import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Literal

from app.base_path import get_base_path

logger = logging.getLogger(__name__)

WorkspaceType = Literal["chain_of_thought", "project_manager", "research_lab"]

DEFAULT_PRESETS_FILE = get_base_path() / "presets.json"


@dataclass
class PresetSettings:
    temperature: float = 0.7
    use_thinking: bool = True
    web_search_enabled: bool = True
    rag_enabled: bool = True
    max_tokens: int = 4096


@dataclass
class ExperimentPreset:
    id: str
    name: str
    description: str
    workspace: WorkspaceType
    settings: PresetSettings
    is_default: bool = False
    icon: str = "🧪"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "workspace": self.workspace,
            "settings": asdict(self.settings),
            "is_default": self.is_default,
            "icon": self.icon,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ExperimentPreset":
        settings_data = data.get("settings", {})
        return cls(
            id=data["id"],
            name=data["name"],
            description=data.get("description", ""),
            workspace=data.get("workspace", "chain_of_thought"),
            settings=PresetSettings(**settings_data),
            is_default=data.get("is_default", False),
            icon=data.get("icon", "🧪"),
        )


DEFAULT_PRESETS = [
    ExperimentPreset(
        id="basic-thinking",
        name="Basic Thinking",
        description="Standard chain-of-thought reasoning with balanced settings",
        workspace="chain_of_thought",
        settings=PresetSettings(temperature=0.7, use_thinking=True, web_search_enabled=False, rag_enabled=False),
        is_default=True,
        icon="🧠",
    ),
    ExperimentPreset(
        id="rag-comparison",
        name="RAG vs No-RAG",
        description="Compare responses with and without RAG retrieval",
        workspace="chain_of_thought",
        settings=PresetSettings(temperature=0.5, use_thinking=True, web_search_enabled=False, rag_enabled=True),
        is_default=True,
        icon="📚",
    ),
    ExperimentPreset(
        id="creative-mode",
        name="Creative Mode",
        description="Higher temperature for more creative, varied responses",
        workspace="chain_of_thought",
        settings=PresetSettings(temperature=0.9, use_thinking=True, web_search_enabled=False, rag_enabled=False),
        is_default=True,
        icon="🎨",
    ),
    ExperimentPreset(
        id="precise-mode",
        name="Precise Mode",
        description="Lower temperature for more focused, deterministic responses",
        workspace="chain_of_thought",
        settings=PresetSettings(temperature=0.2, use_thinking=True, web_search_enabled=False, rag_enabled=False),
        is_default=True,
        icon="🎯",
    ),
    ExperimentPreset(
        id="direct-llm",
        name="Direct LLM",
        description="Skip thinking process, get direct LLM response",
        workspace="chain_of_thought",
        settings=PresetSettings(temperature=0.7, use_thinking=False, web_search_enabled=False, rag_enabled=False),
        is_default=True,
        icon="⚡",
    ),
    ExperimentPreset(
        id="full-stack",
        name="Full Stack Research",
        description="Enable all features: thinking, web search, and RAG",
        workspace="chain_of_thought",
        settings=PresetSettings(temperature=0.6, use_thinking=True, web_search_enabled=True, rag_enabled=True),
        is_default=True,
        icon="🔬",
    ),
    ExperimentPreset(
        id="pm-creative",
        name="Creative Planning",
        description="Higher creativity for brainstorming project ideas",
        workspace="project_manager",
        settings=PresetSettings(temperature=0.8, use_thinking=True, web_search_enabled=True, rag_enabled=True),
        is_default=True,
        icon="💡",
    ),
    ExperimentPreset(
        id="pm-structured",
        name="Structured Planning",
        description="Focused, detailed project planning with precision",
        workspace="project_manager",
        settings=PresetSettings(temperature=0.4, use_thinking=True, web_search_enabled=False, rag_enabled=True),
        is_default=True,
        icon="📋",
    ),
    ExperimentPreset(
        id="research-deep",
        name="Deep Research",
        description="Thorough research with all sources enabled",
        workspace="research_lab",
        settings=PresetSettings(temperature=0.5, use_thinking=True, web_search_enabled=True, rag_enabled=True),
        is_default=True,
        icon="🔍",
    ),
    ExperimentPreset(
        id="research-quick",
        name="Quick Research",
        description="Fast research with web search only",
        workspace="research_lab",
        settings=PresetSettings(temperature=0.6, use_thinking=False, web_search_enabled=True, rag_enabled=False),
        is_default=True,
        icon="⚡",
    ),
]


@dataclass
class PresetsStore:
    presets: list[ExperimentPreset] = field(default_factory=list)

    def get_by_workspace(self, workspace: WorkspaceType) -> list[ExperimentPreset]:
        return [p for p in self.presets if p.workspace == workspace]

    def get_by_id(self, preset_id: str) -> ExperimentPreset | None:
        for p in self.presets:
            if p.id == preset_id:
                return p
        return None

    def add_preset(self, preset: ExperimentPreset) -> None:
        existing = self.get_by_id(preset.id)
        if existing:
            self.presets.remove(existing)
        self.presets.append(preset)

    def delete_preset(self, preset_id: str) -> bool:
        preset = self.get_by_id(preset_id)
        if preset and not preset.is_default:
            self.presets.remove(preset)
            return True
        return False


_store: PresetsStore | None = None


def _load_presets() -> PresetsStore:
    store = PresetsStore(presets=list(DEFAULT_PRESETS))
    
    if DEFAULT_PRESETS_FILE.exists():
        try:
            with open(DEFAULT_PRESETS_FILE, encoding="utf-8") as f:
                data = json.load(f)
            custom_presets = [ExperimentPreset.from_dict(p) for p in data.get("custom_presets", [])]
            for p in custom_presets:
                store.add_preset(p)
            logger.info(f"Loaded {len(custom_presets)} custom presets")
        except Exception as e:
            logger.warning(f"Failed to load custom presets: {e}")
    
    return store


def _save_custom_presets(store: PresetsStore) -> None:
    custom = [p for p in store.presets if not p.is_default]
    try:
        with open(DEFAULT_PRESETS_FILE, "w", encoding="utf-8") as f:
            json.dump({"custom_presets": [p.to_dict() for p in custom]}, f, indent=2)
        logger.info(f"Saved {len(custom)} custom presets")
    except Exception as e:
        logger.warning(f"Failed to save custom presets: {e}")


def get_presets_store() -> PresetsStore:
    global _store
    if _store is None:
        _store = _load_presets()
    return _store


def get_all_presets() -> list[ExperimentPreset]:
    return get_presets_store().presets


def get_presets_by_workspace(workspace: WorkspaceType) -> list[ExperimentPreset]:
    return get_presets_store().get_by_workspace(workspace)


def get_preset_by_id(preset_id: str) -> ExperimentPreset | None:
    return get_presets_store().get_by_id(preset_id)


def save_custom_preset(preset: ExperimentPreset) -> ExperimentPreset:
    store = get_presets_store()
    preset.is_default = False
    store.add_preset(preset)
    _save_custom_presets(store)
    return preset


def delete_custom_preset(preset_id: str) -> bool:
    store = get_presets_store()
    result = store.delete_preset(preset_id)
    if result:
        _save_custom_presets(store)
    return result
