"""Agent placeholder — gerçek LLM entegrasyonu sonraya bırakıldı."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user

router = APIRouter(prefix="/v1", tags=["agent"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    session_state: dict[str, Any] | None = None
    active_modules: list[str] | None = None


class ChatResponse(BaseModel):
    message: str
    actions: list[dict[str, Any]] = []
    tool_invocations: list[dict[str, Any]] = []


@router.post("/chat", response_model=ChatResponse)
async def chat(_body: ChatRequest, _user: CurrentUser) -> ChatResponse:
    return ChatResponse(
        message="Agent bu sürümde etkin değil. Yakında kullanıma açılacak.",
    )


@router.get("/models")
async def list_models(_user: CurrentUser) -> dict:
    return {"models": [], "default": None}
