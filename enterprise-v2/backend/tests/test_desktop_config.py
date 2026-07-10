"""desktop_config — çok bağlantılı yerel saklama (keyring yoksa dosya fallback)."""

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
    monkeypatch.setattr(desktop_config, "_keyring", lambda: None)  # dosya fallback
    yield


def _c(host="192.168.1.10", user="actuarius", pw="s3cret") -> Connection:
    return Connection(host=host, port=1521, service_name="ORCLPDB1", user=user, password=pw)


def test_dsn_property():
    assert _c().dsn == "192.168.1.10:1521/ORCLPDB1"


def test_empty_initially():
    assert desktop_config.is_configured() is False
    assert desktop_config.list_connections() == []
    assert desktop_config.get_selected_id() is None
    assert desktop_config.get_selected_connection() is None


def test_add_selects_first_and_roundtrip():
    cid = desktop_config.add_connection("Üretim", _c())
    assert desktop_config.is_configured() is True
    assert desktop_config.get_selected_id() == cid  # ilk bağlantı otomatik seçili
    metas = desktop_config.list_connections()
    assert len(metas) == 1 and metas[0].name == "Üretim"
    conn = desktop_config.get_selected_connection()
    assert conn is not None and conn.password == "s3cret" and conn.user == "actuarius"


def test_add_second_does_not_change_selection():
    a = desktop_config.add_connection("A", _c(host="10.0.0.1"))
    b = desktop_config.add_connection("B", _c(host="10.0.0.2"))
    assert desktop_config.get_selected_id() == a
    assert {m.id for m in desktop_config.list_connections()} == {a, b}


def test_select_switches_active():
    a = desktop_config.add_connection("A", _c(host="10.0.0.1"))
    b = desktop_config.add_connection("B", _c(host="10.0.0.2"))
    assert desktop_config.set_selected(b) is True
    assert desktop_config.get_selected_id() == b
    assert desktop_config.get_selected_connection().host == "10.0.0.2"
    assert a  # kullanıldı


def test_update_connection():
    cid = desktop_config.add_connection("A", _c(host="10.0.0.1", pw="old"))
    ok = desktop_config.update_connection(cid, "A2", _c(host="10.0.0.9", pw="new"))
    assert ok is True
    conn = desktop_config.get_connection(cid)
    assert conn.host == "10.0.0.9" and conn.password == "new"
    assert desktop_config.list_connections()[0].name == "A2"


def test_delete_reassigns_selection():
    a = desktop_config.add_connection("A", _c(host="10.0.0.1"))
    b = desktop_config.add_connection("B", _c(host="10.0.0.2"))
    assert desktop_config.get_selected_id() == a
    assert desktop_config.delete_connection(a) is True
    assert desktop_config.get_selected_id() == b  # silinince diğerine geçer
    assert desktop_config.delete_connection(b) is True
    assert desktop_config.get_selected_id() is None


def test_delete_unknown_returns_false():
    assert desktop_config.delete_connection("yok") is False


def test_password_in_file_when_no_keyring(tmp_path):
    import json
    cid = desktop_config.add_connection("A", _c(pw="p123"))
    store = json.loads((tmp_path / "connections.json").read_text(encoding="utf-8"))
    entry = store["connections"][0]
    assert entry["id"] == cid
    assert entry["password_in_keyring"] is False
    assert entry["password"] == "p123"


def test_keyring_path(monkeypatch):
    import json
    store_kr: dict = {}

    class FakeKR:
        def set_password(self, s, u, p): store_kr[(s, u)] = p
        def get_password(self, s, u): return store_kr.get((s, u))
        def delete_password(self, s, u): store_kr.pop((s, u), None)

    monkeypatch.setattr(desktop_config, "_keyring", lambda: FakeKR())
    cid = desktop_config.add_connection("A", _c(pw="kr-secret"))
    data = json.loads((desktop_config.config_dir() / "connections.json").read_text(encoding="utf-8"))
    assert data["connections"][0]["password_in_keyring"] is True
    assert data["connections"][0]["password"] is None
    assert desktop_config.get_connection(cid).password == "kr-secret"


def test_env_mode(monkeypatch):
    monkeypatch.setenv("ORACLE_DSN", "10.0.0.5:1522/PDB2")
    monkeypatch.setenv("ORACLE_USER", "envuser")
    monkeypatch.setenv("ORACLE_PASSWORD", "envpass")
    assert desktop_config.is_env_configured() is True
    assert desktop_config.is_configured() is True
    metas = desktop_config.list_connections()
    assert len(metas) == 1 and metas[0].id == "__env__"
    conn = desktop_config.get_selected_connection()
    assert conn.host == "10.0.0.5" and conn.port == 1522 and conn.password == "envpass"


def test_legacy_migration(monkeypatch, tmp_path):
    """Eski connection.json → connections listesine göç eder."""
    import json
    (tmp_path / "connection.json").write_text(json.dumps({
        "host": "1.2.3.4", "port": 1521, "service_name": "OLD",
        "user": "legacy", "password_in_keyring": False, "password": "legacypw",
    }), encoding="utf-8")
    metas = desktop_config.list_connections()
    assert len(metas) == 1 and metas[0].name == "Varsayılan" and metas[0].service_name == "OLD"
    assert desktop_config.get_selected_connection().password == "legacypw"
    assert not (tmp_path / "connection.json").exists()  # göç sonrası silinir
