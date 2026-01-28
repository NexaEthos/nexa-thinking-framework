import asyncio
import json
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.researcher_orchestrator import (
    get_researcher_orchestrator,
    ResearcherResponse,
)
from ..services.agent_settings import get_agent_settings
from ..services.websocket_manager import websocket_manager
from ..services.app_settings import get_app_settings

router = APIRouter(prefix="/researcher", tags=["researcher"])
logger = logging.getLogger(__name__)

RESEARCH_PIPELINE = [
    {"id": "web_researcher", "name": "Web Researcher", "emoji": "🔍"},
    {"id": "rag_indexer", "name": "RAG Indexer", "emoji": "📚"},
    {"id": "document_writer", "name": "Document Writer", "emoji": "📝"},
    {"id": "fact_checker", "name": "Fact Checker", "emoji": "✅"},
]


class ResearcherChatMessage(BaseModel):
    role: str
    content: str


class ResearcherChatRequest(BaseModel):
    message: str
    research_data: str = ""


class AgentInvocationResponse(BaseModel):
    agent_id: str
    success: bool
    content: str
    error: str | None = None


class ResearcherChatResponse(BaseModel):
    response: str
    research_data: str
    agent_invocations: list[AgentInvocationResponse] = []


class ResearchDataRequest(BaseModel):
    data: str


class ResearchDataResponse(BaseModel):
    success: bool
    data: str


@router.get("/greeting")
async def get_greeting() -> dict:
    orchestrator = get_researcher_orchestrator()
    return {"greeting": orchestrator.get_greeting()}


@router.post("/chat", response_model=ResearcherChatResponse)
async def researcher_chat(request: ResearcherChatRequest) -> ResearcherChatResponse:
    orchestrator = get_researcher_orchestrator()

    if request.research_data:
        orchestrator.set_research_data(request.research_data)

    result: ResearcherResponse = await orchestrator.process_message(request.message)

    invocations = [
        AgentInvocationResponse(
            agent_id=inv.agent_id,
            success=inv.success,
            content=inv.content,
            error=inv.error,
        )
        for inv in result.agent_invocations
    ]

    return ResearcherChatResponse(
        response=result.response,
        research_data=result.research_data,
        agent_invocations=invocations,
    )


async def broadcast_research_pipeline(
    agents: list[dict],
    current_agent: str | None = None,
    completed: set[str] | None = None,
):
    """Broadcast research pipeline progress via WebSocket."""
    completed = completed or set()
    pipeline_state = []
    for agent in agents:
        if agent["id"] in completed:
            status = "complete"
        elif agent["id"] == current_agent:
            status = "active"
        else:
            status = "pending"
        pipeline_state.append({
            "id": agent["id"],
            "name": agent["name"],
            "emoji": agent["emoji"],
            "status": status,
        })
    await websocket_manager.broadcast({
        "type": "research_pipeline",
        "data": {"agents": pipeline_state, "current_agent": current_agent},
    })


async def broadcast_research_agent_message(
    agent_id: str,
    agent_name: str,
    message: str,
    message_type: str = "info",
):
    """Broadcast a research agent message via WebSocket."""
    import datetime
    await websocket_manager.broadcast({
        "type": "research_agent_message",
        "data": {
            "agent_id": agent_id,
            "agent_name": agent_name,
            "message": message,
            "message_type": message_type,
            "timestamp": datetime.datetime.now().isoformat(),
        },
    })


async def broadcast_rag_content(
    action: str,
    content: str,
    metadata: dict,
):
    """Broadcast RAG content (retrieved or indexed) via WebSocket."""
    import datetime
    await websocket_manager.broadcast({
        "type": "rag_content",
        "data": {
            "action": action,
            "content": content,
            "metadata": metadata,
            "timestamp": datetime.datetime.now().isoformat(),
        },
    })


