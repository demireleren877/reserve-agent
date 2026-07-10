"""Masaüstü (offline) ilk-kurulum akışı.

Kullanıcı ilk açılışta Oracle bağlantısını buradan girer. Bağlantı kurulmadan
diğer endpoint'ler 503 (not_configured) döner; frontend kurulum ekranına yönlendirir.

Güvenlik: bağlantı henüz kurulmamışsa açık (ilk kurulum). Kurulmuşsa yeniden
yapılandırma yalnızca admin token'ıyla yapılabilir.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app import db, desktop_config
from app.auth import _decode
from app.bootstrap import bootstrap_database

router = APIRouter(prefix="/v1/setup", tags=["setup"])


class ConnectionInput(BaseModel):
    host: str
    port: int = 1521
    service_name: str
    user: str
    password: str


class SaveInput(ConnectionInput):
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None


class StatusResponse(BaseModel):
    env_mode: bool          # web/docker: bağlantı .env'den
    configured: bool        # bağlantı kaydedildi mi
    ready: bool             # pool ayakta mı


@router.get("/status", response_model=StatusResponse)
def status() -> StatusResponse:
    env_mode = desktop_config.is_env_configured()
    return StatusResponse(
        env_mode=env_mode,
        configured=env_mode or desktop_config.is_desktop_configured(),
        ready=db.is_ready(),
    )


def _require_admin_if_configured(authorization: Optional[str]) -> None:
    """Bağlantı zaten kuruluysa yeniden yapılandırmayı admin ile sınırla."""
    if desktop_config.is_env_configured():
        raise HTTPException(status_code=403, detail="env_managed")
    if not desktop_config.is_desktop_configured():
        return  # ilk kurulum — açık
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="admin_required")
    claims = _decode(token)
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="admin_required")


@router.post("/test")
async def test_connection(body: ConnectionInput) -> dict:
    import oracledb

    dsn = f"{body.host}:{body.port}/{body.service_name}"

    def _try() -> None:
        conn = oracledb.connect(user=body.user, password=body.password, dsn=dsn)
        conn.close()

    try:
        await run_in_threadpool(_try)
    except oracledb.DatabaseError as e:
        raise HTTPException(status_code=400, detail=_friendly_error(e)) from e
    return {"ok": True}


@router.post("/save")
async def save(body: SaveInput, authorization: Optional[str] = Header(default=None)) -> dict:
    _require_admin_if_configured(authorization)

    conn = desktop_config.Connection(
        host=body.host,
        port=body.port,
        service_name=body.service_name,
        user=body.user,
        password=body.password,
    )

    import oracledb

    try:
        result = await run_in_threadpool(
            bootstrap_database,
            conn.dsn,
            conn.user,
            conn.password,
            body.admin_username,
            body.admin_password,
        )
    except oracledb.DatabaseError as e:
        raise HTTPException(status_code=400, detail=_friendly_error(e)) from e

    desktop_config.save_connection(conn)
    await db.configure_pool(conn)
    return {"ok": True, **result}


def _friendly_error(e: Exception) -> str:
    import oracledb

    if isinstance(e, oracledb.DatabaseError):
        arg = e.args[0]
        code = getattr(arg, "code", -1)
        mapping = {
            12541: "Oracle sunucusuna ulaşılamıyor. IP ve port doğru mu?",
            1017: "Kullanıcı adı veya şifre yanlış.",
            12514: "Servis adı yanlış (bağlantıdaki servis).",
            12154: "Bağlantı formatı hatalı. Örnek host: 192.168.1.10, port: 1521.",
            12170: "Bağlantı zaman aşımına uğradı. Ağ/firewall kontrol edin.",
        }
        return mapping.get(code, f"Oracle hatası: {arg}")
    return str(e)
