import json
import logging
import aiofiles
from dataclasses import dataclass, field
from typing import Any

from app.base_path import get_base_path

logger = logging.getLogger(__name__)

AGENT_SETTINGS_FILE = get_base_path() / "agent_settings.json"


class AgentSettingsError(Exception):
    pass


@dataclass
class ModelConfig:
    server_type: str = "inherit"
    base_url: str = "inherit"
    model: str = "inherit"
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    max_tokens: int = 2048
    stop_sequences: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "ModelConfig":
        return cls(
            server_type=data.get("server_type", "inherit"),
            base_url=data.get("base_url", "inherit"),
            model=data.get("model", "inherit"),
            temperature=data.get("temperature", 0.7),
            top_p=data.get("top_p", 0.9),
            top_k=data.get("top_k", 40),
            frequency_penalty=data.get("frequency_penalty", 0.0),
            presence_penalty=data.get("presence_penalty", 0.0),
            max_tokens=data.get("max_tokens", 2048),
            stop_sequences=data.get("stop_sequences", []),
        )


@dataclass
class PMPrompts:
    system: str
    greeting: str
    synthesis: str
    conflict_resolution: str

    @classmethod
    def from_dict(cls, data: dict) -> "PMPrompts":
        required = ["system", "greeting", "synthesis", "conflict_resolution"]
        for key in required:
            if key not in data:
                raise AgentSettingsError(
                    f"Missing required PM prompt: '{key}'. Check agent_settings.json"
                )
        return cls(
            system=data["system"],
            greeting=data["greeting"],
            synthesis=data["synthesis"],
            conflict_resolution=data["conflict_resolution"],
        )


@dataclass
class SpecialistPrompts:
    system: str
    extraction: str
    search_query_generation: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "SpecialistPrompts":
        required = ["system", "extraction"]
        for key in required:
            if key not in data:
                raise AgentSettingsError(
                    f"Missing required specialist prompt: '{key}'. Check agent_settings.json"
                )
        return cls(
            system=data["system"],
            extraction=data["extraction"],
            search_query_generation=data.get("search_query_generation", ""),
        )


@dataclass
class ProjectManagerConfig:
    enabled: bool
    name: str
    nickname: str
    emoji: str
    mention_prefix: str
    prompts: PMPrompts
    model: ModelConfig

    @classmethod
    def from_dict(cls, data: dict) -> "ProjectManagerConfig":
        if "prompts" not in data:
            raise AgentSettingsError(
                "Missing 'prompts' in project_manager config. Check agent_settings.json"
            )
        return cls(
            enabled=data.get("enabled", True),
            name=data.get("name", "Project Manager"),
            nickname=data.get("nickname", "The Orchestrator"),
            emoji=data.get("emoji", "👔"),
            mention_prefix=data.get("mention_prefix", "@"),
            prompts=PMPrompts.from_dict(data["prompts"]),
            model=ModelConfig.from_dict(data.get("model", {})),
        )


@dataclass
class SpecialistConfig:
    enabled: bool
    name: str
    nickname: str
    emoji: str
    section_id: str
    prompts: SpecialistPrompts
    model: ModelConfig
    trigger_keywords: list[str]

    @classmethod
    def from_dict(cls, data: dict, agent_id: str) -> "SpecialistConfig":
        if "prompts" not in data:
            raise AgentSettingsError(
                f"Missing 'prompts' in specialist '{agent_id}' config. Check agent_settings.json"
            )
        return cls(
            enabled=data.get("enabled", True),
            name=data.get("name", agent_id.title()),
            nickname=data.get("nickname", ""),
            emoji=data.get("emoji", "🤖"),
            section_id=data.get("section_id", agent_id),
            prompts=SpecialistPrompts.from_dict(data["prompts"]),
            model=ModelConfig.from_dict(data.get("model", {})),
            trigger_keywords=data.get("trigger_keywords", []),
        )


