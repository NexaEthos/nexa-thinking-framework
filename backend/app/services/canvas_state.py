import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.models.agents import (
    CanvasSection,
    ProjectCanvas,
    SectionMetrics,
    SECTION_ORDER,
)

logger = logging.getLogger(__name__)


class CanvasEvent(str, Enum):
    SECTION_UPDATE = "section_update"
    SECTION_CLEAR = "section_clear"
    CANVAS_RESET = "canvas_reset"
    METRICS_UPDATE = "metrics_update"


@dataclass
class CanvasSectionState:
    section: CanvasSection
    version: int = 0
    history: list[tuple[datetime, str]] = field(default_factory=list)

    def update(
        self, title: str, content: str, metrics: SectionMetrics | None = None
    ) -> None:
        if content != self.section.content:
            self.history.append((datetime.now(), self.section.content))
            self.version += 1
        self.section.title = title
        self.section.content = content
        self.section.last_updated = datetime.now()
        if metrics:
            self.section.metrics = metrics

    def rollback(self) -> bool:
        if not self.history:
            return False
        timestamp, previous_content = self.history.pop()
        self.section.content = previous_content
        self.section.last_updated = timestamp
        self.version += 1
        return True


class CanvasStateManager:
    def __init__(self):
        self._canvas = ProjectCanvas.create_empty()
        self._sections: dict[str, CanvasSectionState] = {}
        self._initialize_sections()
        self._listeners: list = []

    def _initialize_sections(self) -> None:
        self._sections = {
            "identity": CanvasSectionState(section=self._canvas.identity),
            "definition": CanvasSectionState(section=self._canvas.definition),
            "resources": CanvasSectionState(section=self._canvas.resources),
            "execution": CanvasSectionState(section=self._canvas.execution),
        }

    def get_canvas(self) -> ProjectCanvas:
        return self._canvas

    def get_section(self, section_id: str) -> CanvasSection | None:
        state = self._sections.get(section_id)
        return state.section if state else None

    def get_section_state(self, section_id: str) -> CanvasSectionState | None:
        return self._sections.get(section_id)

    def update_section(
        self,
        section_id: str,
        title: str,
        content: str,
        agent_id: str | None = None,
        metrics: SectionMetrics | None = None,
    ) -> bool:
        state = self._sections.get(section_id)
        if not state:
            logger.warning(f"Unknown section: {section_id}")
            return False

        state.update(title, content, metrics)
        if agent_id:
            state.section.agent_id = agent_id

        logger.info(f"Section '{section_id}' updated (v{state.version})")
        self._notify_listeners(CanvasEvent.SECTION_UPDATE, section_id)
        return True

    def clear_section(self, section_id: str) -> bool:
        state = self._sections.get(section_id)
        if not state:
            return False

        state.update(state.section.title, "")
        logger.info(f"Section '{section_id}' cleared")
        self._notify_listeners(CanvasEvent.SECTION_CLEAR, section_id)
        return True

    def rollback_section(self, section_id: str) -> bool:
        state = self._sections.get(section_id)
        if not state:
            return False

        success = state.rollback()
        if success:
            logger.info(f"Section '{section_id}' rolled back to v{state.version}")
            self._notify_listeners(CanvasEvent.SECTION_UPDATE, section_id)
        return success

    def reset_canvas(self) -> None:
        self._canvas = ProjectCanvas.create_empty()
        self._initialize_sections()
        logger.info("Canvas reset to empty state")
        self._notify_listeners(CanvasEvent.CANVAS_RESET, None)

    def get_canvas_summary(self) -> dict:
        return {
            "sections": {
                section_id: {
                    "has_content": bool(state.section.content.strip()),
                    "version": state.version,
                    "last_updated": (
                        state.section.last_updated.isoformat()
                        if state.section.last_updated
                        else None
                    ),
                }
                for section_id, state in self._sections.items()
            },
            "completion": self._calculate_completion(),
        }

    def _calculate_completion(self) -> dict:
        total = len(SECTION_ORDER)
        completed = sum(
            1
            for section_id in SECTION_ORDER
            if self._sections[section_id].section.content.strip()
        )
        return {
            "completed": completed,
            "total": total,
            "percentage": int((completed / total) * 100) if total > 0 else 0,
        }

    def add_listener(self, callback) -> None:
        self._listeners.append(callback)

    def remove_listener(self, callback) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    def _notify_listeners(self, event: CanvasEvent, section_id: str | None) -> None:
        for listener in self._listeners:
            try:
                listener(event, section_id, self._canvas)
            except Exception as e:
                logger.error(f"Canvas listener error: {e}")

    def to_dict(self) -> dict:
        return {
            "canvas": self._canvas.to_dict(),
            "summary": self.get_canvas_summary(),
        }

    def export_for_prompt(self) -> str:
        lines = ["Current Canvas State:"]
        for section_id in SECTION_ORDER:
            section = self._sections[section_id].section
            content = section.content.strip() or "(empty)"
            lines.append(f"\n## {section.title}\n{content}")
        return "\n".join(lines)


_canvas_manager: CanvasStateManager | None = None


def get_canvas_manager() -> CanvasStateManager:
    global _canvas_manager
    if _canvas_manager is None:
        _canvas_manager = CanvasStateManager()
    return _canvas_manager