@router.post("/chat/stream")
async def researcher_chat_stream(request: ResearcherChatRequest):
    """Stream researcher output using Server-Sent Events with pipeline visualization"""
    orchestrator = get_researcher_orchestrator()
    app_settings = get_app_settings()

    if request.research_data:
        orchestrator.set_research_data(request.research_data)

    msg_lower = request.message.lower()
    is_fact_check = any(
        trigger in msg_lower
        for trigger in ["verify", "fact check", "confirm", "validate", "@fact_checker"]
    )

    async def generate():
        completed_agents: set[str] = set()
        
        await broadcast_research_agent_message(
            "orchestrator",
            "Research Orchestrator",
            "Starting research pipeline...",
            "info",
        )
        
        if is_fact_check:
            await broadcast_research_pipeline(RESEARCH_PIPELINE, "fact_checker", completed_agents)
            await broadcast_research_agent_message(
                "fact_checker",
                "Fact Checker",
                "Verifying claims in the document...",
                "task",
            )
            
            fact_result = await orchestrator.invoke_fact_checker_streaming()
            completed_agents.add("fact_checker")
            
            await broadcast_research_pipeline(RESEARCH_PIPELINE, None, completed_agents)
            await broadcast_research_agent_message(
                "fact_checker",
                "Fact Checker",
                "Verification complete.",
                "acknowledgment",
            )
            
            yield f"data: {json.dumps({'type': 'fact_check', 'content': fact_result.content, 'success': fact_result.success})}\n\n"
            final_data = orchestrator.get_research_data()
            yield f"data: {json.dumps({'type': 'done', 'research_data': final_data})}\n\n"
            return

        await broadcast_research_pipeline(RESEARCH_PIPELINE, "web_researcher", completed_agents)
        await broadcast_research_agent_message(
            "web_researcher",
            "Web Researcher",
            f"Searching the web for: {request.message[:80]}...",
            "task",
        )

        token_queue: asyncio.Queue[str | None] = asyncio.Queue()
        research_context_holder: dict = {"context": "", "sources": 0}

        async def on_chunk(token: str):
            await token_queue.put(token)

        async def run_researcher():
            try:
                agents = orchestrator._agent_settings.research_agents
                if agents and "researcher" in agents:
                    researcher = agents["researcher"]
                    if researcher.enabled:
                        query_prompt = researcher.prompts.search_query_generation
                        queries = await orchestrator._generate_search_queries(query_prompt, request.message)
                        research_context, rag_retrieval = await orchestrator._perform_research(queries)
                        research_context_holder["context"] = research_context
                        research_context_holder["sources"] = research_context.count("[") if research_context else 0
                        research_context_holder["rag_retrieval"] = rag_retrieval
                        
                        completed_agents.add("web_researcher")
                        await broadcast_research_pipeline(RESEARCH_PIPELINE, "rag_indexer", completed_agents)
                        await broadcast_research_agent_message(
                            "web_researcher",
                            "Web Researcher",
                            f"Found {research_context_holder['sources']} sources from web search.",
                            "acknowledgment",
                        )
                        
                        rag_active = app_settings.qdrant.enabled and orchestrator.is_rag_enabled()
                        rag_stats = await orchestrator.get_rag_stats()
                        
                        if rag_active:
                            collection_size = rag_stats.get("collection_size", 0)
                            retrieved_count = rag_retrieval.get("found", 0)
                            searched = rag_retrieval.get("searched", False)
                            
                            if retrieved_count > 0:
                                avg_score = rag_retrieval.get("avg_score", 0)
                                snippets = rag_retrieval.get("retrieved_snippets", [])
                                full_content = rag_retrieval.get("full_content", "")
                                
                                retrieval_msg = f"🎯 **Retrieved {retrieved_count} relevant document(s)** from knowledge base!\n\n"
                                retrieval_msg += "📖 **Click to view retrieved content** _(will appear in popup)_\n\n"
                                for i, snip in enumerate(snippets[:3], 1):
                                    retrieval_msg += f"**[{i}] {snip['source']}** (relevance: {snip['score']:.0%})\n"
                                    retrieval_msg += f"_{snip['preview']}_\n\n"
                                retrieval_msg += "👆 This prior research will be used to enrich the document."
                                
                                await broadcast_research_agent_message(
                                    "rag_indexer",
                                    "RAG Indexer",
                                    retrieval_msg,
                                    "acknowledgment",
                                )
                                
                                await broadcast_rag_content(
                                    action="retrieved",
                                    content=full_content,
                                    metadata={
                                        "count": retrieved_count,
                                        "avg_score": round(avg_score, 2),
                                        "snippets": snippets,
                                    },
                                )
                            elif searched:
                                await broadcast_research_agent_message(
                                    "rag_indexer",
                                    "RAG Indexer",
                                    f"🔍 Searched knowledge base ({collection_size} documents) - no highly relevant prior research found for this topic.\n\n"
                                    f"_New research will be indexed for future queries._",
                                    "info",
                                )
                            else:
                                await broadcast_research_agent_message(
                                    "rag_indexer",
                                    "RAG Indexer",
                                    f"📊 Knowledge base has **{collection_size} documents**.",
                                    "info",
                                )
                        else:
                            await broadcast_research_agent_message(
                                "rag_indexer",
                                "RAG Indexer",
                                "⚠️ **RAG disabled** - no knowledge retrieval or indexing.\n\n"
                                "_Enable RAG to build cumulative knowledge across research sessions!_",
                                "info",
                            )
                        
                        completed_agents.add("rag_indexer")
                        await broadcast_research_pipeline(RESEARCH_PIPELINE, "document_writer", completed_agents)
                        
                        await broadcast_research_agent_message(
                            "document_writer",
                            "Document Writer",
                            "Composing research document...",
                            "task",
                        )
                
                await orchestrator.invoke_researcher_streaming(request.message, on_chunk)
                
                if rag_active:
                    index_stats = orchestrator.get_last_index_stats()
                    new_stats = await orchestrator.get_rag_stats()
                    new_size = new_stats.get("collection_size", 0)
                    topics = index_stats.get("topics", [])
                    chars = index_stats.get("chars", 0)
                    preview = index_stats.get("preview", "")
                    
                    index_msg = "✅ **Research indexed to knowledge base!**\n\n"
                    index_msg += f"📦 **Stored:** {chars:,} characters\n"
                    if topics:
                        index_msg += f"📑 **Topics:** {', '.join(topics[:3])}\n"
                    index_msg += f"📊 **Knowledge base total:** {new_size} documents\n\n"
                    index_msg += "📖 **Click to view indexed content** _(will appear in popup)_"
                    
                    await broadcast_research_agent_message(
                        "rag_indexer",
                        "RAG Indexer",
                        index_msg,
                        "acknowledgment",
                    )
                    
                    indexed_content = orchestrator._research_data[:3000] if orchestrator._research_data else ""
                    await broadcast_rag_content(
                        action="indexed",
                        content=indexed_content,
                        metadata={
                            "chars": chars,
                            "topics": topics,
                            "collection_size": new_size,
                            "preview": preview,
                        },
                    )
            finally:
                await token_queue.put(None)

        task = asyncio.create_task(run_researcher())

        try:
            while True:
                token = await token_queue.get()
                if token is None:
                    completed_agents.add("document_writer")
                    await broadcast_research_agent_message(
                        "document_writer",
                        "Document Writer",
                        "Document composed.",
                        "acknowledgment",
                    )
                    
                    final_data = orchestrator.get_research_data()
                    
                    if final_data and len(final_data) > 500:
                        await broadcast_research_pipeline(RESEARCH_PIPELINE, "fact_checker", completed_agents)
                        await broadcast_research_agent_message(
                            "fact_checker",
                            "Fact Checker",
                            "Verifying claims...",
                            "task",
                        )
                        
                        fact_result = await orchestrator.invoke_fact_checker_streaming()
                        completed_agents.add("fact_checker")
                        
                        await broadcast_research_agent_message(
                            "fact_checker",
                            "Fact Checker",
                            "Verification complete.",
                            "acknowledgment",
                        )
                        
                        yield f"data: {json.dumps({'type': 'fact_check', 'content': fact_result.content, 'success': fact_result.success})}\n\n"
                    
                    await broadcast_research_pipeline(RESEARCH_PIPELINE, None, completed_agents)
                    await broadcast_research_agent_message(
                        "orchestrator",
                        "Research Orchestrator",
                        "Research pipeline complete!",
                        "info",
                    )
                    
                    yield f"data: {json.dumps({'type': 'done', 'research_data': final_data})}\n\n"
                    break
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/data", response_model=ResearchDataResponse)
async def get_research_data() -> ResearchDataResponse:
    orchestrator = get_researcher_orchestrator()
    return ResearchDataResponse(success=True, data=orchestrator.get_research_data())


