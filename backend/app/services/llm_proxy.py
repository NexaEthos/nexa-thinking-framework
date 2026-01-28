import httpx
import asyncio
from datetime import datetime
from typing import AsyncGenerator, Callable, Awaitable, Any
from app.models.chain_of_thought import ChainOfThought, Step
from app.models.agents import APICallMetrics
from app.services.llm_settings import get_settings
from app.services.app_settings import get_app_settings
from app.services.agent_settings import get_agent_settings
from app.services.telemetry import TelemetryService, create_metrics_from_response
import json
import logging

logger = logging.getLogger(__name__)

# Global connection pool for high-concurrency LLM requests
# Configured for vLLM with max-num-seqs=256
_http_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()

# Concurrency settings for vLLM optimization
MAX_CONCURRENT_REQUESTS = 128  # Safe limit under max-num-seqs=256
CONNECTION_POOL_SIZE = 100
KEEPALIVE_CONNECTIONS = 50


async def get_http_client(timeout: float = 120.0) -> httpx.AsyncClient:
    """Get or create a shared high-performance HTTP client with connection pooling."""
    global _http_client
    async with _client_lock:
        if _http_client is None or _http_client.is_closed:
            limits = httpx.Limits(
                max_connections=CONNECTION_POOL_SIZE,
                max_keepalive_connections=KEEPALIVE_CONNECTIONS,
                keepalive_expiry=30.0,
            )
            _http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(timeout, connect=10.0),
                limits=limits,
                http2=True,  # Enable HTTP/2 for better multiplexing
            )
            logger.info(
                f"Created high-concurrency HTTP client pool (max_conn={CONNECTION_POOL_SIZE})"
            )
        return _http_client


async def close_http_client() -> None:
    """Close the shared HTTP client. Call this during application shutdown."""
    global _http_client
    async with _client_lock:
        if _http_client is not None and not _http_client.is_closed:
            await _http_client.aclose()
            _http_client = None
            logger.info("HTTP client pool closed")