@dataclass
class AnalysisConfig:
    request_analyzer_prompt: str
    canvas_extraction_prompt: str
    complexity_indicators: list[str]

    @classmethod
    def from_dict(cls, data: dict) -> "AnalysisConfig":
        if "request_analyzer" not in data:
            raise AgentSettingsError(
                "Missing 'request_analyzer' in analysis config. Check agent_settings.json"
            )
        if "canvas_extraction" not in data:
            raise AgentSettingsError(
                "Missing 'canvas_extraction' in analysis config. Check agent_settings.json"
            )
        return cls(
            request_analyzer_prompt=data["request_analyzer"].get("prompt", ""),
            canvas_extraction_prompt=data["canvas_extraction"].get("prompt", ""),
            complexity_indicators=data.get("complexity_indicators", []),
        )


@dataclass
class CostEstimationConfig:
    enabled: bool
    models: dict[str, dict[str, float]]

    @classmethod
    def from_dict(cls, data: dict) -> "CostEstimationConfig":
        return cls(
            enabled=data.get("enabled", False),
            models=data.get("models", {}),
        )


@dataclass
class TelemetryConfig:
    enabled: bool
    show_per_message: bool
    show_in_canvas: bool
    export_format: str
    cost_estimation: CostEstimationConfig

    @classmethod
    def from_dict(cls, data: dict) -> "TelemetryConfig":
        return cls(
            enabled=data.get("enabled", True),
            show_per_message=data.get("show_per_message", False),
            show_in_canvas=data.get("show_in_canvas", True),
            export_format=data.get("export_format", "json"),
            cost_estimation=CostEstimationConfig.from_dict(
                data.get("cost_estimation", {})
            ),
        )


@dataclass
class ResearchOrchestratorPrompts:
    system: str
    greeting: str
    synthesis: str

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchOrchestratorPrompts":
        return cls(
            system=data.get("system", ""),
            greeting=data.get("greeting", ""),
            synthesis=data.get("synthesis", ""),
        )


@dataclass
class ResearchOrchestratorConfig:
    enabled: bool
    name: str
    nickname: str
    emoji: str
    mention_prefix: str
    prompts: ResearchOrchestratorPrompts
    model: ModelConfig

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchOrchestratorConfig":
        return cls(
            enabled=data.get("enabled", True),
            name=data.get("name", "Research Orchestrator"),
            nickname=data.get("nickname", "The Coordinator"),
            emoji=data.get("emoji", "🔬"),
            mention_prefix=data.get("mention_prefix", "@"),
            prompts=ResearchOrchestratorPrompts.from_dict(data.get("prompts", {})),
            model=ModelConfig.from_dict(data.get("model", {})),
        )


@dataclass
class ResearchAgentPrompts:
    system: str
    extraction: str
    search_query_generation: str

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchAgentPrompts":
        return cls(
            system=data.get("system", ""),
            extraction=data.get("extraction", ""),
            search_query_generation=data.get("search_query_generation", ""),
        )


@dataclass
class ResearchAgentConfig:
    enabled: bool
    name: str
    nickname: str
    emoji: str
    prompts: ResearchAgentPrompts
    model: ModelConfig

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchAgentConfig":
        return cls(
            enabled=data.get("enabled", True),
            name=data.get("name", "Research Agent"),
            nickname=data.get("nickname", ""),
            emoji=data.get("emoji", "🔍"),
            prompts=ResearchAgentPrompts.from_dict(data.get("prompts", {})),
            model=ModelConfig.from_dict(data.get("model", {})),
        )


