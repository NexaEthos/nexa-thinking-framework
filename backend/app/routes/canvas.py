import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.canvas_state import get_canvas_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["canvas"])


class SectionUpdateRequest(BaseModel):
    title: str
    content: str
    agent_id: str | None = None


class SectionResponse(BaseModel):
    id: str
    title: str
    content: str
    agent_id: str
    last_updated: str | None
    version: int


@router.get("/", response_model=None)
async def get_canvas() -> dict:
    manager = get_canvas_manager()
    return manager.to_dict()


@router.get("/summary", response_model=None)
async def get_canvas_summary() -> dict:
    manager = get_canvas_manager()
    return manager.get_canvas_summary()


@router.get("/export-prompt", response_model=None)
async def export_canvas_for_prompt() -> dict:
    manager = get_canvas_manager()
    return {"prompt": manager.export_for_prompt()}


@router.post("/reset")
async def reset_canvas() -> dict:
    manager = get_canvas_manager()
    manager.reset_canvas()
    return {"status": "ok", "message": "Canvas reset"}


@router.get("/sections/{section_id}", response_model=SectionResponse)
async def get_section(section_id: str) -> SectionResponse:
    manager = get_canvas_manager()
    state = manager.get_section_state(section_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Section not found: {section_id}")

    section = state.section
    return SectionResponse(
        id=section.id,
        title=section.title,
        content=section.content,
        agent_id=section.agent_id,
        last_updated=section.last_updated.isoformat() if section.last_updated else None,
        version=state.version,
    )


@router.put("/sections/{section_id}")
async def update_section(section_id: str, request: SectionUpdateRequest) -> dict:
    manager = get_canvas_manager()
    success = manager.update_section(
        section_id=section_id,
        title=request.title,
        content=request.content,
        agent_id=request.agent_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail=f"Section not found: {section_id}")

    return {"status": "ok", "section_id": section_id}


@router.post("/sections/{section_id}/clear")
async def clear_section(section_id: str) -> dict:
    manager = get_canvas_manager()
    success = manager.clear_section(section_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Section not found: {section_id}")

    return {"status": "ok", "section_id": section_id}


@router.post("/sections/{section_id}/rollback")
async def rollback_section(section_id: str) -> dict:
    manager = get_canvas_manager()
    success = manager.rollback_section(section_id)
    if not success:
        raise HTTPException(
            status_code=400, detail="No history to rollback or section not found"
        )

    return {"status": "ok", "section_id": section_id}