class LLMProxy:
    def __init__(self, base_url: str, model: str, temperature: float | None = None):
        self.base_url = base_url
        self.model = model
        self.temperature_override = temperature
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

    def _get_settings(self):
        """Get current LLM settings"""
        return get_settings()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get the shared HTTP client."""
        settings = self._get_settings()
        return await get_http_client(float(settings.timeout))

    async def chat_completion(
        self, messages: list, stream: bool = False
    ) -> AsyncGenerator[str, None]:
        """Send chat completion request to LLM and stream responses"""
        settings = self._get_settings()
        client = await self._get_client()
        temperature = self.temperature_override if self.temperature_override is not None else settings.temperature

        async with self._semaphore:  # Limit concurrent requests
            try:
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "stream": stream,
                    "temperature": temperature,
                    "max_tokens": settings.max_tokens,
                }

                if stream:
                    async with client.stream(
                        "POST", f"{self.base_url}/chat/completions", json=payload
                    ) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data)
                                    if chunk["choices"][0]["delta"].get("content"):
                                        yield chunk["choices"][0]["delta"]["content"]
                                except json.JSONDecodeError:
                                    continue
                else:
                    response = await client.post(
                        f"{self.base_url}/chat/completions", json=payload
                    )
                    response.raise_for_status()
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]
                    yield content
            except httpx.ConnectError as e:
                logger.error(f"Failed to connect to LLM at {self.base_url}: {e}")
                raise RuntimeError(
                    f"Cannot connect to LLM server at {self.base_url}. Ensure LM Studio is running."
                )
            except httpx.HTTPStatusError as e:
                logger.error(
                    f"LLM API error: {e.response.status_code} - {e.response.text}"
                )
                raise RuntimeError(f"LLM API error: {e.response.status_code}")
            except Exception as e:
                logger.error(f"LLM proxy error: {e}")
                raise

    async def chat_completion_streaming_with_telemetry(
        self,
        messages: list,
        agent_id: str,
        on_chunk: Callable[[str], Awaitable[Any]] | None = None,
    ) -> tuple[str, APICallMetrics]:
        """
        Stream chat completion while recording telemetry.
        Calls on_chunk callback for each token, then records metrics after completion.
        Returns full content and metrics.
        """
        settings = self._get_settings()
        client = await self._get_client()
        start_time = datetime.now()
        first_token_time: datetime | None = None
        success = True
        error_msg: str | None = None
        chunks: list[str] = []
        endpoint = f"{self.base_url}/chat/completions"

        async with self._semaphore:
            try:
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                    "temperature": settings.temperature,
                    "max_tokens": settings.max_tokens,
                }

                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions", json=payload
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                if chunk["choices"][0]["delta"].get("content"):
                                    token = chunk["choices"][0]["delta"]["content"]
                                    if first_token_time is None:
                                        first_token_time = datetime.now()
                                    chunks.append(token)
                                    if on_chunk:
                                        await on_chunk(token)
                            except json.JSONDecodeError:
                                continue

            except Exception as e:
                success = False
                error_msg = str(e)
                logger.error(f"LLM streaming error: {e}")

        end_time = datetime.now()
        content = "".join(chunks)

        input_tokens = len(str(messages)) // 4
        output_tokens = len(content) // 4

        metrics = create_metrics_from_response(
            agent_id=agent_id,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            start_time=start_time,
            first_token_time=first_token_time,
            end_time=end_time,
            success=success,
            error=error_msg,
            request_messages=messages,
            response_content=content,
            endpoint=endpoint,
        )

        telemetry = TelemetryService.get_instance_sync()
        await telemetry.record_call(metrics)

        return content, metrics

    async def batch_chat_completion(self, requests: list[list[dict]]) -> list[str]:
        """
        Execute multiple chat completions in parallel, leveraging vLLM's batching.

        Args:
            requests: List of message lists, each representing a separate completion request

        Returns:
            List of response strings in the same order as requests
        """

        async def single_completion(messages: list[dict]) -> str:
            result = ""
            async for chunk in self.chat_completion(messages, stream=False):
                result += chunk
            return result

        # Fire all requests concurrently - vLLM will batch them efficiently
        results = await asyncio.gather(
            *[single_completion(msgs) for msgs in requests], return_exceptions=True
        )

        # Handle any exceptions
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Batch request {i} failed: {result}")
                processed_results.append("")
            elif isinstance(result, str):
                processed_results.append(result)
            else:
                processed_results.append(str(result))

        return processed_results

    async def chat_completion_with_metrics(
        self, messages: list, agent_id: str, record_telemetry: bool = True
    ) -> tuple[str, APICallMetrics]:
        """
        Send chat completion and return content with metrics.
        Automatically records to telemetry service if enabled.
        """
        settings = self._get_settings()
        client = await self._get_client()
        start_time = datetime.now()
        first_token_time: datetime | None = None
        success = True
        error_msg: str | None = None
        content = ""
        input_tokens = 0
        output_tokens = 0
        endpoint = f"{self.base_url}/chat/completions"
        temperature = self.temperature_override if self.temperature_override is not None else settings.temperature

        async with self._semaphore:
            try:
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                    "temperature": temperature,
                    "max_tokens": settings.max_tokens,
                }

                response = await client.post(endpoint, json=payload)
                response.raise_for_status()
                first_token_time = datetime.now()
                result = response.json()

                content = result["choices"][0]["message"]["content"]

                if "usage" in result:
                    input_tokens = result["usage"].get("prompt_tokens", 0)
                    output_tokens = result["usage"].get("completion_tokens", 0)

            except Exception as e:
                success = False
                error_msg = str(e)
                logger.error(f"LLM completion error: {e}")

        end_time = datetime.now()
        metrics = create_metrics_from_response(
            agent_id=agent_id,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            start_time=start_time,
            first_token_time=first_token_time,
            end_time=end_time,
            success=success,
            error=error_msg,
            request_messages=messages,
            response_content=content,
            endpoint=endpoint,
        )

        if record_telemetry:
            telemetry = TelemetryService.get_instance_sync()
            await telemetry.record_call(metrics)

        return content, metrics

    async def analyze_request(self, request: str, questions: list) -> ChainOfThought:
        """Analyze user request against predefined questions"""
        from datetime import datetime

        start_time = datetime.now()
        system_prompt = get_agent_settings().analysis.request_analyzer_prompt

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"User request: {request}\n\nPredefined questions: {questions}",
            },
        ]

        response_text = ""
        first_token_time = None
        async for chunk in self.chat_completion(messages):
            if first_token_time is None:
                first_token_time = datetime.now()
            response_text += chunk

        end_time = datetime.now()

        input_tokens = len(str(messages)) // 4
        output_tokens = len(response_text) // 4

        telemetry_metrics = create_metrics_from_response(
            agent_id="cot",
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            start_time=start_time,
            first_token_time=first_token_time or end_time,
            end_time=end_time,
            success=True,
            error=None,
            request_messages=messages,
            response_content=response_text,
            endpoint=self.base_url,
        )

        telemetry = TelemetryService.get_instance_sync()
        await telemetry.record_call(telemetry_metrics)

        try:
            response = json.loads(response_text)
            return ChainOfThought(
                request=request,
                status="analyzing",
                steps=[
                    Step(
                        step_number=1,
                        type="analysis",
                        content=response.get("analysis", ""),
                        llm_response=response_text,
                    )
                ],
            )
        except json.JSONDecodeError:
            return ChainOfThought(
                request=request,
                status="error",
                steps=[
                    Step(
                        step_number=1,
                        type="error",
                        content="Failed to parse LLM response",
                        llm_response=response_text,
                    )
                ],
            )

    async def answer_question(self, question: str, context: str) -> tuple[str, dict]:
        """Answer a predefined question using LLM knowledge"""
        prompts = get_app_settings().prompts
        system_prompt = prompts.question_answer.format(context=context)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ]

        response_text = ""
        async for chunk in self.chat_completion(messages):
            response_text += chunk

        return response_text.strip(), {}

    async def answer_question_streaming(
        self, question: str, context: str, on_token: Callable[[str], Awaitable[Any]]
    ) -> tuple[str, dict]:
        """Answer a question with streaming tokens and return metrics"""
        import time
        from datetime import datetime

        start_time = time.time()
        start_datetime = datetime.now()

        prompts = get_app_settings().prompts
        system_prompt = prompts.question_answer.format(context=context)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ]

        response_text = ""
        thinking = ""
        token_count = 0
        first_token_time = None

        async for chunk in self.chat_completion(messages, stream=True):
            if first_token_time is None:
                first_token_time = datetime.now()
            response_text += chunk
            token_count += 1
            await on_token(chunk)

        end_time = datetime.now()
        duration_ms = int((time.time() - start_time) * 1000)

        import re

        think_match = re.search(r"<think>(.*?)</think>", response_text, re.DOTALL)
        if think_match:
            thinking = think_match.group(1).strip()

        input_tokens = len(str(messages)) // 4
        output_tokens = len(response_text) // 4

        telemetry_metrics = create_metrics_from_response(
            agent_id="cot",
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            start_time=start_datetime,
            first_token_time=first_token_time or end_time,
            end_time=end_time,
            success=True,
            error=None,
            request_messages=messages,
            response_content=response_text,
            endpoint=self.base_url,
        )

        telemetry = TelemetryService.get_instance_sync()
        await telemetry.record_call(telemetry_metrics)

        metrics = {
            "tokens_used": token_count,
            "duration_ms": duration_ms,
            "thinking": thinking if thinking else None,
        }

        return response_text.strip(), metrics

    async def generate_final_answer(
        self, request: str, context: str, answers: dict
    ) -> ChainOfThought:
        """Generate final answer based on all question answers"""
        system_prompt = """You are a helpful assistant that synthesizes information into a comprehensive answer.

