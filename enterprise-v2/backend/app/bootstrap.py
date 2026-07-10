"""Şema kurulumu ve ilk admin — masaüstü kurulum ekranı ve init_db.py ortak kullanır.

Tek seferlik DDL olduğu için senkron oracledb kullanır. Idempotent: var olan
tablolar atlanır (ORA-00955), var olan admin dokunulmaz.
"""

from __future__ import annotations

from pathlib import Path

import bcrypt
import oracledb

_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


def _ora_code(e: oracledb.DatabaseError) -> int:
    arg = e.args[0]
    if hasattr(arg, "code"):
        return int(arg.code)
    return -1


def _strip_comments(sql: str) -> str:
    lines = [ln for ln in sql.splitlines() if not ln.strip().startswith("--")]
    return "\n".join(lines).strip()


def ensure_schema(cur: oracledb.Cursor) -> None:
    """schema.sql içindeki CREATE/ALTER ifadelerini idempotent çalıştır."""
    schema = _SCHEMA_PATH.read_text(encoding="utf-8")
    statements = [s for s in (_strip_comments(s) for s in schema.split(";")) if s]
    for stmt in statements:
        first = stmt.upper().split()[0] if stmt.split() else ""
        if first not in ("CREATE", "ALTER"):
            continue
        try:
            cur.execute(stmt)
        except oracledb.DatabaseError as e:
            if _ora_code(e) in (955, 1408):  # zaten var / sütun zaten var
                continue
            raise


def ensure_admin(cur: oracledb.Cursor, username: str, password: str) -> bool:
    """Hiç kullanıcı yoksa admin oluştur. Oluşturulduysa True."""
    cur.execute("SELECT COUNT(*) FROM users")
    (count,) = cur.fetchone()
    if count and count > 0:
        return False
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    cur.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (:1, :2, 'admin')",
        [username, pw_hash],
    )
    return True


def bootstrap_database(
    dsn: str,
    user: str,
    password: str,
    admin_username: str | None = None,
    admin_password: str | None = None,
) -> dict:
    """Bağlan, şemayı kur, gerekirse ilk admini oluştur. Bağlantıyı test eder."""
    conn = oracledb.connect(user=user, password=password, dsn=dsn)
    try:
        cur = conn.cursor()
        ensure_schema(cur)
        admin_created = False
        if admin_username and admin_password:
            admin_created = ensure_admin(cur, admin_username, admin_password)
        conn.commit()
        cur.close()
        return {"admin_created": admin_created}
    finally:
        conn.close()
