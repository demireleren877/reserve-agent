"""Paylaşımlı veri dönemleri ve dataset'ler."""

from __future__ import annotations

import datetime as _dt
import json
import re
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_pool
from app.audit import append_audit_event

router = APIRouter(prefix="/v1/data", tags=["data"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


class PeriodOut(BaseModel):
    id: str
    label: str
    createdAt: str
    datasetMetas: dict[str, Any]


class UpsertPeriodRequest(BaseModel):
    period_id: str
    label: str
    created_at: str


async def _read_clob(val: Any) -> Any:
    if val is None:
        return None
    raw = await val.read() if hasattr(val, "read") else val
    if not raw:
        return None
    return json.loads(raw)


@router.get("/periods", response_model=list[PeriodOut])
async def list_periods(_user: CurrentUser) -> list[PeriodOut]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT period_id, label, created_at FROM periods ORDER BY created_at DESC"
            )
            period_rows = await cur.fetchall()

            result = []
            for pid, label, created_at in period_rows:
                await cur.execute(
                    "SELECT dataset_id, type_id, meta_json FROM datasets WHERE period_id = :1",
                    [pid],
                )
                ds_rows = await cur.fetchall()
                metas: dict[str, Any] = {}
                for ds_id, type_id, meta_json in ds_rows:
                    meta = await _read_clob(meta_json) or {}
                    metas[ds_id] = {"typeId": type_id, **meta}
                result.append(PeriodOut(id=pid, label=label, createdAt=created_at, datasetMetas=metas))

    return result


@router.post("/periods", status_code=200)
async def upsert_period(body: UpsertPeriodRequest, user: CurrentUser) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT period_id FROM periods WHERE period_id = :1",
                [body.period_id],
            )
            if await cur.fetchone():
                await cur.execute(
                    "UPDATE periods SET label = :1, created_at = :2 WHERE period_id = :3",
                    [body.label, body.created_at, body.period_id],
                )
            else:
                await cur.execute(
                    "INSERT INTO periods (period_id, label, created_at) VALUES (:1, :2, :3)",
                    [body.period_id, body.label, body.created_at],
                )
        await conn.commit()
    await append_audit_event(user=user, action="data.period_saved", details={"module": "data", "target": body.label})
    return {"ok": True}


@router.delete("/periods/{period_id}", status_code=200)
async def delete_period(period_id: str, user: CurrentUser) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute("DELETE FROM periods WHERE period_id = :1", [period_id])
        await conn.commit()
    await append_audit_event(user=user, action="data.period_deleted", details={"module": "data", "target": "Değerleme dönemi"})
    return {"ok": True}


@router.get("/periods/{period_id}/datasets/{dataset_id}")
async def get_dataset(period_id: str, dataset_id: str, _user: CurrentUser) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT type_id, meta_json, records_json FROM datasets "
                "WHERE period_id = :1 AND dataset_id = :2",
                [period_id, dataset_id],
            )
            row = await cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="dataset_not_found")
            # CLOB'ları bağlantı AÇIKKEN oku. Bağlantı havuza döndükten (async with
            # bittikten) sonra LOB.read() çağırmak protokolü bozar → DPY-5000
            # "unknown protocol message type" ve havuz kilitlenip uygulama donar.
            type_id, meta_json, records_json = row
            meta = await _read_clob(meta_json)
            records = await _read_clob(records_json)

    return {"typeId": type_id, "meta": meta, "records": records}


class PutDatasetRequest(BaseModel):
    typeId: str
    meta: Any = None
    records: Any = None


@router.put("/periods/{period_id}/datasets/{dataset_id}", status_code=200)
async def put_dataset(
    period_id: str, dataset_id: str, body: PutDatasetRequest, user: CurrentUser
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT dataset_id FROM datasets WHERE period_id = :1 AND dataset_id = :2",
                [period_id, dataset_id],
            )
            if await cur.fetchone():
                await cur.execute(
                    "UPDATE datasets SET type_id=:1, meta_json=:2, records_json=:3 "
                    "WHERE period_id=:4 AND dataset_id=:5",
                    [
                        body.typeId,
                        json.dumps(body.meta),
                        json.dumps(body.records),
                        period_id, dataset_id,
                    ],
                )
            else:
                await cur.execute(
                    "INSERT INTO datasets (period_id, dataset_id, type_id, meta_json, records_json) "
                    "VALUES (:1, :2, :3, :4, :5)",
                    [period_id, dataset_id, body.typeId,
                     json.dumps(body.meta), json.dumps(body.records)],
                )
        await conn.commit()
    await append_audit_event(user=user, action="data.dataset_saved", details={"module": "data", "target": body.meta.get("filename", "Dataset") if isinstance(body.meta, dict) else "Dataset", "record_count": len(body.records) if isinstance(body.records, list) else None})
    return {"ok": True}


@router.delete("/periods/{period_id}/datasets/{dataset_id}", status_code=200)
async def delete_dataset(period_id: str, dataset_id: str, user: CurrentUser) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM datasets WHERE period_id=:1 AND dataset_id=:2",
                [period_id, dataset_id],
            )
        await conn.commit()
    await append_audit_event(user=user, action="data.dataset_deleted", details={"module": "data", "target": "Dataset"})
    return {"ok": True}


