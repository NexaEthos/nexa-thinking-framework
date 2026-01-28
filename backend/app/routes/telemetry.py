import logging
from fastapi import APIRouter, HTTPException

from app.services.telemetry import TelemetryService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["telemetry"])


@router.get("/session", response_model=None)
async def get_session_summary() -> dict:
    service = TelemetryService.get_instance_sync()
    summary = service.get_session_summary()
    return summary.to_dict()


@router.post("/session/reset")
async def reset_session() -> dict:
    service = TelemetryService.get_instance_sync()
    service.reset_session()
    return {"status": "ok", "message": "Session reset"}


@router.get("/agents/{agent_id}", response_model=None)
async def get_agent_stats(agent_id: str) -> dict:
    service = TelemetryService.get_instance_sync()
    stats = service.get_agent_stats(agent_id)
    if not stats:
        raise HTTPException(status_code=404, detail=f"No stats for agent: {agent_id}")
    return stats.to_dict()


@router.get("/calls", response_model=None)
async def get_call_log() -> list[dict]:
    service = TelemetryService.get_instance_sync()
    calls = service.get_call_log()
    return [call.to_dict() for call in calls]


@router.get("/export", response_model=None)
async def export_session() -> dict:
    service = TelemetryService.get_instance_sync()
    return await service.export_session()


@router.post("/import")
async def import_session(data: dict) -> dict:
    try:
        service = TelemetryService.get_instance_sync()
        await service.import_session(data)
        return {"status": "ok", "message": "Session imported"}
    except Exception as e:
        logger.error(f"Failed to import session: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
