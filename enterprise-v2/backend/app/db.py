"""Oracle bağlantı havuzu.

İki mod:
  • Web/Docker: pool, uygulama başlarken .env'deki ORACLE_* değişkenlerinden kurulur.
  • Masaüstü (offline): bağlantı henüz kurulmamış olabilir. Pool tembel (lazy)
    kurulur — kullanıcı ilk açılışta bağlantıyı /v1/setup üzerinden kaydedince.
    Pool yokken get_pool() 503 (not_configured) verir; frontend kurulum ekranına yönlendirir.
"""

from __future__ import annotations

import asyncio

# oracledb LAZY: startup'ta yüklenmesin (Windows'ta DLL yükleme maliyeti yüksek).
# Havuz ilk oluşturulunca (_create_pool) import edilir.
from fastapi import HTTPException

from app import desktop_config

_pool: oracledb.AsyncConnectionPool | None = None
_schema_ready = False
_schema_lock = asyncio.Lock()


async def _ensure_current_schema() -> None:
    """Upgrade an existing offline database once per selected connection.

    Older desktop installations can already have users/project tables while
    missing newer objects such as ``audit_events``. Running the idempotent
    schema bootstrap on the first real DB request upgrades those installations
    without delaying the launcher's health check or desktop window startup.
    """
    global _schema_ready
    if _schema_ready:
        return
    async with _schema_lock:
        if _schema_ready:
            return
        conn = desktop_config.get_selected_connection()
        # Unit tests may inject a pool directly. Production pools always have a
        # selected desktop or environment connection.
        if conn is None:
            return
        from app.bootstrap import bootstrap_database

        await asyncio.to_thread(
            bootstrap_database,
            conn.dsn,
            conn.user,
            conn.password,
        )
        _schema_ready = True


def _create_pool(conn: desktop_config.Connection) -> "oracledb.AsyncConnectionPool":
    import oracledb

    # CLOB/BLOB'ları locator yerine DOĞRUDAN str/bytes olarak getir. LOB locator'ı
    # bağlantı ömrüne bağlıdır; bağlantı havuza döndükten sonra okunursa protokol
    # bozulur (DPY-5000). fetch_lobs=False ile değer fetch anında okunur → güvenli.
    oracledb.defaults.fetch_lobs = False

    return oracledb.create_pool_async(
        user=conn.user,
        password=conn.password,
        dsn=conn.dsn,
        min=2,
        max=10,
        increment=1,
    )


async def init_pool() -> None:
    """Uygulama başlangıcı: seçili/ortam bağlantısı varsa pool'u kur, yoksa sessizce geç."""
    global _pool
    if _pool is not None:
        return
    conn = desktop_config.get_selected_connection()
    if conn is None:
        return  # Masaüstü ilk açılış — kullanıcı bağlantıyı sonra seçecek.
    _pool = _create_pool(conn)


async def configure_pool(conn: desktop_config.Connection) -> None:
    """Kurulum ekranından gelen bağlantıyı uygula (varsa eskisini kapat)."""
    global _pool, _schema_ready
    if _pool is not None:
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
    _schema_ready = False
    _pool = _create_pool(conn)


def is_ready() -> bool:
    return _pool is not None


async def get_pool() -> oracledb.AsyncConnectionPool:
    if _pool is None:
        raise HTTPException(status_code=503, detail="not_configured")
    await _ensure_current_schema()
    return _pool


async def close_pool() -> None:
    global _pool, _schema_ready
    if _pool:
        await _pool.close()
        _pool = None
    _schema_ready = False
