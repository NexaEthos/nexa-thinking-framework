import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Awaitable, Any

from app.models.agents import APICallMetrics, ChatMessage
from app.models.vectors import VectorDocument
from app.services.agent_settings import get_agent_settings
from app.services.llm_settings import get_settings
from app.services.llm_proxy import LLMProxy
from app.services.telemetry import TelemetryService
from app.services.web_search import web_search
from app.services.app_settings import get_app_settings

logger = logging.getLogger(__name__)


@dataclass
class ResearchInvocation:
    agent_id: str
    triggered_by: str
    content: str
    metrics: APICallMetrics | None = None
    success: bool = True
    error: str | None = None


@dataclass
class ResearcherResponse:
    response: str = ""
    research_data: str = ""
    agent_invocations: list[ResearchInvocation] = field(default_factory=list)
    metrics: APICallMetrics | None = None


class ResearcherOrchestrator:
    def __init__(self):
        self._agent_settings = get_agent_settings()
        self._conversation: list[ChatMessage] = []
        self._research_data: str = ""
        self._web_search = web_search
        self._qdrant_service = None
        self._rag_enabled: bool = True
        self._last_rag_stats: dict = {"found": 0, "avg_score": 0.0, "sources": [], "preview": ""}
        self._last_index_stats: dict = {"indexed": False, "chars": 0, "collection_size": 0, "preview": "", "topics": []}

    def set_rag_enabled(self, enabled: bool) -> None:
        self._rag_enabled = enabled
        logger.info(f"RAG {'enabled' if enabled else 'disabled'} for researcher")

    def is_rag_enabled(self) -> bool:
        return self._rag_enabled

    async def _get_qdrant_service(self):
        if not self._rag_enabled:
            return None
        if self._qdrant_service is None:
            settings = get_app_settings().qdrant
            if settings.enabled:
                from app.services.qdrant_service import QdrantService
                self._qdrant_service = await QdrantService.get_instance()
                if not self._qdrant_service.is_enabled():
                    await self._qdrant_service.initialize()
        return self._qdrant_service

    async def _search_existing_research(self, query: str) -> tuple[str, dict]:
        stats = {"found": 0, "avg_score": 0.0, "sources": [], "preview": "", "retrieved_snippets": [], "searched": False, "full_content": ""}
        try:
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled():
                stats["searched"] = True
                settings = get_app_settings().qdrant
                results = await qdrant.search(
                    query=query,
                    collection=settings.collection_research,
                    limit=3,
                    score_threshold=0.60,
                )
                if results:
                    context_parts = []
                    scores = []
                    full_content_parts = []
                    for r in results:
                        source = r.metadata.get("source", "previous research")
                        indexed_at = r.metadata.get("indexed_at", "unknown")
                        score = r.score if hasattr(r, "score") else 0.8
                        snippet = r.content[:300].replace("\n", " ").strip()
                        full_text = r.content[:2000]
                        context_parts.append(f"[FROM KNOWLEDGE BASE - {source}]:\n{r.content[:1000]}")
                        scores.append(score)
                        stats["sources"].append(source)
                        stats["retrieved_snippets"].append({
                            "source": source,
                            "score": round(score, 2),
                            "preview": snippet[:150] + "..." if len(snippet) > 150 else snippet,
                            "full_content": full_text,
                            "indexed_at": indexed_at,
                        })
                        full_content_parts.append(f"## Document from {source}\n**Relevance:** {score:.0%}\n**Indexed:** {indexed_at}\n\n{full_text}")
                    stats["found"] = len(results)
                    stats["avg_score"] = sum(scores) / len(scores) if scores else 0
                    stats["preview"] = results[0].content[:150] + "..." if results else ""
                    stats["full_content"] = "\n\n---\n\n".join(full_content_parts)
                    logger.info(f"Found {len(results)} relevant documents in Qdrant (avg score: {stats['avg_score']:.2f})")
                    return "\n\n---\n\n".join(context_parts), stats
                else:
                    logger.info(f"No relevant documents found in Qdrant for query: {query[:50]}...")
        except Exception as e:
            logger.warning(f"Qdrant search failed: {e}")
        return "", stats

    async def _index_research_result(self, content: str, source: str = "researcher") -> dict:
        stats = {"indexed": False, "chars": 0, "collection_size": 0, "preview": "", "topics": []}
        try:
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled() and content:
                settings = get_app_settings().qdrant
                doc = VectorDocument(
                    content=content[:8000],
                    collection=settings.collection_research,
                    metadata={
                        "source": source,
                        "indexed_at": datetime.utcnow().isoformat(),
                        "content_length": len(content),
                    },
                )
                await qdrant.index_document(doc)
                stats["indexed"] = True
                stats["chars"] = len(content[:8000])
                stats["preview"] = content[:200].replace("\n", " ").strip() + "..."
                headings = [line.strip("# ").strip() for line in content.split("\n") if line.startswith("#")]
                stats["topics"] = headings[:5]
                try:
                    count = await qdrant.get_collection_count(settings.collection_research)
                    stats["collection_size"] = count
                except Exception as e:
                    logger.debug(f"Could not get collection count after indexing: {e}")
                logger.info(f"Indexed research result ({len(content)} chars) from {source}")
        except Exception as e:
            logger.warning(f"Failed to index research result: {e}")
        return stats

    async def get_rag_stats(self) -> dict:
        stats = {"enabled": self._rag_enabled, "collection_size": 0, "connected": False}
        try:
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled():
                stats["connected"] = True
                settings = get_app_settings().qdrant
                try:
                    count = await qdrant.get_collection_count(settings.collection_research)
                    stats["collection_size"] = count
                except Exception as e:
                    logger.debug(f"Could not get collection count: {e}")
        except Exception as e:
            logger.warning(f"Failed to get RAG stats: {e}")
        return stats

    def get_last_retrieval_stats(self) -> dict:
        return self._last_rag_stats

    def get_last_index_stats(self) -> dict:
        return self._last_index_stats

    def _get_llm(self) -> LLMProxy:
        settings = get_settings()
        return LLMProxy(base_url=settings.get_base_url(), model=settings.model)

    def set_research_data(self, data: str) -> None:
        self._research_data = data

    def get_research_data(self) -> str:
        return self._research_data

    async def _generate_search_queries(self, prompt_template: str, query: str) -> list[str]:
        llm = self._get_llm()
        prompt_content = prompt_template.replace("{query}", query[:500])

        messages = [
            {"role": "system", "content": prompt_content},
            {"role": "user", "content": query[:500]},
        ]

        try:
            response, _ = await llm.chat_completion_with_metrics(messages, "query_gen")
            match = re.search(r"\[.*\]", response, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
                if isinstance(parsed, list) and len(parsed) > 0:
                    return parsed
        except Exception as e:
            logger.warning(f"Query generation failed: {e}")

        return [query]

    async def _perform_research(self, queries: list[str]) -> tuple[str, dict]:
        context_parts = []
        rag_retrieval_stats = {"found": 0, "avg_score": 0.0, "sources": [], "preview": "", "searched": False, "retrieved_snippets": []}

        for query in queries[:3]:
            qdrant_context, stats = await self._search_existing_research(query)
            rag_retrieval_stats = stats
            if qdrant_context:
                context_parts.append(f"## Relevant Previous Research\n{qdrant_context}")
                break

        all_results = []
        for query in queries[:3]:
            results = await self._web_search.search(query, max_results=3)
            all_results.extend(results)
            logger.info(f"Researcher search: '{query}' returned {len(results)} results")

        if all_results:
            web_context = self._web_search.format_results_as_context(all_results)
            context_parts.append(f"## Web Research\n{web_context}")

        return "\n\n".join(context_parts), rag_retrieval_stats

    async def _invoke_researcher(self, user_message: str) -> ResearchInvocation:
        try:
            agents = self._agent_settings.research_agents
            if not agents or "researcher" not in agents:
                return ResearchInvocation(
                    agent_id="researcher",
                    triggered_by="orchestrator",
                    content="",
                    success=False,
                    error="Researcher agent not configured",
                )

            researcher = agents["researcher"]
            if not researcher.enabled:
                return ResearchInvocation(
                    agent_id="researcher",
                    triggered_by="orchestrator",
                    content="",
                    success=False,
                    error="Researcher agent is disabled",
                )

            query_prompt = researcher.prompts.search_query_generation
            queries = await self._generate_search_queries(query_prompt, user_message)
            research_context, _rag_stats = await self._perform_research(queries)

            llm = self._get_llm()
            extraction_prompt = researcher.prompts.extraction
            extraction_prompt = extraction_prompt.replace(
                "{research_data}", self._research_data or "No data provided yet"
            )
            extraction_prompt = extraction_prompt.replace(
                "{web_research}", research_context or "No web research available"
            )
            extraction_prompt = extraction_prompt.replace("{user_message}", user_message)

            messages = [
                {"role": "system", "content": researcher.prompts.system},
                {"role": "user", "content": extraction_prompt},
            ]

            response, metrics = await llm.chat_completion_with_metrics(
                messages, "researcher"
            )

            self._research_data = response
            self._last_index_stats = await self._index_research_result(response, "researcher")

            return ResearchInvocation(
                agent_id="researcher",
                triggered_by="orchestrator",
                content=response,
                metrics=metrics,
                success=True,
            )

        except Exception as e:
            logger.error(f"Error invoking researcher: {e}", exc_info=True)
            return ResearchInvocation(
                agent_id="researcher",
                triggered_by="orchestrator",
                content="",
                success=False,
                error=str(e),
            )

    async def invoke_researcher_streaming(
        self, user_message: str, on_chunk: Callable[[str], Awaitable[Any]]
    ) -> ResearchInvocation:
        """Invoke researcher with streaming output"""
        try:
            agents = self._agent_settings.research_agents
            if not agents or "researcher" not in agents:
                return ResearchInvocation(
                    agent_id="researcher",
                    triggered_by="orchestrator",
                    content="",
                    success=False,
                    error="Researcher agent not configured",
                )

            researcher = agents["researcher"]
            if not researcher.enabled:
                return ResearchInvocation(
                    agent_id="researcher",
                    triggered_by="orchestrator",
                    content="",
                    success=False,
                    error="Researcher agent is disabled",
                )

            query_prompt = researcher.prompts.search_query_generation
            queries = await self._generate_search_queries(query_prompt, user_message)
            research_context, self._last_rag_stats = await self._perform_research(queries)

            llm = self._get_llm()
            extraction_prompt = researcher.prompts.extraction
            existing_data = self._research_data or "No existing document"
            logger.info(f"Streaming with existing data length: {len(existing_data)} chars")
            extraction_prompt = extraction_prompt.replace(
                "{research_data}", existing_data
            )
            extraction_prompt = extraction_prompt.replace(
                "{web_research}", research_context or "No web research available"
            )
            extraction_prompt = extraction_prompt.replace("{user_message}", user_message)

            messages = [
                {"role": "system", "content": researcher.prompts.system},
                {"role": "user", "content": extraction_prompt},
            ]

            response, metrics = await llm.chat_completion_streaming_with_telemetry(
                messages, "researcher", on_chunk
            )

            # Handle expansion vs full document (flexible prefix matching)
            # Match variations: ===EXPANSION===, === EXPANSION ===, ===EXPANSION=, etc.
            expansion_match = re.match(r'^===\s*EXPANSION\s*=+\s*', response, re.IGNORECASE)
            full_doc_match = re.match(r'^===\s*FULL_DOCUMENT\s*=+\s*', response, re.IGNORECASE)
            
            if expansion_match:
                # Extract new content and append to existing
                new_content = response[expansion_match.end():].strip()
                if self._research_data and self._research_data != "No existing document":
                    self._research_data = self._research_data + "\n\n" + new_content
                    logger.info(f"Appended {len(new_content)} chars to existing document, total: {len(self._research_data)} chars")
                else:
                    self._research_data = new_content
            elif full_doc_match:
                # Initial document - use as-is
                self._research_data = response[full_doc_match.end():].strip()
            else:
                if self._research_data and self._research_data != "No existing document" and len(self._research_data) > 500:
                    self._research_data = self._research_data + "\n\n" + response
                    logger.info(f"Fallback append: {len(response)} chars, total: {len(self._research_data)} chars")
                else:
                    self._research_data = response

            self._last_index_stats = await self._index_research_result(self._research_data, "researcher_streaming")

            return ResearchInvocation(
                agent_id="researcher",
                triggered_by="orchestrator",
                content=response,
                metrics=metrics,
                success=True,
            )

        except Exception as e:
            logger.error(f"Error invoking researcher streaming: {e}", exc_info=True)
            return ResearchInvocation(
                agent_id="researcher",
                triggered_by="orchestrator",
                content="",
                success=False,
                error=str(e),
            )

    async def _invoke_fact_checker(self, enriched_data: str) -> ResearchInvocation:
        try:
            agents = self._agent_settings.research_agents
            if not agents or "fact_checker" not in agents:
                return ResearchInvocation(
                    agent_id="fact_checker",
                    triggered_by="orchestrator",
                    content="",
                    success=False,
                    error="Fact Checker agent not configured",
                )

            fact_checker = agents["fact_checker"]
            if not fact_checker.enabled:
                return ResearchInvocation(
                    agent_id="fact_checker",
                    triggered_by="orchestrator",
                    content="",
                    success=False,
                    error="Fact Checker agent is disabled",
                )

            query_prompt = fact_checker.prompts.search_query_generation
            queries = await self._generate_search_queries(query_prompt, enriched_data[:500])
            research_context, _rag_stats = await self._perform_research(queries)

            llm = self._get_llm()
            extraction_prompt = fact_checker.prompts.extraction
            extraction_prompt = extraction_prompt.replace("{enriched_data}", enriched_data)
            extraction_prompt = extraction_prompt.replace(
                "{web_research}", research_context or "No web research available"
            )

            messages = [
                {"role": "system", "content": fact_checker.prompts.system},
                {"role": "user", "content": extraction_prompt},
            ]

            response, metrics = await llm.chat_completion_with_metrics(
                messages, "fact_checker"
            )

            return ResearchInvocation(
                agent_id="fact_checker",
                triggered_by="auto",
                content=response,
                metrics=metrics,
                success=True,
            )

        except Exception as e:
            logger.error(f"Error invoking fact checker: {e}", exc_info=True)
            return ResearchInvocation(
                agent_id="fact_checker",
                triggered_by="orchestrator",
                content="",
                success=False,
                error=str(e),
            )

    async def invoke_fact_checker_streaming(self) -> ResearchInvocation:
        """Invoke fact checker on current research data (public method for routes)"""
        return await self._invoke_fact_checker(self._research_data)

    def _get_orchestrator_system_prompt(self) -> str:
        orchestrator = self._agent_settings.research_orchestrator
        if orchestrator:
            return orchestrator.prompts.system
        return "You are a research orchestrator that coordinates research and fact-checking."

    def _get_synthesis_prompt(self) -> str:
        orchestrator = self._agent_settings.research_orchestrator
        if orchestrator:
            return orchestrator.prompts.synthesis
        return "Synthesize the research results."

    async def _generate_orchestrator_response(
        self, user_message: str, invocations: list[ResearchInvocation]
    ) -> tuple[str, APICallMetrics]:
        llm = self._get_llm()

        synthesis = self._get_synthesis_prompt()
        synthesis = synthesis.replace("{user_message}", user_message)
        synthesis = synthesis.replace(
            "{research_data}", self._research_data or "No data yet"
        )

        invocation_summary = ""
        if invocations:
            summaries = []
            for inv in invocations:
                status = "✓" if inv.success else "✗"
                agent_name = "@researcher" if inv.agent_id == "researcher" else "@fact_checker"
                preview = inv.content[:200] if inv.content else inv.error or "No output"
                summaries.append(f"- {agent_name} {status}: {preview}...")
            invocation_summary = "\n\nAgent Updates:\n" + "\n".join(summaries)

        messages = [
            {"role": "system", "content": self._get_orchestrator_system_prompt()},
            {"role": "user", "content": f"{synthesis}{invocation_summary}"},
        ]

        response, metrics = await llm.chat_completion_with_metrics(
            messages, "research_orchestrator"
        )
        return response, metrics

    async def process_message(self, user_message: str) -> ResearcherResponse:
        self._conversation.append(
            ChatMessage(
                id=f"user-{datetime.now().timestamp()}",
                role="user",
                content=user_message,
                timestamp=datetime.now(),
            )
        )

        response = ResearcherResponse()

        msg_lower = user_message.lower()
        should_research = any(
            trigger in msg_lower
            for trigger in ["research", "enrich", "find", "search", "look up", "@researcher"]
        )
        should_fact_check = any(
            trigger in msg_lower
            for trigger in ["verify", "fact check", "confirm", "validate", "@fact_checker"]
        )

        if should_research or "@researcher" in user_message:
            researcher_result = await self._invoke_researcher(user_message)
            response.agent_invocations.append(researcher_result)

            if researcher_result.success and not should_fact_check:
                fact_checker_result = await self._invoke_fact_checker(
                    researcher_result.content
                )
                response.agent_invocations.append(fact_checker_result)

        if should_fact_check or "@fact_checker" in user_message:
            if not any(inv.agent_id == "fact_checker" for inv in response.agent_invocations):
                fact_checker_result = await self._invoke_fact_checker(self._research_data)
                response.agent_invocations.append(fact_checker_result)

        orchestrator_response, orchestrator_metrics = (
            await self._generate_orchestrator_response(
                user_message, response.agent_invocations
            )
        )
        response.response = orchestrator_response
        response.metrics = orchestrator_metrics
        response.research_data = self._research_data

        self._conversation.append(
            ChatMessage(
                id=f"assistant-{datetime.now().timestamp()}",
                role="assistant",
                content=orchestrator_response,
                timestamp=datetime.now(),
                agent_id="research_orchestrator",
                metrics=orchestrator_metrics,
            )
        )

        return response

    def get_greeting(self) -> str:
        orchestrator = self._agent_settings.research_orchestrator
        if orchestrator:
            return orchestrator.prompts.greeting
        return "Welcome to the Research Lab! Paste data to be researched and enriched."

    def get_conversation(self) -> list[ChatMessage]:
        return self._conversation

    def clear_conversation(self) -> None:
        self._conversation = []

    def reset(self) -> None:
        self.clear_conversation()
        self._research_data = ""
        telemetry = TelemetryService.get_instance_sync()
        telemetry.reset_session()


_orchestrator: ResearcherOrchestrator | None = None


def get_researcher_orchestrator() -> ResearcherOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = ResearcherOrchestrator()
    return _orchestrator
