"""Masaüstü bağlantı yöneticisi — çok bağlantı: ekle/güncelle/sil/seç.

Kullanıcı birden fazla Oracle bağlantısı kaydeder, birini seçer ve o bağlantıyla
login olur. Bağlantı seçince sunucu havuzu (pool) o bağlantıya yeniden kurulur;
sonraki login o veritabanına gider.

Yönetim uçları login öncesi ve yereldir (masaüstü). Ortam (ORACLE_DSN) modunda
bağlantı yönetimi kapalıdır (tek, sabit bağlantı).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app import db, desktop_config
from app.bootstrap import bootstrap_database
from app.desktop_config import Connection

router = APIRouter(prefix="/v1/connections", tags=["connections"])


class ConnectionInput(BaseModel):
    host: str
    port: int = 1521
    service_name: str
    user: str
    password: str


class ConnectionCreate(ConnectionInput):
    name: str
    # İlk kez boş bir veritabanı kuruluyorsa şema + ilk admin için:
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None


class ConnectionMetaOut(BaseModel):
    id: str
    name: str
    host: str
    port: int
    service_name: str
    user: str


class ListResponse(BaseModel):
    connections: list[ConnectionMetaOut]
    selected_id: Optional[str]
    ready: bool
    env_mode: bool


def _guard_env() -> None:
    if desktop_config.is_env_configured():
        raise HTTPException(status_code=403, detail="env_managed")


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


def _conn(body: ConnectionInput) -> Connection:
    return Connection(host=body.host, port=body.port, service_name=body.service_name,
                      user=body.user, password=body.password)


@router.get("", response_model=ListResponse)
def list_all() -> ListResponse:
    metas = desktop_config.list_connections()
    return ListResponse(
        connections=[ConnectionMetaOut(**vars(m)) for m in metas],
        selected_id=desktop_config.get_selected_id(),
        ready=db.is_ready(),
        env_mode=desktop_config.is_env_configured(),
    )


@router.post("/test")
async def test(body: ConnectionInput) -> dict:
    import oracledb
    dsn = f"{body.host}:{body.port}/{body.service_name}"

    def _try() -> None:
        oracledb.connect(user=body.user, password=body.password, dsn=dsn).close()

    try:
        await run_in_threadpool(_try)
    except oracledb.DatabaseError as e:
        raise HTTPException(status_code=400, detail=_friendly_error(e)) from e
    return {"ok": True}


@router.post("")
async def create(body: ConnectionCreate) -> dict:
    _guard_env()
    import oracledb
    conn = _conn(body)

    # Bağlantıyı test et; admin verildiyse şema + ilk admini kur.
    try:
        if body.admin_username and body.admin_password:
            await run_in_threadpool(
                bootstrap_database, conn.dsn, conn.user, conn.password,
                body.admin_username, body.admin_password,
            )
        else:
            await run_in_threadpool(
                lambda: oracledb.connect(user=conn.user, password=conn.password, dsn=conn.dsn).close()
            )
    except oracledb.DatabaseError as e:
        raise HTTPException(status_code=400, detail=_friendly_error(e)) from e

    first = not desktop_config.is_configured()
    cid = desktop_config.add_connection(body.name, conn)
    if first:
        await db.configure_pool(conn)  # ilk bağlantı otomatik seçili → havuzu kur
    return {"ok": True, "id": cid, "selected": first}


@router.put("/{conn_id}")
async def update(conn_id: str, body: ConnectionCreate) -> dict:
    _guard_env()
    conn = _conn(body)
    if not desktop_config.update_connection(conn_id, body.name, conn):
        raise HTTPException(status_code=404, detail="not_found")
    # Güncellenen bağlantı seçiliyse havuzu tazele
    if desktop_config.get_selected_id() == conn_id:
        await db.configure_pool(conn)
    return {"ok": True}


@router.delete("/{conn_id}")
async def delete(conn_id: str) -> dict:
    _guard_env()
    if not desktop_config.delete_connection(conn_id):
        raise HTTPException(status_code=404, detail="not_found")
    # Seçili değişmiş olabilir → yeni seçili varsa havuzu ona kur, yoksa kapat
    sel = desktop_config.get_selected_connection()
    if sel is not None:
        await db.configure_pool(sel)
    else:
        await db.close_pool()
    return {"ok": True}


@router.post("/{conn_id}/select")
async def select(conn_id: str) -> dict:
    if desktop_config.is_env_configured():
        return {"ok": True}
    conn = desktop_config.get_connection(conn_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="not_found")
    if not desktop_config.set_selected(conn_id):
        raise HTTPException(status_code=404, detail="not_found")
    await db.configure_pool(conn)
    return {"ok": True}
