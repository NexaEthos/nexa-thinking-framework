import logging
from dataclasses import dataclass, field
from datetime import datetime

from app.models.agents import APICallMetrics, ChatMessage
from app.services.agent_settings import get_agent_settings
from app.services.agent_router import (
    format_agent_mention,
    suggest_agents_for_message,
    create_mention_summary,
)
from app.services.canvas_state import get_canvas_manager
from app.services.llm_settings import get_settings
from app.services.llm_proxy import LLMProxy
from app.services.telemetry import TelemetryService
from app.services.app_settings import get_app_settings
from app.services.web_search import web_search

logger = logging.getLogger(__name__)


@dataclass
class RAGResult:
    id: str
    content: str
    score: float
    collection: str


@dataclass
class AgentInvocation:
    agent_id: str
    triggered_by: str
    content: str
    metrics: APICallMetrics | None = None
    success: bool = True
    error: str | None = None


@dataclass
class PMResponse:
    response: str = ""
    agent_invocations: list[AgentInvocation] = field(default_factory=list)
    canvas_updates: list[str] = field(default_factory=list)
    metrics: APICallMetrics | None = None
    suggestions: list[str] = field(default_factory=list)
    rag_results: list[RAGResult] = field(default_factory=list)
    web_search_used: bool = False
    memory_search_used: bool = False


