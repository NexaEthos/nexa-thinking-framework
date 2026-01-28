import logging
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.llm_proxy import LLMProxy
from ..services.orchestrator import ChainOfThoughtOrchestrator
from ..services.question_manager import QuestionManager
from ..services.llm_settings import get_settings
from ..services.canvas_agent import canvas_agent
from ..services.websocket_manager import websocket_manager
from ..services.agent_settings import get_agent_settings
from ..services.app_settings import get_app_settings
from ..services.web_search import web_search
import os

router = APIRouter(prefix="/project", tags=["project"])
logger = logging.getLogger(__name__)

AGENT_SEQUENCE = ["researcher", "identity", "definition", "resources", "execution"]
AGENT_NAMES = {
    "researcher": "Researcher",
    "identity": "The Visionary",
    "definition": "The Architect", 
    "resources": "The Resource Manager",
    "execution": "The Strategist",
}
AGENT_TASKS = {
    "researcher": "gather context and relevant information from the web",
    "identity": "define the project identity - name and core vision",
    "definition": "outline the scope, features, and constraints",
    "resources": "identify the tech stack, tools, and resources needed",
    "execution": "create a phased development plan with milestones",
}
AGENT_ACKNOWLEDGMENTS = {
    "researcher": "Research complete. {count} sources found and indexed.",
    "identity": "Project identity defined.",
    "definition": "Scope and features outlined.",
    "resources": "Resources and tech stack identified.",
    "execution": "Execution plan drafted.",
}

_qdrant_service = None


async def get_qdrant_service():
    global _qdrant_service
    if _qdrant_service is None:
        from ..services.qdrant_service import QdrantService
        settings = get_app_settings().qdrant
        if settings.enabled:
            _qdrant_service = await QdrantService.get_instance()
            if not _qdrant_service.is_enabled():
                await _qdrant_service.initialize()
    return _qdrant_service


async def search_project_memory(query: str) -> tuple[str, list[dict]]:
    try:
        settings = get_app_settings().qdrant
        if not settings.enabled or not settings.use_memory_search:
            return "", []
        qdrant = await get_qdrant_service()
        if qdrant and qdrant.is_enabled():
            results = await qdrant.search(
                query=query,
                collection=settings.collection_canvas,
                limit=3,
                score_threshold=0.5,
            )
            if results:
                context_parts = []
                rag_results = []
                for r in results:
                    context_parts.append(f"Previous project context:\n{r.content[:1000]}")
                    rag_results.append({
                        "id": r.id,
                        "content": r.content[:500],
                        "score": r.score,
                        "collection": settings.collection_canvas,
                    })
                logger.info(f"Found {len(results)} similar project contexts in Qdrant")
                return "\n\n---\n\n".join(context_parts), rag_results
    except Exception as e:
        logger.warning(f"Qdrant search for project memory failed: {e}")
    return "", []


async def index_project_canvas(canvas_summary: str) -> None:
    try:
        qdrant = await get_qdrant_service()
        if qdrant and qdrant.is_enabled():
            from ..models.vectors import VectorDocument
            from datetime import datetime
            settings = get_app_settings().qdrant
            doc = VectorDocument(
                content=canvas_summary,
                collection=settings.collection_canvas,
                metadata={
                    "type": "project_canvas",
                    "timestamp": datetime.now().isoformat(),
                },
            )
            await qdrant.index_document(doc)
            logger.info("Indexed project canvas to Qdrant")
    except Exception as e:
        logger.warning(f"Failed to index project context: {e}")

QUESTIONS_FILE = os.getenv("QUESTIONS_FILE", "questions.json")


def get_orchestrator() -> ChainOfThoughtOrchestrator:
    settings = get_settings()
    llm_proxy = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
    question_manager = QuestionManager(questions_file=QUESTIONS_FILE)
    return ChainOfThoughtOrchestrator(
        llm_proxy=llm_proxy, question_manager=question_manager
    )


class ProjectChatMessage(BaseModel):
    role: str
    content: str


