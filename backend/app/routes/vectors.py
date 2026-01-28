import logging
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.vectors import VectorDocument
from app.services.qdrant_service import QdrantService
from app.services.embedding_service import EmbeddingService
from app.services.app_settings import get_app_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vectors", tags=["vectors"])


class IndexRequestBody(BaseModel):
    content: str
    collection: str = "research_documents"
    metadata: dict | None = None


class SearchRequestBody(BaseModel):
    query: str
    collection: str = "research_documents"
    limit: int = 5
    score_threshold: float = 0.7


class IndexResponse(BaseModel):
    id: str
    collection: str


class SearchResultResponse(BaseModel):
    id: str
    content: str
    score: float
    metadata: dict


class ChunkInfo(BaseModel):
    id: str
    content: str
    content_preview: str
    char_count: int
    word_count: int
    metadata: dict
    created_at: str | None = None


class ChunkListResponse(BaseModel):
    collection: str
    total_chunks: int
    chunks: list[ChunkInfo]


class EmbeddingInfoResponse(BaseModel):
    provider: str
    model: str
    vector_size: int
    distance_metric: str


class SimilaritySearchResult(BaseModel):
    id: str
    content: str
    content_preview: str
    score: float
    score_percent: int
    score_explanation: str
    metadata: dict


class SimilaritySearchResponse(BaseModel):
    query: str
    query_preview: str
    collection: str
    total_results: int
    results: list[SimilaritySearchResult]
    embedding_info: EmbeddingInfoResponse


class CollectionInfoResponse(BaseModel):
    name: str
    vectors_count: int
    status: str


class StatusResponse(BaseModel):
    enabled: bool
    deployment: str | None = None
    url: str | None = None


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str
    qdrant_connected: bool
    embedding_ready: bool
    latency_ms: int | None = None


class InitializeResponse(BaseModel):
    success: bool
    message: str
    collections_created: list[str]


@router.get("/status")
async def get_status() -> StatusResponse:
    settings = get_app_settings().qdrant
    return StatusResponse(
        enabled=settings.enabled,
        deployment=settings.deployment if settings.enabled else None,
        url=settings.url if settings.enabled else None,
    )


@router.post("/test-connection")
async def test_connection() -> ConnectionTestResponse:
    settings = get_app_settings()
    qdrant_settings = settings.qdrant
    embedding_settings = settings.embedding

    if not qdrant_settings.enabled:
        return ConnectionTestResponse(
            success=False,
            message="Qdrant is disabled in settings",
            qdrant_connected=False,
            embedding_ready=False,
        )

    qdrant_ok = False
    embedding_ok = False
    latency_ms = None
    errors = []

    start = time.time()
    try:
        from qdrant_client import AsyncQdrantClient
        if qdrant_settings.deployment == "cloud" and qdrant_settings.api_key:
            client = AsyncQdrantClient(url=qdrant_settings.url, api_key=qdrant_settings.api_key)
        else:
            client = AsyncQdrantClient(url=qdrant_settings.url)
        await client.get_collections()
        await client.close()
        qdrant_ok = True
        latency_ms = int((time.time() - start) * 1000)
    except Exception as e:
        errors.append(f"Qdrant: {str(e)}")
        logger.warning(f"Qdrant connection test failed: {e}")

    try:
        embedding_service = await EmbeddingService.get_instance()
        await embedding_service.initialize()
        test_embedding = await embedding_service.embed_text("test")
        if len(test_embedding) == embedding_settings.vector_size:
            embedding_ok = True
        else:
            errors.append(f"Embedding size mismatch: got {len(test_embedding)}, expected {embedding_settings.vector_size}")
    except Exception as e:
        errors.append(f"Embedding: {str(e)}")
        logger.warning(f"Embedding test failed: {e}")

    success = qdrant_ok and embedding_ok
    if success:
        message = f"Connected to Qdrant ({latency_ms}ms) and embedding model ready"
    else:
        message = "; ".join(errors) if errors else "Connection failed"

    return ConnectionTestResponse(
        success=success,
        message=message,
        qdrant_connected=qdrant_ok,
        embedding_ready=embedding_ok,
        latency_ms=latency_ms,
    )


@router.post("/initialize")
async def initialize_collections() -> InitializeResponse:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    try:
        service = await QdrantService.get_instance()
        service._initialized = False
        await service.initialize()

        collections = await service.list_collections()
        collection_names = [c.name for c in collections]

        return InitializeResponse(
            success=True,
            message=f"Initialized {len(collection_names)} collections",
            collections_created=collection_names,
        )
    except Exception as e:
        logger.error(f"Failed to initialize collections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index")
