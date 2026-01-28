from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Literal


class AgentId(str, Enum):
    PM = "pm"
    IDENTITY = "identity"
    DEFINITION = "definition"
    RESOURCES = "resources"
    EXECUTION = "execution"


class CanvasSectionId(str, Enum):
    IDENTITY = "identity"
    DEFINITION = "definition"
    RESOURCES = "resources"
    EXECUTION = "execution"


@dataclass
class APICallMetrics:
    agent_id: str
    timestamp: datetime
    input_tokens: int
    output_tokens: int
    latency_ms: int
    duration_ms: int
    model: str
    success: bool
    error: str | None = None
    request_messages: list[dict] | None = None
    response_content: str | None = None
    endpoint: str | None = None

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "timestamp": self.timestamp.isoformat(),
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "latency_ms": self.latency_ms,
            "duration_ms": self.duration_ms,
            "model": self.model,
            "success": self.success,
            "error": self.error,
            "request_messages": self.request_messages,
            "response_content": self.response_content,
            "endpoint": self.endpoint,
        }

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @property
    def tokens_per_second(self) -> float:
        if self.duration_ms <= 0:
            return 0.0
        return (self.output_tokens / self.duration_ms) * 1000


@dataclass
class SectionMetrics:
    input_tokens: int
    output_tokens: int
    latency_ms: int
    duration_ms: int
    tokens_per_second: float
    timestamp: datetime

    def to_dict(self) -> dict:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "latency_ms": self.latency_ms,
            "duration_ms": self.duration_ms,
            "tokens_per_second": self.tokens_per_second,
            "timestamp": self.timestamp.isoformat(),
        }

    @classmethod
    def from_api_call(cls, metrics: APICallMetrics) -> "SectionMetrics":
        return cls(
            input_tokens=metrics.input_tokens,
            output_tokens=metrics.output_tokens,
            latency_ms=metrics.latency_ms,
            duration_ms=metrics.duration_ms,
            tokens_per_second=metrics.tokens_per_second,
            timestamp=metrics.timestamp,
        )


@dataclass
class CanvasSection:
    id: str
    title: str
    content: str
    agent_id: str
    last_updated: datetime | None = None
    metrics: SectionMetrics | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "agent_id": self.agent_id,
            "last_updated": (
                self.last_updated.isoformat() if self.last_updated else None
            ),
            "metrics": self.metrics.to_dict() if self.metrics else None,
        }


@dataclass
class ProjectCanvas:
    identity: CanvasSection
    definition: CanvasSection
    resources: CanvasSection
    execution: CanvasSection

    def to_dict(self) -> dict:
        return {
            "identity": self.identity.to_dict(),
            "definition": self.definition.to_dict(),
            "resources": self.resources.to_dict(),
            "execution": self.execution.to_dict(),
        }

    def get_section(self, section_id: str) -> CanvasSection | None:
        return getattr(self, section_id, None)

    def update_section(
        self,
        section_id: str,
        title: str,
        content: str,
        metrics: SectionMetrics | None = None,
    ) -> None:
        section = self.get_section(section_id)
        if section:
            section.title = title
            section.content = content
            section.last_updated = datetime.now()
            if metrics:
                section.metrics = metrics

    @classmethod
    def create_empty(cls) -> "ProjectCanvas":
        def create_section(section_id: str, title: str) -> CanvasSection:
            return CanvasSection(
                id=section_id,
                title=title,
                content="",
                agent_id=section_id,
                last_updated=None,
                metrics=None,
            )

        return cls(
            identity=create_section("identity", "Identity"),
            definition=create_section("definition", "Definition"),
            resources=create_section("resources", "Resources"),
            execution=create_section("execution", "Execution"),
        )


