import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.pm_orchestrator import get_pm_orchestrator, PMResponse
from app.services.agent_settings import get_agent_settings
from app.services.canvas_state import get_canvas_manager
from app.services.llm_settings import get_settings
from app.services.llm_proxy import LLMProxy
from app.models.agents import SECTION_ORDER, AGENT_INFO

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agents"])


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    canvas_updates: list[str]
    agent_invocations: list[dict]
    suggestions: list[str]


@router.get("/pm/greeting")
async def get_pm_greeting() -> dict:
    orchestrator = get_pm_orchestrator()
    return {"greeting": orchestrator.get_greeting()}


@router.post("/pm/chat", response_model=ChatResponse)
async def pm_chat(request: ChatRequest) -> ChatResponse:
    orchestrator = get_pm_orchestrator()
    result: PMResponse = await orchestrator.process_message(request.message)

    return ChatResponse(
        response=result.response,
        canvas_updates=result.canvas_updates,
        agent_invocations=[
            {
                "agent_id": inv.agent_id,
                "triggered_by": inv.triggered_by,
                "success": inv.success,
                "error": inv.error,
            }
            for inv in result.agent_invocations
        ],
        suggestions=result.suggestions,
    )


@router.get("/pm/conversation")
async def get_conversation() -> dict:
    orchestrator = get_pm_orchestrator()
    conversation = orchestrator.get_conversation()
    return {
        "messages": [msg.to_dict() for msg in conversation],
        "count": len(conversation),
    }


@router.post("/pm/reset")
async def reset_pm() -> dict:
    orchestrator = get_pm_orchestrator()
    orchestrator.reset()
    return {"status": "ok", "message": "Session reset"}


@router.post("/pm/clear-conversation")
async def clear_conversation() -> dict:
    orchestrator = get_pm_orchestrator()
    orchestrator.clear_conversation()
    return {"status": "ok", "message": "Conversation cleared"}


class SpecialistAnalyzeRequest(BaseModel):
    context: str


class SpecialistResponse(BaseModel):
    agent_id: str
    content: str
    section_updated: bool
    metrics: dict | None


@router.get("/specialists")
async def list_specialists() -> dict:
    settings = get_agent_settings()
    specialists = {}
    for agent_id in SECTION_ORDER:
        specialist = settings.specialists.get(agent_id)
        if specialist:
            specialists[agent_id] = {
                "name": specialist.name,
                "nickname": specialist.nickname,
                "emoji": specialist.emoji,
                "enabled": specialist.enabled,
                "section_id": specialist.section_id,
            }
    return {"specialists": specialists}


@router.get("/specialists/{agent_id}")
async def get_specialist(agent_id: str) -> dict:
    if agent_id not in SECTION_ORDER:
        raise HTTPException(status_code=404, detail=f"Unknown specialist: {agent_id}")

    settings = get_agent_settings()
    specialist = settings.specialists.get(agent_id)
    if not specialist:
        raise HTTPException(
            status_code=404, detail=f"Specialist config not found: {agent_id}"
        )

    return {
        "id": agent_id,
        "name": specialist.name,
        "nickname": specialist.nickname,
        "emoji": specialist.emoji,
        "enabled": specialist.enabled,
        "section_id": specialist.section_id,
        "trigger_keywords": specialist.trigger_keywords,
    }


@router.post("/specialists/{agent_id}/analyze", response_model=SpecialistResponse)
async def analyze_with_specialist(
    agent_id: str, request: SpecialistAnalyzeRequest
) -> SpecialistResponse:
    if agent_id not in SECTION_ORDER:
        raise HTTPException(status_code=404, detail=f"Unknown specialist: {agent_id}")

    settings = get_agent_settings()
    specialist = settings.specialists.get(agent_id)
    if not specialist:
        raise HTTPException(
            status_code=404, detail=f"Specialist config not found: {agent_id}"
        )

    if not specialist.enabled:
        raise HTTPException(
            status_code=400, detail=f"Specialist {agent_id} is disabled"
        )

    llm_settings = get_settings()
    llm = LLMProxy(base_url=llm_settings.get_base_url(), model=llm_settings.model)
    canvas = get_canvas_manager()

    identity_section = canvas.get_section("identity")
    definition_section = canvas.get_section("definition")
    resources_section = canvas.get_section("resources")

    extraction_prompt = specialist.prompts.extraction.format(
        conversation=request.context,
        canvas_state=canvas.export_for_prompt(),
        identity=identity_section.content if identity_section else "",
        definition=definition_section.content if definition_section else "",
        resources=resources_section.content if resources_section else "",
    )

    messages = [
        {"role": "system", "content": specialist.prompts.system},
        {"role": "user", "content": extraction_prompt},
    ]

    response, metrics = await llm.chat_completion_with_metrics(messages, agent_id)

    canvas.update_section(
        section_id=specialist.section_id,
        title=specialist.name,
        content=response,
        agent_id=agent_id,
    )

    return SpecialistResponse(
        agent_id=agent_id,
        content=response,
        section_updated=True,
        metrics=metrics.to_dict() if metrics else None,
    )


@router.get("/info")
async def get_agents_info() -> dict:
    return {
        "agents": AGENT_INFO,
        "section_order": SECTION_ORDER,
    }
