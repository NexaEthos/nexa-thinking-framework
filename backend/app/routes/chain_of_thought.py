from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
from datetime import datetime
from app.base_path import get_base_path
from app.models.chain_of_thought import ChainOfThoughtRequest, ChainOfThoughtResponse
from app.services.orchestrator import ChainOfThoughtOrchestrator
from app.services.llm_proxy import LLMProxy
from app.services.question_manager import QuestionManager
from app.services.request_store import request_store
from app.services.llm_settings import get_settings
import os
from dotenv import load_dotenv


class WebSourceResult(BaseModel):
    title: str
    url: str
    snippet: str


class ComparisonConfig(BaseModel):
    label: str
    temperature: float
    use_thinking: bool = True
    web_search_enabled: bool = False
    rag_enabled: bool = False


class ComparisonRequest(BaseModel):
    query: str
    config_a: ComparisonConfig
    config_b: ComparisonConfig


class ComparisonResult(BaseModel):
    label: str
    response: str
    tokens_used: int
    latency_ms: int
    steps_count: int
    web_sources: list[WebSourceResult] = []
    error: str | None = None


class ComparisonResponse(BaseModel):
    query: str
    result_a: ComparisonResult
    result_b: ComparisonResult
    timestamp: str

load_dotenv()

router = APIRouter()

_questions_env = os.getenv("QUESTIONS_FILE", "questions.json")
QUESTIONS_FILE = str(get_base_path() / _questions_env)
question_manager = QuestionManager(questions_file=QUESTIONS_FILE)


def get_orchestrator() -> ChainOfThoughtOrchestrator:
    """Create orchestrator with current LLM settings"""
    settings = get_settings()
    llm_proxy = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
    return ChainOfThoughtOrchestrator(
        llm_proxy=llm_proxy, question_manager=question_manager
    )


@router.post("/chain-of-thought", response_model=ChainOfThoughtResponse)
async def process_chain_of_thought(request: ChainOfThoughtRequest):
    """
    Process a request through chain of thought reasoning

    Args:
        request: ChainOfThoughtRequest containing user query and optional context

    Returns:
        ChainOfThoughtResponse with complete chain of thought and final answer
    """
    try:
        orchestrator = get_orchestrator()
        request_id, chain = await orchestrator.process_request(request.query)

        request_store.save(request_id, chain)

        return ChainOfThoughtResponse(
            request_id=request_id,
            request=chain.request,
            status=chain.status,
            steps=chain.steps,
            final_answer=chain.final_answer,
            verification=chain.verification,
            created_at=chain.created_at,
            completed_at=chain.created_at if chain.status == "completed" else None,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error processing chain of thought: {str(e)}"
        )


@router.get("/chain-of-thought/{request_id}", response_model=ChainOfThoughtResponse)
async def get_chain_of_thought(request_id: str):
    chain = request_store.get(request_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Request not found")

    return ChainOfThoughtResponse(
        request_id=request_id,
        request=chain.request,
        status=chain.status,
        steps=chain.steps,
        final_answer=chain.final_answer,
        verification=chain.verification,
        created_at=chain.created_at,
        completed_at=chain.created_at if chain.status == "completed" else None,
    )


@router.get("/chain-of-thought")
async def list_chain_of_thought_requests(limit: int = 20):
    recent = request_store.list_recent(limit)
    return [
        {
            "request_id": rid,
            "request": (
                chain.request[:100] + "..."
                if len(chain.request) > 100
                else chain.request
            ),
            "status": chain.status,
            "created_at": chain.created_at,
        }
        for rid, chain in recent
    ]


@router.get("/chain-of-thought/health")
async def health_check():
    """
    Health check endpoint for chain of thought service
    """
    return {"status": "healthy", "service": "chain-of-thought"}


async def run_comparison_task(
    query: str, config: ComparisonConfig, question_manager: QuestionManager
) -> ComparisonResult:
    from app.services.app_settings import get_app_settings, save_app_settings
    
    start_time = datetime.now()
    web_sources: list[WebSourceResult] = []
    
    try:
        settings = get_settings()
        llm_proxy = LLMProxy(
            base_url=settings.get_base_url(),
            model=settings.model,
            temperature=config.temperature,
        )
        
        if config.use_thinking:
            app_settings = get_app_settings()
            original_web_search = app_settings.web_search.enabled
            original_rag = app_settings.qdrant.use_memory_search
            
            try:
                app_settings.web_search.enabled = config.web_search_enabled
                app_settings.qdrant.use_memory_search = config.rag_enabled
                save_app_settings(app_settings)
                
                orchestrator = ChainOfThoughtOrchestrator(
                    llm_proxy=llm_proxy,
                    question_manager=question_manager,
                )
                _, chain = await orchestrator.process_request(query)
                response = chain.final_answer or ""
                steps_count = len(chain.steps)
                tokens = sum(
                    s.tokens_used for s in chain.steps if s.tokens_used
                )
                
                for step in chain.steps:
                    if step.sources:
                        for src in step.sources:
                            web_sources.append(WebSourceResult(
                                title=src.title,
                                url=src.url,
                                snippet=src.snippet,
                            ))
            finally:
                app_settings.web_search.enabled = original_web_search
                app_settings.qdrant.use_memory_search = original_rag
                save_app_settings(app_settings)
        else:
            messages = [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": query},
            ]
            response, metrics = await llm_proxy.chat_completion_with_metrics(messages, "direct")
            steps_count = 0
            tokens = metrics.input_tokens + metrics.output_tokens
        
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return ComparisonResult(
            label=config.label,
            response=response,
            tokens_used=tokens,
            latency_ms=latency_ms,
            steps_count=steps_count,
            web_sources=web_sources,
        )
    except Exception as e:
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        return ComparisonResult(
            label=config.label,
            response="",
            tokens_used=0,
            latency_ms=latency_ms,
            steps_count=0,
            web_sources=[],
            error=str(e),
        )


@router.post("/chain-of-thought/compare", response_model=ComparisonResponse)
async def compare_configurations(request: ComparisonRequest):
    """
    Run the same query with two different configurations and compare results.
    Executes both configurations in parallel for faster comparison.
    """
    result_a, result_b = await asyncio.gather(
        run_comparison_task(request.query, request.config_a, question_manager),
        run_comparison_task(request.query, request.config_b, question_manager),
    )
    
    return ComparisonResponse(
        query=request.query,
        result_a=result_a,
        result_b=result_b,
        timestamp=datetime.now().isoformat(),
    )
