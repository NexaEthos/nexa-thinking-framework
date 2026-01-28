from fastapi import APIRouter
from pydantic import BaseModel
from app.services.agent_settings import get_agent_settings
from app.services.app_settings import get_app_settings
from app.services.question_manager import QuestionManager

router = APIRouter()


class PromptSection(BaseModel):
    label: str
    content: str
    token_estimate: int
    source: str


class PromptInfo(BaseModel):
    workspace: str
    system_prompt: PromptSection
    context_sections: list[PromptSection]
    user_message: PromptSection | None
    total_token_estimate: int
    rag_enabled: bool
    web_search_enabled: bool
    active_features: list[str]


def estimate_tokens(text: str) -> int:
    return len(text) // 4


@router.get("/chain-of-thought")
async def get_cot_prompt_info() -> PromptInfo:
    app_settings = get_app_settings()
    question_manager = QuestionManager()
    questions = question_manager.get_all_questions()
    
    enabled_questions = [q for q in questions if q.enabled]
    
    system_prompt = app_settings.prompts.cot_quick_prompt if app_settings.prompts.cot_quick_prompt else "You are a helpful assistant."
    
    context_sections = []
    
    for q in enabled_questions:
        context_sections.append(PromptSection(
            label=f"Question: {q.category}",
            content=q.text,
            token_estimate=estimate_tokens(q.text),
            source="questions.json",
        ))
    
    context_sections.append(PromptSection(
        label="CoT Configuration",
        content=f"Max Steps: {app_settings.chain_of_thought.max_steps}\nVerification: {'Enabled' if app_settings.chain_of_thought.enable_verification else 'Disabled'}\nStreaming: {'Enabled' if app_settings.chain_of_thought.stream_tokens else 'Disabled'}",
        token_estimate=20,
        source="app_settings.json",
    ))
    
    total = estimate_tokens(system_prompt) + sum(s.token_estimate for s in context_sections)
    
    active_features = []
    if app_settings.web_search.enabled:
        active_features.append("Web Search")
    if app_settings.qdrant.enabled and app_settings.qdrant.use_memory_search:
        active_features.append("Memory Search (RAG)")
    active_features.append(f"{len(enabled_questions)} Active Questions")
    
    return PromptInfo(
        workspace="Chain of Thought",
        system_prompt=PromptSection(
            label="System Prompt",
            content=system_prompt,
            token_estimate=estimate_tokens(system_prompt),
            source="app_settings.json",
        ),
        context_sections=context_sections,
        user_message=None,
        total_token_estimate=total,
        rag_enabled=app_settings.qdrant.enabled and app_settings.qdrant.use_memory_search,
        web_search_enabled=app_settings.web_search.enabled,
        active_features=active_features,
    )


