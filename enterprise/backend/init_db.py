"""Veritabanını kur ve ilk admin kullanıcısını oluştur.

Kullanım:
  pip install -r requirements.txt
  python init_db.py

.env'de ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN tanımlı olmalı.
"""

from __future__ import annotations

import os
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

DSN = os.environ["ORACLE_DSN"]
USER = os.environ["ORACLE_USER"]
PASSWORD = os.environ["ORACLE_PASSWORD"]

SCHEMA = (Path(__file__).parent / "schema.sql").read_text()

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "ErenD")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "qwertyadmin123.")


def run() -> None:
    print(f"Oracle'a bağlanılıyor: {DSN}")
    conn = oracledb.connect(user=USER, password=PASSWORD, dsn=DSN)
    cur = conn.cursor()

    statements = [s.strip() for s in SCHEMA.split(";") if s.strip()]
    for stmt in statements:
        if not stmt.upper().startswith(("CREATE", "ALTER")):
            continue
        try:
            cur.execute(stmt)
            print(f"  OK: {stmt[:70]}...")
        except oracledb.DatabaseError as e:
            err = e.args[0]
            if err.code in (955, 1408):
                print(f"  ATLANDI (zaten var): {stmt[:70]}...")
            else:
                print(f"  HATA: {e}")
                raise

    conn.commit()

    cur.execute("SELECT id FROM users WHERE username = :1", [ADMIN_USERNAME])
    if cur.fetchone():
        print(f"\nAdmin kullanıcı zaten var: {ADMIN_USERNAME}")
    else:
        pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (:1, :2, 'admin')",
            [ADMIN_USERNAME, pw_hash],
        )
        conn.commit()
        print(f"\nAdmin kullanıcı oluşturuldu: {ADMIN_USERNAME}")

    cur.close()
    conn.close()
    print("\nKurulum tamamlandı.")


if __name__ == "__main__":
    run()
