"""Paylaşımlı ekip state — tüm kullanıcılar aynı proje üzerinde çalışır."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any

import oracledb
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
    updated_by_name: str | None = None


class PutStateRequest(BaseModel):
    project: Any = None
    chat: Any = None
    expectedVersion: int | None = None


class PutStateResponse(BaseModel):
    version: int
    updated_at: int


async def _read_clob(val: Any) -> Any:
    if val is None:
        return None
    raw = await val.read() if hasattr(val, "read") else val
    if raw is None:
        return None
    return json.loads(raw)


async def _append_audit_events(cur: Any, project: Any, user: dict[str, Any]) -> None:
    """Project history görünümünü sunucuda değiştirilemez audit kaydı olarak sakla.

    Actor bilgisi istemciden alınmaz; token'daki kullanıcı ile yazılır. Aynı history
    kaydı her state senkronunda tekrar gelse dahi event_id birincil anahtarı sayesinde
    tek kayda dönüşür.
    """
    if not isinstance(project, dict):
        return
    for period in project.get("periods", []):
        if not isinstance(period, dict):
            continue
        for branch in period.get("branches", []):
            if not isinstance(branch, dict):
                continue
            branch_id = str(branch.get("id", "")) or None
            for event in branch.get("history", []):
                if not isinstance(event, dict):
                    continue
                event_id = event.get("id")
                action = event.get("action")
                timestamp = event.get("timestamp")
                if not isinstance(event_id, str) or not isinstance(action, str) or not isinstance(timestamp, str):
                    continue
                try:
                    occurred_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except ValueError:
                    occurred_at = datetime.now(timezone.utc)
                try:
                    details = event.get("details")
                    safe_details = dict(details) if isinstance(details, dict) else {}
                    safe_details.setdefault("module", "cashflow" if action.startswith("cashflow_") else "reserve")
                    safe_details.setdefault("branch_name", branch.get("name") or branch_id)
                    await cur.execute(
                        "INSERT INTO audit_events "
                        "(event_id, occurred_at, actor_id, actor_name, source, action, branch_id, details_json) "
                        "VALUES (:1, :2, :3, :4, :5, :6, :7, :8)",
                        [
                            event_id,
                            occurred_at,
                            int(user["sub"]),
                            user["username"],
                            "agent" if event.get("source") == "agent" else "user",
                            action[:100],
                            branch_id,
                            json.dumps(safe_details),
                        ],
                    )
                except oracledb.IntegrityError as exc:
                    # ORA-00001: Aynı event sync/retry sırasında zaten yazılmış.
                    code = getattr(exc.args[0], "code", None)
                    if code != 1:
                        raise


@router.get("", response_model=StateResponse)
async def get_state(_user: CurrentUser) -> StateResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT project_json, chat_json, version, updated_at, updated_by_name "
                "FROM team_state WHERE id = 1"
            )
            row = await cur.fetchone()
            if not row:
                return StateResponse(project=None, chat=None, version=0, updated_at=0)
            # CLOB'ları bağlantı AÇIKKEN oku (havuza dönünce LOB.read() → DPY-5000, donma).
            proj_json, chat_json, version, updated_at, updated_by_name = row
            proj = await _read_clob(proj_json)
            chat = await _read_clob(chat_json)

    ts = int(updated_at.timestamp() * 1000) if updated_at else 0
    return StateResponse(
        project=proj,
        chat=chat,
        version=version,
        updated_at=ts,
        updated_by_name=updated_by_name,
    )


@router.put("", response_model=PutStateResponse)
async def put_state(body: PutStateRequest, user: CurrentUser) -> PutStateResponse:
    uid = int(user["sub"])
    uname = user["username"]
    now = datetime.now(timezone.utc)
    now_ts = int(now.timestamp() * 1000)

    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute("SELECT version FROM team_state WHERE id = 1")
            existing = await cur.fetchone()

            if existing:
                current_version = existing[0]
                if body.expectedVersion is not None and body.expectedVersion != current_version:
                    raise HTTPException(status_code=409, detail="version_conflict")
                proj_val = json.dumps(body.project) if body.project is not None else None
                chat_val = json.dumps(body.chat) if body.chat is not None else None
                if body.expectedVersion is not None:
                    # ATOMİK: yalnız versiyon hâlâ beklenen ise yaz. Eş zamanlı iki
                    # yazımdan biri Oracle satır kilidiyle bekler, sonra WHERE
                    # version=:expected 0 satır eşler → 409 (kayıp imkânsız).
                    new_version = body.expectedVersion + 1
                    await cur.execute(
                        "UPDATE team_state SET version=:1, updated_at=:2, "
                        "updated_by_id=:3, updated_by_name=:4, "
                        "project_json=:5, chat_json=:6 WHERE id=1 AND version=:7",
                        [new_version, now, uid, uname, proj_val, chat_val, body.expectedVersion],
                    )
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=409, detail="version_conflict")
                else:
                    new_version = current_version + 1
                    await cur.execute(
                        "UPDATE team_state SET version=:1, updated_at=:2, "
                        "updated_by_id=:3, updated_by_name=:4, "
                        "project_json=:5, chat_json=:6 WHERE id=1",
                        [new_version, now, uid, uname, proj_val, chat_val],
                    )
            else:
                new_version = 1
                await cur.execute(
                    "INSERT INTO team_state "
                    "(id, project_json, chat_json, version, updated_at, updated_by_id, updated_by_name) "
                    "VALUES (1, :1, :2, :3, :4, :5, :6)",
                    [
                        json.dumps(body.project) if body.project is not None else None,
                        json.dumps(body.chat) if body.chat is not None else None,
                        new_version, now, uid, uname,
                    ],
                )
            # State satırı yeni ya da mevcut olsun, görünüm logundaki yeni event'leri
            # sunucudaki append-only audit tablosuna yaz.
            await _append_audit_events(cur, body.project, user)
        await conn.commit()

    return PutStateResponse(version=new_version, updated_at=now_ts)


@router.delete("", status_code=204)
async def delete_state(_user: CurrentUser) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute("DELETE FROM team_state WHERE id = 1")
        await conn.commit()
