from fastapi import WebSocket
import logging
from app.models.chain_of_thought import ChainOfThought, Step
from app.models.agents import APICallMetrics

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"WebSocket connected. Total connections: {len(self.active_connections)}"
        )

    async def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(
                f"WebSocket disconnected. Total connections: {len(self.active_connections)}"
            )

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                await self.disconnect(connection)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
            await self.disconnect(websocket)

    async def broadcast_chain_progress(self, request_id: str, chain: ChainOfThought):
        await self.broadcast({"type": "chain_progress", "data": chain.model_dump()})
        logger.info(f"Broadcasted chain progress for request {request_id}")

    async def broadcast_step(self, request_id: str, step: Step):
        await self.broadcast({"type": "step_update", "data": step.model_dump()})
        logger.info(f"Broadcasted step {step.step_number} for request {request_id}")

    async def broadcast_complete(self, request_id: str, chain: ChainOfThought):
        await self.broadcast(
            {
                "type": "chain_complete",
                "data": {
                    "final_answer": chain.final_answer,
                    "verification": (
                        chain.verification.model_dump() if chain.verification else None
                    ),
                    "steps": [s.model_dump() for s in chain.steps],
                },
            }
        )
        logger.info(f"Broadcasted chain completion for request {request_id}")

    async def broadcast_error(self, request_id: str, error_message: str):
        await self.broadcast({"type": "chain_error", "data": error_message})
        logger.error(f"Broadcasted error for request {request_id}: {error_message}")

    async def broadcast_token(self, request_id: str, step_number: int, token: str):
        await self.broadcast(
            {
                "type": "token_stream",
                "data": {
                    "request_id": request_id,
                    "step_number": step_number,
                    "token": token,
                },
            }
        )
        # Log only first token per step to avoid log spam
        if len(token.strip()) > 0:
            logger.debug(f"Token stream: step {step_number}, token: {token[:20]}...")

    async def broadcast_stream_complete(
        self, request_id: str, step_number: int, full_response: str
    ):
        await self.broadcast(
            {
                "type": "stream_complete",
                "data": {
                    "request_id": request_id,
                    "step_number": step_number,
                    "full_response": full_response,
                },
            }
        )

    def get_connection_count(self) -> int:
        return len(self.active_connections)

    async def broadcast_project_thinking(self, status: str, thinking: str = ""):
        await self.broadcast(
            {
                "type": "project_thinking",
                "data": {"status": status, "thinking": thinking},
            }
        )

    async def broadcast_project_token(self, token: str):
        await self.broadcast({"type": "project_token", "data": {"token": token}})

    async def broadcast_project_response(self, response: str):
        await self.broadcast(
            {"type": "project_response", "data": {"response": response}}
        )

    async def broadcast_project_canvas(self, canvas_updates: list):
        await self.broadcast(
            {"type": "project_canvas", "data": {"canvas_updates": canvas_updates}}
        )

    async def broadcast_project_complete(
        self,
        response: str,
        canvas_updates: list,
        reasoning_used: bool,
        mentioned_agents: list[str] | None = None,
    ):
        await self.broadcast(
            {
                "type": "project_complete",
                "data": {
                    "response": response,
                    "canvas_updates": canvas_updates,
                    "reasoning_used": reasoning_used,
                    "mentioned_agents": mentioned_agents or [],
                },
            }
        )

    async def broadcast_project_tools(
        self,
        web_search_used: bool = False,
        memory_search_used: bool = False,
        rag_results: list[dict] | None = None,
    ):
        await self.broadcast(
            {
                "type": "project_tools",
                "data": {
                    "web_search_used": web_search_used,
                    "memory_search_used": memory_search_used,
                    "rag_results": rag_results or [],
                },
            }
        )

    async def broadcast_project_error(self, error: str):
        await self.broadcast({"type": "project_error", "data": {"error": error}})

    async def broadcast_pipeline_progress(
        self,
        agents: list[dict],
        current_agent: str | None = None,
    ):
        """Broadcast pipeline progress showing which agents are pending/active/complete.
        
        Each agent dict should have: {id, name, status, result_summary}
        Status: 'pending', 'active', 'complete', 'skipped'
        """
        await self.broadcast(
            {
                "type": "pipeline_progress",
                "data": {
                    "agents": agents,
                    "current_agent": current_agent,
                },
            }
        )

    async def broadcast_agent_message(
        self,
        agent_id: str,
        agent_name: str,
        message: str,
        message_type: str = "acknowledgment",
    ):
        """Broadcast a message from an agent to appear in chat.
        
        message_type: 'task', 'acknowledgment', 'info'
        """
        await self.broadcast(
            {
                "type": "agent_message",
                "data": {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "message": message,
                    "message_type": message_type,
                    "timestamp": __import__("datetime").datetime.now().isoformat(),
                },
            }
        )

    async def broadcast_metrics(self, metrics: APICallMetrics) -> None:
        await self.broadcast(
            {
                "type": "metrics_update",
                "data": {
                    "agent_id": metrics.agent_id,
                    "model": metrics.model,
                    "input_tokens": metrics.input_tokens,
                    "output_tokens": metrics.output_tokens,
                    "latency_ms": metrics.latency_ms,
                    "duration_ms": metrics.duration_ms,
                    "tokens_per_second": metrics.tokens_per_second,
                    "success": metrics.success,
                    "timestamp": metrics.timestamp.isoformat(),
                },
            }
        )
        logger.debug(
            f"Broadcasted metrics for agent {metrics.agent_id}: "
            f"{metrics.total_tokens} tokens"
        )


websocket_manager = WebSocketManager()