Your task is to:
1. Review all the answers provided
2. Synthesize them into a clear, comprehensive response to the user's original question
3. Ensure the answer directly addresses the user's request
4. Be thorough but concise

Respond with just the final answer, no explanations."""

        context_str = "\n\n".join([f"Q: {q}\nA: {a}" for q, a in answers.items()])

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Original request: {request}\n\nContext:\n{context_str}",
            },
        ]

        response_text = ""
        async for chunk in self.chat_completion(messages):
            response_text += chunk

        return ChainOfThought(
            request=request,
            status="generating",
            steps=[
                Step(
                    step_number=1,
                    type="final_answer",
                    content="Synthesizing final answer",
                    llm_response=response_text,
                )
            ],
        )

    async def generate_final_answer_streaming(
        self,
        request: str,
        context: str,
        answers: dict,
        on_token: Callable[[str], Awaitable[Any]],
    ) -> tuple[str, dict]:
        """Generate final answer with streaming tokens and return metrics"""
        import time
        from datetime import datetime

        start_time = time.time()
        start_datetime = datetime.now()

        context_str = "\n\n---\n\n".join([f"### {q}\n{a}" for q, a in answers.items()])

        prompts = get_app_settings().prompts
        system_prompt = prompts.final_answer.format(context=context_str)

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"User's original request: {request}\n\nWrite a complete, detailed answer using ALL the analysis insights provided in the system prompt. Be thorough.",
            },
        ]

        response_text = ""
        token_count = 0
        first_token_time = None
        async for chunk in self.chat_completion(messages, stream=True):
            if first_token_time is None:
                first_token_time = datetime.now()
            response_text += chunk
            token_count += 1
            await on_token(chunk)

        end_time = datetime.now()
        duration_ms = int((time.time() - start_time) * 1000)

        import re

        thinking = ""
        think_match = re.search(r"<think>(.*?)</think>", response_text, re.DOTALL)
        if think_match:
            thinking = think_match.group(1).strip()

        input_tokens = len(str(messages)) // 4
        output_tokens = len(response_text) // 4

        telemetry_metrics = create_metrics_from_response(
            agent_id="cot",
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            start_time=start_datetime,
            first_token_time=first_token_time or end_time,
            end_time=end_time,
            success=True,
            error=None,
            request_messages=messages,
            response_content=response_text,
            endpoint=self.base_url,
        )

        telemetry = TelemetryService.get_instance_sync()
        await telemetry.record_call(telemetry_metrics)

        metrics = {
            "tokens_used": token_count,
            "duration_ms": duration_ms,
            "thinking": thinking if thinking else None,
        }

        return response_text, metrics

    async def generate_simple_response_streaming(
        self, request: str, on_token: Callable[[str], Awaitable[Any]]
    ) -> tuple[str, dict]:
        """Generate a simple response with streaming for moderate prompts"""
        import time
        from datetime import datetime

        start_time = time.time()
        start_datetime = datetime.now()

        prompts = get_app_settings().prompts
        messages = [
            {"role": "system", "content": prompts.simple_assistant},
            {"role": "user", "content": request},
        ]

        response_text = ""
        token_count = 0
        first_token_time = None
        async for chunk in self.chat_completion(messages, stream=True):
            if first_token_time is None:
                first_token_time = datetime.now()
            response_text += chunk
            token_count += 1
            await on_token(chunk)

        end_time = datetime.now()
        duration_ms = int((time.time() - start_time) * 1000)

        import re

        thinking = ""
        think_match = re.search(r"<think>(.*?)</think>", response_text, re.DOTALL)
        if think_match:
            thinking = think_match.group(1).strip()

        input_tokens = len(str(messages)) // 4
        output_tokens = len(response_text) // 4

        telemetry_metrics = create_metrics_from_response(
            agent_id="cot",
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            start_time=start_datetime,
            first_token_time=first_token_time or end_time,
            end_time=end_time,
            success=True,
            error=None,
            request_messages=messages,
            response_content=response_text,
            endpoint=self.base_url,
        )

        telemetry = TelemetryService.get_instance_sync()
        await telemetry.record_call(telemetry_metrics)

        metrics = {
            "tokens_used": token_count,
            "duration_ms": duration_ms,
            "thinking": thinking if thinking else None,
        }

        return response_text, metrics

    async def verify_answer(self, request: str, final_answer: str) -> dict:
        """Verify if the final answer addresses the original request"""
        system_prompt = """You are a verification assistant. Your job is to check if an answer appropriately addresses a user request.

Important: You are verifying that the answer is relevant and addresses the request topic. Do NOT mark as failed just because you only see a portion of the answer.

Respond ONLY with this exact JSON format (no other text):
{"passed": true, "notes": "Answer addresses the request"}

OR if the answer is clearly off-topic or fails to address the core request:
{"passed": false, "notes": "Brief description of issue"}"""

        answer_preview = (
            final_answer[:2500] if len(final_answer) > 2500 else final_answer
        )
        is_truncated = len(final_answer) > 2500

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Request: {request[:500]}\n\nAnswer{' (showing first 2500 chars)' if is_truncated else ''}: {answer_preview}",
            },
        ]

        response_text = ""
        async for chunk in self.chat_completion(messages):
            response_text += chunk

        try:
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start >= 0 and end > start:
                cleaned = cleaned[start:end]
            response = json.loads(cleaned)
            return {
                "passed": response.get("passed", True),
                "notes": response.get("notes", "Verification complete"),
            }
        except (json.JSONDecodeError, ValueError):
            return {"passed": True, "notes": "Answer generated successfully"}
