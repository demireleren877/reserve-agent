"""Agent Ayarları (masaüstüyle aynı `config`) → /v1/agent/chat davranışı."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.api as api
from app.firebase_auth import verify_firebase_token
from app.main import app


@pytest.fixture
def client(monkeypatch):
    calls: dict = {}

    class FakeClient:
        def __init__(self, **kwargs):
            calls["client"] = kwargs

    def fake_turn(client, messages, modules_payload=None, **kwargs):
        calls["turn"] = kwargs
        return SimpleNamespace(
            assistant_message="ok", tool_invocations=[], actions=[],
            stopped_reason="final", raw_additions=[], form=None,
        )

    monkeypatch.setattr(api, "AgentClient", FakeClient)
    monkeypatch.setattr(api, "run_agent_turn", fake_turn)
    app.dependency_overrides[verify_firebase_token] = lambda: {"uid": "u1"}
    try:
        yield TestClient(app), calls
    finally:
        app.dependency_overrides.pop(verify_firebase_token, None)


MSG = [{"role": "user", "content": "merhaba"}]


def test_without_config_uses_platform_llm(client):
    tc, calls = client
    r = tc.post("/v1/agent/chat", json={"messages": MSG, "model": "m-1"})
    assert r.status_code == 200
    assert calls["client"] == {"model": "m-1", "temperature": None}
    assert calls["turn"]["global_prompt"] is None
    assert calls["turn"]["enabled_tools"] is None


def test_config_prompt_and_tools_forwarded_on_platform_llm(client):
    tc, calls = client
    r = tc.post("/v1/agent/chat", json={
        "messages": MSG,
        "config": {
            "model": "m-2", "system_prompt": "SEN",
            "enabled_tools": ["get_state"], "temperature": 0.1,
        },
    })
    assert r.status_code == 200
    assert calls["client"] == {"model": "m-2", "temperature": 0.1}
    assert calls["turn"]["global_prompt"] == "SEN"
    assert calls["turn"]["enabled_tools"] == {"get_state"}


def test_own_endpoint_uses_user_key(client, monkeypatch):
    tc, calls = client
    monkeypatch.setattr(api, "validate_llm_base_url", lambda u: u.rstrip("/"))
    r = tc.post("/v1/agent/chat", json={
        "messages": MSG,
        "config": {"base_url": "https://llm.example.com/v1/", "api_key": "k", "model": "x"},
    })
    assert r.status_code == 200
    assert calls["client"]["base_url"] == "https://llm.example.com/v1"
    assert calls["client"]["api_key"] == "k"


def test_private_endpoint_rejected(client):
    tc, _ = client
    r = tc.post("/v1/agent/chat", json={
        "messages": MSG,
        "config": {"base_url": "https://127.0.0.1/v1", "api_key": "k", "model": "x"},
    })
    assert r.status_code == 400
    assert "agent_endpoint_not_allowed" in r.json()["detail"]


def test_own_endpoint_requires_key_and_model(client, monkeypatch):
    tc, _ = client
    monkeypatch.setattr(api, "validate_llm_base_url", lambda u: u)
    r = tc.post("/v1/agent/chat", json={
        "messages": MSG, "config": {"base_url": "https://llm.example.com/v1", "model": "x"},
    })
    assert r.status_code == 400


def test_prompt_and_tools_endpoints(client):
    tc, _ = client
    assert "system_prompt" in tc.get("/v1/agent/prompt").json()
    tools = tc.get("/v1/agent/tools").json()
    assert tools["count"] == len(tools["tools"]) > 0
