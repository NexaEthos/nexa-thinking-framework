from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional, Any
from app.services.llm_settings import (
    get_settings,
    update_settings,
    fetch_models,
    test_connection,
    LLMSettings,
)
from app.services.app_settings import (
    get_app_settings,
    update_app_settings,
    update_web_search_settings,
    update_classifier_settings,
    update_chain_of_thought_settings,
    update_prompt_settings,
    AppSettings,
    WebSearchSettings,
    ClassifierSettings,
    ChainOfThoughtSettings,
    PromptSettings,
)
from app.services.agent_settings import (
    get_agent_settings,
    reload_agent_settings,
    update_agent_settings_async,
    AgentSettingsError,
    ModelConfig,
)

router = APIRouter()


class LLMSettingsRequest(BaseModel):
    server_type: Literal["lm_studio", "ollama", "vllm"]
    address: str
    port: int
    model: str
    temperature: float = 0.7
    max_tokens: int = 4096
    timeout: int = 300


class LLMSettingsResponse(BaseModel):
    server_type: str
    address: str
    port: int
    model: str
    temperature: float
    max_tokens: int
    timeout: int


class ModelInfo(BaseModel):
    id: str
    name: str
    owned_by: str


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class ConnectionTestRequest(BaseModel):
    server_type: Literal["lm_studio", "ollama", "vllm"]
    address: str
    port: int


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str
    models_count: int


@router.get("/settings/llm", response_model=LLMSettingsResponse)
async def get_llm_settings():
    """Get current LLM settings"""
    settings = get_settings()
    return LLMSettingsResponse(
        server_type=settings.server_type,
        address=settings.address,
        port=settings.port,
        model=settings.model,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        timeout=settings.timeout,
    )


@router.put("/settings/llm", response_model=LLMSettingsResponse)
async def update_llm_settings(request: LLMSettingsRequest):
    """Update LLM settings"""
    settings = LLMSettings(
        server_type=request.server_type,
        address=request.address,
        port=request.port,
        model=request.model,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        timeout=request.timeout,
    )
    update_settings(settings)
    return LLMSettingsResponse(
        server_type=settings.server_type,
        address=settings.address,
        port=settings.port,
        model=settings.model,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        timeout=settings.timeout,
    )


@router.get("/settings/llm/models", response_model=ModelsResponse)
async def get_available_models():
    """Get available models from current LLM server"""
    settings = get_settings()
    try:
        models = await fetch_models(
            settings.server_type, settings.address, settings.port
        )
        return ModelsResponse(models=[ModelInfo(**m) for m in models])
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/settings/llm/models", response_model=ModelsResponse)
async def fetch_models_from_server(request: ConnectionTestRequest):
    """Fetch models from a specific server (before saving settings)"""
    try:
        models = await fetch_models(request.server_type, request.address, request.port)
        return ModelsResponse(models=[ModelInfo(**m) for m in models])
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/settings/llm/test", response_model=ConnectionTestResponse)
async def test_llm_connection(request: ConnectionTestRequest):
    """Test connection to LLM server"""
    result = await test_connection(request.server_type, request.address, request.port)
    return ConnectionTestResponse(**result)


class LLMStatusResponse(BaseModel):
    connected: bool
    model: str
    server_type: str


@router.get("/settings/llm/status", response_model=LLMStatusResponse)
async def get_llm_status():
    """Get current LLM connection status using saved settings"""
    settings = get_settings()
    try:
        result = await test_connection(
            settings.server_type, settings.address, settings.port
        )
        return LLMStatusResponse(
            connected=result.get("success", False),
            model=settings.model,
            server_type=settings.server_type,
        )
    except Exception:
        return LLMStatusResponse(
            connected=False,
            model=settings.model,
            server_type=settings.server_type,
        )


class WebSearchSettingsRequest(BaseModel):
    enabled: bool = True
    max_results: int = 5
    max_results_for_questions: int = 3
    region: str = "wt-wt"
    research_triggers: list[str] = []


class ClassifierSettingsRequest(BaseModel):
    moderate_word_threshold: int = 4
    complex_indicators: list[str] = []


class ChainOfThoughtSettingsRequest(BaseModel):
    max_steps: int = 10
    enable_verification: bool = True
    stream_tokens: bool = True


class PromptSettingsRequest(BaseModel):
    canvas_agent_system: Optional[str] = None
    simple_assistant: Optional[str] = None
    question_answer: Optional[str] = None
    final_answer: Optional[str] = None
    cot_quick_prompt: Optional[str] = None
    quick_prompt: Optional[str] = None