@router.get("/project-manager")
async def get_pm_prompt_info() -> PromptInfo:
    agent_settings = get_agent_settings()
    app_settings = get_app_settings()
    
    pm = agent_settings.project_manager
    system_prompt = pm.prompts.system
    
    context_sections = []
    
    context_sections.append(PromptSection(
        label="Synthesis Prompt",
        content=pm.prompts.synthesis,
        token_estimate=estimate_tokens(pm.prompts.synthesis),
        source="agent_settings.json",
    ))

    context_sections.append(PromptSection(
        label="Conflict Resolution Prompt",
        content=pm.prompts.conflict_resolution[:200] + "..." if len(pm.prompts.conflict_resolution) > 200 else pm.prompts.conflict_resolution,
        token_estimate=estimate_tokens(pm.prompts.conflict_resolution),
        source="agent_settings.json",
    ))
    
    context_sections.append(PromptSection(
        label="Canvas Export Template",
        content="[Current canvas state will be injected here with all 4 sections: Identity, Definition, Resources, Execution]",
        token_estimate=500,
        source="Dynamic",
    ))
    
    context_sections.append(PromptSection(
        label="Conversation History",
        content="[Last 10 messages from conversation will be included]",
        token_estimate=1000,
        source="Dynamic",
    ))
    
    for agent_id, specialist in agent_settings.specialists.items():
        if specialist.enabled:
            context_sections.append(PromptSection(
                label=f"Specialist: @{agent_id} ({specialist.name})",
                content=f"System: {specialist.prompts.system[:200]}...\n\nExtraction Template: {specialist.prompts.extraction[:200]}...",
                token_estimate=estimate_tokens(specialist.prompts.system + specialist.prompts.extraction),
                source="agent_settings.json",
            ))
    
    total = estimate_tokens(system_prompt) + sum(s.token_estimate for s in context_sections)
    
    active_features = []
    if app_settings.web_search.enabled:
        active_features.append("Web Search")
    if app_settings.qdrant.enabled:
        active_features.append("Project Memory (RAG)")
    enabled_specialists = [s.name for s in agent_settings.specialists.values() if s.enabled]
    active_features.append(f"{len(enabled_specialists)} Active Specialists")
    
    return PromptInfo(
        workspace="Project Manager",
        system_prompt=PromptSection(
            label="PM System Prompt",
            content=system_prompt,
            token_estimate=estimate_tokens(system_prompt),
            source="agent_settings.json",
        ),
        context_sections=context_sections,
        user_message=None,
        total_token_estimate=total,
        rag_enabled=app_settings.qdrant.enabled,
        web_search_enabled=app_settings.web_search.enabled,
        active_features=active_features,
    )


@router.get("/research-lab")
async def get_research_prompt_info() -> PromptInfo:
    agent_settings = get_agent_settings()
    app_settings = get_app_settings()
    
    research_agents = agent_settings.research_agents or {}
    
    context_sections = []
    
    if "researcher" in research_agents:
        researcher = research_agents["researcher"]
        context_sections.append(PromptSection(
            label="Web Researcher System Prompt",
            content=researcher.prompts.system,
            token_estimate=estimate_tokens(researcher.prompts.system),
            source="agent_settings.json",
        ))
        context_sections.append(PromptSection(
            label="Search Query Generation",
            content=researcher.prompts.search_query_generation,
            token_estimate=estimate_tokens(researcher.prompts.search_query_generation),
            source="agent_settings.json",
        ))
        context_sections.append(PromptSection(
            label="Extraction Prompt",
            content=researcher.prompts.extraction[:500] + "..." if len(researcher.prompts.extraction) > 500 else researcher.prompts.extraction,
            token_estimate=estimate_tokens(researcher.prompts.extraction),
            source="agent_settings.json",
        ))
    
    if "fact_checker" in research_agents:
        fact_checker = research_agents["fact_checker"]
        context_sections.append(PromptSection(
            label="Fact Checker System Prompt",
            content=fact_checker.prompts.system,
            token_estimate=estimate_tokens(fact_checker.prompts.system),
            source="agent_settings.json",
        ))
        context_sections.append(PromptSection(
            label="Fact Checker Extraction",
            content=fact_checker.prompts.extraction[:500] + "..." if len(fact_checker.prompts.extraction) > 500 else fact_checker.prompts.extraction,
            token_estimate=estimate_tokens(fact_checker.prompts.extraction),
            source="agent_settings.json",
        ))
    
    total = sum(s.token_estimate for s in context_sections)
    
    active_features = []
    active_features.append("Web Search (DuckDuckGo)")
    if app_settings.qdrant.enabled:
        active_features.append("RAG Indexing & Retrieval")
    active_features.append("4-Agent Pipeline")
    
    return PromptInfo(
        workspace="Research Lab",
        system_prompt=PromptSection(
            label="Research Pipeline",
            content="The Research Lab uses a 4-agent pipeline: Web Researcher → RAG Indexer → Document Writer → Fact Checker",
            token_estimate=50,
            source="System",
        ),
        context_sections=context_sections,
        user_message=None,
        total_token_estimate=total,
        rag_enabled=app_settings.qdrant.enabled,
        web_search_enabled=True,
        active_features=active_features,
    )
