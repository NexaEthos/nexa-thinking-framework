from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.llm_proxy import LLMProxy
from app.services.llm_settings import get_settings
from app.services.app_settings import get_app_settings

router = APIRouter()


class DirectChatRequest(BaseModel):
    message: str


class DirectChatResponse(BaseModel):
    response: str


@router.post("/chat/direct", response_model=DirectChatResponse)
async def direct_chat(request: DirectChatRequest):
    """
    Direct chat endpoint - bypasses chain of thought and sends directly to LLM
    """
    try:
        settings = get_settings()
        app_settings = get_app_settings()
        
        llm_proxy = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
        
        system_prompt = app_settings.prompts.simple_assistant
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.message},
        ]
        
        response_text = ""
        async for chunk in llm_proxy.chat_completion(messages, stream=False):
            response_text += chunk
        
        return DirectChatResponse(response=response_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Direct chat error: {str(e)}")
