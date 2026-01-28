from fastapi import APIRouter, Query, Response
from fastapi.responses import PlainTextResponse
from typing import Optional
from app.services.logging_service import (
    get_logging_service,
    LogFilter,
    LogLevel,
    LogsResponse,
)

router = APIRouter()


@router.get("/logs", response_model=LogsResponse)
async def get_logs(
    levels: Optional[str] = Query(
        None, description="Comma-separated log levels to filter (DEBUG,INFO,WARNING,ERROR,CRITICAL)"
    ),
    logger: Optional[str] = Query(None, description="Filter by logger name"),
    search: Optional[str] = Query(None, description="Search text in message or logger"),
    start_time: Optional[str] = Query(None, description="Start time ISO format"),
    end_time: Optional[str] = Query(None, description="End time ISO format"),
    limit: int = Query(500, ge=1, le=10000, description="Maximum logs to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    level_list = None
    if levels:
        level_list = [LogLevel(lvl.strip().upper()) for lvl in levels.split(",") if lvl.strip()]

    filter_params = LogFilter(
        levels=level_list,
        logger=logger,
        search=search,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )

    service = get_logging_service()
    return service.get_logs(filter_params)


@router.get("/logs/stats")
async def get_log_stats():
    service = get_logging_service()
    return service.get_log_stats()


@router.delete("/logs")
async def clear_logs():
    service = get_logging_service()
    return service.clear_logs()


@router.get("/logs/export")
async def export_logs(
    format: str = Query("json", description="Export format: json or text")
):
    service = get_logging_service()
    content = service.export_logs(format)

    if format == "json":
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=logs.json"},
        )
    else:
        return PlainTextResponse(
            content=content,
            headers={"Content-Disposition": "attachment; filename=app.log"},
        )


@router.get("/logs/levels")
async def get_log_levels():
    return {"levels": [level.value for level in LogLevel]}