class CanvasSection(BaseModel):
    id: str
    title: str
    content: str | dict


class ProjectChatRequest(BaseModel):
    messages: list[ProjectChatMessage]
    current_canvas: list[CanvasSection] = []


class CanvasUpdate(BaseModel):
    id: str
    title: str
    content: str


class ProjectChatResponse(BaseModel):
    response: str
    canvas_updates: list[CanvasUpdate] = []
    reasoning_used: bool = False
    mentioned_agents: list[str] = []


def get_pm_system_prompt() -> str:
    return get_agent_settings().project_manager.prompts.system


def get_pm_synthesis_prompt() -> str:
    return get_agent_settings().project_manager.prompts.synthesis


def format_canvas_for_prompt(canvas: list[CanvasSection]) -> str:
    if not canvas:
        return "Empty - no sections yet"
    parts = []
    for s in canvas:
        if isinstance(s.content, dict):
            import json
            content_str = json.dumps(s.content)[:200]
        else:
            content_str = str(s.content)
        parts.append(f"- {s.title}: {content_str}")
    return "\n".join(parts)


def should_research(message: str) -> bool:
    """Check if the message contains triggers that suggest web research is needed."""
    app_settings = get_app_settings()
    if not app_settings.web_search.enabled:
        return False
    msg_lower = message.lower()
    for trigger in app_settings.web_search.research_triggers:
        if trigger in msg_lower:
            return True
    return False


async def perform_research(query: str, agent_id: str = "") -> str:
    """Perform web search and return formatted context.
    
    For specialists with search_query_generation prompt, uses LLM to generate focused queries.
    """
    app_settings = get_app_settings()
    if not app_settings.web_search.enabled:
        return ""
    
    all_results = []
    agent_settings = get_agent_settings()
    specialist = agent_settings.specialists.get(agent_id)
    
    # Check if this specialist has a custom search query generation prompt
    if specialist and specialist.prompts.search_query_generation:
        settings = get_settings()
        llm = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
        
        # Use the configurable prompt from agent_settings.json
        prompt_template = specialist.prompts.search_query_generation
        prompt_content = prompt_template.replace("{query}", query[:500])
        
        query_gen_messages = [
            {"role": "system", "content": prompt_content},
            {"role": "user", "content": query[:500]}
        ]
        
        try:
            response, _ = await llm.chat_completion_with_metrics(query_gen_messages, "query_gen")
            # Parse the JSON array from response
            import json
            import re
            match = re.search(r'\[.*\]', response, re.DOTALL)
            if match:
                search_queries = json.loads(match.group())
                for search_query in search_queries[:3]:
                    results = await web_search.search(search_query, max_results=3)
                    all_results.extend(results)
                    logger.info(f"{agent_id} search: '{search_query}' returned {len(results)} results")
        except Exception as e:
            logger.warning(f"Query generation failed for {agent_id}, using default search: {e}")
            results = await web_search.search(query, max_results=5)
            all_results = results
    else:
        # Default search for agents without custom query generation
        results = await web_search.search(query, max_results=5)
        all_results = results
    
    if all_results:
        formatted = web_search.format_results_as_context(all_results)
        logger.info(f"Web search for '{query[:50]}...' returned {len(all_results)} results")
        return formatted
    return ""


