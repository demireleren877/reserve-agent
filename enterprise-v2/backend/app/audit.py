"""Uygulama genelinde append-only denetim günlüğü."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import oracledb

from app.db import get_pool


async def append_audit_event(
    *,
    user: dict[str, Any],
    action: str,
    source: str = "user",
    details: dict[str, Any] | None = None,
    branch_id: str | None = None,
    occurred_at: datetime | None = None,
) -> None:
    """Oturum kullanıcısına bağlı, silinmeyen tek bir audit olayı ekle.

    Audit yazımının başarısız olması kullanıcı işlemini geri almaz; aksi halde log
    altyapısındaki geçici bir sorun ana uygulamayı kullanılamaz hale getirir.
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO audit_events "
                    "(event_id, occurred_at, actor_id, actor_name, source, action, branch_id, details_json) "
                    "VALUES (:1, :2, :3, :4, :5, :6, :7, :8)",
                    [
                        uuid4().hex,
                        occurred_at or datetime.now(timezone.utc),
                        int(user["sub"]),
                        user["username"],
                        source,
                        action[:100],
                        branch_id,
                        json.dumps(details) if details is not None else None,
                    ],
                )
            await conn.commit()
    except Exception:
        # Audit best-effort değildir: kayıtları ayrıca state transaction'ında da
        # yazarız. Middleware yalnızca uygulama-geneli operasyon kapsamasıdır.
        return