class AppSettingsResponse(BaseModel):
    web_search: dict
    classifier: dict
    chain_of_thought: dict
    prompts: dict
    embedding: dict = {}
    qdrant: dict = {}


@router.get("/settings/app", response_model=AppSettingsResponse)
async def get_application_settings():
    """Get all application settings"""
    settings = get_app_settings()
    return AppSettingsResponse(**settings.to_dict())


@router.put("/settings/app", response_model=AppSettingsResponse)
async def update_application_settings(request: AppSettingsResponse):
    """Update all application settings"""
    settings = AppSettings.from_dict(
        {
            "web_search": request.web_search,
            "classifier": request.classifier,
            "chain_of_thought": request.chain_of_thought,
            "prompts": request.prompts,
            "embedding": request.embedding,
            "qdrant": request.qdrant,
        }
    )
    update_app_settings(settings)
    return AppSettingsResponse(**settings.to_dict())


@router.put("/settings/app/web-search")
async def update_web_search_config(request: WebSearchSettingsRequest):
    """Update web search settings"""
    web_search = WebSearchSettings(
        enabled=request.enabled,
        max_results=request.max_results,
        max_results_for_questions=request.max_results_for_questions,
        region=request.region,
        research_triggers=(
            request.research_triggers
            if request.research_triggers
            else WebSearchSettings().research_triggers
        ),
    )
    settings = update_web_search_settings(web_search)
    return settings.to_dict()


@router.put("/settings/app/classifier")
async def update_classifier_config(request: ClassifierSettingsRequest):
    """Update classifier settings"""
    classifier = ClassifierSettings(
        moderate_word_threshold=request.moderate_word_threshold,
        complex_indicators=(
            request.complex_indicators
            if request.complex_indicators
            else ClassifierSettings().complex_indicators
        ),
    )
    settings = update_classifier_settings(classifier)
    return settings.to_dict()


@router.put("/settings/app/chain-of-thought")
async def update_cot_config(request: ChainOfThoughtSettingsRequest):
    """Update chain-of-thought settings"""
    cot = ChainOfThoughtSettings(
        max_steps=request.max_steps,
        enable_verification=request.enable_verification,
        stream_tokens=request.stream_tokens,
    )
    settings = update_chain_of_thought_settings(cot)
    return settings.to_dict()


@router.put("/settings/app/prompts")
async def update_prompts_config(request: PromptSettingsRequest):
    """Update prompt settings"""
    current = get_app_settings().prompts
    prompts = PromptSettings(
        canvas_agent_system=(
            request.canvas_agent_system
            if request.canvas_agent_system
            else current.canvas_agent_system
        ),
        simple_assistant=(
            request.simple_assistant
            if request.simple_assistant
            else current.simple_assistant
        ),
        question_answer=(
            request.question_answer
            if request.question_answer
            else current.question_answer
        ),
        final_answer=(
            request.final_answer if request.final_answer else current.final_answer
        ),
        cot_quick_prompt=(
            request.cot_quick_prompt
            if request.cot_quick_prompt
            else current.cot_quick_prompt
        ),
        quick_prompt=(
            request.quick_prompt if request.quick_prompt else current.quick_prompt
        ),
    )
    settings = update_prompt_settings(prompts)
    return settings.to_dict()


@router.post("/settings/app/prompts/reset")
async def reset_prompts_to_defaults():
    """Reset all prompts to defaults"""
    prompts = PromptSettings()
    settings = update_prompt_settings(prompts)
    return settings.to_dict()


class AgentSettingsResponse(BaseModel):
    version: str
    project_manager: dict[str, Any]
    specialists: dict[str, dict[str, Any]]
    analysis: dict[str, Any]
    telemetry: dict[str, Any]


