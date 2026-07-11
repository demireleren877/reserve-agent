"""API router: upload + compute + chat endpoint'leri."""

from __future__ import annotations

import os
import base64
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.firebase_auth import verify_firebase_token
from app.cashflow.compute import (
    CashflowRecord,
    compute_cashflow,
    parse_records_from_bytes,
    triangle_to_cashflow_records,
)
from app.data.parser import inspect_file, parse_with_mapping
from app.data.prim_parser import inspect_prim_file, parse_prim_with_mapping
from app.data.triangle_builder import build_triangles

# Excel (xlsx) magic bytes: PK\x03\x04 (ZIP archive)
_XLSX_MAGIC = b"PK\x03\x04"
# Max upload size: 10 MB (decoded)
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

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
    ModelOption(id="deepseek/deepseek-v4-flash", label="DeepSeek V4 Flash"),
    ModelOption(id="qwen/qwen3.6-flash", label="Qwen 3.6 Flash"),
    ModelOption(id="google/gemini-3.1-flash-lite-preview", label="Gemini 3.1 Flash Lite (Preview)"),
]


@router.get("/models", response_model=ModelsResponse)
def list_models() -> ModelsResponse:
    default = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
    return ModelsResponse(models=MODEL_CATALOG, default=default)


class UploadJsonRequest(BaseModel):
    file_b64: str
    triangle_type: str = "paid"
    origin_granularity: str = "yearly"
    development_granularity: str = "yearly"
    cumulative: bool = True


