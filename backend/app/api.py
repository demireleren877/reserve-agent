"""API router: upload + compute + chat endpoint'leri."""

from __future__ import annotations

import os

import base64

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.agent.client import AgentClient
from app.agent.loop import run_agent_turn
from app.core.chain_ladder import run_chain_ladder
from app.core.excel_parser import (
    ParseError,
    ParseOptions,
    parse_premiums_from_excel,
    parse_triangle_from_excel,
)
from app.core.triangle import Granularity, TriangleType
from app.schemas import (
    AgentAction,
    ChatRequest,
    ChatResponse,
    ComputeRequest,
    ComputeResponse,
    ModelOption,
    ModelsResponse,
    ToolInvocation,
    TriangleSchema,
    UploadResponse,
)

router = APIRouter(prefix="/v1", tags=["api"])


MODEL_CATALOG: list[ModelOption] = [
    ModelOption(id="anthropic/claude-sonnet-4.6", label="Claude Sonnet 4.6"),
    ModelOption(id="anthropic/claude-opus-4-7", label="Claude Opus 4.7"),
    ModelOption(id="anthropic/claude-haiku-4.5", label="Claude Haiku 4.5"),
    ModelOption(id="openai/gpt-5", label="GPT-5"),
    ModelOption(id="openai/gpt-4o-mini", label="GPT-4o mini"),
    ModelOption(id="google/gemini-2.0-flash-001", label="Gemini 2.0 Flash"),
    ModelOption(id="google/gemini-2.5-pro", label="Gemini 2.5 Pro"),
    ModelOption(id="meta-llama/llama-3.3-70b-instruct", label="Llama 3.3 70B"),
]


@router.get("/models", response_model=ModelsResponse)
def list_models() -> ModelsResponse:
    default = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.6")
    return ModelsResponse(models=MODEL_CATALOG, default=default)


class UploadJsonRequest(BaseModel):
    file_b64: str
    triangle_type: str = "paid"
    origin_granularity: str = "yearly"
    development_granularity: str = "yearly"
    cumulative: bool = True


@router.post("/upload", response_model=UploadResponse)
async def upload_excel(body: UploadJsonRequest) -> UploadResponse:
    try:
        content = base64.b64decode(body.file_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz base64: {e}") from e
    triangle_type = body.triangle_type
    origin_granularity = body.origin_granularity
    development_granularity = body.development_granularity
    cumulative = body.cumulative
    try:
        tt = TriangleType(triangle_type)
        og = Granularity(origin_granularity)
        dg = Granularity(development_granularity)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz parametre: {e}") from e

    opts = ParseOptions(
        triangle_type=tt,
        origin_granularity=og,
        development_granularity=dg,
        cumulative=cumulative,
    )

    try:
        triangle, file_data = parse_triangle_from_excel(content, options=opts)
    except ParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return UploadResponse(
        triangle=TriangleSchema.from_domain(triangle),
        file_data=file_data,
    )


class UploadPremiumsRequest(BaseModel):
    file_b64: str
    origin_granularity: str = "yearly"


@router.post("/upload/premiums")
async def upload_premiums(body: UploadPremiumsRequest) -> dict:
    try:
        content = base64.b64decode(body.file_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz base64: {e}") from e
    try:
        og = Granularity(body.origin_granularity)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz granülarite: {e}") from e
    try:
        premiums = parse_premiums_from_excel(content, origin_granularity=og)
    except ParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"premiums": premiums}


@router.post("/compute", response_model=ComputeResponse)
def compute(req: ComputeRequest) -> ComputeResponse:
    try:
        triangle = req.triangle.to_domain()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        result = run_chain_ladder(
            triangle,
            method=req.method,
            n_years=req.n_years,
            excluded_origins=set(req.excluded_origins) if req.excluded_origins else None,
            ldf_override=req.ldf_override,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ComputeResponse(
        method=result.method.value,
        n_origins=len(result.origin_periods),
        origin_periods=result.origin_periods,
        ldfs=result.ldfs,
        cdfs=result.cdfs,
        latest_per_origin=result.latest_per_origin,
        ultimate_per_origin=result.ultimate_per_origin,
        reserve_per_origin=result.reserve_per_origin,
        total_latest=result.total_latest,
        total_ultimate=result.total_ultimate,
        total_reserve=result.total_reserve,
    )


@router.post("/agent/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest) -> ChatResponse:
    # Modül payload'ını derle: yeni şema (req.modules) öncelikli; yoksa
    # legacy üst seviye triangle/session_state'i rezerv olarak sar.
    modules_payload: dict[str, dict] = {}
    if req.modules:
        modules_payload = req.modules
    elif req.triangle is not None:
        modules_payload["reserve"] = {
            "triangle": req.triangle.model_dump(),
            "session_state": req.session_state.model_dump()
            if req.session_state
            else None,
        }

    # Rezerv için triangle doğrulaması (triangle gönderildiyse)
    reserve_payload = modules_payload.get("reserve")
    if reserve_payload and reserve_payload.get("triangle"):
        try:
            from app.schemas import TriangleSchema  # local import to avoid cycle
            TriangleSchema(**reserve_payload["triangle"]).to_domain()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    client = AgentClient(model=req.model)
    try:
        result = run_agent_turn(
            client=client,
            messages=[m.model_dump() for m in req.messages],
            modules_payload=modules_payload,
            full_history=req.full_history,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent hatası: {e}") from e

    return ChatResponse(
        assistant_message=result.assistant_message,
        tool_invocations=[ToolInvocation(**inv) for inv in result.tool_invocations],
        actions=[AgentAction(**a) for a in result.actions],
        stopped_reason=result.stopped_reason,
        raw_additions=result.raw_additions,
    )
