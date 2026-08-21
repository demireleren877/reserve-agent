"""Agent döngüsünün gerçek senaryolardaki dayanıklılığı.

Buradaki testler tek tek tool'ları değil, DÖNGÜNÜN davranışını sabitler:
hatalar modele ulaşıyor mu, form akışı turu doğru yerde durduruyor mu,
tur limiti dolduğunda ne oluyor, ve dejenere veri sessizce IBNR=0 olarak
raporlanabiliyor mu.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.client import ToolCall
from app.agent.loop import run_agent_turn
from app.agent.tools import dispatch_tool
from app.core.triangle import Triangle, TriangleType


class ScriptedClient:
    """Önceden yazılmış yanıtları sırayla döndürür; gönderilen conv'u saklar."""

    def __init__(self, script):
        self.script = list(script)
        self.seen: list[list[dict]] = []

    def chat(self, messages, tools):
        self.seen.append(list(messages))
        return self.script.pop(0) if self.script else {"content": "bitti", "tool_calls": []}


def _tri() -> Triangle:
    return Triangle(
        origin_periods=["2021", "2022", "2023"],
        development_periods=[0, 1, 2],
        values=[[100.0, 150.0, 165.0], [120.0, 180.0, None], [130.0, None, None]],
        triangle_type=TriangleType.PAID,
    )


def _degenerate() -> Triangle:
    """Tek köşegen: her origin'de yalnız bir dolu hücre (cari dönem hareketi)."""
    return Triangle(
        origin_periods=["2021", "2022", "2023"],
        development_periods=[0, 1, 2],
        values=[[0.0, 0.0, 165.0], [0.0, 180.0, None], [130.0, None, None]],
        triangle_type=TriangleType.PAID,
    )


def _payload(triangle=None):
    return {"reserve": {"triangle": None, "session_state": {
        "active": {"period_id": "p1", "branch_id": "b1", "branch_name": "Test"},
        "per_origin": [{"origin": "2023", "latest": 130.0, "cdf": 1.65,
                        "cl_ultimate": 214.5, "premium": 200.0, "premium_annual": 200.0,
                        "correction": 1.0, "selected_ultimate": 214.5, "ibnr": 84.5,
                        "basis": "cl"}],
    }}}


# ── Dejenere üçgen ───────────────────────────────────────────────────────────
class TestDegenerateTriangle:
    def test_single_diagonal_triangle_is_flagged(self):
        out = dispatch_tool("describe_triangle", {}, triangle=_degenerate())
        assert "warning" in out, "tek köşegenli üçgen uyarısız geçti"
        assert "IBNR" in out["warning"]

    def test_healthy_triangle_has_no_warning(self):
        out = dispatch_tool("describe_triangle", {}, triangle=_tri())
        assert "warning" not in out

    def test_warning_names_the_remedy(self):
        w = dispatch_tool("describe_triangle", {}, triangle=_degenerate())["warning"]
        assert "roll_forward" in w


# ── Hata modele ulaşıyor mu ──────────────────────────────────────────────────
class TestErrorsReachTheModel:
    def test_tool_error_is_written_back_to_conversation(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "set_premium", {"origin": "2023"})]},
            {"content": "düzeltildi", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "primi ayarla"}],
                             _payload())
        second = client.seen[1]
        tool_msgs = [m for m in second if m.get("role") == "tool"]
        assert tool_msgs, "tool sonucu konuşmaya yazılmadı"
        assert "error" in json.loads(tool_msgs[-1]["content"])
        assert res.actions == [], "hatalı çağrı yine de action üretti"

    def test_unknown_tool_does_not_crash(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "diye_bir_sey_yok", {})]},
            {"content": "tamam", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "x"}], _payload())
        assert res.stopped_reason == "final"

    def test_malformed_arguments_produce_error_not_default_write(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [
                ToolCall("c1", "set_premium", {"__malformed_arguments__": "{bozuk"})]},
            {"content": "tamam", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "x"}], _payload())
        assert res.actions == []
        assert "error" in res.tool_invocations[0]["output"]


# ── Akış kontrolü ────────────────────────────────────────────────────────────
class TestTurnControl:
    def test_ask_user_stops_turn_with_form(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "ask_user", {
                "title": "Seçim", "fields": [
                    {"name": "basis", "label": "Basis", "type": "select",
                     "options": ["cl", "bf"]}]})]},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "modelle"}], _payload())
        assert res.stopped_reason == "awaiting_input"
        assert res.form is not None and res.form["fields"]

    def test_max_iterations_tells_user_how_to_resume(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall(f"c{i}", "list_project", {})]}
            for i in range(6)
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "modelle"}],
                             _payload(), max_iterations=3)
        assert res.stopped_reason == "max_iterations"
        assert "devam" in res.assistant_message.lower()

    def test_async_load_note_does_not_tell_agent_to_stop_and_ask(self):
        """Şema 'kullanıcıya sorma' derken tool notu 'sor ve DUR' diyordu.

        Tool sonucu bağlamda daha yeni olduğu için model notu dinliyor ve
        üçgeni yükleyip duruyordu. İki metin aynı yönü göstermeli.
        """
        note = dispatch_tool("load_triangle_from_data", {"source": "direct"})["note"]
        assert "SORMA" in note.upper()
        assert "devam edeyim mi" not in note.lower()

# ── Canlı LLM koşusunda çıkanlar ─────────────────────────────────────────────
class TestFoundByLiveModel:
    """Haiku 4.5 ile gerçek koşuda ortaya çıkan iki açık."""

    def test_empty_model_response_never_reaches_user_blank(self):
        """Model ne metin ne tool üretirse kullanıcı BOŞ mesaj görmemeli."""
        client = ScriptedClient([{"content": "", "tool_calls": []}])
        res = run_agent_turn(client, [{"role": "user", "content": "kuyruk nerede kesildi?"}],
                             _payload())
        assert res.assistant_message.strip(), "kullanıcıya boş cevap döndü"

    def test_empty_response_after_tools_summarises_what_ran(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "list_project", {})]},
            {"content": "", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "x"}], _payload())
        assert "list_project" in res.assistant_message

    def test_degeneracy_warning_is_on_the_tool_the_agent_actually_calls(self):
        """Prompt rezerv sorularında get_analysis_state'e yönlendiriyor;
        uyarı yalnız describe_triangle'da olursa agent onu hiç görmüyor."""
        out = dispatch_tool("get_analysis_state", {}, triangle=_degenerate(),
                            session_state={"active": {"branch_id": "b1"}, "per_origin": []})
        assert "warning" in out