@router.post("/upload", response_model=UploadResponse)
async def upload_excel(
    body: UploadJsonRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> UploadResponse:
    try:
        content = base64.b64decode(body.file_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz base64: {e}") from e
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Dosya 10 MB sınırını aşıyor")
    if not content.startswith(_XLSX_MAGIC):
        raise HTTPException(status_code=400, detail="Geçersiz dosya formatı (xlsx bekleniyor)")
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
async def upload_premiums(
    body: UploadPremiumsRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict:
    try:
        content = base64.b64decode(body.file_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz base64: {e}") from e
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Dosya 10 MB sınırını aşıyor")
    if not content.startswith(_XLSX_MAGIC):
        raise HTTPException(status_code=400, detail="Geçersiz dosya formatı (xlsx bekleniyor)")
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
def compute(req: ComputeRequest, _auth: dict = Depends(verify_firebase_token)) -> ComputeResponse:
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
def agent_chat(req: ChatRequest, _auth: dict = Depends(verify_firebase_token)) -> ChatResponse:
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
            max_iterations=20,
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


# ─── Cashflow endpoints ───────────────────────────────────────────────────────

_CSV_MAX_BYTES = 300 * 1024 * 1024  # 300 MB


class CashflowUploadRequest(BaseModel):
    file_b64: str
    filename: str = "data.csv"


class CashflowComputeRequest(BaseModel):
    records: list[dict[str, Any]]  # [{origin_year, dev_date, paid}]


@router.post("/cashflow/upload")
async def cashflow_upload(
    body: CashflowUploadRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    try:
        content = base64.b64decode(body.file_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz base64: {e}") from e

    if len(content) > _CSV_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Dosya 300 MB sınırını aşıyor")

    try:
        records = parse_records_from_bytes(content, body.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dosya okunamadı: {e}") from e

    if not records:
        raise HTTPException(status_code=400, detail="Geçerli kayıt bulunamadı")

    return {
        "record_count": len(records),
        "origin_years": sorted({r.origin_year for r in records}),
        "report_date": max(r.dev_date for r in records).isoformat(),
        "records": [
            {"origin_year": r.origin_year, "dev_date": r.dev_date.isoformat(), "paid": r.paid}
            for r in records
        ],
    }


@router.post("/cashflow/compute")
async def cashflow_compute(
    body: CashflowComputeRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    from datetime import date as date_cls

    if not body.records:
        raise HTTPException(status_code=400, detail="Kayıt listesi boş")

    try:
        records = [
            CashflowRecord(
                origin_year=int(r["origin_year"]),
                dev_date=date_cls.fromisoformat(str(r["dev_date"])),
                paid=float(r.get("paid") or 0),
            )
            for r in body.records
        ]
        result = compute_cashflow(records)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hesaplama hatası: {e}") from e

    return {
        "origin_years": result.origin_years,
        "report_date": result.report_date.isoformat(),
        "triangle": {
            str(y): {str(p): v for p, v in periods.items()}
            for y, periods in result.triangle.items()
        },
        "incremental": {
            str(y): {str(p): v for p, v in periods.items()}
            for y, periods in result.incremental.items()
        },
        "dev_factors": [
            {
                "period": r.period,
                "df": r.df,
                "cdf": r.cdf,
                "inv_cdf_100": r.inv_cdf_100,
                "inv_cdf_100_inc": r.inv_cdf_100_inc,
                "global_weight": r.global_weight,
            }
            for r in result.dev_factors
        ],
        "quarterly_pattern": {
            str(y): rows for y, rows in result.quarterly_pattern.items()
        },
        "monthly_pattern": {
            str(y): rows for y, rows in result.monthly_pattern.items()
        },
        "per_origin": [
            {
                "origin_year": r.origin_year,
                "latest": r.latest,
                "cdf": r.cdf,
                "ultimate": r.ultimate,
                "ibnr": r.ibnr,
            }
            for r in result.per_origin
        ],
        "max_period": result.max_period,
    }


class CashflowFromTriangleRequest(BaseModel):
    origin_periods: list[str]
    development_periods: list[str]
    values: list[list[float | None]]
    origin_granularity: str = "yearly"
    development_granularity: str = "yearly"
    n_years: int = 5
    report_date: Optional[str] = None  # ISO format (YYYY-MM-DD), yoksa triangleden algılanır


@router.post("/cashflow/from-triangle")
async def cashflow_from_triangle(
    body: CashflowFromTriangleRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    try:
        records = triangle_to_cashflow_records(
            body.origin_periods,
            body.development_periods,
            body.values,
            body.origin_granularity,
            body.development_granularity,
        )
        if not records:
            raise ValueError("Üçgenden kayıt üretilemedi — değerler boş olabilir")
        override_date = None
        if body.report_date:
            from datetime import date as _date
            override_date = _date.fromisoformat(body.report_date)
        result = compute_cashflow(records, n_years=body.n_years, report_date=override_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hesaplama hatası: {e}") from e

    return {
        "origin_years": result.origin_years,
        "report_date": result.report_date.isoformat(),
        "triangle": {
            str(y): {str(p): v for p, v in periods.items()}
            for y, periods in result.triangle.items()
        },
        "incremental": {
            str(y): {str(p): v for p, v in periods.items()}
            for y, periods in result.incremental.items()
        },
        "dev_factors": [
            {
                "period": r.period,
                "df": r.df,
                "cdf": r.cdf,
                "inv_cdf_100": r.inv_cdf_100,
                "inv_cdf_100_inc": r.inv_cdf_100_inc,
                "global_weight": r.global_weight,
            }
            for r in result.dev_factors
        ],
        "quarterly_pattern": {
            str(y): rows for y, rows in result.quarterly_pattern.items()
        },
        "monthly_pattern": {
            str(y): rows for y, rows in result.monthly_pattern.items()
        },
        "per_origin": [
            {
                "origin_year": r.origin_year,
                "latest": r.latest,
                "cdf": r.cdf,
                "ultimate": r.ultimate,
                "ibnr": r.ibnr,
            }
            for r in result.per_origin
        ],
        "max_period": result.max_period,
    }


@router.post("/cashflow/pattern-from-cdf")
async def cashflow_pattern_from_cdf(
    body: dict,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    """Kullanıcının seçtiği CDF dizisinden CF pattern hesaplar.

    Body: { origin_years, report_date, selected_cdfs }
    selected_cdfs: 0-indexed CDF değerleri (frontend ldfExportCdfs ile birebir)
    """
    from datetime import date as _date
    from app.cashflow.compute import calc_cdf_pattern, build_patterns

    try:
        origin_years: list[int] = body["origin_years"]
        report_date_str: str = body["report_date"]
        selected_cdfs: list[float] = body["selected_cdfs"]

        rdate = _date.fromisoformat(report_date_str)
        cdf = {i: v for i, v in enumerate(selected_cdfs) if v > 0}

        global_pattern = calc_cdf_pattern(cdf, rdate)
        quarterly, monthly = build_patterns(origin_years, rdate, global_pattern)

        return {
            "quarterly_pattern": {str(y): rows for y, rows in quarterly.items()},
            "monthly_pattern": {str(y): rows for y, rows in monthly.items()},
            "report_date": rdate.isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ─── Data (ham hasar) endpoints ───────────────────────────────────────────────

_DATA_MAX_BYTES = 50 * 1024 * 1024  # 50 MB


def _decode_file(file_b64: str, max_bytes: int) -> bytes:
    try:
        content = base64.b64decode(file_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz base64: {e}") from e
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Dosya 50 MB sınırını aşıyor")
    return content


class DataInspectRequest(BaseModel):
    file_b64: str
    filename: str = "data.csv"


@router.post("/data/inspect")
async def data_inspect(
    body: DataInspectRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    content = _decode_file(body.file_b64, _DATA_MAX_BYTES)
    try:
        result = inspect_file(content, body.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dosya okunamadı: {e}") from e
    return result


class DataImportRequest(BaseModel):
    file_b64: str
    filename: str = "data.csv"
    sheet_name: str | None = None
    column_mapping: dict[str, str]  # field → column header adı


@router.post("/data/import")
async def data_import(
    body: DataImportRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    content = _decode_file(body.file_b64, _DATA_MAX_BYTES)
    try:
        records = parse_with_mapping(content, body.filename, body.column_mapping, body.sheet_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse hatası: {e}") from e

    if not records:
        raise HTTPException(status_code=400, detail="Geçerli kayıt bulunamadı")

    brans_set: set[str] = set()
    hasar_min: str | None = None
    hasar_max: str | None = None
    gelisim_min: str | None = None
    gelisim_max: str | None = None
    # Ödeme = AKIŞ (flow): dönemler boyunca toplanır → kümülatif ödeme.
    total_odeme = 0.0
    # Muallak = STOK (stock): her gelişim döneminde yeniden yazılır; toplanmaz.
    # Her dosyanın yalnızca SON gelişim tarihindeki muallağı alınmalı, aksi
    # halde aynı bakiye onlarca kez sayılır. (dosya başına son muallağı izle.)
    last_muallak: dict[tuple[str, str], tuple[str, float]] = {}
    serialized: list[dict[str, Any]] = []

    for r in records:
        h = r.hasar_tarihi.isoformat()
        g = r.gelisim_tarihi.isoformat()
        brans_set.add(r.brans)
        if hasar_min is None or h < hasar_min:
            hasar_min = h
        if hasar_max is None or h > hasar_max:
            hasar_max = h
        if gelisim_min is None or g < gelisim_min:
            gelisim_min = g
        if gelisim_max is None or g > gelisim_max:
            gelisim_max = g
        total_odeme += r.odeme
        key = (r.brans, r.dosya_no)
        prev = last_muallak.get(key)
        if prev is None or g > prev[0]:
            last_muallak[key] = (g, r.muallak)
        serialized.append({
            "dosya_no": r.dosya_no,
            "brans": r.brans,
            "hasar_tarihi": h,
            "gelisim_tarihi": g,
            "odeme": r.odeme,
            "muallak": r.muallak,
        })

    # Son diagonal muallağı: her dosyanın son gelişim dönemindeki bakiye toplamı.
    total_muallak = sum(v for _, v in last_muallak.values())

    return {
        "record_count": len(records),
        "brans_list": sorted(brans_set),
        "hasar_tarihi_min": hasar_min,
        "hasar_tarihi_max": hasar_max,
        "gelisim_tarihi_min": gelisim_min,
        "gelisim_tarihi_max": gelisim_max,
        "total_odeme": total_odeme,
        "total_muallak": total_muallak,
        # Incurred = kümülatif ödeme + son dönem muallağı (stok+akış doğru birleşimi)
        "total_incurred": total_odeme + total_muallak,
        "records": serialized,
    }


class BuildTriangleRequest(BaseModel):
    records: list[dict]
    brans: str
    origin_granularity: str = "yearly"
    development_granularity: str = "yearly"


class BuildTriangleResponse(BaseModel):
    paid_triangle: TriangleSchema
    incurred_triangle: TriangleSchema
    count_triangle: TriangleSchema | None = None
    file_data: dict | None = None


@router.post("/data/build-triangle", response_model=BuildTriangleResponse)
def data_build_triangle(
    body: BuildTriangleRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> BuildTriangleResponse:
    try:
        paid, incurred, count, file_data = build_triangles(
            records=body.records,
            brans=body.brans,
            origin_granularity=body.origin_granularity,  # type: ignore[arg-type]
            development_granularity=body.development_granularity,  # type: ignore[arg-type]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return BuildTriangleResponse(
        paid_triangle=TriangleSchema.from_domain(paid),
        incurred_triangle=TriangleSchema.from_domain(incurred),
        count_triangle=TriangleSchema.from_domain(count) if count else None,
        file_data=file_data,
    )


class RollForwardRequest(BaseModel):
    prior_paid: TriangleSchema
    prior_incurred: TriangleSchema | None = None
    records: list[dict]  # güncel dönem ARTIMSAL dosya-bazlı kayıtlar
    brans: str
    origin_granularity: str = "yearly"
    development_granularity: str = "yearly"


class RollForwardResponse(BaseModel):
    paid_triangle: TriangleSchema
    incurred_triangle: TriangleSchema | None = None
    # {origin_label: {dosya_no: artımsal_ödeme}} — yeni diagonalin dosya kırılımı
    new_diagonal_files: dict | None = None


@router.post("/data/roll-forward", response_model=RollForwardResponse)
def data_roll_forward(
    body: RollForwardRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> RollForwardResponse:
    from app.data.triangle_builder import roll_forward

    try:
        prior_paid = body.prior_paid.to_domain()
        prior_incurred = body.prior_incurred.to_domain() if body.prior_incurred else None
        paid, incurred, new_files = roll_forward(
            prior_paid=prior_paid,
            prior_incurred=prior_incurred,
            records=body.records,
            brans=body.brans,
            origin_granularity=body.origin_granularity,  # type: ignore[arg-type]
            development_granularity=body.development_granularity,  # type: ignore[arg-type]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RollForwardResponse(
        paid_triangle=TriangleSchema.from_domain(paid),
        incurred_triangle=TriangleSchema.from_domain(incurred) if incurred else None,
        new_diagonal_files=new_files,
    )


# ─── Prim verisi inspect + import ────────────────────────────────────────────

class PrimInspectRequest(BaseModel):
    file_b64: str
    filename: str = "prim.csv"


@router.post("/data/inspect-prim")
async def data_inspect_prim(
    body: PrimInspectRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    content = _decode_file(body.file_b64, _DATA_MAX_BYTES)
    try:
        result = inspect_prim_file(content, body.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dosya okunamadı: {e}") from e
    return result


class PrimImportRequest(BaseModel):
    file_b64: str
    filename: str = "prim.csv"
    sheet_name: str | None = None
    column_mapping: dict[str, str]


@router.post("/data/import-prim")
async def data_import_prim(
    body: PrimImportRequest,
    _auth: dict = Depends(verify_firebase_token),
) -> dict[str, Any]:
    content = _decode_file(body.file_b64, _DATA_MAX_BYTES)
    try:
        records = parse_prim_with_mapping(content, body.filename, body.column_mapping, body.sheet_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse hatası: {e}") from e

    if not records:
        raise HTTPException(status_code=400, detail="Geçerli kayıt bulunamadı")

    brans_set: set[str] = set()
    donem_set: set[str] = set()
    total_ep = 0.0
    serialized: list[dict[str, Any]] = []

    for r in records:
        brans_set.add(r.brans)
        donem_set.add(r.donem)
        total_ep += r.ep
        serialized.append({"brans": r.brans, "donem": r.donem, "ep": r.ep})

    return {
        "record_count": len(records),
        "brans_list": sorted(brans_set),
        "donem_list": sorted(donem_set),
        "total_ep": total_ep,
        "records": serialized,
    }