async def invoke_specialist(
    agent_id: str,
    conversation: list[dict],
    current_canvas: list[dict],
) -> dict | None:
    """Invoke a specialist agent to update its canvas section."""
    agent_settings = get_agent_settings()
    specialist = agent_settings.specialists.get(agent_id)
    if not specialist or not specialist.enabled:
        logger.warning(f"Specialist {agent_id} not found or disabled")
        return None

    settings = get_settings()
    llm = LLMProxy(base_url=settings.get_base_url(), model=settings.model)

    conversation_text = "\n".join(
        [f"{msg['role'].upper()}: {msg['content']}" for msg in conversation[-6:]]
    )

    last_user_msg = ""
    for msg in reversed(conversation):
        if msg["role"] == "user":
            last_user_msg = msg["content"]
            break

    research_context = ""
    if last_user_msg and should_research(last_user_msg):
        logger.info(f"Research triggered for specialist {agent_id}: {last_user_msg[:50]}...")
        research_context = await perform_research(last_user_msg, agent_id)
        if research_context:
            research_context = f"\n\n## Web Research Results\n{research_context}\n"

    canvas_text = "Empty"
    if current_canvas:
        canvas_text = "\n".join(
            [f"- {s.get('title', s['id'])}: {s.get('content', '')[:200]}"
             for s in current_canvas]
        )

    identity_content = ""
    definition_content = ""
    resources_content = ""
    for section in current_canvas:
        section_id = section.get("id")
        if section_id == "identity":
            identity_content = section.get("content", "")
        elif section_id == "definition":
            definition_content = section.get("content", "")
        elif section_id == "resources":
            resources_content = section.get("content", "")

    extraction_prompt = specialist.prompts.extraction
    extraction_prompt = extraction_prompt.replace("{conversation}", conversation_text)
    extraction_prompt = extraction_prompt.replace("{canvas_state}", canvas_text)
    extraction_prompt = extraction_prompt.replace("{identity}", identity_content)
    extraction_prompt = extraction_prompt.replace("{definition}", definition_content)
    extraction_prompt = extraction_prompt.replace("{resources}", resources_content)

    if research_context:
        extraction_prompt = f"{extraction_prompt}{research_context}"

    messages = [
        {"role": "system", "content": specialist.prompts.system},
        {"role": "user", "content": extraction_prompt},
    ]

    try:
        response, _ = await llm.chat_completion_with_metrics(messages, agent_id)
        logger.info(f"Specialist {agent_id} invoked successfully")
        return {
            "id": agent_id,
            "title": specialist.name,
            "content": response,
            "agent_id": agent_id,
        }
    except Exception as e:
        logger.error(f"Error invoking specialist {agent_id}: {e}")
        return None


def should_use_chain_of_thought(message: str, message_count: int) -> bool:
    return False


def is_initial_request(canvas: list[CanvasSection]) -> bool:
    """Check if this is the initial request (canvas is empty or mostly empty)."""
    filled_sections = 0
    for c in canvas:
        if c.id == "researcher":
            if isinstance(c.content, dict) and c.content.get("sources"):
                filled_sections += 1
        elif isinstance(c.content, str) and c.content.strip() and len(c.content.strip()) > 10:
            filled_sections += 1
    return filled_sections < 2


async def build_pipeline_state(
    agents: list[str],
    completed: set[str],
    current: str | None = None,
    results: dict | None = None,
) -> list[dict]:
    """Build pipeline state for broadcasting."""
    results = results or {}
    pipeline = []
    for agent_id in agents:
        if agent_id in completed:
            status = "complete"
        elif agent_id == current:
            status = "active"
        else:
            status = "pending"
        pipeline.append({
            "id": agent_id,
            "name": AGENT_NAMES.get(agent_id, agent_id.title()),
            "status": status,
            "result_summary": results.get(agent_id, ""),
        })
    return pipeline


