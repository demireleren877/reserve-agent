"""desktop_config — yerel bağlantı saklama (keyring yoksa dosya fallback)."""

from __future__ import annotations

import pytest

from app import desktop_config
from app.desktop_config import Connection


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.delenv("ORACLE_DSN", raising=False)
    monkeypatch.delenv("ORACLE_USER", raising=False)
    monkeypatch.delenv("ORACLE_PASSWORD", raising=False)
    monkeypatch.setenv("RESERVE_AGENT_CONFIG_DIR", str(tmp_path))
    # keyring'i devre dışı bırak → dosya fallback yolunu test et
    monkeypatch.setattr(desktop_config, "_keyring", lambda: None)
    yield


def _conn() -> Connection:
    return Connection(host="192.168.1.10", port=1521, service_name="ORCLPDB1",
                      user="actuarius", password="s3cret")


def test_dsn_property():
    assert _conn().dsn == "192.168.1.10:1521/ORCLPDB1"


def test_not_configured_initially():
    assert desktop_config.is_desktop_configured() is False
    assert desktop_config.load_connection() is None
    assert desktop_config.is_env_configured() is False


def test_save_and_load_roundtrip():
    desktop_config.save_connection(_conn())
    assert desktop_config.is_desktop_configured() is True
    loaded = desktop_config.load_connection()
    assert loaded is not None
    assert loaded.host == "192.168.1.10"
    assert loaded.port == 1521
    assert loaded.service_name == "ORCLPDB1"
    assert loaded.user == "actuarius"
    assert loaded.password == "s3cret"  # keyring yok → dosyadan okundu


def test_save_stores_password_in_file_when_no_keyring(tmp_path):
    import json
    desktop_config.save_connection(_conn())
    data = json.loads((tmp_path / "connection.json").read_text(encoding="utf-8"))
    assert data["password_in_keyring"] is False
    assert data["password"] == "s3cret"


def test_clear_connection():
    desktop_config.save_connection(_conn())
    desktop_config.clear_connection()
    assert desktop_config.is_desktop_configured() is False
    assert desktop_config.load_connection() is None


def test_env_mode_takes_precedence(monkeypatch):
    monkeypatch.setenv("ORACLE_DSN", "10.0.0.5:1522/PDB2")
    monkeypatch.setenv("ORACLE_USER", "envuser")
    monkeypatch.setenv("ORACLE_PASSWORD", "envpass")
    assert desktop_config.is_env_configured() is True
    loaded = desktop_config.load_connection()
    assert loaded is not None
    assert loaded.host == "10.0.0.5"
    assert loaded.port == 1522
    assert loaded.service_name == "PDB2"
    assert loaded.user == "envuser"
    assert loaded.password == "envpass"


def test_keyring_path_when_available(monkeypatch):
    """keyring varsa şifre dosyaya yazılmaz, password_in_keyring True olur."""
    import json
    store: dict = {}

    class FakeKR:
        def set_password(self, svc, user, pw): store[(svc, user)] = pw
        def get_password(self, svc, user): return store.get((svc, user))
        def delete_password(self, svc, user): store.pop((svc, user), None)

    monkeypatch.setattr(desktop_config, "_keyring", lambda: FakeKR())
    desktop_config.save_connection(_conn())

    cfg_path = desktop_config.config_dir() / "connection.json"
    data = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert data["password_in_keyring"] is True
    assert data["password"] is None
    loaded = desktop_config.load_connection()
    assert loaded is not None and loaded.password == "s3cret"
