import asyncio
import logging

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.exceptions import UnexpectedResponse

from app.models.vectors import VectorDocument, VectorSearchResult, CollectionInfo
from app.services.app_settings import get_app_settings, QdrantSettings
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class QdrantService:
    _instance: "QdrantService | None" = None
    _lock = asyncio.Lock()

    def __init__(self):
        self._client: AsyncQdrantClient | None = None
        self._embedding_service: EmbeddingService | None = None
        self._settings: QdrantSettings | None = None
        self._initialized = False

    @classmethod
    async def get_instance(cls) -> "QdrantService":
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = QdrantService()
        return cls._instance

    async def initialize(self, settings: QdrantSettings | None = None) -> None:
        if self._initialized:
            return

        if settings is None:
            settings = get_app_settings().qdrant

        self._settings = settings

        if not settings.enabled:
            logger.info("Qdrant is disabled in settings")
            return

        if settings.deployment == "cloud" and settings.api_key:
            self._client = AsyncQdrantClient(
                url=settings.url,
                api_key=settings.api_key,
            )
        else:
            self._client = AsyncQdrantClient(url=settings.url)

        self._embedding_service = await EmbeddingService.get_instance()
        await self._embedding_service.initialize()

        await self._ensure_collections()
        self._initialized = True
        logger.info(f"QdrantService initialized with {settings.deployment} deployment at {settings.url}")

    async def _ensure_collections(self) -> None:
        if not self._client or not self._settings:
            return

        vector_size = self._embedding_service.get_vector_size()
        collections = [
            self._settings.collection_research,
            self._settings.collection_memory,
            self._settings.collection_canvas,
        ]

        for collection_name in collections:
            try:
                await self._client.get_collection(collection_name)
                logger.debug(f"Collection {collection_name} exists")
            except (UnexpectedResponse, Exception):
                await self._client.create_collection(
                    collection_name=collection_name,
                    vectors_config=qdrant_models.VectorParams(
                        size=vector_size,
                        distance=qdrant_models.Distance.COSINE,
                    ),
                )
                logger.info(f"Created collection: {collection_name}")

    def is_enabled(self) -> bool:
        return self._settings is not None and self._settings.enabled and self._client is not None

    async def index_document(self, doc: VectorDocument) -> str:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        embedding = await self._embedding_service.embed_text(doc.content)

        await self._client.upsert(
            collection_name=doc.collection,
            points=[
                qdrant_models.PointStruct(
                    id=doc.id,
                    vector=embedding,
                    payload={
                        "content": doc.content,
                        **doc.metadata,
                    },
                )
            ],
        )
        logger.debug(f"Indexed document {doc.id} in {doc.collection}")
        return doc.id

    async def index_batch(self, docs: list[VectorDocument]) -> list[str]:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        if not docs:
            return []

        collections: dict[str, list[VectorDocument]] = {}
        for doc in docs:
            if doc.collection not in collections:
                collections[doc.collection] = []
            collections[doc.collection].append(doc)

        all_ids = []
        for collection_name, collection_docs in collections.items():
            texts = [doc.content for doc in collection_docs]
            embeddings = await self._embedding_service.embed_batch(texts)

            points = [
                qdrant_models.PointStruct(
                    id=doc.id,
                    vector=embedding,
                    payload={
                        "content": doc.content,
                        **doc.metadata,
                    },
                )
                for doc, embedding in zip(collection_docs, embeddings)
            ]

            await self._client.upsert(
                collection_name=collection_name,
                points=points,
            )
            all_ids.extend([doc.id for doc in collection_docs])
            logger.debug(f"Indexed {len(collection_docs)} documents in {collection_name}")

        return all_ids

    async def search(
        self,
        query: str,
        collection: str,
        limit: int = 5,
        score_threshold: float = 0.7,
    ) -> list[VectorSearchResult]:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        query_embedding = await self._embedding_service.embed_text(query)

        response = await self._client.query_points(
            collection_name=collection,
            query=query_embedding,
            limit=limit,
            score_threshold=score_threshold,
            with_payload=True,
        )

        return [
            VectorSearchResult(
                id=str(point.id),
                content=point.payload.get("content", "") if point.payload else "",
                score=point.score if point.score else 0.0,
                metadata={k: v for k, v in point.payload.items() if k != "content"} if point.payload else {},
            )
            for point in response.points
        ]

    async def delete(self, doc_id: str, collection: str) -> bool:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        try:
            await self._client.delete(
                collection_name=collection,
                points_selector=qdrant_models.PointIdsList(points=[doc_id]),
            )
            logger.debug(f"Deleted document {doc_id} from {collection}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete document {doc_id}: {e}")
            return False

    async def get_collection_info(self, collection: str) -> CollectionInfo:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        info = await self._client.get_collection(collection)
        return CollectionInfo(
            name=collection,
            vectors_count=info.points_count or 0,
            status=info.status.value if info.status else "unknown",
        )

    async def get_collection_count(self, collection: str) -> int:
        if not self.is_enabled():
            return 0
        try:
            info = await self._client.get_collection(collection)
            return info.points_count or 0
        except Exception as e:
            logger.debug(f"Could not get collection count for {collection}: {e}")
            return 0

    async def list_collections(self) -> list[CollectionInfo]:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        collections = await self._client.get_collections()
        result = []
        for col in collections.collections:
            info = await self.get_collection_info(col.name)
            result.append(info)
        return result

    async def clear_collection(self, collection: str) -> bool:
        if not self.is_enabled():
            raise RuntimeError("Qdrant service is not enabled")

        try:
            info = await self._client.get_collection(collection)
            vector_size = info.config.params.vectors.size
            
            await self._client.delete_collection(collection)
            await self._client.create_collection(
                collection_name=collection,
                vectors_config=qdrant_models.VectorParams(
                    size=vector_size,
                    distance=qdrant_models.Distance.COSINE,
                ),
            )
            logger.info(f"Cleared collection: {collection}")
            return True
        except Exception as e:
            logger.error(f"Failed to clear collection {collection}: {e}")
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            self._client = None
            self._initialized = False
            logger.info("QdrantService closed")