async def invoke_researcher(
    user_message: str,
    conversation: list[dict],
) -> tuple[str, int, dict]:
    """Invoke researcher to gather web context.
    
    Returns: (formatted_context, source_count, research_data)
    research_data contains structured info for canvas display.
    """
    app_settings = get_app_settings()
    research_data: dict = {
        "queries": [],
        "sources": [],
        "indexed_to_rag": False,
        "rag_collection": None,
    }
    
    if not app_settings.web_search.enabled:
        return "", 0, research_data
    
    settings = get_settings()
    llm = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
    
    query_gen_prompt = """Generate 2-3 focused search queries to research this project idea.
Return ONLY a JSON array of search query strings, nothing else.
Example: ["query 1", "query 2"]

Project idea: {query}"""
    
    messages = [
        {"role": "system", "content": query_gen_prompt.format(query=user_message[:500])},
        {"role": "user", "content": "Generate search queries."},
    ]
    
    try:
        import json
        import re
        response, _ = await llm.chat_completion_with_metrics(messages, "researcher")
        
        match = re.search(r'\[.*?\]', response, re.DOTALL)
        if match:
            try:
                search_queries = json.loads(match.group())
            except json.JSONDecodeError:
                search_queries = [user_message[:100]]
        else:
            search_queries = [user_message[:100]]
        
        if not isinstance(search_queries, list) or not search_queries:
            search_queries = [user_message[:100]]
        
        research_data["queries"] = search_queries[:3]
        
        all_results = []
        for query in search_queries[:3]:
            results = await web_search.search(query, max_results=3)
            all_results.extend(results)
            logger.info(f"Researcher search: '{query}' returned {len(results)} results")
        
        if all_results:
            formatted = web_search.format_results_as_context(all_results)
            
            for r in all_results:
                research_data["sources"].append({
                    "title": r.get("title", "Untitled"),
                    "url": r.get("url", ""),
                    "snippet": r.get("snippet", "")[:200],
                })
            
            qdrant_settings = app_settings.qdrant
            if qdrant_settings.enabled and qdrant_settings.use_memory_search:
                await index_project_canvas(f"Research for: {user_message[:200]}\n\n{formatted[:2000]}")
                research_data["indexed_to_rag"] = True
                research_data["rag_collection"] = qdrant_settings.collection_canvas
                logger.info(f"Research indexed to RAG collection: {qdrant_settings.collection_canvas}")
            
            return formatted, len(all_results), research_data
    except Exception as e:
        logger.warning(f"Researcher failed: {e}")
    
    return "", 0, research_data


async def orchestrate_full_cycle(
    user_message: str,
    conversation: list[dict],
    current_canvas: list[dict],
) -> tuple[str, list[dict]]:
    """Orchestrate a full cycle through all agents sequentially."""
    app_settings = get_app_settings()
    completed_agents: set[str] = set()
    results: dict[str, str] = {}
    canvas_updates: list[dict] = []
    research_context = ""
    
    agents_to_run = AGENT_SEQUENCE.copy()
    if not app_settings.web_search.enabled:
        agents_to_run.remove("researcher")
        logger.info("Skipping researcher - web search disabled")
    
    await websocket_manager.broadcast_agent_message(
        agent_id="pm",
        agent_name="Project Manager",
        message="Let me coordinate the team to build your project canvas.",
        message_type="info",
    )
    
    for agent_id in agents_to_run:
        pipeline_state = await build_pipeline_state(agents_to_run, completed_agents, agent_id, results)
        await websocket_manager.broadcast_pipeline_progress(pipeline_state, agent_id)
        
        task_msg = f"@{agent_id}, {AGENT_TASKS.get(agent_id, 'process this request')}"
        await websocket_manager.broadcast_agent_message(
            agent_id="pm",
            agent_name="Project Manager",
            message=task_msg,
            message_type="task",
        )
        
        if agent_id == "researcher":
            research_context, source_count, research_data = await invoke_researcher(user_message, conversation)
            results[agent_id] = f"{source_count} sources"
            ack_msg = AGENT_ACKNOWLEDGMENTS[agent_id].format(count=source_count)
            
            researcher_section = {
                "id": "researcher",
                "title": "Research",
                "content": research_data,
                "agent_id": "researcher",
            }
            canvas_updates.append(researcher_section)
            await websocket_manager.broadcast_project_canvas([researcher_section])
        else:
            conversation_with_research = conversation.copy()
            if research_context:
                conversation_with_research.append({
                    "role": "system",
                    "content": f"## Research Context\n{research_context[:3000]}"
                })
            
            section = await invoke_specialist(
                agent_id, 
                conversation_with_research, 
                current_canvas,
            )
            
            if section:
                canvas_updates.append(section)
                await websocket_manager.broadcast_project_canvas([section])
                
                for i, c in enumerate(current_canvas):
                    if c["id"] == agent_id:
                        current_canvas[i] = section
                        break
                else:
                    current_canvas.append(section)
                
                content_preview = section.get("content", "")[:50]
                results[agent_id] = f"{content_preview}..."
            
            ack_msg = AGENT_ACKNOWLEDGMENTS.get(agent_id, "Task complete.")
        
        await websocket_manager.broadcast_agent_message(
            agent_id=agent_id,
            agent_name=AGENT_NAMES.get(agent_id, agent_id.title()),
            message=f"{ack_msg} @pm",
            message_type="acknowledgment",
        )
        
        completed_agents.add(agent_id)
    
    pipeline_state = await build_pipeline_state(agents_to_run, completed_agents, None, results)
    await websocket_manager.broadcast_pipeline_progress(pipeline_state, None)
    
    final_message = "Canvas complete! All sections have been filled based on your vision. What would you like to refine or explore next?"
    
    return final_message, canvas_updates