@dataclass
class AgentSettings:
    version: str
    project_manager: ProjectManagerConfig
    specialists: dict[str, SpecialistConfig]
    analysis: AnalysisConfig
    telemetry: TelemetryConfig
    research_orchestrator: ResearchOrchestratorConfig | None = None
    research_agents: dict[str, ResearchAgentConfig] | None = None

    @classmethod
    def from_dict(cls, data: dict) -> "AgentSettings":
        if "project_manager" not in data:
            raise AgentSettingsError(
                "Missing 'project_manager' section. Check agent_settings.json"
            )
        if "specialists" not in data:
            raise AgentSettingsError(
                "Missing 'specialists' section. Check agent_settings.json"
            )
        if "analysis" not in data:
            raise AgentSettingsError(
                "Missing 'analysis' section. Check agent_settings.json"
            )

        specialists = {}
        for agent_id, agent_data in data["specialists"].items():
            specialists[agent_id] = SpecialistConfig.from_dict(agent_data, agent_id)

        research_orchestrator = None
        if "research_orchestrator" in data:
            research_orchestrator = ResearchOrchestratorConfig.from_dict(
                data["research_orchestrator"]
            )

        research_agents = None
        if "research_agents" in data:
            research_agents = {}
            for agent_id, agent_data in data["research_agents"].items():
                research_agents[agent_id] = ResearchAgentConfig.from_dict(agent_data)

        return cls(
            version=data.get("version", "1.0.0"),
            project_manager=ProjectManagerConfig.from_dict(data["project_manager"]),
            specialists=specialists,
            analysis=AnalysisConfig.from_dict(data["analysis"]),
            telemetry=TelemetryConfig.from_dict(data.get("telemetry", {})),
            research_orchestrator=research_orchestrator,
            research_agents=research_agents,
        )

    def get_specialist(self, agent_id: str) -> SpecialistConfig:
        if agent_id not in self.specialists:
            raise AgentSettingsError(
                f"Unknown specialist agent: '{agent_id}'. "
                f"Available: {list(self.specialists.keys())}"
            )
        return self.specialists[agent_id]

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "project_manager": {
                "enabled": self.project_manager.enabled,
                "name": self.project_manager.name,
                "nickname": self.project_manager.nickname,
                "emoji": self.project_manager.emoji,
                "mention_prefix": self.project_manager.mention_prefix,
                "prompts": {
                    "system": self.project_manager.prompts.system,
                    "greeting": self.project_manager.prompts.greeting,
                    "synthesis": self.project_manager.prompts.synthesis,
                    "conflict_resolution": self.project_manager.prompts.conflict_resolution,
                },
                "model": {
                    "server_type": self.project_manager.model.server_type,
                    "base_url": self.project_manager.model.base_url,
                    "model": self.project_manager.model.model,
                    "temperature": self.project_manager.model.temperature,
                    "top_p": self.project_manager.model.top_p,
                    "top_k": self.project_manager.model.top_k,
                    "frequency_penalty": self.project_manager.model.frequency_penalty,
                    "presence_penalty": self.project_manager.model.presence_penalty,
                    "max_tokens": self.project_manager.model.max_tokens,
                    "stop_sequences": self.project_manager.model.stop_sequences,
                },
            },
            "specialists": {
                agent_id: {
                    "enabled": spec.enabled,
                    "name": spec.name,
                    "nickname": spec.nickname,
                    "emoji": spec.emoji,
                    "section_id": spec.section_id,
                    "prompts": {
                        "system": spec.prompts.system,
                        "extraction": spec.prompts.extraction,
                    },
                    "model": {
                        "server_type": spec.model.server_type,
                        "base_url": spec.model.base_url,
                        "model": spec.model.model,
                        "temperature": spec.model.temperature,
                        "top_p": spec.model.top_p,
                        "top_k": spec.model.top_k,
                        "frequency_penalty": spec.model.frequency_penalty,
                        "presence_penalty": spec.model.presence_penalty,
                        "max_tokens": spec.model.max_tokens,
                        "stop_sequences": spec.model.stop_sequences,
                    },
                    "trigger_keywords": spec.trigger_keywords,
                }
                for agent_id, spec in self.specialists.items()
            },
            "analysis": {
                "request_analyzer": {"prompt": self.analysis.request_analyzer_prompt},
                "canvas_extraction": {"prompt": self.analysis.canvas_extraction_prompt},
                "complexity_indicators": self.analysis.complexity_indicators,
            },
            "telemetry": {
                "enabled": self.telemetry.enabled,
                "show_per_message": self.telemetry.show_per_message,
                "show_in_canvas": self.telemetry.show_in_canvas,
                "export_format": self.telemetry.export_format,
                "cost_estimation": {
                    "enabled": self.telemetry.cost_estimation.enabled,
                    "models": self.telemetry.cost_estimation.models,
                },
            },
            **(
                {
                    "research_orchestrator": {
                        "enabled": self.research_orchestrator.enabled,
                        "name": self.research_orchestrator.name,
                        "nickname": self.research_orchestrator.nickname,
                        "emoji": self.research_orchestrator.emoji,
                        "mention_prefix": self.research_orchestrator.mention_prefix,
                        "prompts": {
                            "system": self.research_orchestrator.prompts.system,
                            "greeting": self.research_orchestrator.prompts.greeting,
                            "synthesis": self.research_orchestrator.prompts.synthesis,
                        },
                        "model": {
                            "server_type": self.research_orchestrator.model.server_type,
                            "base_url": self.research_orchestrator.model.base_url,
                            "model": self.research_orchestrator.model.model,
                            "temperature": self.research_orchestrator.model.temperature,
                            "top_p": self.research_orchestrator.model.top_p,
                            "top_k": self.research_orchestrator.model.top_k,
                            "frequency_penalty": self.research_orchestrator.model.frequency_penalty,
                            "presence_penalty": self.research_orchestrator.model.presence_penalty,
                            "max_tokens": self.research_orchestrator.model.max_tokens,
                            "stop_sequences": self.research_orchestrator.model.stop_sequences,
                        },
                    }
                }
                if self.research_orchestrator
                else {}
            ),
            **(
                {
                    "research_agents": {
                        agent_id: {
                            "enabled": agent.enabled,
                            "name": agent.name,
                            "nickname": agent.nickname,
                            "emoji": agent.emoji,
                            "prompts": {
                                "system": agent.prompts.system,
                                "extraction": agent.prompts.extraction,
                                "search_query_generation": agent.prompts.search_query_generation,
                            },
                            "model": {
                                "server_type": agent.model.server_type,
                                "base_url": agent.model.base_url,
                                "model": agent.model.model,
                                "temperature": agent.model.temperature,
                                "top_p": agent.model.top_p,
                                "top_k": agent.model.top_k,
                                "frequency_penalty": agent.model.frequency_penalty,
                                "presence_penalty": agent.model.presence_penalty,
                                "max_tokens": agent.model.max_tokens,
                                "stop_sequences": agent.model.stop_sequences,
                            },
                        }
                        for agent_id, agent in self.research_agents.items()
                    }
                }
                if self.research_agents
                else {}
            ),
        }


