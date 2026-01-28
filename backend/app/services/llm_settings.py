import httpx
import json
import logging
import os
import aiofiles
from dataclasses import dataclass, asdict
from typing import Literal, TypeGuard
from pathlib import Path

logger = logging.getLogger(__name__)

ServerType = Literal["lm_studio", "ollama", "vllm"]
_VALID_SERVER_TYPES: tuple[ServerType, ...] = ("lm_studio", "ollama", "vllm")

SETTINGS_FILE = Path(__file__).parent.parent.parent / "llm_settings.json"


def _is_valid_server_type(value: str) -> TypeGuard[ServerType]:
    return value in _VALID_SERVER_TYPES


def _parse_server_type(value: str) -> ServerType:
    if _is_valid_server_type(value):
        return value
    return "lm_studio"


@dataclass
class LLMSettings:
    server_type: ServerType
    address: str
    port: int
    model: str
    temperature: float = 0.7
    max_tokens: int = 4096
    timeout: int = 300

    def get_base_url(self) -> str:
        if self.server_type == "ollama":
            return f"http://{self.address}:{self.port}/api"
        return f"http://{self.address}:{self.port}/v1"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "LLMSettings":
        return cls(
            server_type=data.get("server_type", "lm_studio"),
            address=data.get("address", "localhost"),
            port=data.get("port", 1234),
            model=data.get("model", ""),
            temperature=data.get("temperature", 0.7),
            max_tokens=data.get("max_tokens", 4096),
            timeout=data.get("timeout", 300),
        )


def get_default_settings() -> LLMSettings:
    server_type_str = os.getenv("LLM_SERVER_TYPE", "lm_studio")
    server_type = _parse_server_type(server_type_str)
    return LLMSettings(
        server_type=server_type,
        address=os.getenv("LM_STUDIO_HOST", "localhost"),
        port=int(os.getenv("LM_STUDIO_PORT", "1234")),
        model=os.getenv("LM_STUDIO_MODEL", ""),
        temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
        max_tokens=int(os.getenv("LLM_MAX_TOKENS", "4096")),
        timeout=int(os.getenv("LLM_TIMEOUT", "300")),
    )


def load_settings() -> LLMSettings:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                data = json.load(f)
                return LLMSettings.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to load llm_settings.json, using defaults: {e}")
    return get_default_settings()


async def load_settings_async() -> LLMSettings:
    if SETTINGS_FILE.exists():
        try:
            async with aiofiles.open(SETTINGS_FILE, mode="r", encoding="utf-8") as f:
                content = await f.read()
                data = json.loads(content)
                return LLMSettings.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to load llm_settings.json async, using defaults: {e}")
    return get_default_settings()


def save_settings(settings: LLMSettings) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings.to_dict(), f, indent=2)


async def save_settings_async(settings: LLMSettings) -> None:
    async with aiofiles.open(SETTINGS_FILE, mode="w", encoding="utf-8") as f:
        await f.write(json.dumps(settings.to_dict(), indent=2))


_current_settings: LLMSettings | None = None


def get_settings() -> LLMSettings:
    global _current_settings
    if _current_settings is None:
        _current_settings = load_settings()
    return _current_settings


def update_settings(settings: LLMSettings) -> None:
    global _current_settings
    _current_settings = settings
    save_settings(settings)


async def update_settings_async(settings: LLMSettings) -> None:
    global _current_settings
    _current_settings = settings
    await save_settings_async(settings)


async def fetch_models_lm_studio(address: str, port: int) -> list[dict]:
    """Fetch available models from LM Studio"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"http://{address}:{port}/v1/models")
            response.raise_for_status()
            data = response.json()
            models = []
            for model in data.get("data", []):
                models.append(
                    {
                        "id": model.get("id", ""),
                        "name": model.get("id", "").split("/")[-1],
                        "owned_by": model.get("owned_by", "unknown"),
                    }
                )
            return models
    except Exception as e:
        raise RuntimeError(f"Failed to fetch models from LM Studio: {e}")


async def fetch_models_ollama(address: str, port: int) -> list[dict]:
    """Fetch available models from Ollama"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"http://{address}:{port}/api/tags")
            response.raise_for_status()
            data = response.json()
            models = []
            for model in data.get("models", []):
                models.append(
                    {
                        "id": model.get("name", ""),
                        "name": model.get("name", "").split(":")[0],
                        "owned_by": "ollama",
                        "size": model.get("size", 0),
                        "modified_at": model.get("modified_at", ""),
                    }
                )
            return models
    except Exception as e:
        raise RuntimeError(f"Failed to fetch models from Ollama: {e}")


async def fetch_models_vllm(address: str, port: int) -> list[dict]:
    """Fetch available models from vLLM"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"http://{address}:{port}/v1/models")
            response.raise_for_status()
            data = response.json()
            models = []
            for model in data.get("data", []):
                models.append(
                    {
                        "id": model.get("id", ""),
                        "name": model.get("id", ""),
                        "owned_by": model.get("owned_by", "vllm"),
                    }
                )
            return models
    except Exception as e:
        raise RuntimeError(f"Failed to fetch models from vLLM: {e}")


async def fetch_models(server_type: ServerType, address: str, port: int) -> list[dict]:
    """Fetch available models based on server type"""
    if server_type == "lm_studio":
        return await fetch_models_lm_studio(address, port)
    elif server_type == "ollama":
        return await fetch_models_ollama(address, port)
    elif server_type == "vllm":
        return await fetch_models_vllm(address, port)
    else:
        raise ValueError(f"Unknown server type: {server_type}")


async def test_connection(server_type: ServerType, address: str, port: int) -> dict:
    """Test connection to LLM server"""
    try:
        models = await fetch_models(server_type, address, port)
        return {
            "success": True,
            "message": f"Connected successfully. Found {len(models)} model(s).",
            "models_count": len(models),
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "models_count": 0,
        }