async def orchestrate_update(
    user_message: str,
    conversation: list[dict],
    current_canvas: list[dict],
) -> tuple[str, list[dict]]:
    """PM autonomously decides which agents to invoke for an update request."""
    settings = get_settings()
    llm = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
    
    canvas_summary = "\n".join([
        f"- {c.get('title', c['id'])}: {c.get('content', '')[:100]}..."
        for c in current_canvas if c.get('content')
    ])
    
    decision_prompt = f"""You are a Project Manager deciding which specialist agents to invoke based on a user request.

Current canvas state:
{canvas_summary}

User request: {user_message}

Available specialists:
- identity: Updates project name, vision, description
- definition: Updates scope, features, constraints, success criteria
- resources: Updates tech stack, tools, materials, budget
- execution: Updates phases, milestones, action plan
- researcher: Gathers web research (only if new external information is needed)

Based on the user's request, which agents should be invoked? Consider:
1. Only invoke agents whose sections need updating
2. Invoke researcher ONLY if new external information is needed
3. Order matters: identity → definition → resources → execution

Return ONLY a JSON array of agent IDs to invoke, in order. Example: ["definition", "resources"]
If no updates needed, return: []"""

    messages = [
        {"role": "system", "content": decision_prompt},
        {"role": "user", "content": "Which agents should handle this request?"},
    ]
    
    try:
        import json
        import re
        response, _ = await llm.chat_completion_with_metrics(messages, "pm_router")
        
        match = re.search(r'\[.*?\]', response, re.DOTALL)
        if match:
            try:
                agents_to_invoke = json.loads(match.group())
                agents_to_invoke = [a for a in agents_to_invoke if a in AGENT_SEQUENCE]
            except json.JSONDecodeError:
                agents_to_invoke = ["definition", "resources"]
        else:
            agents_to_invoke = ["definition", "resources"]
    except Exception as e:
        logger.warning(f"PM routing decision failed: {e}")
        agents_to_invoke = ["definition", "resources"]
    
    if not agents_to_invoke:
        return "I don't see any changes needed. Could you clarify what you'd like to update?", []
    
    app_settings = get_app_settings()
    if "researcher" in agents_to_invoke:
        agents_to_invoke.remove("researcher")
    
    if app_settings.web_search.enabled:
        agents_to_invoke.insert(0, "researcher")
    
    completed_agents: set[str] = set()
    results: dict[str, str] = {}
    canvas_updates: list[dict] = []
    research_context = ""
    
    agent_list = ", ".join([f"@{a}" for a in agents_to_invoke])
    await websocket_manager.broadcast_agent_message(
        agent_id="pm",
        agent_name="Project Manager",
        message=f"I'll update the following sections: {agent_list}",
        message_type="info",
    )
    
    for agent_id in agents_to_invoke:
        pipeline_state = await build_pipeline_state(agents_to_invoke, completed_agents, agent_id, results)
        await websocket_manager.broadcast_pipeline_progress(pipeline_state, agent_id)
        
        task_msg = f"@{agent_id}, update based on: {user_message[:100]}"
        await websocket_manager.broadcast_agent_message(
            agent_id="pm",
            agent_name="Project Manager",
            message=task_msg,
            message_type="task",
        )
        
        if agent_id == "researcher":
            research_context, source_count, research_data = await invoke_researcher(user_message, conversation)
            results[agent_id] = f"{source_count} sources"
            ack_msg = AGENT_ACKNOWLEDGMENTS[agent_id].format(count=source_count)
            
            researcher_section = {
                "id": "researcher",
                "title": "Research",
                "content": research_data,
                "agent_id": "researcher",
            }
            canvas_updates.append(researcher_section)
            await websocket_manager.broadcast_project_canvas([researcher_section])
        else:
            conversation_with_context = conversation.copy()
            if research_context:
                conversation_with_context.append({
                    "role": "system",
                    "content": f"## Research Context\n{research_context[:3000]}"
                })
            
            section = await invoke_specialist(
                agent_id,
                conversation_with_context,
                current_canvas,
            )
            
            if section:
                canvas_updates.append(section)
                await websocket_manager.broadcast_project_canvas([section])
                
                for i, c in enumerate(current_canvas):
                    if c["id"] == agent_id:
                        current_canvas[i] = section
                        break
                else:
                    current_canvas.append(section)
                
                results[agent_id] = "Updated"
            
            ack_msg = AGENT_ACKNOWLEDGMENTS.get(agent_id, "Task complete.")
        
        await websocket_manager.broadcast_agent_message(
            agent_id=agent_id,
            agent_name=AGENT_NAMES.get(agent_id, agent_id.title()),
            message=f"{ack_msg} @pm",
            message_type="acknowledgment",
        )
        
        completed_agents.add(agent_id)
    
    pipeline_state = await build_pipeline_state(agents_to_invoke, completed_agents, None, results)
    await websocket_manager.broadcast_pipeline_progress(pipeline_state, None)
    
    updated_sections = ", ".join([AGENT_NAMES.get(a, a) for a in agents_to_invoke if a != "researcher"])
    final_message = f"Updates complete! I've refreshed: {updated_sections}. What else would you like to adjust?"
    
    return final_message, canvas_updates


