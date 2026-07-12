"""Model kilitleri — concurrent editing önleme."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Annotated

import oracledb
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_pool


def _is_unique_violation(e: oracledb.DatabaseError) -> bool:
    arg = e.args[0]
    return getattr(arg, "code", None) == 1  # ORA-00001

router = APIRouter(prefix="/v1/locks", tags=["locks"])

CurrentUser = Annotated[dict, Depends(get_current_user)]

LOCK_TTL_SECONDS = 300  # 5 dakika; frontend 60sn'de bir yeniler


class LockStatus(BaseModel):
    locked: bool
    lock_key: str
    locked_by_id: int | None = None
    locked_by_name: str | None = None
    locked_at: str | None = None
    expires_at: str | None = None
    is_mine: bool = False


class AcquireRequest(BaseModel):
    lock_key: str


@router.get("/{lock_key:path}", response_model=LockStatus)
async def get_lock(lock_key: str, user: CurrentUser) -> LockStatus:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await _purge_expired(cur, lock_key)
            await cur.execute(
                "SELECT locked_by_id, locked_by_name, locked_at, expires_at "
                "FROM model_locks WHERE lock_key = :1",
                [lock_key],
            )
            row = await cur.fetchone()

    if not row:
        return LockStatus(locked=False, lock_key=lock_key)

    uid, uname, locked_at, expires_at = row
    return LockStatus(
        locked=True,
        lock_key=lock_key,
        locked_by_id=uid,
        locked_by_name=uname,
        locked_at=locked_at.isoformat() if locked_at else None,
        expires_at=expires_at.isoformat() if expires_at else None,
        is_mine=str(uid) == user["sub"],
    )


@router.post("/acquire", response_model=LockStatus)
async def acquire_lock(body: AcquireRequest, user: CurrentUser) -> LockStatus:
    uid = int(user["sub"])
    uname = user["username"]
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=LOCK_TTL_SECONDS)

    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await _purge_expired(cur, body.lock_key)

            await cur.execute(
                "SELECT locked_by_id FROM model_locks WHERE lock_key = :1",
                [body.lock_key],
            )
            existing = await cur.fetchone()

            if existing:
                owner_id = existing[0]
                if owner_id != uid:
                    # Başkası kilitli — kilit sahibini döndür
                    await cur.execute(
                        "SELECT locked_by_id, locked_by_name, locked_at, expires_at "
                        "FROM model_locks WHERE lock_key = :1",
                        [body.lock_key],
                    )
                    row = await cur.fetchone()
                    raise HTTPException(
                        status_code=423,
                        detail={
                            "code": "locked",
                            "locked_by_name": row[1] if row else "?",
                            "expires_at": row[3].isoformat() if row and row[3] else None,
                        },
                    )
                # Benim kilidim — yenile (heartbeat)
                await cur.execute(
                    "UPDATE model_locks SET expires_at = :1 WHERE lock_key = :2",
                    [expires, body.lock_key],
                )
            else:
                try:
                    await cur.execute(
                        "INSERT INTO model_locks (lock_key, locked_by_id, locked_by_name, locked_at, expires_at) "
                        "VALUES (:1, :2, :3, :4, :5)",
                        [body.lock_key, uid, uname, now, expires],
                    )
                except oracledb.DatabaseError as e:
                    if not _is_unique_violation(e):
                        raise
                    # YARIŞ: başka istek tam aynı anda ekledi. Sahibi oku:
                    # benimse yenile, değilse 423 (temiz salt-okunur, kayıp yok).
                    await cur.execute(
                        "SELECT locked_by_id, locked_by_name, locked_at, expires_at "
                        "FROM model_locks WHERE lock_key = :1",
                        [body.lock_key],
                    )
                    row = await cur.fetchone()
                    if row and row[0] == uid:
                        await cur.execute(
                            "UPDATE model_locks SET expires_at = :1 WHERE lock_key = :2",
                            [expires, body.lock_key],
                        )
                    else:
                        await conn.rollback()
                        raise HTTPException(
                            status_code=423,
                            detail={
                                "code": "locked",
                                "locked_by_name": row[1] if row else "?",
                                "expires_at": row[3].isoformat() if row and row[3] else None,
                            },
                        )
        await conn.commit()

    return LockStatus(
        locked=True,
        lock_key=body.lock_key,
        locked_by_id=uid,
        locked_by_name=uname,
        locked_at=now.isoformat(),
        expires_at=expires.isoformat(),
        is_mine=True,
    )


@router.post("/force-acquire", response_model=LockStatus)
async def force_acquire_lock(body: AcquireRequest, user: CurrentUser) -> LockStatus:
    """Kilidi zorla devral — mevcut (başkasının/bayat) kilidi silip kendine al."""
    uid = int(user["sub"])
    uname = user["username"]
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=LOCK_TTL_SECONDS)

    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM model_locks WHERE lock_key = :1", [body.lock_key]
            )
            await cur.execute(
                "INSERT INTO model_locks (lock_key, locked_by_id, locked_by_name, locked_at, expires_at) "
                "VALUES (:1, :2, :3, :4, :5)",
                [body.lock_key, uid, uname, now, expires],
            )
        await conn.commit()

    return LockStatus(
        locked=True, lock_key=body.lock_key, locked_by_id=uid,
        locked_by_name=uname, locked_at=now.isoformat(),
        expires_at=expires.isoformat(), is_mine=True,
    )


@router.delete("/{lock_key:path}", status_code=204)
async def release_lock(lock_key: str, user: CurrentUser) -> None:
    uid = int(user["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM model_locks WHERE lock_key = :1 AND locked_by_id = :2",
                [lock_key, uid],
            )
        await conn.commit()


async def _purge_expired(cur, lock_key: str) -> None:
    now = datetime.now(timezone.utc)
    await cur.execute(
        "DELETE FROM model_locks WHERE lock_key = :1 AND expires_at < :2",
        [lock_key, now],
    )
