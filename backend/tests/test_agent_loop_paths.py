"""run_agent_turn'ün test edilmeyen yolları: legacy triangle sarmalama,
full_history devamlılığı, duplicate tool adı, default modül seti,
KeyError dispatch dalı ve raw_additions içeriği."""

from unittest.mock import MagicMock

import pytest

from app.agent.client import AgentClient, ToolCall
from app.agent.loop import GLOBAL_PROMPT, run_agent_turn
from app.agent.modules.base import ModuleSpec
from app.agent.modules.reserve import reserve_module


@pytest.fixture
def triangle_payload() -> dict:
    return {
        "origin_periods": [2020, 2021],
        "development_periods": [1, 2],
        "values": [[1000.0, 1500.0], [1100.0, None]],
        "triangle_type": "paid",
    }


def _client(*responses) -> AgentClient:
    mock = MagicMock(spec=AgentClient)
    mock.chat.side_effect = list(responses)
    return mock


class TestLegacyTrianglePath:
    def test_triangle_payload_wrapped_as_reserve(self, triangle_payload):
        """modules_payload verilmeyince triangle_payload reserve olarak sarılır."""
        client = _client(
            {"content": None, "tool_calls": [
                ToolCall(id="t1", name="describe_triangle", arguments={})
            ]},
            {"content": "bitti", "tool_calls": []},
        )
        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "üçgeni anlat"}],
            triangle_payload=triangle_payload,
            session_state={"active": {"branch_name": "T"}},
        )
        inv = result.tool_invocations[0]
        assert inv["module"] == "reserve"
        assert inv["output"]["n_origins"] == 2

    def test_no_payload_defaults_to_all_modules(self):
        """Hiç modül yoksa tüm REGISTRY (boş context) ile çalışır —
        navigate_to gibi state'siz tool'lar yine kullanılabilir olmalı."""
        client = _client(
            {"content": None, "tool_calls": [
                ToolCall(id="t1", name="navigate_to", arguments={"module": "data"})
            ]},
            {"content": "ok", "tool_calls": []},
        )
        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "veri sayfasına git"}],
        )
        assert result.actions[0]["type"] == "navigate_to"
        assert result.actions[0]["module"] == "navigation"


class TestFullHistory:
    def test_history_prepended_and_last_user_appended(self):
        """full_history varsa konuşma = system + history + son user mesajı."""
        client = _client({"content": "cevap", "tool_calls": []})
        history = [
            {"role": "user", "content": "önceki soru"},
            {"role": "assistant", "content": "önceki cevap"},
        ]
        run_agent_turn(
            client=client,
            messages=[
                {"role": "user", "content": "önceki soru"},
                {"role": "assistant", "content": "önceki cevap"},
                {"role": "user", "content": "yeni soru"},
            ],
            modules_payload={},
            full_history=history,
        )
        sent = client.chat.call_args.kwargs["messages"]
        assert sent[0]["role"] == "system"
        assert sent[1:3] == history
        assert sent[3] == {"role": "user", "content": "yeni soru"}
        assert len(sent) == 4

    def test_history_without_user_message(self):
        """messages'ta user yoksa history olduğu gibi gönderilir (crash yok)."""
        client = _client({"content": "ok", "tool_calls": []})
        result = run_agent_turn(
            client=client,
            messages=[{"role": "assistant", "content": "selam"}],
            modules_payload={},
            full_history=[{"role": "user", "content": "eski"}],
        )
        assert result.assistant_message == "ok"
        sent = client.chat.call_args.kwargs["messages"]
        assert sent[-1] == {"role": "user", "content": "eski"}

    def test_raw_additions_chain(self, triangle_payload):
        """raw_additions = bu turda eklenen assistant tool-call mesajı +
        tool sonucu + final mesaj (frontend bunu history'e ekler)."""
        client = _client(
            {"content": None, "tool_calls": [
                ToolCall(id="t1", name="describe_triangle", arguments={})
            ]},
            {"content": "bitti", "tool_calls": []},
        )
        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "x"}],
            triangle_payload=triangle_payload,
        )
        roles = [m["role"] for m in result.raw_additions]
        assert roles == ["assistant", "tool", "assistant"]
        assert result.raw_additions[0]["tool_calls"][0]["function"]["name"] == (
            "describe_triangle"
        )
        assert result.raw_additions[1]["tool_call_id"] == "t1"
        assert result.raw_additions[-1]["content"] == "bitti"


class TestToolNameCollision:
    def test_first_module_wins(self, monkeypatch):
        """Aynı tool adı iki modülde tanımlıysa ilk kayıtlı modül sahiplenir."""
        schema = {
            "type": "function",
            "function": {"name": "ortak_tool", "parameters": {
                "type": "object", "properties": {}, "required": []}},
        }
        calls: list[str] = []

        def make(name: str) -> ModuleSpec:
            return ModuleSpec(
                name=name, label=name, system_prompt="",
                tool_schemas=[dict(schema)],
                dispatch=lambda n, a, c, _name=name: calls.append(_name) or {"ok": _name},
                context_provider=lambda s: "ctx",
            )

        fake_registry = {"m1": make("m1"), "m2": make("m2")}
        monkeypatch.setattr("app.agent.loop.REGISTRY", fake_registry)
        monkeypatch.setattr(
            "app.agent.loop.get_modules",
            lambda names: list(fake_registry.values()),
        )
        client = _client(
            {"content": None, "tool_calls": [
                ToolCall(id="t1", name="ortak_tool", arguments={})
            ]},
            {"content": "ok", "tool_calls": []},
        )
        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "x"}],
            modules_payload={"m1": {}, "m2": {}},
        )
        assert calls == ["m1"]
        assert result.tool_invocations[0]["module"] == "m1"
        # Şema listesinde tool bir kez yer almalı
        tools_sent = client.chat.call_args.kwargs["tools"]
        assert sum(1 for t in tools_sent
                   if t["function"]["name"] == "ortak_tool") == 1


class TestDispatchKeyError:
    def test_keyerror_returns_dispatch_error(self, monkeypatch):
        def boom(name, args, ctx):
            raise KeyError("iç anahtar yok")

        monkeypatch.setattr(reserve_module, "dispatch", boom)
        client = _client(
            {"content": None, "tool_calls": [
                ToolCall(id="t1", name="list_project", arguments={})
            ]},
            {"content": "ok", "tool_calls": []},
        )
        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "x"}],
            modules_payload={"reserve": {"session_state": {}}},
        )
        assert "Tool dispatch hatası" in result.tool_invocations[0]["output"]["error"]


class TestSystemPrompt:
    def test_module_summaries_injected(self, triangle_payload):
        client = _client({"content": "ok", "tool_calls": []})
        run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "x"}],
            modules_payload={
                "reserve": {
                    "triangle": triangle_payload,
                    "session_state": {
                        "active": {"branch_name": "Yangın", "period_label": "2026Q1"},
                        "periods": [],
                        "totals_all_branches": {"branch_count": 3},
                    },
                }
            },
        )
        system = client.chat.call_args.kwargs["messages"][0]["content"]
        assert "Yangın" in system          # context_provider çıktısı
        assert "REZERV MODÜLÜ" in system   # modül prompt bölümü
        assert "{module_summaries}" not in system  # placeholder dolduruldu

    def test_global_prompt_has_placeholder(self):
        assert "{module_summaries}" in GLOBAL_PROMPT
