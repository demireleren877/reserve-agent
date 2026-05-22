"""Veri dönemleri ve dataset'ler — Oracle'da persist."""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_pool

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
async def list_periods(user: CurrentUser) -> list[PeriodOut]:
    uid = int(user["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT period_id, label, created_at FROM periods "
                "WHERE user_id = :1 ORDER BY created_at DESC",
                [uid],
            )
            period_rows = await cur.fetchall()

            result = []
            for pid, label, created_at in period_rows:
                await cur.execute(
                    "SELECT dataset_id, type_id, meta_json FROM datasets "
                    "WHERE user_id = :1 AND period_id = :2",
                    [uid, pid],
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
    uid = int(user["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT period_id FROM periods WHERE user_id = :1 AND period_id = :2",
                [uid, body.period_id],
            )
            if await cur.fetchone():
                await cur.execute(
                    "UPDATE periods SET label = :1, created_at = :2 "
                    "WHERE user_id = :3 AND period_id = :4",
                    [body.label, body.created_at, uid, body.period_id],
                )
            else:
                await cur.execute(
                    "INSERT INTO periods (user_id, period_id, label, created_at) "
                    "VALUES (:1, :2, :3, :4)",
                    [uid, body.period_id, body.label, body.created_at],
                )
        await conn.commit()
    return {"ok": True}


@router.delete("/periods/{period_id}", status_code=200)
async def delete_period(period_id: str, user: CurrentUser) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM periods WHERE user_id = :1 AND period_id = :2",
                [int(user["sub"]), period_id],
            )
        await conn.commit()
    return {"ok": True}


@router.get("/periods/{period_id}/datasets/{dataset_id}")
async def get_dataset(period_id: str, dataset_id: str, user: CurrentUser) -> dict:
    uid = int(user["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT type_id, meta_json, records_json FROM datasets "
                "WHERE user_id = :1 AND period_id = :2 AND dataset_id = :3",
                [uid, period_id, dataset_id],
            )
            row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="dataset_not_found")

    type_id, meta_json, records_json = row
    return {
        "typeId": type_id,
        "meta": await _read_clob(meta_json),
        "records": await _read_clob(records_json),
    }


class PutDatasetRequest(BaseModel):
    typeId: str
    meta: Any = None
    records: Any = None


@router.put("/periods/{period_id}/datasets/{dataset_id}", status_code=200)
async def put_dataset(
    period_id: str, dataset_id: str, body: PutDatasetRequest, user: CurrentUser
) -> dict:
    uid = int(user["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT dataset_id FROM datasets "
                "WHERE user_id = :1 AND period_id = :2 AND dataset_id = :3",
                [uid, period_id, dataset_id],
            )
            if await cur.fetchone():
                await cur.execute(
                    "UPDATE datasets SET type_id=:1, meta_json=:2, records_json=:3 "
                    "WHERE user_id=:4 AND period_id=:5 AND dataset_id=:6",
                    [
                        body.typeId,
                        json.dumps(body.meta),
                        json.dumps(body.records),
                        uid, period_id, dataset_id,
                    ],
                )
            else:
                await cur.execute(
                    "INSERT INTO datasets "
                    "(user_id, period_id, dataset_id, type_id, meta_json, records_json) "
                    "VALUES (:1, :2, :3, :4, :5, :6)",
                    [
                        uid, period_id, dataset_id, body.typeId,
                        json.dumps(body.meta),
                        json.dumps(body.records),
                    ],
                )
        await conn.commit()
    return {"ok": True}


@router.delete("/periods/{period_id}/datasets/{dataset_id}", status_code=200)
async def delete_dataset(period_id: str, dataset_id: str, user: CurrentUser) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM datasets WHERE user_id=:1 AND period_id=:2 AND dataset_id=:3",
                [int(user["sub"]), period_id, dataset_id],
            )
        await conn.commit()
    return {"ok": True}