# ── Oracle: doğrudan tablo/view'dan veri çekme ────────────────────────────────
# Kullanıcı Excel yerine Oracle'daki bir tabloyu/view'ı seçip aynı import
# sihirbazından (sütun eşleme) geçirebilsin diye. Tablo adları identifier olduğu
# için parametreleştirilemez → sıkı doğrula + çift-tırnakla; ayrıca sistem
# şemalarını gizle.

_ORA_IDENT = re.compile(r"^[A-Za-z0-9_$#]{1,128}$")
_ORA_SYS_SCHEMAS = (
    "SYS", "SYSTEM", "CTXSYS", "MDSYS", "XDB", "OUTLN", "DBSNMP", "APPQOSSYS",
    "ORDSYS", "ORDDATA", "WMSYS", "LBACSYS", "OLAPSYS", "DVSYS", "AUDSYS",
    "GSMADMIN_INTERNAL", "REMOTE_SCHEDULER_AGENT",
)


def _validate_table(qualified: str) -> tuple[str | None, str]:
    """'OWNER.TABLE' veya 'TABLE' → doğrulanmış (owner, table). Hatalıysa 400."""
    q = (qualified or "").strip().strip('"')
    parts = q.split(".")
    if len(parts) == 1:
        owner, table = None, parts[0]
    elif len(parts) == 2:
        owner, table = parts[0].strip('"'), parts[1].strip('"')
    else:
        raise HTTPException(status_code=400, detail="invalid_table")
    if (owner is not None and not _ORA_IDENT.match(owner)) or not _ORA_IDENT.match(table):
        raise HTTPException(status_code=400, detail="invalid_table_name")
    return owner, table


def _quoted(owner: str | None, table: str) -> str:
    return f'"{owner}"."{table}"' if owner else f'"{table}"'


def _ser(v: Any) -> Any:
    """Oracle değerini JSON-güvenli hale getir."""
    if v is None:
        return None
    if isinstance(v, Decimal):
        f = float(v)
        return int(f) if f.is_integer() else f
    if isinstance(v, (_dt.datetime, _dt.date)):
        return v.isoformat()
    if isinstance(v, bytes):
        try:
            return v.decode("utf-8", "replace")
        except Exception:
            return str(v)
    return v


class OracleTableRequest(BaseModel):
    table: str
    limit: int | None = None
    max_rows: int | None = None


@router.get("/oracle/tables")
async def oracle_tables(_user: CurrentUser, search: str = "", limit: int = 300) -> dict:
    """Erişilebilir tablo + view listesi (sistem şemaları hariç). search = owner.name filtresi."""
    limit = max(1, min(int(limit or 300), 2000))
    like = f"%{search.upper().strip()}%" if search else "%"
    sys_list = ",".join(f"'{s}'" for s in _ORA_SYS_SCHEMAS)
    sql = f"""
        SELECT owner, object_name, object_type FROM (
            SELECT owner, table_name AS object_name, 'TABLE' AS object_type
              FROM all_tables WHERE owner NOT IN ({sys_list})
            UNION ALL
            SELECT owner, view_name AS object_name, 'VIEW' AS object_type
              FROM all_views WHERE owner NOT IN ({sys_list})
        ) WHERE UPPER(owner || '.' || object_name) LIKE :1
        ORDER BY owner, object_name
        FETCH FIRST {limit} ROWS ONLY
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(sql, [like])
            rows = await cur.fetchall()
    return {
        "tables": [
            {"owner": o, "name": n, "type": t, "qualified": f"{o}.{n}"}
            for (o, n, t) in rows
        ],
        "count": len(rows),
    }


@router.post("/oracle/preview")
async def oracle_preview(body: OracleTableRequest, _user: CurrentUser) -> dict:
    """Seçilen tablonun sütunları + ilk N satırı (önizleme + eşleme için)."""
    owner, table = _validate_table(body.table)
    limit = max(1, min(int(body.limit or 50), 500))
    qname = _quoted(owner, table)
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(f"SELECT * FROM {qname} FETCH FIRST {limit} ROWS ONLY")
            columns = [d[0] for d in cur.description]
            rows = await cur.fetchall()
    return {
        "columns": columns,
        "rows": [[_ser(v) for v in r] for r in rows],
        "row_count": len(rows),
    }


@router.post("/oracle/fetch")
async def oracle_fetch(body: OracleTableRequest, _user: CurrentUser) -> dict:
    """Tablonun tüm satırlarını (üst sınıra kadar) kayıt (dict) listesi olarak döndür —
    frontend eşlemeyle claim/prim/üçgen record'una çevirir."""
    owner, table = _validate_table(body.table)
    max_rows = max(1, min(int(body.max_rows or 500_000), 2_000_000))
    qname = _quoted(owner, table)
    pool = await get_pool()
    records: list[dict[str, Any]] = []
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(f"SELECT * FROM {qname} FETCH FIRST {max_rows} ROWS ONLY")
            columns = [d[0] for d in cur.description]
            while True:
                batch = await cur.fetchmany(5000)
                if not batch:
                    break
                for r in batch:
                    records.append({columns[i]: _ser(r[i]) for i in range(len(columns))})
    return {"columns": columns, "records": records, "count": len(records)}