_current_agent_settings: AgentSettings | None = None


def load_agent_settings() -> AgentSettings:
    if not AGENT_SETTINGS_FILE.exists():
        raise AgentSettingsError(
            f"Agent settings file not found: {AGENT_SETTINGS_FILE}. "
            "This file is required - no fallback defaults allowed per AGENTS.md"
        )
    try:
        with open(AGENT_SETTINGS_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return AgentSettings.from_dict(data)
    except json.JSONDecodeError as e:
        raise AgentSettingsError(f"Invalid JSON in agent_settings.json: {e}") from e


async def load_agent_settings_async() -> AgentSettings:
    if not AGENT_SETTINGS_FILE.exists():
        raise AgentSettingsError(
            f"Agent settings file not found: {AGENT_SETTINGS_FILE}. "
            "This file is required - no fallback defaults allowed per AGENTS.md"
        )
    try:
        async with aiofiles.open(AGENT_SETTINGS_FILE, mode="r", encoding="utf-8") as f:
            content = await f.read()
            data = json.loads(content)
            return AgentSettings.from_dict(data)
    except json.JSONDecodeError as e:
        raise AgentSettingsError(f"Invalid JSON in agent_settings.json: {e}") from e


def get_agent_settings() -> AgentSettings:
    global _current_agent_settings
    if _current_agent_settings is None:
        _current_agent_settings = load_agent_settings()
    return _current_agent_settings


def reload_agent_settings() -> AgentSettings:
    global _current_agent_settings
    _current_agent_settings = load_agent_settings()
    return _current_agent_settings


def save_agent_settings(settings: AgentSettings) -> None:
    with open(AGENT_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings.to_dict(), f, indent=2)


async def save_agent_settings_async(settings: AgentSettings) -> None:
    async with aiofiles.open(AGENT_SETTINGS_FILE, mode="w", encoding="utf-8") as f:
        await f.write(json.dumps(settings.to_dict(), indent=2))


def update_agent_settings(settings: AgentSettings) -> None:
    global _current_agent_settings
    _current_agent_settings = settings
    save_agent_settings(settings)


async def update_agent_settings_async(settings: AgentSettings) -> None:
    global _current_agent_settings
    _current_agent_settings = settings
    await save_agent_settings_async(settings)