class PMOrchestrator:
    def __init__(self):
        self._agent_settings = get_agent_settings()
        self._canvas = get_canvas_manager()
        self._conversation: list[ChatMessage] = []
        self._web_search = web_search
        self._qdrant_service = None

    def _get_llm(self) -> LLMProxy:
        settings = get_settings()
        return LLMProxy(base_url=settings.get_base_url(), model=settings.model)

    async def _get_qdrant_service(self):
        if self._qdrant_service is None:
            from app.services.qdrant_service import QdrantService
            settings = get_app_settings().qdrant
            if settings.enabled:
                self._qdrant_service = await QdrantService.get_instance()
                if not self._qdrant_service.is_enabled():
                    await self._qdrant_service.initialize()
        return self._qdrant_service

    async def _search_project_memory(self, query: str) -> tuple[str, list[RAGResult]]:
        try:
            settings = get_app_settings().qdrant
            if not settings.enabled or not settings.use_memory_search:
                return "", []
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled():
                results = await qdrant.search(
                    query=query,
                    collection=settings.collection_canvas,
                    limit=3,
                    score_threshold=0.7,
                )
                if results:
                    context_parts = []
                    rag_results = []
                    for r in results:
                        context_parts.append(f"Previous project context:\n{r.content[:1000]}")
                        rag_results.append(RAGResult(
                            id=r.id,
                            content=r.content[:500],
                            score=r.score,
                            collection=settings.collection_canvas,
                        ))
                    logger.info(f"Found {len(results)} similar project contexts in Qdrant")
                    return "\n\n---\n\n".join(context_parts), rag_results
        except Exception as e:
            logger.warning(f"Qdrant search for project memory failed: {e}")
        return "", []

    async def _index_project_context(self, canvas_summary: str) -> None:
        try:
            qdrant = await self._get_qdrant_service()
            if qdrant and qdrant.is_enabled():
                from app.models.vectors import VectorDocument
                settings = get_app_settings().qdrant
                doc = VectorDocument(
                    content=canvas_summary,
                    metadata={
                        "type": "project_canvas",
                        "timestamp": datetime.now().isoformat(),
                    },
                )
                await qdrant.index_document(doc, settings.collection_canvas)
                logger.debug("Indexed project canvas to Qdrant")
        except Exception as e:
            logger.warning(f"Failed to index project context: {e}")

    def _should_research(self, message: str) -> bool:
        """Check if the message contains triggers that suggest web research is needed."""
        app_settings = get_app_settings()
        if not app_settings.web_search.enabled:
            return False
        msg_lower = message.lower()
        for trigger in app_settings.web_search.research_triggers:
            if trigger in msg_lower:
                return True
        return False

    async def _perform_research(self, query: str) -> str:
        """Perform web search and return formatted context."""
        app_settings = get_app_settings()
        if not app_settings.web_search.enabled:
            return ""
        results = await self._web_search.search(query, max_results=5)
        if results:
            formatted = self._web_search.format_results_as_context(results)
            logger.info(f"Web search for '{query}' returned {len(results)} results")
            return formatted
        return ""

    def _get_pm_system_prompt(self) -> str:
        return self._agent_settings.project_manager.prompts.system

    def _get_specialist_system_prompt(self, agent_id: str) -> str:
        specialist = self._agent_settings.specialists.get(agent_id)
        if specialist:
            return specialist.prompts.system
        raise ValueError(f"Unknown specialist: {agent_id}")

    def _build_pm_context(self) -> str:
        canvas_prompt = self._canvas.export_for_prompt()
        recent_messages = self._conversation[-10:] if self._conversation else []
        conversation_text = "\n".join(
            [f"{msg.role.upper()}: {msg.content}" for msg in recent_messages]
        )
        return f"{canvas_prompt}\n\nRecent Conversation:\n{conversation_text}"

    async def process_message(self, user_message: str) -> PMResponse:
        mention_info = create_mention_summary(user_message)
        user_mentioned_agents = mention_info["agents"]
        clean_message = mention_info["stripped_message"]

        self._conversation.append(
            ChatMessage(
                id=f"user-{datetime.now().timestamp()}",
                role="user",
                content=user_message,
                timestamp=datetime.now(),
                mentions=user_mentioned_agents,
            )
        )

        response = PMResponse()

        memory_context, rag_results = await self._search_project_memory(clean_message)
        if rag_results:
            response.rag_results = rag_results
            response.memory_search_used = True

        if user_mentioned_agents:
            for agent_id in user_mentioned_agents:
                if agent_id != "pm":
                    invocation = await self._invoke_specialist(
                        agent_id, clean_message, memory_context
                    )
                    response.agent_invocations.append(invocation)
                    if invocation.success:
                        response.canvas_updates.append(agent_id)

        pm_response, pm_metrics, web_used = await self._generate_pm_response(
            clean_message, response.agent_invocations, memory_context
        )
        response.response = pm_response
        response.metrics = pm_metrics
        response.web_search_used = web_used

        pm_mention_info = create_mention_summary(pm_response)
        pm_mentioned_agents = pm_mention_info["agents"]
        already_invoked = {inv.agent_id for inv in response.agent_invocations}

        for agent_id in pm_mentioned_agents:
            if agent_id != "pm" and agent_id not in already_invoked:
                invocation = await self._invoke_specialist(
                    agent_id, clean_message, memory_context
                )
                response.agent_invocations.append(invocation)
                if invocation.success:
                    response.canvas_updates.append(agent_id)

        response.suggestions = suggest_agents_for_message(clean_message)

        self._conversation.append(
            ChatMessage(
                id=f"assistant-{datetime.now().timestamp()}",
                role="assistant",
                content=pm_response,
                timestamp=datetime.now(),
                agent_id="pm",
                metrics=pm_metrics,
            )
        )

        if response.canvas_updates:
            canvas_summary = self._canvas.export_for_prompt()
            await self._index_project_context(canvas_summary)

        return response

    async def _generate_pm_response(
        self, user_message: str, invocations: list[AgentInvocation], memory_context: str = ""
    ) -> tuple[str, APICallMetrics, bool]:
        llm = self._get_llm()
        context = self._build_pm_context()
        web_search_used = False

        invocation_summary = ""
        if invocations:
            summaries = []
            for inv in invocations:
                status = "✓" if inv.success else "✗"
                summaries.append(
                    f"- {format_agent_mention(inv.agent_id)} {status}: {inv.content[:200]}..."
                )
            invocation_summary = "\n\nAgent Updates:\n" + "\n".join(summaries)

        memory_section = ""
        if memory_context:
            memory_section = f"\n\n## Retrieved Project Memory\n{memory_context}\n"

        research_section = ""
        if self._should_research(user_message):
            research_context = await self._perform_research(user_message)
            if research_context:
                research_section = f"\n\n## Web Research Results\n{research_context}\n"
                web_search_used = True

        messages = [
            {"role": "system", "content": self._get_pm_system_prompt()},
            {
                "role": "user",
                "content": f"Context:\n{context}{invocation_summary}{memory_section}{research_section}\n\nUser message: {user_message}",
            },
        ]

        response, metrics = await llm.chat_completion_with_metrics(messages, "pm")
        return response, metrics, web_search_used

    async def _invoke_specialist(
        self, agent_id: str, context_message: str, memory_context: str = ""
    ) -> AgentInvocation:
        try:
            specialist = self._agent_settings.specialists.get(agent_id)
            if not specialist:
                return AgentInvocation(
                    agent_id=agent_id,
                    triggered_by="mention",
                    content="",
                    success=False,
                    error=f"Unknown specialist: {agent_id}",
                )

            if not specialist.enabled:
                return AgentInvocation(
                    agent_id=agent_id,
                    triggered_by="mention",
                    content="",
                    success=False,
                    error=f"Specialist {agent_id} is disabled",
                )

            research_context = ""
            if self._should_research(context_message):
                research_context = await self._perform_research(context_message)
                if research_context:
                    research_context = (
                        f"\n\n## Web Research Results\n{research_context}\n"
                    )

            llm = self._get_llm()
            canvas_state = self._canvas.export_for_prompt()

            identity_section = self._canvas.get_section("identity")
            identity_content = identity_section.content if identity_section else ""

            extraction_prompt = specialist.prompts.extraction.format(
                conversation=context_message,
                canvas_state=canvas_state,
                identity=identity_content,
            )

            if memory_context:
                extraction_prompt = f"{extraction_prompt}\n\n## Retrieved Project Memory\n{memory_context}\n"

            if research_context:
                extraction_prompt = f"{extraction_prompt}{research_context}"

            messages = [
                {"role": "system", "content": specialist.prompts.system},
                {"role": "user", "content": extraction_prompt},
            ]

            response, metrics = await llm.chat_completion_with_metrics(
                messages, agent_id
            )

            section_id = specialist.section_id
            self._canvas.update_section(
                section_id=section_id,
                title=specialist.name,
                content=response,
                agent_id=agent_id,
            )

            return AgentInvocation(
                agent_id=agent_id,
                triggered_by="mention",
                content=response,
                metrics=metrics,
                success=True,
            )

        except Exception as e:
            logger.error(f"Error invoking specialist {agent_id}: {e}", exc_info=True)
            return AgentInvocation(
                agent_id=agent_id,
                triggered_by="mention",
                content="",
                success=False,
                error=str(e),
            )

    def get_greeting(self) -> str:
        return self._agent_settings.project_manager.prompts.greeting

    def get_conversation(self) -> list[ChatMessage]:
        return self._conversation

    def clear_conversation(self) -> None:
        self._conversation = []

    def reset(self) -> None:
        self.clear_conversation()
        self._canvas.reset_canvas()
        telemetry = TelemetryService.get_instance_sync()
        telemetry.reset_session()


_orchestrator: PMOrchestrator | None = None


def get_pm_orchestrator() -> PMOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = PMOrchestrator()
    return _orchestrator
