"""Masaüstü (offline) mod için yerel bağlantı yapılandırması — çok bağlantılı.

Kullanıcı birden fazla Oracle bağlantısı kaydedebilir (ekle/güncelle/sil), birini
seçer ve o bağlantıyla login olur. Bağlantılar OS uygulama-veri klasöründe
(connections.json) tutulur; şifreler mümkünse OS keyring'de (Windows Credential
Manager), keyring yoksa dosyaya düşülür.

Ortam değişkeni ORACLE_DSN tanımlıysa masaüstü modu devre dışıdır (web dağıtımı):
tek, sabit bir bağlantı olarak görünür.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_APP_DIR_NAME = "ReserveAgentEnterprise"
_CONNECTIONS_FILE = "connections.json"
_LEGACY_FILE = "connection.json"  # eski tek-bağlantı formatı → göç ettirilir
_KEYRING_SERVICE = "ReserveAgentEnterprise"
_ENV_ID = "__env__"


def is_env_configured() -> bool:
    """Web/Docker dağıtımı: bağlantı ortam değişkenlerinden gelir."""
    return bool(os.environ.get("ORACLE_DSN"))


def config_dir() -> Path:
    override = os.environ.get("RESERVE_AGENT_CONFIG_DIR")
    if override:
        return Path(override)
    if os.name == "nt":
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library" / "Application Support")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / _APP_DIR_NAME


def _store_path() -> Path:
    return config_dir() / _CONNECTIONS_FILE


@dataclass
class Connection:
    host: str
    port: int
    service_name: str
    user: str
    password: str

    @property
    def dsn(self) -> str:
        return f"{self.host}:{self.port}/{self.service_name}"


@dataclass
class ConnectionMeta:
    """Şifresiz bağlantı özeti — arayüz listesi için."""
    id: str
    name: str
    host: str
    port: int
    service_name: str
    user: str


# ─── Şifre saklama (keyring → dosya fallback) ─────────────────────────────────

def _keyring():
    try:
        import keyring  # type: ignore

        keyring.get_keyring()
        return keyring
    except Exception:
        return None


def _store_password(conn_id: str, password: str) -> bool:
    kr = _keyring()
    if kr is None:
        return False
    try:
        kr.set_password(_KEYRING_SERVICE, conn_id, password)
        return True
    except Exception:
        return False


def _load_password(conn_id: str) -> Optional[str]:
    kr = _keyring()
    if kr is None:
        return None
    try:
        return kr.get_password(_KEYRING_SERVICE, conn_id)
    except Exception:
        return None


def _delete_password(conn_id: str) -> None:
    kr = _keyring()
    if kr is None:
        return
    try:
        kr.delete_password(_KEYRING_SERVICE, conn_id)
    except Exception:
        pass


# ─── Depo (JSON) ──────────────────────────────────────────────────────────────

def _empty_store() -> dict:
    return {"connections": [], "selected_id": None}


def _migrate_legacy(store: dict) -> bool:
    """Eski tek-bağlantı connection.json varsa listeye göç ettir."""
    legacy = config_dir() / _LEGACY_FILE
    if not legacy.is_file():
        return False
    try:
        data = json.loads(legacy.read_text(encoding="utf-8"))
    except Exception:
        return False
    cid = uuid.uuid4().hex
    password = data.get("password")
    entry = {
        "id": cid,
        "name": "Varsayılan",
        "host": data["host"],
        "port": int(data["port"]),
        "service_name": data["service_name"],
        "user": data["user"],
        "password_in_keyring": False,
        "password": None,
    }
    if data.get("password_in_keyring"):
        # eski keyring kaydı kullanıcı adına göreydi; taşıyamıyoruz, dosyadan al
        password = _load_password(data["user"]) or password
    if password is not None:
        entry["password_in_keyring"] = _store_password(cid, password)
        if not entry["password_in_keyring"]:
            entry["password"] = password
    store["connections"].append(entry)
    store["selected_id"] = cid
    try:
        legacy.unlink()
    except OSError:
        pass
    return True


def _load_store() -> dict:
    path = _store_path()
    if not path.is_file():
        store = _empty_store()
        if _migrate_legacy(store):
            _save_store(store)
        return store
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_store()


def _save_store(store: dict) -> None:
    d = config_dir()
    d.mkdir(parents=True, exist_ok=True)
    path = _store_path()
    path.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _find(store: dict, conn_id: str) -> Optional[dict]:
    return next((c for c in store["connections"] if c["id"] == conn_id), None)


# ─── Public API ───────────────────────────────────────────────────────────────

def is_configured() -> bool:
    """En az bir bağlantı var mı (ya da env modu)?"""
    if is_env_configured():
        return True
    return bool(_load_store()["connections"])


def list_connections() -> list[ConnectionMeta]:
    if is_env_configured():
        dsn = os.environ["ORACLE_DSN"]
        host, _, rest = dsn.partition(":")
        port_str, _, service = rest.partition("/")
        return [ConnectionMeta(
            id=_ENV_ID, name="Ortam (ORACLE_DSN)", host=host,
            port=int(port_str or "1521"), service_name=service,
            user=os.environ.get("ORACLE_USER", ""),
        )]
    store = _load_store()
    return [ConnectionMeta(
        id=c["id"], name=c["name"], host=c["host"], port=int(c["port"]),
        service_name=c["service_name"], user=c["user"],
    ) for c in store["connections"]]


def _resolve(entry: dict) -> Connection:
    password = entry.get("password")
    if entry.get("password_in_keyring"):
        password = _load_password(entry["id"])
    return Connection(
        host=entry["host"], port=int(entry["port"]), service_name=entry["service_name"],
        user=entry["user"], password=password or "",
    )


def get_connection(conn_id: str) -> Optional[Connection]:
    if is_env_configured() and conn_id == _ENV_ID:
        return get_env_connection()
    entry = _find(_load_store(), conn_id)
    return _resolve(entry) if entry else None


def get_env_connection() -> Optional[Connection]:
    if not is_env_configured():
        return None
    dsn = os.environ["ORACLE_DSN"]
    host, _, rest = dsn.partition(":")
    port_str, _, service = rest.partition("/")
    return Connection(host=host, port=int(port_str or "1521"), service_name=service,
                      user=os.environ.get("ORACLE_USER", ""),
                      password=os.environ.get("ORACLE_PASSWORD", ""))


def add_connection(name: str, conn: Connection) -> str:
    store = _load_store()
    cid = uuid.uuid4().hex
    in_kr = _store_password(cid, conn.password)
    store["connections"].append({
        "id": cid, "name": name, "host": conn.host, "port": conn.port,
        "service_name": conn.service_name, "user": conn.user,
        "password_in_keyring": in_kr, "password": None if in_kr else conn.password,
    })
    if store["selected_id"] is None:
        store["selected_id"] = cid
    _save_store(store)
    return cid


def update_connection(conn_id: str, name: str, conn: Connection) -> bool:
    store = _load_store()
    entry = _find(store, conn_id)
    if entry is None:
        return False
    in_kr = _store_password(conn_id, conn.password)
    entry.update({
        "name": name, "host": conn.host, "port": conn.port,
        "service_name": conn.service_name, "user": conn.user,
        "password_in_keyring": in_kr, "password": None if in_kr else conn.password,
    })
    _save_store(store)
    return True


def delete_connection(conn_id: str) -> bool:
    store = _load_store()
    entry = _find(store, conn_id)
    if entry is None:
        return False
    store["connections"] = [c for c in store["connections"] if c["id"] != conn_id]
    _delete_password(conn_id)
    if store["selected_id"] == conn_id:
        store["selected_id"] = store["connections"][0]["id"] if store["connections"] else None
    _save_store(store)
    return True


def get_selected_id() -> Optional[str]:
    if is_env_configured():
        return _ENV_ID
    return _load_store().get("selected_id")


def set_selected(conn_id: str) -> bool:
    if is_env_configured():
        return conn_id == _ENV_ID
    store = _load_store()
    if _find(store, conn_id) is None:
        return False
    store["selected_id"] = conn_id
    _save_store(store)
    return True


def get_selected_connection() -> Optional[Connection]:
    sid = get_selected_id()
    return get_connection(sid) if sid else None