async def collect_llm_response(
    llm: LLMProxy, messages: list, agent_id: str = "pm"
) -> str:
    """Collect LLM response with telemetry tracking"""
    content, _ = await llm.chat_completion_with_metrics(messages, agent_id)
    return content


@router.post("/chat", response_model=ProjectChatResponse)
async def project_chat(request: ProjectChatRequest) -> ProjectChatResponse:
    settings = get_settings()
    llm = LLMProxy(base_url=settings.get_base_url(), model=settings.model)

    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        return ProjectChatResponse(
            response="I'm here to help! Tell me about your project idea."
        )

    latest_user = user_messages[-1].content
    message_count = len(user_messages)

    use_cot = should_use_chain_of_thought(latest_user, message_count)

    if use_cot:
        orchestrator = get_orchestrator()

        context_prompt = f"""Project brainstorming context. The user is developing a project idea.

Current canvas state:
{format_canvas_for_prompt(request.current_canvas)}

Recent conversation:
{chr(10).join([f'{m.role}: {m.content}' for m in request.messages[-4:]])}

User's latest input to analyze:
{latest_user}"""

        _, chain = await orchestrator.process_request(context_prompt)

        analysis_summary = chain.final_answer or ""
        if chain.steps:
            question_answers = [
                f"Q: {s.question}\nA: {s.llm_response[:500]}"
                for s in chain.steps
                if s.type == "question" and s.llm_response
            ]
            if question_answers:
                analysis_summary = "\n\n".join(question_answers[:3])

        synthesis_messages = [
            {
                "role": "system",
                "content": get_pm_synthesis_prompt().format(
                    user_message=latest_user, analysis=analysis_summary
                ),
            },
            {"role": "user", "content": "Generate the conversational response."},
        ]
        response = await collect_llm_response(llm, synthesis_messages)
        reasoning_used = True
    else:
        chat_messages = [{"role": "system", "content": get_pm_system_prompt()}]
        for msg in request.messages:
            chat_messages.append({"role": msg.role, "content": msg.content})

        response = await collect_llm_response(llm, chat_messages)
        reasoning_used = False

    full_conversation = [
        {"role": m.role, "content": m.content} for m in request.messages
    ]
    full_conversation.append({"role": "assistant", "content": response})

    current_canvas_dicts = [
        {"id": c.id, "title": c.title, "content": c.content}
        for c in request.current_canvas
    ]

    logger.info(
        f"Canvas Agent: Analyzing conversation with {len(full_conversation)} messages"
    )
    try:
        raw_updates = await canvas_agent.analyze_conversation(
            full_conversation, current_canvas_dicts
        )
        canvas_updates = [
            CanvasUpdate(
                id=u["id"], title=u.get("title", u["id"].title()), content=u["content"]
            )
            for u in raw_updates
        ]
        logger.info(f"Canvas Agent: Generated {len(canvas_updates)} updates")
    except Exception as e:
        logger.error(f"Canvas Agent error: {e}", exc_info=True)
        canvas_updates = []

    return ProjectChatResponse(
        response=response, canvas_updates=canvas_updates, reasoning_used=reasoning_used
    )


