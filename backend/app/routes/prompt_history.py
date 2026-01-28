import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prompt-history", tags=["prompt-history"])

HISTORY_FILE = Path("prompt_history.json")


class PromptSettings(BaseModel):
    temperature: float = 0.7
    use_thinking: bool = True
    web_search_enabled: bool = False
    rag_enabled: bool = False
    model: str = ""


class PromptVersion(BaseModel):
    id: str
    name: str
    prompt: str
    settings: PromptSettings
    workspace: str
    response_preview: str | None = None
    tokens_used: int | None = None
    latency_ms: int | None = None
    created_at: str
    parent_id: str | None = None
    tags: list[str] = []


class SavePromptRequest(BaseModel):
    name: str
    prompt: str
    settings: PromptSettings
    workspace: str
    response_preview: str | None = None
    tokens_used: int | None = None
    latency_ms: int | None = None
    parent_id: str | None = None
    tags: list[str] = []


class UpdatePromptRequest(BaseModel):
    name: str | None = None
    tags: list[str] | None = None


class PromptHistoryStore:
    def __init__(self, file_path: Path = HISTORY_FILE):
        self.file_path = file_path
        self._versions: list[PromptVersion] = []
        self._load()

    def _load(self) -> None:
        if self.file_path.exists():
            try:
                with open(self.file_path, "r") as f:
                    data = json.load(f)
                    self._versions = [PromptVersion(**v) for v in data]
                logger.info(f"Loaded {len(self._versions)} prompt versions from {self.file_path}")
            except Exception as e:
                logger.error(f"Failed to load prompt history: {e}")
                self._versions = []
        else:
            self._versions = []

    def _save(self) -> None:
        try:
            with open(self.file_path, "w") as f:
                json.dump([v.model_dump() for v in self._versions], f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save prompt history: {e}")

    def add(self, request: SavePromptRequest) -> PromptVersion:
        version = PromptVersion(
            id=str(uuid4()),
            name=request.name,
            prompt=request.prompt,
            settings=request.settings,
            workspace=request.workspace,
            response_preview=request.response_preview,
            tokens_used=request.tokens_used,
            latency_ms=request.latency_ms,
            created_at=datetime.now(timezone.utc).isoformat(),
            parent_id=request.parent_id,
            tags=request.tags,
        )
        self._versions.append(version)
        self._save()
        return version

    def get(self, version_id: str) -> PromptVersion | None:
        for v in self._versions:
            if v.id == version_id:
                return v
        return None

    def get_all(self, workspace: str | None = None) -> list[PromptVersion]:
        if workspace:
            return [v for v in self._versions if v.workspace == workspace]
        return self._versions

    def update(self, version_id: str, request: UpdatePromptRequest) -> PromptVersion | None:
        for i, v in enumerate(self._versions):
            if v.id == version_id:
                if request.name is not None:
                    self._versions[i].name = request.name
                if request.tags is not None:
                    self._versions[i].tags = request.tags
                self._save()
                return self._versions[i]
        return None

    def delete(self, version_id: str) -> bool:
        for i, v in enumerate(self._versions):
            if v.id == version_id:
                self._versions.pop(i)
                self._save()
                return True
        return False

    def clear(self) -> int:
        count = len(self._versions)
        self._versions = []
        self._save()
        return count

    def fork(self, version_id: str, new_name: str) -> PromptVersion | None:
        original = self.get(version_id)
        if not original:
            return None
        
        forked = PromptVersion(
            id=str(uuid4()),
            name=new_name,
            prompt=original.prompt,
            settings=original.settings,
            workspace=original.workspace,
            response_preview=None,
            tokens_used=None,
            latency_ms=None,
            created_at=datetime.now(timezone.utc).isoformat(),
            parent_id=original.id,
            tags=original.tags.copy(),
        )
        self._versions.append(forked)
        self._save()
        return forked

    def export_json(self, workspace: str | None = None) -> str:
        versions = self.get_all(workspace)
        return json.dumps([v.model_dump() for v in versions], indent=2)


history_store = PromptHistoryStore()


@router.get("")
async def list_prompt_versions(workspace: str | None = None) -> list[PromptVersion]:
    return history_store.get_all(workspace)


@router.get("/{version_id}")
async def get_prompt_version(version_id: str) -> PromptVersion:
    version = history_store.get(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("")
async def save_prompt_version(request: SavePromptRequest) -> PromptVersion:
    return history_store.add(request)


@router.patch("/{version_id}")
async def update_prompt_version(version_id: str, request: UpdatePromptRequest) -> PromptVersion:
    version = history_store.update(version_id, request)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.delete("/{version_id}")
async def delete_prompt_version(version_id: str) -> dict:
    if not history_store.delete(version_id):
        raise HTTPException(status_code=404, detail="Version not found")
    return {"status": "deleted", "id": version_id}


@router.post("/clear")
async def clear_prompt_history() -> dict:
    count = history_store.clear()
    return {"status": "cleared", "deleted_count": count}


@router.post("/{version_id}/fork")
async def fork_prompt_version(version_id: str, name: str) -> PromptVersion:
    forked = history_store.fork(version_id, name)
    if not forked:
        raise HTTPException(status_code=404, detail="Version not found")
    return forked


@router.get("/export/json")
async def export_prompt_history(workspace: str | None = None) -> dict:
    json_data = history_store.export_json(workspace)
    return {
        "format": "json",
        "data": json.loads(json_data),
        "count": len(json.loads(json_data)),
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
