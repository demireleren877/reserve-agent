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
from app.agent.client import API_FORMATS, AgentClient, OAuthClientCredentials, is_cert_verify_error
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
    # Kurumsal ağ HTTPS'i yeniden imzalıyorsa son çare (Agent Ayarları'ndaki kutu).
    skip_tls_verify: bool = False
    # Düşünme kipini kapat: OpenAI biçiminde reasoning_effort "none" (LM Studio'da
    # ~17x hızlı). Ollama biçimleri zaten think:false gönderiyor.
    disable_thinking: bool = False
    # Custom sağlayıcı: API biçimi ve kimlik doğrulama (kurumsal gateway).
    api_format: str = "openai"  # openai | ollama_chat | ollama_generate
    auth_type: str = "api_key"  # api_key | oauth_client_credentials
    token_url: str = ""
    client_id: str = ""
    client_secret: str = ""


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
    # NOT: frontend `assistant_message` alanını okur (web ile aynı şema) — `message` DEĞİL.
    assistant_message: str
    actions: list[dict[str, Any]] = []
    tool_invocations: list[dict[str, Any]] = []
    stopped_reason: str = "final"
    # Frontend biriktirip sonraki turda full_history olarak geri gönderir.
    raw_additions: list[dict[str, Any]] = []
    # ask_user ile istenen yapısal form (doluysa chat'te tıklanabilir gösterilir).
    form: dict[str, Any] | None = None


@router.post("/agent/chat", response_model=ChatResponse)
def agent_chat(body: ChatRequest, _user: CurrentUser) -> ChatResponse:
    cfg = body.config or AgentConfigIn()
    if not cfg.model.strip():
        raise HTTPException(status_code=400, detail="agent_not_configured")

    if cfg.api_format not in API_FORMATS:
        raise HTTPException(status_code=400, detail=f"unknown api_format: {cfg.api_format}")
    oauth = None
    if cfg.auth_type == "oauth_client_credentials":
        if not (cfg.token_url.strip() and cfg.client_id.strip() and cfg.client_secret):
            raise HTTPException(status_code=400, detail="oauth_incomplete: token URL, client ID and client secret are required")
        oauth = OAuthClientCredentials(cfg.token_url.strip(), cfg.client_id.strip(), cfg.client_secret)

    # Lokal sunucular anahtar istemez; OpenAI SDK boş anahtar kabul etmez → dummy.
    client = AgentClient(
        api_key=cfg.api_key.strip() or "local",
        model=cfg.model.strip(),
        base_url=cfg.base_url.strip() or None,
        temperature=cfg.temperature,
        verify_tls=not cfg.skip_tls_verify,
        api_format=cfg.api_format,
        oauth=oauth,
        extra_body={"reasoning_effort": "none"} if cfg.disable_thinking and cfg.api_format == "openai" else None,
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
        if is_cert_verify_error(e):
            # Ham OpenSSL metni kullanıcıya ne yapacağını söylemiyordu.
            raise HTTPException(
                status_code=502,
                detail=(
                    "agent_error: The LLM endpoint's TLS certificate is not trusted on this "
                    "computer. Corporate networks often re-sign HTTPS with their own root "
                    "certificate; the app uses the Windows certificate store, so this means "
                    "that root is not installed there. Either tick \"Skip TLS certificate "
                    "verification\" in Agent Settings, or ask IT for the corporate root CA "
                    "(.pem/.cer) and set the AGENT_CA_BUNDLE environment variable to its path. "
                    f"Details: {e}"
                ),
            ) from e
        raise HTTPException(status_code=502, detail=f"agent_error: {e}") from e

    return ChatResponse(
        assistant_message=result.assistant_message,
        actions=result.actions,
        tool_invocations=result.tool_invocations,
        stopped_reason=result.stopped_reason,
        raw_additions=result.raw_additions,
        form=result.form,
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