@router.post("/data", response_model=ResearchDataResponse)
async def set_research_data(request: ResearchDataRequest) -> ResearchDataResponse:
    orchestrator = get_researcher_orchestrator()
    orchestrator.set_research_data(request.data)
    return ResearchDataResponse(success=True, data=request.data)


@router.post("/reset")
async def reset_researcher() -> dict:
    orchestrator = get_researcher_orchestrator()
    orchestrator.reset()
    return {"success": True, "message": "Researcher session reset"}


class RAGToggleRequest(BaseModel):
    enabled: bool


@router.post("/rag/toggle")
async def toggle_rag(request: RAGToggleRequest) -> dict:
    orchestrator = get_researcher_orchestrator()
    orchestrator.set_rag_enabled(request.enabled)
    return {"success": True, "rag_enabled": request.enabled}


@router.get("/rag/status")
async def get_rag_status() -> dict:
    orchestrator = get_researcher_orchestrator()
    app_settings = get_app_settings()
    stats = await orchestrator.get_rag_stats()
    return {
        "rag_enabled": orchestrator.is_rag_enabled(),
        "qdrant_configured": app_settings.qdrant.enabled,
        "collection_size": stats.get("collection_size", 0),
        "connected": stats.get("connected", False),
    }


@router.get("/agents")
async def get_research_agents() -> dict:
    agent_settings = get_agent_settings()
    agents = {}

    if agent_settings.research_orchestrator:
        agents["orchestrator"] = {
            "name": agent_settings.research_orchestrator.name,
            "emoji": agent_settings.research_orchestrator.emoji,
            "enabled": agent_settings.research_orchestrator.enabled,
        }

    if agent_settings.research_agents:
        for agent_id, config in agent_settings.research_agents.items():
            agents[agent_id] = {
                "name": config.name,
                "emoji": config.emoji,
                "enabled": config.enabled,
            }

    return {"agents": agents}
