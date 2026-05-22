"""Oracle bağlantı havuzu."""

from __future__ import annotations

import os
import oracledb

_pool: oracledb.AsyncConnectionPool | None = None


async def init_pool() -> None:
    global _pool
    _pool = oracledb.create_pool_async(
        user=os.environ["ORACLE_USER"],
        password=os.environ["ORACLE_PASSWORD"],
        dsn=os.environ["ORACLE_DSN"],  # örn: "192.168.1.10:1521/ORCLPDB1"
        min=2,
        max=10,
        increment=1,
    )


async def get_pool() -> oracledb.AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("DB pool başlatılmamış")
    return _pool


async def close_pool() -> None:
    if _pool:
        await _pool.close()