@dataclass
class AgentSessionStats:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_latency_ms: int = 0
    total_duration_ms: int = 0
    estimated_cost: float | None = None

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / self.calls if self.calls > 0 else 0.0

    @property
    def avg_tokens_per_sec(self) -> float:
        if self.total_duration_ms <= 0:
            return 0.0
        return (self.output_tokens / self.total_duration_ms) * 1000

    def record_call(self, metrics: APICallMetrics) -> None:
        self.calls += 1
        self.input_tokens += metrics.input_tokens
        self.output_tokens += metrics.output_tokens
        self.total_latency_ms += metrics.latency_ms
        self.total_duration_ms += metrics.duration_ms

    def to_dict(self) -> dict:
        return {
            "calls": self.calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "avg_latency_ms": self.avg_latency_ms,
            "avg_tokens_per_sec": self.avg_tokens_per_sec,
            "estimated_cost": self.estimated_cost,
        }


@dataclass
class SessionSummary:
    start_time: datetime
    agents: dict[str, AgentSessionStats] = field(default_factory=dict)
    call_log: list[APICallMetrics] = field(default_factory=list)

    def __post_init__(self):
        if not self.agents:
            self.agents = {
                "pm": AgentSessionStats(),
                "identity": AgentSessionStats(),
                "definition": AgentSessionStats(),
                "resources": AgentSessionStats(),
                "execution": AgentSessionStats(),
            }

    @property
    def session_duration(self) -> int:
        return int((datetime.now() - self.start_time).total_seconds() * 1000)

    @property
    def total_calls(self) -> int:
        return sum(stats.calls for stats in self.agents.values())

    @property
    def total_input_tokens(self) -> int:
        return sum(stats.input_tokens for stats in self.agents.values())

    @property
    def total_output_tokens(self) -> int:
        return sum(stats.output_tokens for stats in self.agents.values())

    @property
    def estimated_cost(self) -> float | None:
        costs = [
            s.estimated_cost
            for s in self.agents.values()
            if s.estimated_cost is not None
        ]
        return sum(costs) if costs else None

    def record_call(self, metrics: APICallMetrics) -> None:
        self.call_log.append(metrics)
        if metrics.agent_id not in self.agents:
            self.agents[metrics.agent_id] = AgentSessionStats()
        self.agents[metrics.agent_id].record_call(metrics)

    def to_dict(self) -> dict:
        return {
            "session_duration": self.session_duration,
            "total_calls": self.total_calls,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "estimated_cost": self.estimated_cost,
            "agents": {
                agent_id: stats.to_dict() for agent_id, stats in self.agents.items()
            },
        }


@dataclass
class ChatMessage:
    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime
    agent_id: str | None = None
    metrics: APICallMetrics | None = None
    mentions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "agent_id": self.agent_id,
            "metrics": self.metrics.to_dict() if self.metrics else None,
            "mentions": self.mentions,
        }


@dataclass
class SessionExport:
    version: str
    exported_at: datetime
    project: ProjectCanvas
    conversation: list[ChatMessage]
    telemetry: SessionSummary
    agent_configs: dict

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "exported_at": self.exported_at.isoformat(),
            "project": self.project.to_dict(),
            "conversation": {"messages": [msg.to_dict() for msg in self.conversation]},
            "telemetry": {
                **self.telemetry.to_dict(),
                "call_log": [m.to_dict() for m in self.telemetry.call_log],
            },
            "agent_configs": self.agent_configs,
        }


AGENT_INFO = {
    "pm": {"name": "Project Manager", "nickname": "The Orchestrator", "emoji": "👔"},
    "identity": {"name": "Identity", "nickname": "The Namer", "emoji": "🎯"},
    "definition": {"name": "Definition", "nickname": "The Architect", "emoji": "📐"},
    "resources": {"name": "Resources", "nickname": "The Pragmatist", "emoji": "🧰"},
    "execution": {"name": "Execution", "nickname": "The Planner", "emoji": "📋"},
}

SECTION_ORDER = ["identity", "definition", "resources", "execution"]