@router.post("/chat/stream")
async def project_chat_stream(request: ProjectChatRequest):
    """Stream project chat responses via WebSocket with sequential agent orchestration."""
    user_messages = [m for m in request.messages if m.role == "user"]
    logger.info(
        f"Project chat stream: {len(request.messages)} messages, "
        f"{len(request.current_canvas)} canvas sections"
    )
    
    if not user_messages:
        await websocket_manager.broadcast_project_complete(
            response="I'm here to help! Tell me about your project idea.",
            canvas_updates=[],
            reasoning_used=False,
        )
        return {"status": "completed"}

    latest_user = user_messages[-1].content

    app_settings = get_app_settings()
    if app_settings.qdrant.enabled and app_settings.qdrant.use_memory_search:
        memory_context, rag_results = await search_project_memory(latest_user)
        if rag_results:
            await websocket_manager.broadcast_project_tools(
                memory_search_used=True,
                rag_results=rag_results,
            )

    full_conversation = [
        {"role": m.role, "content": m.content} for m in request.messages
    ]

    current_canvas_dicts = []
    for c in request.current_canvas:
        content = c.content
        if isinstance(content, dict):
            import json
            content = json.dumps(content)
        current_canvas_dicts.append({"id": c.id, "title": c.title, "content": content})

    initial_request = is_initial_request(request.current_canvas)
    
    if initial_request:
        logger.info("Initial request detected - running full orchestration cycle")
        final_message, canvas_updates = await orchestrate_full_cycle(
            latest_user,
            full_conversation,
            current_canvas_dicts,
        )
    else:
        logger.info("Update request detected - PM will decide which agents to invoke")
        final_message, canvas_updates = await orchestrate_update(
            latest_user,
            full_conversation,
            current_canvas_dicts,
        )

    await websocket_manager.broadcast_agent_message(
        agent_id="pm",
        agent_name="Project Manager",
        message=final_message,
        message_type="info",
    )

    if canvas_updates:
        import json
        summary_parts = []
        for u in canvas_updates:
            content = u.get('content', '')
            if isinstance(content, dict):
                content_str = json.dumps(content)[:500]
            else:
                content_str = str(content)[:500]
            summary_parts.append(f"## {u.get('title', u['id'])}\n{content_str}")
        canvas_summary = "\n".join(summary_parts)
        await index_project_canvas(canvas_summary)

    await websocket_manager.broadcast_project_complete(
        response=final_message,
        canvas_updates=[],
        reasoning_used=False,
        mentioned_agents=[],
    )

    return {"status": "completed"}
