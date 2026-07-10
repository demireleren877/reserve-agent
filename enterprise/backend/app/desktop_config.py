"""Masaüstü (offline) mod için yerel bağlantı yapılandırması.

Docker/web dağıtımında Oracle bağlantısı ortam değişkenlerinden (.env) gelir.
Masaüstü uygulamasında ise kullanıcı ilk açılışta bağlantıyı ekrandan girer;
burada işletim sistemine ait uygulama-veri klasörüne kaydedilir. Şifre, mümkünse
OS keyring'de (Windows Credential Manager) tutulur; keyring yoksa dosyaya düşülür.

Ortam değişkeni ORACLE_DSN tanımlıysa masaüstü modu devre dışıdır (web dağıtımı).
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_APP_DIR_NAME = "ReserveAgentEnterprise"
_CONFIG_FILE = "connection.json"
_KEYRING_SERVICE = "ReserveAgentEnterprise"


def is_env_configured() -> bool:
    """Web/Docker dağıtımı: bağlantı ortam değişkenlerinden gelir."""
    return bool(os.environ.get("ORACLE_DSN"))


def config_dir() -> Path:
    """İşletim sistemine uygun uygulama-veri klasörü."""
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


def _config_path() -> Path:
    return config_dir() / _CONFIG_FILE


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


# ─── Şifre saklama (keyring → dosya fallback) ─────────────────────────────────

def _keyring():
    try:
        import keyring  # type: ignore

        # Backend'in gerçekten çalıştığını doğrula (headless Linux'ta patlayabilir).
        keyring.get_keyring()
        return keyring
    except Exception:
        return None


def _store_password(user: str, password: str) -> bool:
    """Şifreyi keyring'e yaz. Başarılıysa True (dosyaya yazma)."""
    kr = _keyring()
    if kr is None:
        return False
    try:
        kr.set_password(_KEYRING_SERVICE, user, password)
        return True
    except Exception:
        return False


def _load_password(user: str) -> Optional[str]:
    kr = _keyring()
    if kr is None:
        return None
    try:
        return kr.get_password(_KEYRING_SERVICE, user)
    except Exception:
        return None


# ─── Public API ───────────────────────────────────────────────────────────────

def is_desktop_configured() -> bool:
    """Masaüstü modda bağlantı daha önce kaydedildi mi?"""
    return _config_path().is_file()


def save_connection(conn: Connection) -> None:
    """Bağlantıyı kalıcı hale getir. Şifre mümkünse keyring'de tutulur."""
    d = config_dir()
    d.mkdir(parents=True, exist_ok=True)
    in_keyring = _store_password(conn.user, conn.password)
    payload = {
        "host": conn.host,
        "port": conn.port,
        "service_name": conn.service_name,
        "user": conn.user,
        "password_in_keyring": in_keyring,
        # keyring yoksa şifre burada tutulur (yalnızca kullanıcı klasöründe).
        "password": None if in_keyring else conn.password,
    }
    path = _config_path()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def load_connection() -> Optional[Connection]:
    """Kaydedilmiş bağlantıyı oku. Ortam değişkeni varsa onu tercih et."""
    if is_env_configured():
        dsn = os.environ["ORACLE_DSN"]
        host, _, rest = dsn.partition(":")
        port_str, _, service = rest.partition("/")
        return Connection(
            host=host,
            port=int(port_str or "1521"),
            service_name=service,
            user=os.environ.get("ORACLE_USER", ""),
            password=os.environ.get("ORACLE_PASSWORD", ""),
        )

    path = _config_path()
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    user = data["user"]
    password = data.get("password")
    if data.get("password_in_keyring"):
        password = _load_password(user)
    if password is None:
        return None
    return Connection(
        host=data["host"],
        port=int(data["port"]),
        service_name=data["service_name"],
        user=user,
        password=password,
    )


def clear_connection() -> None:
    """Kaydedilmiş bağlantıyı sil (bağlantı değiştirmek için)."""
    path = _config_path()
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("password_in_keyring"):
                kr = _keyring()
                if kr is not None:
                    try:
                        kr.delete_password(_KEYRING_SERVICE, data["user"])
                    except Exception:
                        pass
        except Exception:
            pass
        path.unlink()
