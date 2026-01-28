from typing import List
import json
import logging
import re
import asyncio
import uuid
from datetime import datetime

from app.models.chain_of_thought import ChainOfThought, Step, Verification, WebSource, MemorySource
from app.models.vectors import VectorDocument
from app.services.llm_proxy import LLMProxy
from app.services.question_manager import QuestionManager
from app.services.websocket_manager import websocket_manager
from app.services.web_search import web_search
from app.services.app_settings import get_app_settings
from app.services.prompt_classifier import (
    classify_prompt,
    PromptComplexity,
    ClassificationResult,
)

logger = logging.getLogger(__name__)


def clean_llm_response(response: str) -> str:
    """Extract the actual answer from LLM response, stripping only <think> tags"""
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"</think>", "", cleaned)
    cleaned = re.sub(r"<think>.*$", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


class ChainOfThoughtOrchestrator:
    def __init__(self, llm_proxy: LLMProxy, question_manager: QuestionManager):
        self.llm_proxy = llm_proxy
        self.question_manager = question_manager
        self.web_search = web_search
        self._qdrant_service = None

    async def _get_qdrant_service(self):
        if self._qdrant_service is None:
            settings = get_app_settings().qdrant
            if settings.enabled:
                from app.services.qdrant_service import QdrantService
                self._qdrant_service = await QdrantService.get_instance()
                if not self._qdrant_service.is_enabled():
                    await self._qdrant_service.initialize()
        return self._qdrant_service

    async def _search_similar_reasoning(self, query: str) -> tuple[str, list[MemorySource]]:
        try:
            settings = get_app_settings().qdrant
            if not settings.enabled or not settings.use_memory_search:
                return "", []
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled():
                results = await qdrant.search(
                    query=query,
                    collection=settings.collection_memory,
                    limit=2,
                    score_threshold=0.8,
                )
                if results:
                    context_parts = []
                    memory_sources = []
                    for r in results:
                        context_parts.append(f"Previous reasoning:\n{r.content[:1500]}")
                        memory_sources.append(MemorySource(
                            id=r.id,
                            content=r.content[:500],
                            score=r.score,
                            collection=settings.collection_memory,
                        ))
                    logger.info(f"Found {len(results)} similar reasoning chains in Qdrant")
                    return "\n\n---\n\n".join(context_parts), memory_sources
        except Exception as e:
            logger.warning(f"Qdrant search for reasoning failed: {e}")
        return "", []

    async def _index_chain_of_thought(self, request: str, chain: ChainOfThought) -> None:
        try:
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled() and chain.final_answer:
                settings = get_app_settings().qdrant
                reasoning_summary = f"Request: {request}\n\nFinal Answer: {chain.final_answer}"
                if chain.steps:
                    step_summaries = []
                    for step in chain.steps[:5]:
                        if step.llm_response:
                            step_summaries.append(f"- {step.type}: {step.llm_response[:200]}")
                    if step_summaries:
                        reasoning_summary += "\n\nReasoning steps:\n" + "\n".join(step_summaries)

                doc = VectorDocument(
                    content=reasoning_summary[:8000],
                    collection=settings.collection_memory,
                    metadata={
                        "source": "chain_of_thought",
                        "request": request[:500],
                        "status": chain.status,
                        "steps_count": len(chain.steps),
                        "indexed_at": datetime.utcnow().isoformat(),
                    },
                )
                await qdrant.index_document(doc)
                logger.info(f"Indexed chain-of-thought reasoning ({len(reasoning_summary)} chars)")
        except Exception as e:
            logger.warning(f"Failed to index chain-of-thought: {e}")

    def _extract_search_keywords(self, text: str) -> str:
        """Extract meaningful keywords from text for search.

        Removes common filler words and keeps product/topic-related terms.
        """
        stop_words = {
            "i",
            "would",
            "like",
            "to",
            "please",
            "can",
            "you",
            "help",
            "me",
            "find",
            "the",
            "a",
            "an",
            "and",
            "or",
            "of",
            "for",
            "with",
            "in",
            "on",
            "at",
            "is",
            "are",
            "what",
            "how",
            "why",
            "when",
            "where",
            "which",
            "do",
            "does",
            "did",
            "have",
            "has",
            "had",
            "be",
            "been",
            "being",
            "this",
            "that",
            "these",
            "those",
            "it",
            "its",
            "draft",
            "create",
            "make",
            "get",
            "want",
            "need",
            "looking",
            "search",
        }
        words = text.lower().replace(",", "").replace("$", " ").split()
        keywords = [w for w in words if w not in stop_words and len(w) > 2]
        return " ".join(keywords[:8])

    async def _research_for_question(
        self, question: str, context: str
    ) -> tuple[str, list[dict]]:
        """Perform web research to help answer a question.

        Returns:
            Tuple of (formatted_context, raw_results) where raw_results contains
            dicts with title, url, snippet keys for source attribution.
        """
        app_settings = get_app_settings()
        if not app_settings.web_search.enabled:
            return "", []
        topic_keywords = self._extract_search_keywords(context)
        search_query = f"{topic_keywords} {question[:50]}"
        results = await self.web_search.search(
            search_query, max_results=app_settings.web_search.max_results_for_questions
        )
        if results:
            formatted = self.web_search.format_results_as_context(results)
            return formatted, results
        return "", []

    async def _should_research_question(
        self, question: str, original_request: str = ""
    ) -> bool:
        """Determine if a question would benefit from web research.

        Checks both the question and the original user request against triggers.
        """
        app_settings = get_app_settings()
        if not app_settings.web_search.enabled:
            return False
        research_triggers = app_settings.web_search.research_triggers
        question_lower = question.lower()
        request_lower = original_request.lower()
        # Check if either the question or original request contains triggers
        return any(
            trigger in question_lower or trigger in request_lower
            for trigger in research_triggers
        )

    async def _parallel_research_all_questions(
        self, questions: list[str], original_request: str
    ) -> dict[str, tuple[str, list[dict]]]:
        """
        Perform web research for all questions in parallel.

        Returns:
            Dict mapping question -> (research_context, research_sources)
        """

        async def research_one(question: str) -> tuple[str, str, list[dict]]:
            if await self._should_research_question(question, original_request):
                context, sources = await self._research_for_question(
                    question, original_request
                )
                return question, context, sources
            return question, "", []

        # Fire all research requests in parallel
        results = await asyncio.gather(
            *[research_one(q) for q in questions], return_exceptions=True
        )

        research_map = {}
        for result in results:
            if isinstance(result, tuple):
                question, context, sources = result
                research_map[question] = (context, sources)
            elif isinstance(result, Exception):
                logger.debug(f"Research batch item failed: {result}")

        return research_map

    async def process_request(self, request: str) -> tuple[str, ChainOfThought]:
        """Process a user request through chain-of-thought framework with WebSocket updates"""
        request_id = str(uuid.uuid4())

        classification = classify_prompt(request)

        if classification.complexity == PromptComplexity.MODERATE:
            return await self._handle_moderate_request(
                request_id, request, classification
            )

        return await self._handle_complex_request(request_id, request, classification)

    async def _handle_moderate_request(
        self, request_id: str, request: str, classification: ClassificationResult
    ) -> tuple[str, ChainOfThought]:
        """Handle moderate prompts with a single LLM call (no full chain-of-thought)"""
        chain = ChainOfThought(
            request=request,
            status="classifying",
            steps=[],
            created_at=self._get_timestamp(),
        )

        await websocket_manager.broadcast_chain_progress(request_id, chain)

        chain.steps.append(
            Step(
                step_number=1,
                type="classification",
                content="Analyzing prompt complexity",
                decision="MODERATE → Single-pass processing",
                reasoning=classification.reasoning,
                confidence=classification.confidence,
                llm_response=f"Word count: {classification.word_count} | Complexity: {classification.complexity.value.upper()} | Confidence: {int(classification.confidence * 100)}%",
            )
        )
        await websocket_manager.broadcast_step(request_id, chain.steps[-1])

        chain.status = "processing"
        chain.steps.append(
            Step(
                step_number=2,
                type="llm_call",
                content="Sending request to language model",
                decision="Direct query without decomposition",
                reasoning="Prompt is short and straightforward, no need for multi-step analysis",
                llm_response="",
            )
        )
        await websocket_manager.broadcast_chain_progress(request_id, chain)
        await websocket_manager.broadcast_step(request_id, chain.steps[-1])

        response = ""
        step_number = 2

        async def on_token(token: str):
            nonlocal response
            response += token
            await websocket_manager.broadcast_token(request_id, step_number, token)

        _, metrics = await self.llm_proxy.generate_simple_response_streaming(
            request, on_token
        )

        cleaned_response = clean_llm_response(response)
        chain.steps[-1].llm_response = cleaned_response
        chain.steps[-1].tokens_used = metrics.get("tokens_used")
        chain.steps[-1].duration_ms = metrics.get("duration_ms")
        chain.steps[-1].thinking = metrics.get("thinking")
        await websocket_manager.broadcast_stream_complete(
            request_id, step_number, cleaned_response
        )
        await websocket_manager.broadcast_step(request_id, chain.steps[-1])

        chain.final_answer = cleaned_response
        chain.status = "completed"
        chain.verification = Verification(
            passed=True,
            notes=f"Single-pass response | {classification.word_count} words analyzed | {int(classification.confidence * 100)}% confidence | {metrics.get('duration_ms', 0)}ms",
        )

        await websocket_manager.broadcast_chain_progress(request_id, chain)
        await websocket_manager.broadcast_complete(request_id, chain)

        return request_id, chain

    async def _handle_complex_request(
        self, request_id: str, request: str, classification: ClassificationResult
    ) -> tuple[str, ChainOfThought]:
        """Process a complex request through full chain-of-thought framework"""
        questions = self.question_manager.get_question_texts()

        similar_reasoning, memory_sources = await self._search_similar_reasoning(request)

        chain = ChainOfThought(
            request=request,
            status="classifying",
            steps=[],
            created_at=self._get_timestamp(),
        )

        await websocket_manager.broadcast_chain_progress(request_id, chain)

        memory_note = f" | Found {len(memory_sources)} similar reasoning(s)" if memory_sources else ""
        chain.steps.append(
            Step(
                step_number=1,
                type="classification",
                content="Analyzing prompt complexity",
                decision="COMPLEX → Full chain-of-thought analysis",
                reasoning=classification.reasoning,
                confidence=classification.confidence,
                llm_response=f"Word count: {classification.word_count} | Indicators: {', '.join(classification.indicators[:3]) if classification.indicators else 'length-based'} | Confidence: {int(classification.confidence * 100)}%{memory_note}",
                memory_sources=memory_sources if memory_sources else None,
            )
        )
        await websocket_manager.broadcast_step(request_id, chain.steps[-1])

        chain.status = "analyzing"
        chain.steps.append(
            Step(
                step_number=2,
                type="analysis",
                content="Decomposing request into analysis framework",
                decision=f"Using {len(questions)} analytical questions",
                reasoning="Breaking down the request using structured questions to ensure comprehensive coverage",
                llm_response="",
            )
        )
        await websocket_manager.broadcast_chain_progress(request_id, chain)
        await websocket_manager.broadcast_step(request_id, chain.steps[-1])

        analysis_chain = await self.llm_proxy.analyze_request(request, questions)

        chain.steps[-1].llm_response = (
            analysis_chain.steps[0].llm_response
            if analysis_chain.steps
            else "Analysis complete"
        )
        await websocket_manager.broadcast_step(request_id, chain.steps[-1])

        relevant_questions = self._extract_relevant_questions(chain)
        if relevant_questions:
            chain.status = "processing"
            chain.steps.append(
                Step(
                    step_number=3,
                    type="planning",
                    content="Planning question sequence",
                    decision=f"Processing {len(relevant_questions)} relevant questions",
                    reasoning="Each question will provide insight needed for the final answer",
                    llm_response=f"Questions to answer: {len(relevant_questions)} | Research starting in parallel...",
                )
            )
            await websocket_manager.broadcast_chain_progress(request_id, chain)
            await websocket_manager.broadcast_step(request_id, chain.steps[-1])

            # PARALLEL RESEARCH: Pre-fetch all research in parallel before processing questions
            import time

            research_start = time.time()
            research_map = await self._parallel_research_all_questions(
                relevant_questions, request
            )
            research_duration = int((time.time() - research_start) * 1000)

            research_count = sum(1 for v in research_map.values() if v[0])
            if research_count > 0:
                chain.steps[-1].llm_response = (
                    f"Questions to answer: {len(relevant_questions)} | Parallel research completed: {research_count} topics ({research_duration}ms)"
                )
                await websocket_manager.broadcast_step(request_id, chain.steps[-1])

            for i, question in enumerate(relevant_questions, start=4):
                step_start = time.time()
                current_step_number = i

                # Use pre-fetched research instead of sequential lookup
                research_context, research_sources = research_map.get(
                    question, ("", [])
                )

                chain.steps.append(
                    Step(
                        step_number=current_step_number,
                        type="question",
                        question=question,
                        content=f"Question {i-3} of {len(relevant_questions)}"
                        + (" 🔍" if research_context else ""),
                        reasoning=f"This question helps address: {question[:50]}...",
                        llm_response="",
                        sources=(
                            [WebSource(**s) for s in research_sources]
                            if research_sources
                            else None
                        ),
                    )
                )
                await websocket_manager.broadcast_chain_progress(request_id, chain)
                await websocket_manager.broadcast_step(request_id, chain.steps[-1])

                collected_answer = []
                step_num_capture = current_step_number

                async def on_token(token: str):
                    collected_answer.append(token)
                    await websocket_manager.broadcast_token(
                        request_id, step_num_capture, token
                    )

                augmented_question = question
                if research_context:
                    augmented_question = f"{question}\n\nWeb research results to consider:\n{research_context}"

                _, metrics = await self.llm_proxy.answer_question_streaming(
                    augmented_question, request, on_token
                )

                full_answer = "".join(collected_answer)
                cleaned_answer = clean_llm_response(full_answer)
                step_duration = int((time.time() - step_start) * 1000)
                chain.steps[-1].llm_response = cleaned_answer
                chain.steps[-1].tokens_used = metrics.get(
                    "tokens_used", len(cleaned_answer.split())
                )
                chain.steps[-1].duration_ms = step_duration
                chain.steps[-1].thinking = metrics.get("thinking")
                await websocket_manager.broadcast_stream_complete(
                    request_id, current_step_number, cleaned_answer
                )
                await websocket_manager.broadcast_step(request_id, chain.steps[-1])
        else:
            chain.status = "error"
            chain.steps.append(
                Step(
                    step_number=2,
                    type="error",
                    content="No relevant questions found",
                    llm_response="Could not determine which questions to answer",
                )
            )
            await websocket_manager.broadcast_chain_progress(request_id, chain)
            return request_id, chain

        # Step 3: Generate final answer
        chain.status = "generating"
        await websocket_manager.broadcast_chain_progress(request_id, chain)

        # Questions start at step index 3 (after classification, analysis, planning)
        question_start_index = 3
        answers = {
            q: chain.steps[question_start_index + i].llm_response
            for i, q in enumerate(relevant_questions)
        }

        final_response = ""
        final_step_number = len(chain.steps) + 1

        async def on_final_token(token: str):
            nonlocal final_response
            final_response += token
            await websocket_manager.broadcast_token(
                request_id, final_step_number, token
            )

        raw_final, final_metrics = await self.llm_proxy.generate_final_answer_streaming(
            request, request, answers, on_final_token
        )

        cleaned_final = clean_llm_response(raw_final)
        await websocket_manager.broadcast_stream_complete(
            request_id, final_step_number, cleaned_final
        )

        # Update chain with final answer
        chain.final_answer = cleaned_final
        chain.status = "verifying"
        await websocket_manager.broadcast_chain_progress(request_id, chain)

        # Step 4: Verify answer
        if chain.final_answer:
            verification_result = await self.llm_proxy.verify_answer(
                request, chain.final_answer
            )

            verification = Verification(
                passed=verification_result.get("passed", True),
                notes=verification_result.get("notes", ""),
            )

            chain.verification = verification
            chain.status = "completed"
            await websocket_manager.broadcast_chain_progress(request_id, chain)

            await websocket_manager.broadcast_complete(request_id, chain)

            await self._index_chain_of_thought(request, chain)
        else:
            chain.verification = Verification(
                passed=False, notes="No final answer was generated"
            )
            chain.status = "error"
            await websocket_manager.broadcast_error(
                request_id, "Failed to generate final answer for verification"
            )

        return request_id, chain

    def _extract_relevant_questions(self, chain: ChainOfThought) -> List[str]:
        """Extract relevant questions from analysis step"""
        try:
            analysis_text = chain.steps[0].llm_response
            if analysis_text and "relevant_questions" in analysis_text:
                analysis = json.loads(analysis_text)
                return analysis.get("relevant_questions", [])
        except (json.JSONDecodeError, AttributeError, TypeError) as e:
            logger.debug(f"Failed to extract relevant questions from analysis: {e}")
        return self.question_manager.get_question_texts()

    def _get_timestamp(self) -> str:
        """Get current timestamp in ISO format"""
        from datetime import timezone

        return datetime.now(timezone.utc).isoformat()