@router.get("/settings/agents", response_model=AgentSettingsResponse)
async def get_agents_settings():
    """Get all agent settings including PM and specialists"""
    try:
        settings = get_agent_settings()
        return AgentSettingsResponse(**settings.to_dict())
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings/agents/pm")
async def get_pm_settings():
    """Get Project Manager settings"""
    try:
        settings = get_agent_settings()
        pm = settings.project_manager
        return {
            "enabled": pm.enabled,
            "name": pm.name,
            "nickname": pm.nickname,
            "emoji": pm.emoji,
            "mention_prefix": pm.mention_prefix,
            "prompts": {
                "system": pm.prompts.system,
                "greeting": pm.prompts.greeting,
                "synthesis": pm.prompts.synthesis,
                "conflict_resolution": pm.prompts.conflict_resolution,
            },
            "model": {
                "server_type": pm.model.server_type,
                "base_url": pm.model.base_url,
                "model": pm.model.model,
                "temperature": pm.model.temperature,
                "top_p": pm.model.top_p,
                "top_k": pm.model.top_k,
                "frequency_penalty": pm.model.frequency_penalty,
                "presence_penalty": pm.model.presence_penalty,
                "max_tokens": pm.model.max_tokens,
                "stop_sequences": pm.model.stop_sequences,
            },
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings/agents/pm/greeting")
async def get_pm_greeting():
    """Get PM greeting message for frontend initialization"""
    try:
        settings = get_agent_settings()
        return {"greeting": settings.project_manager.prompts.greeting}
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings/agents/specialists")
async def get_all_specialists():
    """Get all specialist agent settings"""
    try:
        settings = get_agent_settings()
        return {
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
            for agent_id, spec in settings.specialists.items()
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings/agents/specialists/{agent_id}")
async def get_specialist_settings(agent_id: str):
    """Get settings for a specific specialist agent"""
    try:
        settings = get_agent_settings()
        spec = settings.get_specialist(agent_id)
        return {
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
    except AgentSettingsError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/settings/agents/reload")
async def reload_agents_settings():
    """Reload agent settings from disk (useful after manual file edits)"""
    try:
        settings = reload_agent_settings()
        return {"success": True, "version": settings.version}
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


class AgentModelConfigRequest(BaseModel):
    server_type: str = "inherit"
    base_url: str = "inherit"
    model: str = "inherit"
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    max_tokens: int = 2048
    stop_sequences: list[str] = []


@router.put("/settings/agents/pm/model")
async def update_pm_model_config(request: AgentModelConfigRequest):
    """Update Project Manager model configuration"""
    try:
        settings = get_agent_settings()
        settings.project_manager.model = ModelConfig(
            server_type=request.server_type,
            base_url=request.base_url,
            model=request.model,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            frequency_penalty=request.frequency_penalty,
            presence_penalty=request.presence_penalty,
            max_tokens=request.max_tokens,
            stop_sequences=request.stop_sequences,
        )
        await update_agent_settings_async(settings)
        pm = settings.project_manager
        return {
            "server_type": pm.model.server_type,
            "base_url": pm.model.base_url,
            "model": pm.model.model,
            "temperature": pm.model.temperature,
            "top_p": pm.model.top_p,
            "top_k": pm.model.top_k,
            "frequency_penalty": pm.model.frequency_penalty,
            "presence_penalty": pm.model.presence_penalty,
            "max_tokens": pm.model.max_tokens,
            "stop_sequences": pm.model.stop_sequences,
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/agents/specialists/{agent_id}/model")
async def update_specialist_model_config(agent_id: str, request: AgentModelConfigRequest):
    """Update specialist agent model configuration"""
    try:
        settings = get_agent_settings()
        spec = settings.get_specialist(agent_id)
        spec.model = ModelConfig(
            server_type=request.server_type,
            base_url=request.base_url,
            model=request.model,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            frequency_penalty=request.frequency_penalty,
            presence_penalty=request.presence_penalty,
            max_tokens=request.max_tokens,
            stop_sequences=request.stop_sequences,
        )
        await update_agent_settings_async(settings)
        return {
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
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=404, detail=str(e))


class PMPromptsRequest(BaseModel):
    system: str
    greeting: str
    synthesis: str
    conflict_resolution: str


class SpecialistPromptsRequest(BaseModel):
    system: str
    extraction: str


class SpecialistKeywordsRequest(BaseModel):
    trigger_keywords: list[str]


@router.put("/settings/agents/pm/prompts")
async def update_pm_prompts(request: PMPromptsRequest):
    """Update Project Manager prompts"""
    try:
        from app.services.agent_settings import PMPrompts
        settings = get_agent_settings()
        settings.project_manager.prompts = PMPrompts(
            system=request.system,
            greeting=request.greeting,
            synthesis=request.synthesis,
            conflict_resolution=request.conflict_resolution,
        )
        await update_agent_settings_async(settings)
        pm = settings.project_manager
        return {
            "system": pm.prompts.system,
            "greeting": pm.prompts.greeting,
            "synthesis": pm.prompts.synthesis,
            "conflict_resolution": pm.prompts.conflict_resolution,
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/agents/specialists/{agent_id}/prompts")
async def update_specialist_prompts(agent_id: str, request: SpecialistPromptsRequest):
    """Update specialist agent prompts"""
    try:
        from app.services.agent_settings import SpecialistPrompts
        settings = get_agent_settings()
        spec = settings.get_specialist(agent_id)
        spec.prompts = SpecialistPrompts(
            system=request.system,
            extraction=request.extraction,
        )
        await update_agent_settings_async(settings)
        return {
            "system": spec.prompts.system,
            "extraction": spec.prompts.extraction,
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/settings/agents/specialists/{agent_id}/keywords")
async def update_specialist_keywords(agent_id: str, request: SpecialistKeywordsRequest):
    """Update specialist agent trigger keywords"""
    try:
        settings = get_agent_settings()
        spec = settings.get_specialist(agent_id)
        spec.trigger_keywords = request.trigger_keywords
        await update_agent_settings_async(settings)
        return {"trigger_keywords": spec.trigger_keywords}
    except AgentSettingsError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/settings/agents/research")
async def get_research_agents_settings():
    """Get all research agent settings including orchestrator"""
    try:
        settings = get_agent_settings()
        result = {}
        
        if settings.research_orchestrator:
            orch = settings.research_orchestrator
            result["orchestrator"] = {
                "enabled": orch.enabled,
                "name": orch.name,
                "nickname": orch.nickname,
                "emoji": orch.emoji,
                "prompts": {
                    "system": orch.prompts.system,
                    "greeting": orch.prompts.greeting,
                    "synthesis": orch.prompts.synthesis,
                },
                "model": {
                    "server_type": orch.model.server_type,
                    "base_url": orch.model.base_url,
                    "model": orch.model.model,
                    "temperature": orch.model.temperature,
                    "top_p": orch.model.top_p,
                    "top_k": orch.model.top_k,
                    "frequency_penalty": orch.model.frequency_penalty,
                    "presence_penalty": orch.model.presence_penalty,
                    "max_tokens": orch.model.max_tokens,
                    "stop_sequences": orch.model.stop_sequences,
                },
            }
        
        if settings.research_agents:
            result["agents"] = {}
            for agent_id, agent in settings.research_agents.items():
                result["agents"][agent_id] = {
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
        
        return result
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


class ResearchOrchestratorPromptsRequest(BaseModel):
    system: str
    greeting: str
    synthesis: str


class ResearchAgentPromptsRequest(BaseModel):
    system: str
    extraction: str
    search_query_generation: str


@router.put("/settings/agents/research/orchestrator/prompts")
async def update_research_orchestrator_prompts(request: ResearchOrchestratorPromptsRequest):
    """Update Research Orchestrator prompts"""
    try:
        from app.services.agent_settings import ResearchOrchestratorPrompts
        settings = get_agent_settings()
        if not settings.research_orchestrator:
            raise HTTPException(status_code=404, detail="Research orchestrator not configured")
        settings.research_orchestrator.prompts = ResearchOrchestratorPrompts(
            system=request.system,
            greeting=request.greeting,
            synthesis=request.synthesis,
        )
        await update_agent_settings_async(settings)
        orch = settings.research_orchestrator
        return {
            "system": orch.prompts.system,
            "greeting": orch.prompts.greeting,
            "synthesis": orch.prompts.synthesis,
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/agents/research/orchestrator/model")
async def update_research_orchestrator_model(request: AgentModelConfigRequest):
    """Update Research Orchestrator model configuration"""
    try:
        settings = get_agent_settings()
        if not settings.research_orchestrator:
            raise HTTPException(status_code=404, detail="Research orchestrator not configured")
        settings.research_orchestrator.model = ModelConfig(
            server_type=request.server_type,
            base_url=request.base_url,
            model=request.model,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            frequency_penalty=request.frequency_penalty,
            presence_penalty=request.presence_penalty,
            max_tokens=request.max_tokens,
            stop_sequences=request.stop_sequences,
        )
        await update_agent_settings_async(settings)
        orch = settings.research_orchestrator
        return {
            "server_type": orch.model.server_type,
            "base_url": orch.model.base_url,
            "model": orch.model.model,
            "temperature": orch.model.temperature,
            "top_p": orch.model.top_p,
            "top_k": orch.model.top_k,
            "frequency_penalty": orch.model.frequency_penalty,
            "presence_penalty": orch.model.presence_penalty,
            "max_tokens": orch.model.max_tokens,
            "stop_sequences": orch.model.stop_sequences,
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/agents/research/{agent_id}/prompts")
async def update_research_agent_prompts(agent_id: str, request: ResearchAgentPromptsRequest):
    """Update research agent prompts"""
    try:
        from app.services.agent_settings import ResearchAgentPrompts
        settings = get_agent_settings()
        if not settings.research_agents or agent_id not in settings.research_agents:
            raise HTTPException(status_code=404, detail=f"Research agent '{agent_id}' not found")
        agent = settings.research_agents[agent_id]
        agent.prompts = ResearchAgentPrompts(
            system=request.system,
            extraction=request.extraction,
            search_query_generation=request.search_query_generation,
        )
        await update_agent_settings_async(settings)
        return {
            "system": agent.prompts.system,
            "extraction": agent.prompts.extraction,
            "search_query_generation": agent.prompts.search_query_generation,
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/agents/research/{agent_id}/model")
async def update_research_agent_model(agent_id: str, request: AgentModelConfigRequest):
    """Update research agent model configuration"""
    try:
        settings = get_agent_settings()
        if not settings.research_agents or agent_id not in settings.research_agents:
            raise HTTPException(status_code=404, detail=f"Research agent '{agent_id}' not found")
        agent = settings.research_agents[agent_id]
        agent.model = ModelConfig(
            server_type=request.server_type,
            base_url=request.base_url,
            model=request.model,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            frequency_penalty=request.frequency_penalty,
            presence_penalty=request.presence_penalty,
            max_tokens=request.max_tokens,
            stop_sequences=request.stop_sequences,
        )
        await update_agent_settings_async(settings)
        return {
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
        }
    except AgentSettingsError as e:
        raise HTTPException(status_code=500, detail=str(e))


class EmbeddingConnectionTestRequest(BaseModel):
    server_type: Literal["lm_studio", "ollama", "vllm", "openai"]
    address: str
    port: int
    model: str
    api_key: Optional[str] = None


class EmbeddingConnectionTestResponse(BaseModel):
    success: bool
    message: str
    vector_size: Optional[int] = None


class EmbeddingModelInfo(BaseModel):
    id: str
    name: str
    owned_by: str
    is_embedding: bool = False


class EmbeddingModelsResponse(BaseModel):
    models: list[EmbeddingModelInfo]


class EmbeddingModelsRequest(BaseModel):
    server_type: Literal["lm_studio", "ollama", "vllm"]
    address: str
    port: int


@router.post("/settings/embedding/test", response_model=EmbeddingConnectionTestResponse)
async def test_embedding_endpoint(request: EmbeddingConnectionTestRequest):
    from app.services.embedding_service import test_embedding_connection
    result = await test_embedding_connection(
        request.server_type,
        request.address,
        request.port,
        request.model,
        request.api_key,
    )
    return EmbeddingConnectionTestResponse(**result)


@router.post("/settings/embedding/models", response_model=EmbeddingModelsResponse)
async def fetch_embedding_models_endpoint(request: EmbeddingModelsRequest):
    from app.services.embedding_service import fetch_embedding_models
    models = await fetch_embedding_models(
        request.server_type,
        request.address,
        request.port,
    )
    return EmbeddingModelsResponse(models=[EmbeddingModelInfo(**m) for m in models])


@router.post("/settings/embedding/reinitialize")
async def reinitialize_embedding_service():
    from app.services.embedding_service import EmbeddingService
    try:
        service = await EmbeddingService.get_instance()
        await service.reinitialize()
        return {"success": True, "message": "Embedding service reinitialized"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/system/reset")
async def global_system_reset():
    """Reset all system data: telemetry, logs, and Qdrant collections"""
    from app.services.telemetry import TelemetryService
    from app.services.logging_service import get_logging_service
    from app.services.qdrant_service import QdrantService

    results = {
        "telemetry": False,
        "logs": False,
        "qdrant_research": False,
        "qdrant_memory": False,
        "qdrant_canvas": False,
    }

    try:
        telemetry = await TelemetryService.get_instance()
        telemetry.reset_session()
        results["telemetry"] = True
    except Exception as e:
        results["telemetry_error"] = str(e)

    try:
        logging_svc = get_logging_service()
        logging_svc.clear_logs()
        results["logs"] = True
    except Exception as e:
        results["logs_error"] = str(e)

    try:
        qdrant = await QdrantService.get_instance()
        if qdrant.is_enabled():
            app_settings = get_app_settings()
            collections = [
                app_settings.qdrant.collection_research,
                app_settings.qdrant.collection_memory,
                app_settings.qdrant.collection_canvas,
            ]
            for collection in collections:
                try:
                    await qdrant.clear_collection(collection)
                    results[f"qdrant_{collection.split('_')[-1]}"] = True
                except Exception as e:
                    results[f"qdrant_{collection.split('_')[-1]}_error"] = str(e)
    except Exception as e:
        results["qdrant_error"] = str(e)

    return {
        "status": "ok",
        "message": "System reset completed",
        "results": results,
    }
