import asyncio
import logging
from typing import Protocol, Literal

import httpx

from app.services.app_settings import get_app_settings, EmbeddingSettings

logger = logging.getLogger(__name__)

ServerType = Literal["lm_studio", "ollama", "vllm", "openai"]


class EmbeddingProvider(Protocol):
    async def embed_text(self, text: str) -> list[float]: ...
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


class LMStudioEmbeddingProvider:
    def __init__(self, address: str, port: int, model: str):
        self._base_url = f"http://{address}:{port}"
        self._model = model
        self._client = httpx.AsyncClient(timeout=60.0)

    async def embed_text(self, text: str) -> list[float]:
        response = await self._client.post(
            f"{self._base_url}/v1/embeddings",
            json={"input": text, "model": self._model},
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.post(
            f"{self._base_url}/v1/embeddings",
            json={"input": texts, "model": self._model},
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]


class OllamaEmbeddingProvider:
    def __init__(self, address: str, port: int, model: str):
        self._base_url = f"http://{address}:{port}"
        self._model = model
        self._client = httpx.AsyncClient(timeout=60.0)

    async def embed_text(self, text: str) -> list[float]:
        response = await self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": text},
        )
        response.raise_for_status()
        data = response.json()
        if "embeddings" in data:
            return data["embeddings"][0]
        return data["embedding"]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self._model, "input": texts},
        )
        response.raise_for_status()
        data = response.json()
        return data["embeddings"]


class VLLMEmbeddingProvider:
    def __init__(self, address: str, port: int, model: str):
        self._base_url = f"http://{address}:{port}"
        self._model = model
        self._client = httpx.AsyncClient(timeout=60.0)

    async def embed_text(self, text: str) -> list[float]:
        response = await self._client.post(
            f"{self._base_url}/v1/embeddings",
            json={"input": text, "model": self._model},
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.post(
            f"{self._base_url}/v1/embeddings",
            json={"input": texts, "model": self._model},
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]


class OpenAIEmbeddingProvider:
    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self._api_key = api_key
        self._model = model
        self._client = httpx.AsyncClient(
            base_url="https://api.openai.com/v1",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
        )

    async def embed_text(self, text: str) -> list[float]:
        response = await self._client.post(
            "/embeddings",
            json={"input": text, "model": self._model},
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.post(
            "/embeddings",
            json={"input": texts, "model": self._model},
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]


async def test_embedding_connection(
    server_type: ServerType,
    address: str,
    port: int,
    model: str,
    api_key: str | None = None,
) -> dict:
    try:
        if server_type == "openai":
            if not api_key:
                return {"success": False, "message": "OpenAI API key required"}
            provider = OpenAIEmbeddingProvider(api_key, model)
        elif server_type == "lm_studio":
            provider = LMStudioEmbeddingProvider(address, port, model)
        elif server_type == "ollama":
            provider = OllamaEmbeddingProvider(address, port, model)
        elif server_type == "vllm":
            provider = VLLMEmbeddingProvider(address, port, model)
        else:
            return {"success": False, "message": f"Unknown server type: {server_type}"}

        embedding = await provider.embed_text("test")
        return {
            "success": True,
            "message": f"Connected! Vector size: {len(embedding)}",
            "vector_size": len(embedding),
        }
    except httpx.ConnectError:
        return {"success": False, "message": f"Cannot connect to {address}:{port}"}
    except httpx.HTTPStatusError as e:
        return {"success": False, "message": f"HTTP error: {e.response.status_code}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def fetch_embedding_models(
    server_type: ServerType,
    address: str,
    port: int,
) -> list[dict]:
    base_url = f"http://{address}:{port}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if server_type == "ollama":
                response = await client.get(f"{base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                models = []
                for m in data.get("models", []):
                    name = m.get("name", "")
                    if any(kw in name.lower() for kw in ["embed", "nomic", "mxbai", "bge", "minilm"]):
                        models.append({
                            "id": name,
                            "name": name,
                            "owned_by": "ollama",
                            "is_embedding": True,
                        })
                return models
            else:
                response = await client.get(f"{base_url}/v1/models")
                response.raise_for_status()
                data = response.json()
                models = []
                for m in data.get("data", []):
                    model_id = m.get("id", "")
                    is_embedding = any(kw in model_id.lower() for kw in [
                        "embed", "nomic", "mxbai", "bge", "minilm", "e5", "gte"
                    ])
                    models.append({
                        "id": model_id,
                        "name": model_id,
                        "owned_by": m.get("owned_by", server_type),
                        "is_embedding": is_embedding,
                    })
                return models
        except Exception as e:
            logger.warning(f"Failed to fetch embedding models: {e}")
            return []


class EmbeddingService:
    _instance: "EmbeddingService | None" = None
    _lock = asyncio.Lock()

    def __init__(self):
        self._provider: EmbeddingProvider | None = None
        self._settings: EmbeddingSettings | None = None

    @classmethod
    async def get_instance(cls) -> "EmbeddingService":
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = EmbeddingService()
        return cls._instance

    async def initialize(self, settings: EmbeddingSettings | None = None) -> None:
        if settings is None:
            settings = get_app_settings().embedding
        self._settings = settings
        self._provider = await self._create_provider(settings)
        logger.info(f"EmbeddingService initialized with provider: {settings.provider}/{settings.server_type}")

    async def reinitialize(self) -> None:
        settings = get_app_settings().embedding
        self._settings = settings
        self._provider = await self._create_provider(settings)
        logger.info(f"EmbeddingService reinitialized with provider: {settings.provider}/{settings.server_type}")

    async def _create_provider(self, settings: EmbeddingSettings) -> EmbeddingProvider:
        if settings.provider == "openai":
            if not settings.openai_api_key:
                raise ValueError("OpenAI API key required for openai embedding provider")
            return OpenAIEmbeddingProvider(settings.openai_api_key, settings.model)
        elif settings.provider == "llm":
            if settings.server_type == "lm_studio":
                return LMStudioEmbeddingProvider(settings.address, settings.port, settings.model)
            elif settings.server_type == "ollama":
                return OllamaEmbeddingProvider(settings.address, settings.port, settings.model)
            elif settings.server_type == "vllm":
                return VLLMEmbeddingProvider(settings.address, settings.port, settings.model)
            else:
                raise ValueError(f"Unknown server type: {settings.server_type}")
        else:
            raise ValueError(f"Unknown embedding provider: {settings.provider}")

    async def embed_text(self, text: str) -> list[float]:
        if self._provider is None:
            await self.initialize()
        return await self._provider.embed_text(text)

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if self._provider is None:
            await self.initialize()
        return await self._provider.embed_batch(texts)

    def get_vector_size(self) -> int:
        if self._settings is None:
            self._settings = get_app_settings().embedding
        return self._settings.vector_size
