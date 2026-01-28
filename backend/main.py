import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


def get_base_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


if getattr(sys, "frozen", False):
    os.chdir(get_base_path())
from app.routes import (
    chain_of_thought,
    questions,
    settings,
    project,
    telemetry,
    canvas,
    agents,
    logs,
    researcher,
    vectors,
    chat,
    prompts,
    presets,
    prompt_history,
)
from app.services.websocket_manager import websocket_manager
from app.services.telemetry import TelemetryService
from app.services.logging_service import get_logging_service
from app.services.llm_proxy import close_http_client
from app.services.qdrant_service import QdrantService
from app.services.app_settings import get_app_settings
from app.models.agents import APICallMetrics

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def broadcast_metrics_listener(metrics: APICallMetrics) -> None:
    await websocket_manager.broadcast_metrics(metrics)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ = get_logging_service()
    logger.info("File logging service initialized - logs will be saved to logs/app.log")
    telemetry_service = await TelemetryService.get_instance()
    telemetry_service.add_listener(broadcast_metrics_listener)
    logger.info("Telemetry service initialized with WebSocket broadcast")
    qdrant_settings = get_app_settings().qdrant
    if qdrant_settings.enabled:
        qdrant_service = await QdrantService.get_instance()
        await qdrant_service.initialize()
        logger.info("Qdrant service initialized")
    yield
    telemetry_service.remove_listener(broadcast_metrics_listener)
    if qdrant_settings.enabled:
        qdrant_service = await QdrantService.get_instance()
        await qdrant_service.close()
    await close_http_client()
    logger.info("Application shutdown complete")


app = FastAPI(
    title="Chain of Thought Orchestrator",
    description="Web app for structuring chain of thought for small LLMs",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chain_of_thought.router, prefix="/api", tags=["chain-of-thought"])
app.include_router(questions.router, prefix="/api", tags=["questions"])
app.include_router(settings.router, prefix="/api", tags=["settings"])
app.include_router(project.router, prefix="/api", tags=["project"])
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["telemetry"])
app.include_router(canvas.router, prefix="/api/canvas", tags=["canvas"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(logs.router, prefix="/api", tags=["logs"])
app.include_router(researcher.router, prefix="/api", tags=["researcher"])
app.include_router(vectors.router, prefix="/api", tags=["vectors"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(prompts.router, prefix="/api/prompts", tags=["prompts"])
app.include_router(presets.router, prefix="/api/presets", tags=["presets"])
app.include_router(prompt_history.router, prefix="/api", tags=["prompt-history"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"Received WebSocket message: {data}")
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        await websocket_manager.disconnect(websocket)


@app.get("/")
async def root():
    return {
        "message": "Nexa Thinking Framework API",
        "version": "1.0.0",
        "endpoints": {
            "chain-of-thought": "/api/chain-of-thought",
            "questions": "/api/questions",
            "telemetry": "/api/telemetry",
            "canvas": "/api/canvas",
            "agents": "/api/agents",
            "logs": "/api/logs",
            "researcher": "/api/researcher",
            "vectors": "/api/vectors",
            "websocket": "/ws",
        },
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, log_level="info")
