from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
import uuid


@dataclass
class VectorDocument:
    content: str
    collection: str
    metadata: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "collection": self.collection,
            "metadata": self.metadata,
        }


@dataclass
class VectorSearchResult:
    id: str
    content: str
    score: float
    metadata: dict[str, Any]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "score": self.score,
            "metadata": self.metadata,
        }


@dataclass
class IndexRequest:
    content: str
    collection: str = "research_documents"
    metadata: dict[str, Any] | None = None

    def to_document(self) -> VectorDocument:
        return VectorDocument(
            content=self.content,
            collection=self.collection,
            metadata=self.metadata or {"indexed_at": datetime.utcnow().isoformat()},
        )


@dataclass
class SearchRequest:
    query: str
    collection: str = "research_documents"
    limit: int = 5
    score_threshold: float = 0.7


@dataclass
class CollectionInfo:
    name: str
    vectors_count: int
    status: str

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "vectors_count": self.vectors_count,
            "status": self.status,
        }
