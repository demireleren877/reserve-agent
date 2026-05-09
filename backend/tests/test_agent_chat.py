"""Agent chat endpoint + tool-use loop testleri.

LLM mock'lanır, tool-use loop'unun doğru akıp tool'ları çağırdığı ve
sonucu mesaj listesine doğru şekilde eklediği test edilir.
"""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.agent.client import AgentClient, ToolCall
from app.agent.loop import run_agent_turn
from app.main import app


@pytest.fixture
def sample_triangle_payload() -> dict:
    return {
        "origin_periods": [2020, 2021, 2022, 2023],
        "development_periods": [1, 2, 3, 4],
        "values": [
            [1000.0, 1500.0, 1700.0, 1750.0],
            [1100.0, 1600.0, 1800.0, None],
            [1200.0, 1700.0, None, None],
            [1300.0, None, None, None],
        ],
        "triangle_type": "paid",
    }


def _make_mock_client(responses: list) -> AgentClient:
    """Sırayla `responses` döndüren mock client."""
    mock = MagicMock(spec=AgentClient)
    mock.chat.side_effect = responses
    return mock


class TestAgentLoopNoToolCalls:
    def test_plain_response_returned_directly(self, sample_triangle_payload):
        """LLM tool çağırmazsa direkt metin yanıtı dönmeli."""
        mock_response = {
            "content": "Merhaba! Size nasıl yardımcı olabilirim?",
            "tool_calls": [],
        }
        client = _make_mock_client([mock_response])

        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "merhaba"}],
            triangle_payload=sample_triangle_payload,
        )

        assert result.assistant_message == "Merhaba! Size nasıl yardımcı olabilirim?"
        assert result.tool_invocations == []
        assert client.chat.call_count == 1


class TestAgentLoopWithTools:
    def test_single_tool_call_then_final_text(self, sample_triangle_payload):
        """LLM tool çağırır, sonuç döner, LLM yorumlar ve metin dönerek biter."""
        first = {
            "content": None,
            "tool_calls": [
                ToolCall(id="c1", name="describe_triangle", arguments={})
            ],
        }
        second = {
            "content": "Üçgen 4x4, en güncel toplam 6550.",
            "tool_calls": [],
        }
        client = _make_mock_client([first, second])

        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "üçgeni özetle"}],
            triangle_payload=sample_triangle_payload,
        )

        assert "6550" in result.assistant_message
        assert len(result.tool_invocations) == 1
        assert result.tool_invocations[0]["name"] == "describe_triangle"
        assert result.tool_invocations[0]["output"]["n_origins"] == 4

    def test_run_chain_ladder_tool_via_agent(self, sample_triangle_payload):
        first = {
            "content": None,
            "tool_calls": [
                ToolCall(
                    id="c2",
                    name="run_chain_ladder",
                    arguments={"excluded_origins": [2021]},
                )
            ],
        }
        second = {"content": "2021 hariç tutuldu, yeni rezerv hesaplandı.", "tool_calls": []}
        client = _make_mock_client([first, second])

        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "2021'i çıkar"}],
            triangle_payload=sample_triangle_payload,
        )

        inv = result.tool_invocations[0]
        assert inv["name"] == "run_chain_ladder"
        assert inv["arguments"] == {"excluded_origins": [2021]}
        # dev 1->2 LDF after exclusion
        assert inv["output"]["ldfs"][0] == pytest.approx(3200 / 2200, rel=1e-9)

    def test_max_iterations_protects_against_infinite_loop(
        self, sample_triangle_payload
    ):
        """Sonsuz tool çağrısı olursa güvenlik limiti devreye girmeli."""
        # LLM sürekli aynı tool'u çağırıyor
        loop_response = {
            "content": None,
            "tool_calls": [ToolCall(id="x", name="describe_triangle", arguments={})],
        }
        client = _make_mock_client([loop_response] * 20)

        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "özetle"}],
            triangle_payload=sample_triangle_payload,
            max_iterations=3,
        )
        # 3 iterasyondan fazla tool çağrısı olmamalı
        assert len(result.tool_invocations) <= 3
        assert result.stopped_reason in {"max_iterations", "final"}


class TestAgentChatEndpoint:
    def test_chat_endpoint_returns_agent_response(
        self, sample_triangle_payload, monkeypatch
    ):
        """Endpoint mock LLM ile çalışıp 200 dönmeli."""
        mock_response = {
            "content": "Tamam.",
            "tool_calls": [],
        }

        def fake_chat(self, messages, tools):
            return mock_response

        monkeypatch.setattr(AgentClient, "chat", fake_chat)
        # API key gerekmesin diye
        monkeypatch.setattr(AgentClient, "__init__", lambda self, **kw: None)

        client = TestClient(app)
        response = client.post(
            "/v1/agent/chat",
            json={
                "messages": [{"role": "user", "content": "merhaba"}],
                "triangle": sample_triangle_payload,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["assistant_message"] == "Tamam."
        assert data["tool_invocations"] == []

    def test_chat_endpoint_works_without_triangle(self, monkeypatch):
        """Triangle (ve modules) opsiyonel — agent'a sade bir mesaj göndermek
        bile başarılı yanıt dönmeli."""
        monkeypatch.setattr(AgentClient, "__init__", lambda self, **kw: None)
        monkeypatch.setattr(
            AgentClient,
            "chat",
            lambda self, messages, tools: {"content": "ok", "tool_calls": []},
        )
        client = TestClient(app)
        response = client.post(
            "/v1/agent/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"] == "ok"
