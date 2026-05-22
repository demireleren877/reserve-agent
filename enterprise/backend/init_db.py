"""Veritabanını kur ve ilk admin kullanıcısını oluştur.

Kullanım:
  pip install -r requirements.txt
  python init_db.py

.env'de ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN tanımlı olmalı.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

for candidate in (Path(__file__).parent / ".env", Path(__file__).parent.parent / ".env"):
    if candidate.is_file():
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

import oracledb
import bcrypt

DSN      = os.environ["ORACLE_DSN"]
USER     = os.environ["ORACLE_USER"]
PASSWORD = os.environ["ORACLE_PASSWORD"]

SCHEMA = (Path(__file__).parent / "schema.sql").read_text()

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "ErenD")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "qwertyadmin123.")

# Eski tablolar → bağımlılık sırasına göre (FK önce child)
_OLD_TABLES = [
    "model_locks",
    "datasets",
    "periods",
    "user_state",
    "users",
]


def _ora_code(e: oracledb.DatabaseError) -> int:
    arg = e.args[0]
    if hasattr(arg, "code"):
        return int(arg.code)
    msg = str(arg)
    if "ORA-" in msg:
        try:
            return int(msg.split("ORA-")[1].split(":")[0].split()[0])
        except (IndexError, ValueError):
            pass
    return -1


def _execute(cur: oracledb.Cursor, stmt: str, label: str) -> bool:
    """DDL çalıştırır. 'zaten var' hatalarını atlar, diğerlerinde durur."""
    try:
        cur.execute(stmt)
        print(f"  ✓  {label}")
        return True
    except oracledb.DatabaseError as e:
        code = _ora_code(e)
        if code in (955, 1408):
            print(f"  –  {label}  (zaten var, atlandı)")
            return False
        print(f"\n  ✗  {label}")
        print(f"     Hata kodu : ORA-{code:05d}")
        print(f"     Mesaj     : {e.args[0]}")
        print()
        sys.exit(1)


def _drop_old_tables(cur: oracledb.Cursor) -> None:
    """Eski tabloları düşür. Yoksa sessizce geç."""
    print("Eski tablolar temizleniyor:")
    for table in _OLD_TABLES:
        try:
            cur.execute(f"DROP TABLE {table} CASCADE CONSTRAINTS")
            print(f"  ✓  DROP {table}")
        except oracledb.DatabaseError as e:
            code = _ora_code(e)
            if code == 942:   # ORA-00942: table or view does not exist
                print(f"  –  DROP {table}  (yok, atlandı)")
            else:
                print(f"\n  ✗  DROP {table}")
                print(f"     Hata kodu : ORA-{code:05d}")
                print(f"     Mesaj     : {e.args[0]}")
                print()
                sys.exit(1)
    print()


def run() -> None:
    print(f"\nOracle'a bağlanılıyor...")
    print(f"  DSN  : {DSN}")
    print(f"  User : {USER}\n")

    try:
        conn = oracledb.connect(user=USER, password=PASSWORD, dsn=DSN)
    except oracledb.DatabaseError as e:
        print(f"BAĞLANTI HATASI: {e}")
        print()
        code = _ora_code(e)
        if code == 12541:
            print("→ Oracle sunucusuna ulaşılamıyor. IP ve port doğru mu?")
        elif code == 1017:
            print("→ Kullanıcı adı veya şifre yanlış.")
        elif code == 12514:
            print("→ Servis adı (DSN'deki / sonrası) yanlış.")
        elif code == 12154:
            print("→ DSN formatı hatalı. Örnek: 192.168.1.10:1521/ORCLPDB1")
        sys.exit(1)

    print("Bağlantı başarılı.\n")

    cur = conn.cursor()

    _drop_old_tables(cur)

    print("Tablolar oluşturuluyor:")

    def _strip_comments(sql: str) -> str:
        lines = [ln for ln in sql.splitlines() if not ln.strip().startswith("--")]
        return "\n".join(lines).strip()

    statements = [_strip_comments(s) for s in SCHEMA.split(";")]
    statements = [s for s in statements if s]
    for stmt in statements:
        first_word = stmt.upper().split()[0] if stmt.split() else ""
        if first_word not in ("CREATE", "ALTER"):
            continue
        label = next((ln.strip() for ln in stmt.splitlines() if ln.strip()), stmt[:80])[:80]
        _execute(cur, stmt, label)

    conn.commit()
    print()

    print(f"Admin kullanıcı kontrol ediliyor: {ADMIN_USERNAME}")
    try:
        cur.execute("SELECT id FROM users WHERE username = :1", [ADMIN_USERNAME])
        row = cur.fetchone()
    except oracledb.DatabaseError as e:
        print(f"\nKULLANICI SORGUSU HATASI: {e}")
        print("users tablosu oluşturulamamış olabilir. Yukarıdaki çıktıyı kontrol edin.")
        sys.exit(1)

    if row:
        print(f"  –  Zaten var (id={row[0]}), şifre değiştirilmedi.")
    else:
        pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (:1, :2, 'admin')",
            [ADMIN_USERNAME, pw_hash],
        )
        conn.commit()
        print(f"  ✓  Oluşturuldu → kullanıcı: {ADMIN_USERNAME}")

    cur.close()
    conn.close()
    print("\nKurulum tamamlandı.\n")


if __name__ == "__main__":
    run()
