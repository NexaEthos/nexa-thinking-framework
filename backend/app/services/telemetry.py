import asyncio
import logging
from collections.abc import Coroutine
from datetime import datetime
from typing import Any, Callable

from app.models.agents import (
    APICallMetrics,
    SessionSummary,
    AgentSessionStats,
)
from app.services.agent_settings import get_agent_settings

logger = logging.getLogger(__name__)

type AsyncCallback = Callable[[APICallMetrics], Coroutine[Any, Any, None]]


class TelemetryService:
    _instance: "TelemetryService | None" = None
    _lock = asyncio.Lock()

    def __init__(self):
        self._session = SessionSummary(start_time=datetime.now())
        self._listeners: list[AsyncCallback] = []
        self._cost_config = get_agent_settings().telemetry.cost_estimation

    @classmethod
    async def get_instance(cls) -> "TelemetryService":
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @classmethod
    def get_instance_sync(cls) -> "TelemetryService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def reset_session(self) -> None:
        self._session = SessionSummary(start_time=datetime.now())
        self._cost_config = get_agent_settings().telemetry.cost_estimation
        logger.info("Telemetry session reset")

    async def record_call(self, metrics: APICallMetrics) -> None:
        self._session.record_call(metrics)

        if self._cost_config.enabled:
            self._update_cost_estimation(metrics)

        for listener in self._listeners:
            try:
                asyncio.create_task(listener(metrics))
            except Exception as e:
                logger.error(f"Telemetry listener error: {e}")

        logger.debug(
            f"Recorded call: agent={metrics.agent_id}, "
            f"tokens={metrics.input_tokens}+{metrics.output_tokens}, "
            f"latency={metrics.latency_ms}ms"
        )

    def _update_cost_estimation(self, metrics: APICallMetrics) -> None:
        model_config = self._cost_config.models.get(metrics.model)
        if not model_config:
            return

        input_cost = (metrics.input_tokens / 1_000_000) * model_config.get(
            "inputCostPer1M", 0
        )
        output_cost = (metrics.output_tokens / 1_000_000) * model_config.get(
            "outputCostPer1M", 0
        )
        call_cost = input_cost + output_cost

        agent_stats = self._session.agents.get(metrics.agent_id)
        if agent_stats:
            if agent_stats.estimated_cost is None:
                agent_stats.estimated_cost = 0.0
            agent_stats.estimated_cost += call_cost

    def add_listener(self, callback: AsyncCallback) -> None:
        self._listeners.append(callback)

    def remove_listener(self, callback: AsyncCallback) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    def get_session_summary(self) -> SessionSummary:
        return self._session

    def get_agent_stats(self, agent_id: str) -> AgentSessionStats | None:
        return self._session.agents.get(agent_id)

    def get_call_log(self) -> list[APICallMetrics]:
        return self._session.call_log

    def get_last_metrics(self, agent_id: str) -> APICallMetrics | None:
        for metrics in reversed(self._session.call_log):
            if metrics.agent_id == agent_id:
                return metrics
        return None

    async def export_session(self) -> dict:
        return {
            "exported_at": datetime.now().isoformat(),
            "session_duration": self._session.session_duration,
            "total_calls": self._session.total_calls,
            "total_input_tokens": self._session.total_input_tokens,
            "total_output_tokens": self._session.total_output_tokens,
            "estimated_cost": self._session.estimated_cost,
            "agents": {
                agent_id: stats.to_dict()
                for agent_id, stats in self._session.agents.items()
            },
            "call_log": [m.to_dict() for m in self._session.call_log],
        }

    async def import_session(self, data: dict) -> None:
        self._session = SessionSummary(start_time=datetime.now())

        if "agents" in data:
            for agent_id, stats_data in data["agents"].items():
                if agent_id in self._session.agents:
                    stats = self._session.agents[agent_id]
                    stats.calls = stats_data.get("calls", 0)
                    stats.input_tokens = stats_data.get("input_tokens", 0)
                    stats.output_tokens = stats_data.get("output_tokens", 0)
                    stats.estimated_cost = stats_data.get("estimated_cost")

        logger.info("Telemetry session imported")


def create_metrics_from_response(
    agent_id: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    start_time: datetime,
    first_token_time: datetime | None = None,
    end_time: datetime | None = None,
    success: bool = True,
    error: str | None = None,
    request_messages: list[dict] | None = None,
    response_content: str | None = None,
    endpoint: str | None = None,
) -> APICallMetrics:
    end = end_time or datetime.now()
    first_token = first_token_time or end

    latency_ms = int((first_token - start_time).total_seconds() * 1000)
    duration_ms = int((end - start_time).total_seconds() * 1000)

    return APICallMetrics(
        agent_id=agent_id,
        timestamp=start_time,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        duration_ms=duration_ms,
        model=model,
        success=success,
        error=error,
        request_messages=request_messages,
        response_content=response_content,
        endpoint=endpoint,
    )


async def get_telemetry_service() -> TelemetryService:
    return await TelemetryService.get_instance()
