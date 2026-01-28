from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.presets_service import (
    get_all_presets,
    get_presets_by_workspace,
    get_preset_by_id,
    save_custom_preset,
    delete_custom_preset,
    ExperimentPreset,
    PresetSettings,
)

router = APIRouter()


class PresetSettingsRequest(BaseModel):
    temperature: float = 0.7
    use_thinking: bool = True
    web_search_enabled: bool = True
    rag_enabled: bool = True
    max_tokens: int = 4096


class CreatePresetRequest(BaseModel):
    id: str
    name: str
    description: str
    workspace: str
    settings: PresetSettingsRequest
    icon: str = "🧪"


class PresetResponse(BaseModel):
    id: str
    name: str
    description: str
    workspace: str
    settings: PresetSettingsRequest
    is_default: bool
    icon: str


def preset_to_response(preset: ExperimentPreset) -> PresetResponse:
    return PresetResponse(
        id=preset.id,
        name=preset.name,
        description=preset.description,
        workspace=preset.workspace,
        settings=PresetSettingsRequest(
            temperature=preset.settings.temperature,
            use_thinking=preset.settings.use_thinking,
            web_search_enabled=preset.settings.web_search_enabled,
            rag_enabled=preset.settings.rag_enabled,
            max_tokens=preset.settings.max_tokens,
        ),
        is_default=preset.is_default,
        icon=preset.icon,
    )


@router.get("")
async def list_presets() -> list[PresetResponse]:
    presets = get_all_presets()
    return [preset_to_response(p) for p in presets]


@router.get("/workspace/{workspace}")
async def list_presets_by_workspace(workspace: str) -> list[PresetResponse]:
    if workspace not in ["chain_of_thought", "project_manager", "research_lab"]:
        raise HTTPException(status_code=400, detail="Invalid workspace")
    presets = get_presets_by_workspace(workspace)  # type: ignore
    return [preset_to_response(p) for p in presets]


@router.get("/{preset_id}")
async def get_preset(preset_id: str) -> PresetResponse:
    preset = get_preset_by_id(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    return preset_to_response(preset)


@router.post("")
async def create_preset(request: CreatePresetRequest) -> PresetResponse:
    if request.workspace not in ["chain_of_thought", "project_manager", "research_lab"]:
        raise HTTPException(status_code=400, detail="Invalid workspace")
    
    preset = ExperimentPreset(
        id=request.id,
        name=request.name,
        description=request.description,
        workspace=request.workspace,  # type: ignore
        settings=PresetSettings(
            temperature=request.settings.temperature,
            use_thinking=request.settings.use_thinking,
            web_search_enabled=request.settings.web_search_enabled,
            rag_enabled=request.settings.rag_enabled,
            max_tokens=request.settings.max_tokens,
        ),
        icon=request.icon,
        is_default=False,
    )
    
    saved = save_custom_preset(preset)
    return preset_to_response(saved)


@router.delete("/{preset_id}")
async def delete_preset(preset_id: str) -> dict:
    success = delete_custom_preset(preset_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete preset (not found or is default)")
    return {"success": True, "deleted_id": preset_id}
