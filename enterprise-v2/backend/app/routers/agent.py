"""Agent — web sürümüyle BİREBİR portlanmış motor (loop + tools + modules).

Desktop OFFLINE çalışır: LLM, kullanıcının Agent Ayarları'nda tanımladığı LOKAL,
OpenAI-uyumlu bir endpoint'tir (Ollama / LM Studio / llama.cpp / LAN). İstek gövdesinde
gelen config (base_url/api_key/model/system_prompt/enabled_tools) ile AgentClient kurulur.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.agent.client import AgentClient
from app.agent.loop import run_agent_turn, GLOBAL_PROMPT
from app.agent.tools import TOOL_SCHEMAS

router = APIRouter(prefix="/v1", tags=["agent"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


class AgentConfigIn(BaseModel):
    """Agent Ayarları ekranından gelen LLM yapılandırması (lokal endpoint)."""
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    system_prompt: str | None = None
    enabled_tools: list[str] | None = None
    temperature: float | None = None


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    # Çok-modüllü payload: { reserve: {triangle, session_state}, cashflow: {...}, ... }
    modules: dict[str, dict[str, Any]] | None = None
    # Legacy tek-modül (rezerv) yolu
    triangle: dict[str, Any] | None = None
    session_state: dict[str, Any] | None = None
    full_history: list[dict[str, Any]] | None = None
    config: AgentConfigIn | None = None


class ChatResponse(BaseModel):
    message: str
    actions: list[dict[str, Any]] = []
    tool_invocations: list[dict[str, Any]] = []
    # Frontend biriktirip sonraki turda full_history olarak geri gönderir.
    raw_additions: list[dict[str, Any]] = []


@router.post("/agent/chat", response_model=ChatResponse)
def agent_chat(body: ChatRequest, _user: CurrentUser) -> ChatResponse:
    cfg = body.config or AgentConfigIn()
    if not cfg.model.strip():
        raise HTTPException(status_code=400, detail="agent_not_configured")

    # Lokal sunucular anahtar istemez; OpenAI SDK boş anahtar kabul etmez → dummy.
    client = AgentClient(
        api_key=cfg.api_key.strip() or "local",
        model=cfg.model.strip(),
        base_url=cfg.base_url.strip() or None,
    )

    try:
        result = run_agent_turn(
            client,
            body.messages,
            body.modules,
            triangle_payload=body.triangle,
            session_state=body.session_state,
            full_history=body.full_history,
            global_prompt=cfg.system_prompt,
            enabled_tools=set(cfg.enabled_tools) if cfg.enabled_tools is not None else None,
        )
    except Exception as e:  # LLM/endpoint hatasını istemciye taşı
        raise HTTPException(status_code=502, detail=f"agent_error: {e}") from e

    return ChatResponse(
        message=result.assistant_message,
        actions=result.actions,
        tool_invocations=result.tool_invocations,
        raw_additions=result.raw_additions,
    )


@router.get("/agent/tools")
def agent_tools(_user: CurrentUser) -> dict:
    """LLM'e gönderilebilecek GERÇEK araç listesi (Ayarlar > Tools'u besler)."""
    tools = [
        {
            "name": s["function"]["name"],
            "description": s["function"].get("description", ""),
        }
        for s in TOOL_SCHEMAS
    ]
    return {"tools": tools, "count": len(tools)}


@router.get("/agent/prompt")
def agent_prompt(_user: CurrentUser) -> dict:
    """Yerleşik GLOBAL sistem promptu (Ayarlar'da 'varsayılanı yükle' için)."""
    return {"system_prompt": GLOBAL_PROMPT}


@router.get("/models")
def list_models(_user: CurrentUser) -> dict:
    # Model, Agent Ayarları'ndan gelir (lokal endpoint). Sabit liste yok.
    return {"models": [], "default": None}
