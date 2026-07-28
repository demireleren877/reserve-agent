"""Merkezi denetim günlüğü — yalnızca yöneticiler okuyabilir."""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.auth import require_admin
from app.db import get_pool

router = APIRouter(prefix="/v1/audit", tags=["audit"])
Admin = Annotated[dict, Depends(require_admin)]


@router.get("")
async def list_audit_events(_: Admin, limit: int = Query(default=200, ge=1, le=1_000)) -> dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT event_id, occurred_at, actor_name, source, action, branch_id, details_json "
                f"FROM audit_events ORDER BY occurred_at DESC FETCH FIRST {limit} ROWS ONLY",
            )
            rows = await cur.fetchall()
            # Eski audit kayıtlarında yalnız branch_id bulunabilir. Auditor'a teknik
            # kimlik göstermek yerine güncel proje ağacından okunabilir branş adını çöz.
            await cur.execute("SELECT project_json FROM team_state WHERE id = 1")
            state_row = await cur.fetchone()
    branch_names: dict[str, str] = {}
    raw_project = state_row[0] if state_row else None
    raw_project = await raw_project.read() if hasattr(raw_project, "read") else raw_project
    try:
        project = json.loads(raw_project) if raw_project else {}
        for period in project.get("periods", []):
            for branch in period.get("branches", []):
                if branch.get("id") and branch.get("name"):
                    branch_names[str(branch["id"])] = str(branch["name"])
    except (TypeError, json.JSONDecodeError, AttributeError):
        pass
    events = []
    for event_id, occurred_at, actor_name, source, action, branch_id, details in rows:
        raw = await details.read() if hasattr(details, "read") else details
        try:
            parsed = json.loads(raw) if raw else None
        except (TypeError, json.JSONDecodeError):
            parsed = None
        events.append({
            "id": event_id, "timestamp": occurred_at.isoformat() if occurred_at else None,
            "actor": actor_name, "source": source, "action": action,
            "branch_id": branch_id,
            "branch_name": branch_names.get(str(branch_id)) if branch_id else None,
            "details": parsed,
        })
    return {"events": events}