async def index_document(body: IndexRequestBody) -> IndexResponse:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    doc = VectorDocument(
        content=body.content,
        collection=body.collection,
        metadata=body.metadata or {},
    )
    doc_id = await service.index_document(doc)
    return IndexResponse(id=doc_id, collection=body.collection)


@router.post("/search")
async def search_documents(body: SearchRequestBody) -> list[SearchResultResponse]:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    results = await service.search(
        query=body.query,
        collection=body.collection,
        limit=body.limit,
        score_threshold=body.score_threshold,
    )
    return [
        SearchResultResponse(
            id=r.id,
            content=r.content,
            score=r.score,
            metadata=r.metadata,
        )
        for r in results
    ]


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, collection: str = "research_documents") -> dict:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    success = await service.delete(doc_id, collection)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found or deletion failed")
    return {"status": "deleted", "id": doc_id}


@router.get("/collections")
async def list_collections() -> list[CollectionInfoResponse]:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    collections = await service.list_collections()
    return [
        CollectionInfoResponse(
            name=c.name,
            vectors_count=c.vectors_count,
            status=c.status,
        )
        for c in collections
    ]


@router.post("/collections/{name}/clear")
async def clear_collection(name: str) -> dict:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    success = await service.clear_collection(name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to clear collection")
    return {"status": "cleared", "collection": name}


@router.get("/embedding-info")
async def get_embedding_info() -> EmbeddingInfoResponse:
    settings = get_app_settings()
    embedding_settings = settings.embedding
    return EmbeddingInfoResponse(
        provider=embedding_settings.provider,
        model=embedding_settings.model,
        vector_size=embedding_settings.vector_size,
        distance_metric="cosine",
    )


@router.get("/collections/{name}/chunks")
async def get_collection_chunks(name: str, limit: int = 100, offset: int = 0) -> ChunkListResponse:
    settings = get_app_settings().qdrant
    if not settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    try:
        from qdrant_client.http import models as qdrant_models
        
        scroll_result = await service._client.scroll(
            collection_name=name,
            limit=limit,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        
        points, next_offset = scroll_result
        
        chunks = []
        for point in points:
            content = point.payload.get("content", "") if point.payload else ""
            metadata = {k: v for k, v in point.payload.items() if k != "content"} if point.payload else {}
            
            chunks.append(ChunkInfo(
                id=str(point.id),
                content=content,
                content_preview=content[:200] + "..." if len(content) > 200 else content,
                char_count=len(content),
                word_count=len(content.split()),
                metadata=metadata,
                created_at=metadata.get("created_at"),
            ))
        
        collection_info = await service.get_collection_info(name)
        
        return ChunkListResponse(
            collection=name,
            total_chunks=collection_info.vectors_count,
            chunks=chunks,
        )
    except Exception as e:
        logger.error(f"Failed to get chunks from {name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_score_explanation(score: float) -> str:
    if score >= 0.95:
        return "Excellent match - nearly identical semantic meaning"
    elif score >= 0.85:
        return "Very strong match - highly relevant content"
    elif score >= 0.75:
        return "Good match - relevant with some variation"
    elif score >= 0.65:
        return "Moderate match - partially relevant"
    elif score >= 0.50:
        return "Weak match - loosely related"
    else:
        return "Poor match - minimal relevance"


@router.post("/search-detailed")
async def search_detailed(body: SearchRequestBody) -> SimilaritySearchResponse:
    settings = get_app_settings()
    qdrant_settings = settings.qdrant
    embedding_settings = settings.embedding
    
    if not qdrant_settings.enabled:
        raise HTTPException(status_code=503, detail="Qdrant service is disabled")

    service = await QdrantService.get_instance()
    if not service.is_enabled():
        await service.initialize()

    results = await service.search(
        query=body.query,
        collection=body.collection,
        limit=body.limit,
        score_threshold=body.score_threshold,
    )
    
    detailed_results = [
        SimilaritySearchResult(
            id=r.id,
            content=r.content,
            content_preview=r.content[:200] + "..." if len(r.content) > 200 else r.content,
            score=round(r.score, 4),
            score_percent=int(r.score * 100),
            score_explanation=get_score_explanation(r.score),
            metadata=r.metadata,
        )
        for r in results
    ]
    
    return SimilaritySearchResponse(
        query=body.query,
        query_preview=body.query[:100] + "..." if len(body.query) > 100 else body.query,
        collection=body.collection,
        total_results=len(detailed_results),
        results=detailed_results,
        embedding_info=EmbeddingInfoResponse(
            provider=embedding_settings.provider,
            model=embedding_settings.model,
            vector_size=embedding_settings.vector_size,
            distance_metric="cosine",
        ),
    )
