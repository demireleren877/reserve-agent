"""Proje state persist — Cloudflare Worker'ın yerini alır."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_pool

router = APIRouter(prefix="/v1/state", tags=["state"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


class StateResponse(BaseModel):
    project: Any
    chat: Any
    version: int
    updated_at: int


class PutStateRequest(BaseModel):
    project: Any = None
    chat: Any = None
    expectedVersion: int | None = None


class PutStateResponse(BaseModel):
    version: int
    updated_at: int


async def _read_clob(val: Any) -> Any:
    """CLOB değerini string'e çevirir — async read gerektirir."""
    if val is None:
        return None
    # python-oracledb async modda CLOB bir LOB nesnesi döner
    raw = await val.read() if hasattr(val, "read") else val
    if raw is None:
        return None
    return json.loads(raw)


@router.get("", response_model=StateResponse)
async def get_state(user: CurrentUser) -> StateResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT project_json, chat_json, version, updated_at "
                "FROM user_state WHERE user_id = :1",
                [int(user["sub"])],
            )
            row = await cur.fetchone()

    if not row:
        return StateResponse(project=None, chat=None, version=0, updated_at=0)

    proj_json, chat_json, version, updated_at = row
    proj = await _read_clob(proj_json)
    chat = await _read_clob(chat_json)
    ts = int(updated_at.timestamp() * 1000) if updated_at else 0
    return StateResponse(project=proj, chat=chat, version=version, updated_at=ts)


@router.put("", response_model=PutStateResponse)
async def put_state(body: PutStateRequest, user: CurrentUser) -> PutStateResponse:
    uid = int(user["sub"])
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    now_ts = int(now.timestamp() * 1000)

    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT version FROM user_state WHERE user_id = :1", [uid]
            )
            existing = await cur.fetchone()

            if existing:
                current_version = existing[0]
                if body.expectedVersion is not None and body.expectedVersion != current_version:
                    raise HTTPException(status_code=409, detail="version_conflict")
                new_version = current_version + 1

                sets = ["version = :v", "updated_at = :ts"]
                params: dict = {"v": new_version, "ts": now, "uid": uid}

                if body.project is not None:
                    sets.append("project_json = :proj")
                    params["proj"] = json.dumps(body.project)
                if body.chat is not None:
                    sets.append("chat_json = :chat")
                    params["chat"] = json.dumps(body.chat)

                await cur.execute(
                    f"UPDATE user_state SET {', '.join(sets)} WHERE user_id = :uid",
                    params,
                )
            else:
                new_version = 1
                await cur.execute(
                    "INSERT INTO user_state (user_id, project_json, chat_json, version, updated_at) "
                    "VALUES (:1, :2, :3, :4, :5)",
                    [
                        uid,
                        json.dumps(body.project) if body.project is not None else None,
                        json.dumps(body.chat) if body.chat is not None else None,
                        new_version,
                        now,
                    ],
                )
        await conn.commit()

    return PutStateResponse(version=new_version, updated_at=now_ts)


@router.delete("", status_code=204)
async def delete_state(user: CurrentUser) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute("DELETE FROM user_state WHERE user_id = :1", [int(user["sub"])])
        await conn.commit()
