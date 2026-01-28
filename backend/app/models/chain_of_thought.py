from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WebSource(BaseModel):
    title: str
    url: str
    snippet: str


class MemorySource(BaseModel):
    id: str
    content: str
    score: float
    collection: str


class Step(BaseModel):
    step_number: int
    type: str
    question: Optional[str] = None
    content: Optional[str] = None
    llm_response: Optional[str] = None
    reasoning: Optional[str] = None
    decision: Optional[str] = None
    confidence: Optional[float] = None
    thinking: Optional[str] = None
    tokens_used: Optional[int] = None
    duration_ms: Optional[int] = None
    sources: Optional[List[WebSource]] = None
    memory_sources: Optional[List[MemorySource]] = None
    timestamp: str = Field(default_factory=_utc_now_iso)


class Verification(BaseModel):
    passed: bool
    notes: Optional[str] = None


class ChainOfThought(BaseModel):
    request: str
    status: str
    steps: List[Step] = Field(default_factory=list)
    final_answer: Optional[str] = None
    verification: Optional[Verification] = None
    created_at: str = Field(default_factory=_utc_now_iso)


class Question(BaseModel):
    id: int
    text: str
    category: Optional[str] = None
    enabled: bool = True
    created_at: str = Field(default_factory=_utc_now_iso)


class ChainOfThoughtRequest(BaseModel):
    query: str
    context: Optional[str] = None
    max_steps: int = 10
    enable_verification: bool = True


class ChainOfThoughtResponse(BaseModel):
    request_id: str
    request: str
    status: str
    steps: List[Step]
    final_answer: Optional[str] = None
    verification: Optional[Verification] = None
    created_at: str
    completed_at: Optional[str] = None
