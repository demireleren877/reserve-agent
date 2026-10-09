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
        self.choices: list[str] = []

    def chat(self, messages, tools, tool_choice="auto"):
        self.seen.append(list(messages))
        self.choices.append(tool_choice)
        return self.script.pop(0) if self.script else {"content": "bitti", "tool_calls": []}


class ToolCapturingClient(ScriptedClient):
    """Modele HANGİ araçların sunulduğunu kaydeder."""

    def __init__(self, script=None):
        super().__init__(script or [{"content": "tamam", "tool_calls": []}])
        self.tools_seen: list[list[dict]] = []

    def chat(self, messages, tools, tool_choice="auto"):
        self.tools_seen.append(list(tools))
        return super().chat(messages, tools, tool_choice)


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


class TestAskUserGuard:
    """ask_user, cevabı zaten hesaplanmış bir turda form açmamalı.

    Küçük modeller "2024 için LR %25 olsaydı?" gibi sorularda simulate_bf'yi
    doğru çağırıp doğru sonucu alıyor, sonra ask_user ile form açıyordu: tur
    awaiting_input ile kesiliyor ve kullanıcı cevap yerine form görüyordu.
    Prompt kuralı 9B'de tutmadığı için kural döngüde de uygulanıyor.
    """

    def test_ask_user_rejected_after_compute_tool(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [
                ToolCall("c1", "simulate_bf", {"origin": "2023", "loss_ratio": 0.25})]},
            {"content": None, "tool_calls": [
                ToolCall("c2", "ask_user", {"title": "Seçim", "fields": [
                    {"name": "b", "label": "Basis", "type": "select", "options": ["cl", "bf"]}]})]},
            {"content": "IBNR -10.742.934 olurdu.", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "LR %25 olsaydı?"}],
                             _payload(), max_iterations=5)
        assert res.stopped_reason == "final", "hesap sonrası form turu kesti"
        assert res.form is None
        rejected = res.tool_invocations[1]["output"]
        assert "error" in rejected and "simulate_bf" in rejected["error"]

    def test_ask_user_still_allowed_without_compute(self):
        """Otonom modelleme akışı bozulmamalı: hesap yapılmadıysa form serbest."""
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "list_project", {})]},
            {"content": None, "tool_calls": [
                ToolCall("c2", "ask_user", {"title": "Modelleme", "fields": [
                    {"name": "b", "label": "Branş", "type": "select", "options": ["x"]}]})]},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "modelle"}],
                             _payload(), max_iterations=5)
        assert res.stopped_reason == "awaiting_input"
        assert res.form is not None


class TestAskUserRemovedFromToolList:
    """Hesap aracı çalıştıktan sonra ask_user modele HİÇ sunulmamalı.

    Sadece reddetmek yetmedi: model reddi görüp aynı çağrıyı üst üste
    deneyerek tur limitini yaktı ("Tur limiti doldu... ask_user, ask_user,
    ask_user, ask_user"). Araç listede yoksa ısrar edemez.
    """

    def _tools_seen(self, client):
        return client.tool_lists

    def test_ask_user_absent_after_compute_tool(self):
        class Recording(ScriptedClient):
            def __init__(self, script):
                super().__init__(script)
                self.tool_lists = []

            def chat(self, messages, tools, tool_choice="auto"):
                self.tool_lists.append([t["function"]["name"] for t in tools])
                return super().chat(messages, tools, tool_choice)

        client = Recording([
            {"content": None, "tool_calls": [
                ToolCall("c1", "simulate_bf", {"origin": "2023", "loss_ratio": 0.25})]},
            {"content": "IBNR -10.742.934 olurdu.", "tool_calls": []},
        ])
        run_agent_turn(client, [{"role": "user", "content": "LR %25 olsaydı?"}],
                       _payload(), max_iterations=5)
        assert "ask_user" in client.tool_lists[0], "ilk turda sunulmalıydı"
        assert "ask_user" not in client.tool_lists[1], "hesap sonrası hâlâ sunuluyor"


class TestAskUserBlockedOnQuestions:
    """Kullanıcı SORU sorduysa ve state okunduysa form gösterilmez.

    V5 ("BF kullanılan yerlerde hangi loss ratio kullanılıyor?") canlı koşuda
    get_analysis_state çağırıp sonra ask_user açtı; kullanıcı cevap yerine form
    gördü. Hesap araçları için konan koruma okuma araçlarını kapsamıyordu.
    Ayrım aracın türü değil, kullanıcının SORU sorup sormadığı.
    """

    class _Recording(ScriptedClient):
        def __init__(self, script):
            super().__init__(script)
            self.tool_lists = []

        def chat(self, messages, tools, tool_choice="auto"):
            self.tool_lists.append([t["function"]["name"] for t in tools])
            return super().chat(messages, tools, tool_choice)

    def _script(self, first_tool):
        return [
            {"content": None, "tool_calls": [ToolCall("c1", first_tool, {})]},
            {"content": "cevap", "tool_calls": []},
        ]

    def test_blocked_when_question_and_state_read(self):
        client = self._Recording(self._script("get_analysis_state"))
        run_agent_turn(client, [{"role": "user", "content": "Hangi loss ratio kullanılıyor?"}],
                       _payload(), max_iterations=4)
        assert "ask_user" not in client.tool_lists[1]

    def test_allowed_for_modelling_command(self):
        """'modelle' bir komut, soru değil — form akışı korunmalı."""
        client = self._Recording(self._script("get_analysis_state"))
        run_agent_turn(client, [{"role": "user", "content": "Modelle"}],
                       _payload(), max_iterations=4)
        assert "ask_user" in client.tool_lists[1]

    def test_list_project_does_not_block_form(self):
        """Proje ağacını okumak form açmayı engellememeli (modelleme akışı)."""
        client = self._Recording(self._script("list_project"))
        run_agent_turn(client, [{"role": "user", "content": "Q2'yi modelleyebilir misin?"}],
                       _payload(), max_iterations=4)
        assert "ask_user" in client.tool_lists[1]


class TestDuplicateWriteGuard:
    """Aynı yazma işlemini ikinci kez uygulamayı reddetme.

    Haiku ile ölçüldü: "LDF ortalamasını basit ortalamaya çevir" komutunda
    model set_method'u uyguladıktan sonra aynı çağrıyı tekrarlıyordu (çelişkili
    prompt düzeltilmeden önce altı kez). set_method'da sonuç aynı kalıyor ama
    exclude_cells ya da create_version'da durum bozulur — ve her tekrar tur
    bütçesinden yiyor.
    """

    def _script(self, n):
        call = {"content": None, "tool_calls": [
            ToolCall("c", "set_method", {"method": "simple_average"})]}
        return [call] * n + [{"content": "Yöntem basit ortalamaya çevrildi.",
                              "tool_calls": []}]

    def test_identical_write_applied_once(self):
        client = ScriptedClient(self._script(3))
        res = run_agent_turn(client, [{"role": "user", "content": "basit ortalamaya çevir"}],
                             _payload())
        assert len(res.actions) == 1, f"aksiyon tekrarlandı: {res.actions}"

    def test_repeat_is_rejected_with_a_reason(self):
        client = ScriptedClient(self._script(2))
        run_agent_turn(client, [{"role": "user", "content": "basit ortalamaya çevir"}],
                       _payload())
        tool_msgs = [m for conv in client.seen for m in conv if m.get("role") == "tool"]
        errors = [json.loads(m["content"]).get("error", "") for m in tool_msgs]
        assert any("zaten uygulandı" in e for e in errors), \
            "tekrar sessizce yutuldu; model neden durması gerektiğini görmüyor"

    def test_different_arguments_still_apply(self):
        """Fikir değiştirmek tekrar değildir."""
        client = ScriptedClient([
            {"content": None, "tool_calls": [
                ToolCall("c1", "set_method", {"method": "simple_average"})]},
            {"content": None, "tool_calls": [
                ToolCall("c2", "set_method", {"method": "geometric_average"})]},
            {"content": "oldu", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "x"}], _payload())
        assert len(res.actions) == 2, "farklı argümanlı ikinci yazma da engellendi"

    def test_empty_answer_fallback_does_not_repeat_tool_names(self):
        """Model boş bitirirse kullanıcı 'Uygulandı: set_method, set_method' görmemeli."""
        client = ScriptedClient([
            {"content": None, "tool_calls": [
                ToolCall("c1", "set_method", {"method": "simple_average"})]},
            {"content": None, "tool_calls": [
                ToolCall("c2", "set_method", {"method": "geometric_average"})]},
            {"content": "", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "x"}], _payload())
        assert res.assistant_message.count("set_method") == 1, res.assistant_message

    def test_a_later_turn_may_repeat_the_same_write(self):
        """Kayıt TUR başınadır. Kullanıcı sonraki mesajında aynı şeyi
        isterse uygulanmalı — 'zaten yaptım' demek kullanıcıyı kilitler."""
        for _ in range(2):
            client = ScriptedClient(self._script(1))
            res = run_agent_turn(client, [{"role": "user", "content": "basit ortalamaya çevir"}],
                                 _payload())
            assert len(res.actions) == 1


class TestNavigationGuardIsPreventive:
    """Soru sorulduğunda görünüm taşıyan araçlar İLK turdan itibaren düşer.

    Regresyon (Haiku ile ölçüldü): "2024'ün primi 5 milyar TL değil mi?"
    sorusuna ajan navigate_to üretti. Koruma yalnızca bir okuma aracı
    çalıştıktan SONRA devreye giriyordu, ilk iterasyonda araç masadaydı.
    """

    def _names(self, client):
        """İlk çağrıda modele sunulan araç adları."""
        return {t["function"]["name"] for t in client.tools_seen[0]}

    def test_question_hides_navigation_from_the_first_call(self):
        client = ToolCapturingClient()
        run_agent_turn(client, [{"role": "user", "content": "2024'ün primi 5 milyar TL değil mi?"}],
                       _payload())
        assert "navigate_to" not in self._names(client)
        assert "select_branch" not in self._names(client)

    def test_explicit_navigation_survives_even_as_a_question(self):
        """'Veri sekmesine geçer misin?' hem soru hem gerçek istek.

        (navigate_to data modülünde; bu payload reserve modülünü taşıyor,
        o yüzden aynı filtreden geçen select_branch üzerinden ölçüyoruz.)
        """
        client = ToolCapturingClient()
        run_agent_turn(client, [{"role": "user", "content": "Veri sekmesine geçer misin?"}],
                       _payload())
        assert "select_branch" in self._names(client)

    def test_plain_command_is_untouched(self):
        client = ToolCapturingClient()
        run_agent_turn(client, [{"role": "user", "content": "Veri sekmesine geç."}], _payload())
        assert "select_branch" in self._names(client)

    def test_branch_switch_request_survives(self):
        client = ToolCapturingClient()
        run_agent_turn(client, [{"role": "user", "content": "ENGINEERING branşına geçer misin?"}],
                       _payload())
        assert "select_branch" in self._names(client)


class TestCompletionGuard:
    """Yapılmamış değişikliği "yaptım" deme ve formu düz metin yazma koruması.

    Qwen 3.5 9B ile ölçüldü: "2021 için LR'ı %30 yap" → "ayarladım", hiçbir
    araç çağrısı yok (AG02, 6 koşuda 2 kez). "Modelle" → seçenekleri düz metin
    yazdı, ask_user çağırmadı (AG13, 6 koşuda 4 kez).
    """

    def test_false_claim_is_sent_back_once(self):
        client = ScriptedClient([
            {"content": "2021 için loss ratio %30 olarak ayarlandı.", "tool_calls": []},
            {"content": "Uygulayamadım: 2021 BF bazında değil.", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "2021 için LR'ı %30 yap"}], _payload())
        assert len(client.seen) == 2, "iddia geri çevrilmedi"
        assert "HİÇBİR değişiklik" in client.seen[1][-1]["content"]
        assert res.assistant_message.startswith("Uygulayamadım")

    def test_claim_backed_by_an_action_passes(self):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "set_window", {"window": "5"})]},
            {"content": "Volume 5 olarak ayarlandı.", "tool_calls": []},
        ])
        run_agent_turn(client, [{"role": "user", "content": "volume'ü 5 yap"}], _payload())
        assert len(client.seen) == 2  # araç turu + son cevap; geri çevirme yok

    def test_questions_are_never_sent_back(self):
        client = ScriptedClient([{"content": "Volume all olarak ayarlandı.", "tool_calls": []}])
        run_agent_turn(client, [{"role": "user", "content": "Volume ne olarak ayarlı?"}], _payload())
        assert len(client.seen) == 1

    def test_already_set_is_a_legitimate_no_op(self):
        client = ScriptedClient([{"content": "2023 zaten BF bazında, değişiklik gerekmedi; BF olarak ayarlı.", "tool_calls": []}])
        run_agent_turn(client, [{"role": "user", "content": "2023'ü BF yap"}], _payload())
        assert len(client.seen) == 1

    def test_greeting_is_untouched(self):
        client = ScriptedClient([{"content": "Merhaba! Nasıl yardımcı olabilirim?", "tool_calls": []}])
        run_agent_turn(client, [{"role": "user", "content": "Merhaba, günaydın."}], _payload())
        assert len(client.seen) == 1

    def test_guard_fires_at_most_once(self):
        client = ScriptedClient([
            {"content": "Ayarladım.", "tool_calls": []},
            {"content": "Ayarladım.", "tool_calls": []},
            {"content": "Ayarladım.", "tool_calls": []},
        ])
        run_agent_turn(client, [{"role": "user", "content": "2021 LR %30 yap"}], _payload())
        assert len(client.seen) == 2

    def test_modelling_command_without_tools_is_sent_to_ask_user(self):
        client = ScriptedClient([
            {"content": "Şu seçimleri yapın: branş, yöntem…", "tool_calls": []},
            {"content": "tamam", "tool_calls": []},
        ])
        run_agent_turn(client, [{"role": "user", "content": "Modelle"}], _payload())
        assert len(client.seen) == 2
        assert "ask_user" in client.seen[1][-1]["content"]

    def test_guard_messages_stay_out_of_history(self):
        client = ScriptedClient([
            {"content": "Ayarladım.", "tool_calls": []},
            {"content": "Uygulayamadım.", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": "2021 LR %30 yap"}], _payload())
        joined = " ".join(str(m.get("content")) for m in res.raw_additions)
        assert "SİSTEM KONTROLÜ" not in joined
        assert "Ayarladım." not in joined  # geri çevrilen cevap da geçmişe yazılmaz

    def test_auto_continue_turn_is_not_sent_back(self):
        """Arayüzün gizli "devam" turunda önceki değişikliği özetlemek yalan değil.

        Kullanıcı ekranı: BF gerçekten uygulandı, sonra devam turunda koruma
        "hiçbir değişiklik uygulanmadı" dedi ve model "haklısınız" diye özür diledi.
        """
        cont = ("(System) Previous actions have been applied and the latest snapshot is ready. "
                "CONTINUE from where you left off.")
        client = ScriptedClient([{"content": "2025 BF olarak ayarlandı; toplam IBNR …", "tool_calls": []}])
        res = run_agent_turn(client, [{"role": "user", "content": cont}], _payload())
        assert len(client.seen) == 1, "otomatik devam turu geri çevrildi"
        assert res.assistant_message.startswith("2025 BF")

    def test_nudge_tells_the_model_not_to_apologise_to_the_user(self):
        client = ScriptedClient([
            {"content": "Ayarladım.", "tool_calls": []},
            {"content": "Uygulayamadım.", "tool_calls": []},
        ])
        run_agent_turn(client, [{"role": "user", "content": "2021 LR %30 yap"}], _payload())
        nudge = client.seen[1][-1]["content"]
        assert "kullanıcı görmüyor" in nudge and "haklısınız" in nudge


class TestInventedRateGuard:
    """Kullanıcının vermediği sabit LR yazılmaz (Qwen 9B: kendiliğinden %100, %400)."""

    def _run(self, user, formula):
        client = ScriptedClient([
            {"content": None, "tool_calls": [ToolCall("c1", "set_selected_loss_ratio", {"origin": "2023", "formula": formula})]},
            {"content": "tamam", "tool_calls": []},
        ])
        res = run_agent_turn(client, [{"role": "user", "content": user}], _payload())
        return res

    def test_invented_constant_is_rejected(self):
        res = self._run("son dönem için bf ayarlasana", "4.0")
        assert res.actions == []
        assert "UYDURMA" in res.tool_invocations[0]["output"]["error"]

    def test_rate_the_user_gave_passes_in_any_notation(self):
        for f in ("0.3", "30", "%30", "0,30"):
            assert self._run("2023 için loss ratio'yu %30 olarak ayarla", f).actions, f

    def test_formulas_are_not_judged(self):
        assert self._run("2023'e son 4 yılın ağırlıklı ortalamasını uygula", "vw(2019:2022)").actions


class TestOriginReadGuard:
    """Kaza yılı sorusuna durumu okumadan rakamla cevap verilmez.

    Qwen 3.5 9B "son kaza yılına ait ibnr tutarı nedir" sorusuna bloktaki branş
    TOPLAMINI verdi.
    """

    def _run(self, user, script):
        client = ScriptedClient(script + [{"content": "2025 IBNR -161.9M", "tool_calls": []}])
        run_agent_turn(client, [{"role": "user", "content": user}], _payload())
        return client

    def test_year_question_answered_without_reading_is_sent_back(self):
        c = self._run("son kaza yılına ait ibnr tutarı nedir", [{"content": "IBNR -183,221,236 TL", "tool_calls": []}])
        assert len(c.seen) >= 2 and "get_analysis_state" in c.seen[1][-1]["content"]

    def test_read_nudge_forces_a_tool_call_next(self):
        """Geri çevirmeden sonraki çağrıda araç zorunlu (Qwen uyarıya rağmen yine araçsız cevap veriyordu)."""
        c = self._run("son kaza yılına ait ibnr tutarı nedir", [{"content": "IBNR -183,221,236 TL", "tool_calls": []}])
        assert c.choices[:2] == ["auto", "required"]

    def test_forced_call_ignored_by_the_model_reads_anyway(self):
        """LM Studio "required"ı her zaman uygulamıyor: döngü okumayı kendisi yapar,
        reddedilen cevap konuşmada kalmaz (model onu tekrarlıyordu)."""
        c = ScriptedClient([{"content": "IBNR -183,221,236 TL", "tool_calls": []},
                            {"content": "yine araçsız", "tool_calls": []},
                            {"content": "2025 IBNR -161.9M", "tool_calls": []}])
        res = run_agent_turn(c, [{"role": "user", "content": "son kaza yılına ait ibnr tutarı nedir"}], _payload())
        assert c.choices == ["auto", "required", "auto"]
        assert [t["name"] for t in res.tool_invocations] == ["get_analysis_state"]
        assert not any("183,221,236" in str(m.get("content")) for m in c.seen[2] if m["role"] == "assistant")

    def test_typo_question_with_year_missing_in_answer_is_sent_back(self):
        """SEM08: "ne kdar" soru sayılmalı; cevap sorulan yılı hiç anmıyorsa geri çevrilir."""
        c = self._run("2024 kaza yılnın ibnrı ne kdar", [
            {"content": None, "tool_calls": [ToolCall("r1", "get_analysis_state", {})]},
            {"content": "IBNR -161,904,753 TL", "tool_calls": []},
        ])
        assert len(c.seen) >= 3 and "2024" in c.seen[2][-1]["content"]

    def test_year_question_after_reading_passes(self):
        c = self._run("2025 kaza yılının IBNR'ı ne?", [
            {"content": None, "tool_calls": [ToolCall("r1", "get_analysis_state", {})]},
        ])
        assert len(c.seen) == 2  # okuma turu + cevap; geri çevirme yok

    def test_total_question_is_not_judged(self):
        c = self._run("Toplam IBNR ne kadar?", [{"content": "-190,576,298", "tool_calls": []}])
        assert len(c.seen) == 1

    def test_year_command_is_not_judged_as_a_question(self):
        c = self._run("2025'i BF yap", [{"content": "Hangi oranla?", "tool_calls": []}])
        assert len(c.seen) == 1


def test_exclude_cells_does_not_redo_existing_exclusions():
    """Zaten elenmiş hücre yeniden elenmez; aykırı tespiti exclude_outliers'a yönlenir."""
    tri = _tri()
    ss = {"active": {"branch_id": "b1", "branch_name": "T"}, "excluded_cells": [{"origin": "2021", "step": 0}]}
    out = dispatch_tool("exclude_cells", {"cells": [{"origin": "2021", "step": 0}]}, triangle=tri, session_state=ss)
    assert "_action" not in out and "ZATEN" in out["error"] and "exclude_outliers" in out["error"]
    mixed = dispatch_tool("exclude_cells", {"cells": [{"origin": "2021", "step": 0}, {"origin": "2021", "step": 1}]},
                          triangle=tri, session_state=ss)
    assert mixed["_action"]["payload"]["cells"] == [{"origin": "2021", "step": 1}]
    assert mixed["already_excluded"] == [{"origin": "2021", "step": 0}]


class TestAnswerGuards:
    """_guard_nudge'ın cevap denetimleri (Qwen 3.5 9B'de ölçülen hatalar)."""

    BLOCK = ("2026Q1 dönem toplamı IBNR -7,355,063 (ayrı değerleme — diğer dönemle TOPLANMAZ)\n"
             "2026Q2 dönem toplamı IBNR -190,576,298 (ayrı değerleme — diğer dönemle TOPLANMAZ)")

    def _nudge(self, q, answer, tools=(), block=BLOCK):
        from app.agent.loop import _guard_nudge
        return _guard_nudge([{"role": "user", "content": q}], answer,
                            [{"name": t, "output": {}} for t in tools], [], block)

    def test_summing_period_subtotals_is_sent_back(self):
        assert "toplanmaz" in self._nudge("Toplam IBNR ne kadar?", "Toplam: -197,931,361 TL").lower()

    def test_single_period_total_passes(self):
        assert self._nudge("Toplam IBNR ne kadar?", "2026Q2: -190,576,298 TL") is None

    def test_negative_written_unsigned_is_sent_back(self):
        assert "eksi" in self._nudge("Toplam IBNR ne kadar?", "IBNR 190,576,298 TL")

    def test_negative_named_in_words_passes(self):
        assert self._nudge("Toplam IBNR ne kadar?", "IBNR negatif: 190,576,298 TL") is None

    def test_other_year_than_asked_is_sent_back(self):
        out = self._nudge("2024 kaza yılının IBNR'ı ne kadar?", "2025: -161,904,753 TL",
                          tools=["get_analysis_state"])
        assert out and "2024" in out

    def test_data_question_without_reading_is_sent_back(self):
        out = self._nudge("Correction nerede uygulanmış ve neden?", "2024 ve 2025'te k = 1.333")
        assert out and "get_analysis_state" in out


class TestForcedToolFallback:
    """Zorunlu araç çağrısı takılır/boş dönerse tur normal çağrıyla sürer."""

    def test_forced_call_failure_falls_back_to_auto(self):
        class Flaky(ScriptedClient):
            def chat(self, messages, tools, tool_choice="auto"):
                if tool_choice == "required":
                    self.choices.append(tool_choice)
                    raise RuntimeError("ReadTimeout")
                return super().chat(messages, tools, tool_choice)

        c = Flaky([{"content": "IBNR -183,221,236 TL", "tool_calls": []},
                   {"content": "2025 IBNR -161.9M", "tool_calls": []}])
        res = run_agent_turn(c, [{"role": "user", "content": "son kaza yılına ait ibnr tutarı nedir"}], _payload())
        assert c.choices == ["auto", "required", "auto"]
        assert "161.9" in res.assistant_message

    def test_forced_call_without_tool_is_discarded(self):
        c = ScriptedClient([{"content": "IBNR -183,221,236 TL", "tool_calls": []},
                            {"content": "", "tool_calls": []},
                            {"content": "2025 IBNR -161.9M", "tool_calls": []}])
        res = run_agent_turn(c, [{"role": "user", "content": "son kaza yılına ait ibnr tutarı nedir"}], _payload())
        assert c.choices == ["auto", "required", "auto"] and "161.9" in res.assistant_message


class TestNegativeUltimateGuard:
    """IBNR'ı nihai hasar diye sunmak geri çevrilir (Qwen 3.5 9B: V6, SEM02)."""

    def _nudge(self, answer):
        from app.agent.loop import _guard_nudge
        return _guard_nudge([{"role": "user", "content": "Nihai hasar tahminimiz toplamda kaç?"}],
                            answer, [{"name": "get_analysis_state", "output": {}}], [], "")

    def test_ibnr_labelled_as_ultimate_is_sent_back(self):
        assert "ultimate" in self._nudge("**Selected Ultimate**: **-183,221,236 TL** (toplam)")
        assert self._nudge("Toplam Nihai Hasar (Selected Ultimate): **-183.2 Milyon TL**")

    def test_correct_labels_pass(self):
        assert self._nudge("Selected ultimate 617,969,275 TL; IBNR -183,221,236 TL (negatif)") is None
        assert self._nudge("Nihai hasar − ödenmiş = IBNR: -183,221,236 (negatif)") is None
        assert self._nudge("İki dönem arası ultimate değişimi: -12,400,000 TL (negatif)") is None


class TestCommandAndUnitGuards:
    def _nudge(self, q, answer, tools=(), actions=()):
        from app.agent.loop import _guard_nudge
        return _guard_nudge([{"role": "user", "content": q}], answer,
                            [{"name": n, "output": o} for n, o in tools], list(actions), "")

    def test_asking_to_confirm_an_explicit_command_is_sent_back(self):
        """AG10: komut verilmişken "çıkarmak ister misiniz?" diye dönmek."""
        out = self._nudge("Nakit akışı modülünde 2023'ün ilk gelişim hücresini ele.",
                          "Hücre şu an elenmemiş. Bu hücreyi çıkarmak ister misiniz?",
                          tools=[("get_cashflow_ldf_state", {})])
        assert out and "onay sorma" in out

    def test_confirm_question_after_applying_passes(self):
        assert self._nudge("2023'ü ele", "Elendi. Başka hücre eklemek ister misiniz?",
                           actions=[{"type": "exclude_cells"}]) is None

    def test_wrong_unit_is_sent_back(self):
        """TK04: araç -123,760,430 dedi, cevap "-123.76 Milyar TL"."""
        out = self._nudge("İskontolu yükümlülüğü %30 sabit oranla hesapla.",
                          "İskontolu yükümlülük: -123.76 Milyar TL",
                          tools=[("get_discount_state", {"discounted_unpaid": -123760430.12})])
        assert out and "birim" in out

    def test_right_unit_passes(self):
        assert self._nudge("İskontolu yükümlülüğü hesapla.", "İskontolu yükümlülük: -123.76 milyon TL (negatif)",
                           tools=[("get_discount_state", {"discounted_unpaid": -123760430.12})]) is None


class TestFinalIterationAnswers:
    """Hiçbir şey uygulanmadan tur sınırına gelinirse son çağrı araçsız (C4)."""

    def test_read_loop_ends_with_an_answer(self):
        read = {"content": None, "tool_calls": [ToolCall("r", "get_analysis_state", {})]}
        c = ScriptedClient([read, read, {"content": "Dönemler toplanmaz: 2026Q2 -190,576,298 (negatif)", "tool_calls": []}])
        res = run_agent_turn(c, [{"role": "user", "content": "Bütün dönemlerin IBNR'ını toplayıp tek rakam söyle."}],
                             _payload(), max_iterations=3)
        assert c.choices[-1] == "none" and res.stopped_reason != "max_iterations"


class TestBasisAndShowGuards:
    def _nudge(self, q, answer, actions=(), tools=(), bases=None):
        from app.agent.loop import _guard_nudge
        return _guard_nudge([{"role": "user", "content": q}], answer,
                            [{"name": n, "output": {}} for n in tools], list(actions), "", bases)

    LR = {"type": "set_selected_loss_ratios", "payload": {"items": [{"origin": "2022", "formula": "vw(2021:2023)"}]}}

    def test_bf_command_with_only_lr_is_sent_back(self):
        """AG01: "BF bazına al" → yalnız LR yazıldı, basis CL kaldı."""
        out = self._nudge("2022 kaza yılını BF bazına al.", "2022 BF'e alındı.", [self.LR], bases={"2022": "cl"})
        assert out and "2022" in out

    def test_bf_command_with_basis_passes(self):
        basis = {"type": "set_basis_bulk", "payload": {"items": [{"origin": "2022", "basis": "bf"}]}}
        assert self._nudge("2022'yi BF bazına al.", "Alındı.", [basis, self.LR], bases={"2022": "cl"}) is None

    def test_lr_on_origin_already_bf_passes(self):
        assert self._nudge("2022 BF için LR'yi güncelle.", "Güncellendi.", [self.LR], bases={"2022": "bf"}) is None

    def test_data_request_as_command_without_reading_is_sent_back(self):
        """TK11b: "üçgenini ver" emir kipinde; okumadan tablo uydurdu."""
        out = self._nudge("Hasar/prim oranı üçgenini ver.", "| 2019 | 84.5% |")
        assert out and "get_ilr_triangle" in out


class TestRound5Guards:
    def test_compute_command_is_not_a_false_claim(self):
        """TK04: "hesapla" → compute_discount çalıştı; "uygulandı" demek yalan değil."""
        from app.agent.loop import _guard_nudge
        out = _guard_nudge([{"role": "user", "content": "İskontolu yükümlülüğü %30 sabit oranla hesapla."}],
                           "%30 sabit iskonto uygulandı: -123,760,430 TL (negatif)",
                           [{"name": "compute_discount", "output": {"discount_amount": -42423218.0}}], [], "")
        assert out is None

    def test_sign_guard_only_judges_ibnr_values(self):
        from app.agent.loop import _guard_nudge
        tools = [{"name": "get_analysis_state", "output": {"discount_amount": -42423218.0,
                                                           "per_origin": [{"ibnr": -161904753.0}]}}]
        q = [{"role": "user", "content": "Durum nedir?"}]
        assert _guard_nudge(q, "İskonto tutarı 42,423,218 TL", tools, [], "") is None
        assert "eksi" in _guard_nudge(q, "2025 IBNR 161,904,753 TL", tools, [], "")

    def test_false_claim_forces_a_write_and_drops_the_claim(self):
        """AG05: geri çevrilince aynı "temizledim" cevabını tekrarlıyordu."""
        c = ScriptedClient([{"content": "Tüm elemeleri kaldırdım.", "tool_calls": []},
                            {"content": None, "tool_calls": [ToolCall("w", "clear_exclusions", {})]},
                            {"content": "Temizlendi.", "tool_calls": []}])
        res = run_agent_turn(c, [{"role": "user", "content": "Tüm elemeleri temizle."}], _payload())
        assert c.choices[:2] == ["auto", "required"]
        assert not any(m.get("content") == "Tüm elemeleri kaldırdım." for m in c.seen[1])
        assert [a["type"] for a in res.actions] == ["clear_exclusions"]

    def test_synthetic_read_matches_the_question(self):
        from app.agent.loop import _synthetic_read_tool
        assert _synthetic_read_tool([{"role": "user", "content": "Hasar/prim oranı üçgenini ver."}]) == "get_ilr_triangle"
        assert _synthetic_read_tool([{"role": "user", "content": "2024 IBNR ne?"}]) == "get_analysis_state"


class TestCompactContext:
    """Kompakt bağlam: çağrı başına sabit yükü küçültür, davranışı korur."""

    def _sizes(self, compact, text="2023 için loss ratio'yu %30 yap", active=None, history=None):
        c = ToolCapturingClient()
        payload = {**_payload(), "cashflow": {"session_state": None}, "discount": {"session_state": None},
                   "data": {"session_state": None}}
        run_agent_turn(c, [{"role": "user", "content": text}], payload, compact=compact,
                       active_module=active, full_history=history)
        system = c.seen[0][0]["content"]
        names = [t["function"]["name"] for t in c.tools_seen[0]]
        return len(system), names, c

    def test_compact_prompt_is_much_smaller(self):
        full, full_tools, _ = self._sizes(False)
        small, small_tools, _ = self._sizes(True)
        assert small < full * 0.6
        assert "get_app_guide" in small_tools and "get_app_guide" not in full_tools

    def test_mentioned_module_tools_are_offered(self):
        _, names, _ = self._sizes(True, "İskontolu yükümlülüğü %30 ile hesapla")
        assert "compute_discount" in names

    def test_active_tab_decides_the_module(self):
        _, names, _ = self._sizes(True, "durum nedir", active="cashflow")
        assert "get_cashflow_ldf_state" in names

    def test_old_tool_outputs_are_trimmed(self):
        big = "x" * 5000
        hist = [{"role": "user", "content": "oku"},
                {"role": "assistant", "content": None, "tool_calls": [
                    {"id": "t1", "type": "function", "function": {"name": "get_analysis_state", "arguments": "{}"}}]},
                {"role": "tool", "tool_call_id": "t1", "content": big}]
        _, _, c = self._sizes(True, "2023 IBNR ne?", history=hist)
        tool_msgs = [m for m in c.seen[0] if m.get("role") == "tool"]
        assert tool_msgs and len(tool_msgs[0]["content"]) < 600

    def test_guide_tool_returns_the_guide(self):
        c = ScriptedClient([{"content": None, "tool_calls": [ToolCall("g", "get_app_guide", {})]},
                            {"content": "Pro plan ₺100/ay.", "tool_calls": []}])
        res = run_agent_turn(c, [{"role": "user", "content": "Pro plan ne kadar?"}], _payload(), compact=True)
        assert "Pro plan" in json.dumps(res.tool_invocations[0]["output"], ensure_ascii=False)


def test_command_answered_with_a_simulation_is_sent_back():
    """"BF oranını %40 yap" → yalnız simulate_bf; uygulanmadı."""
    from app.agent.loop import _guard_nudge
    out = _guard_nudge([{"role": "user", "content": "2023 kaza yılının BF oranını %40 yap"}],
                       "%40 olarak ayarlandıysa IBNR -8,2M olur.",
                       [{"name": "simulate_bf", "output": {}}], [], "")
    assert out and "set_selected_loss_ratio" in out
    q = _guard_nudge([{"role": "user", "content": "2023'ün BF oranını %40 yapsak ne olur?"}],
                     "2023 IBNR -8,2M olur.", [{"name": "simulate_bf", "output": {}}], [], "")
    assert q is None


def test_apply_command_does_not_offer_simulation_tools():
    c = ToolCapturingClient()
    run_agent_turn(c, [{"role": "user", "content": "2023 kaza yılının BF oranını %40 yap"}], _payload())
    names = {t["function"]["name"] for t in c.tools_seen[0]}
    assert "simulate_bf" not in names and "set_selected_loss_ratio" in names
    c = ToolCapturingClient()
    run_agent_turn(c, [{"role": "user", "content": "2023 için %40 BF senaryosunu simüle et"}], _payload())
    assert "simulate_bf" in {t["function"]["name"] for t in c.tools_seen[0]}


def test_formula_scenario_requires_reading_the_state_first():
    """TK01: okumadan origin tahmin edip simulate_bf_formula çağırmak reddedilir."""
    c = ScriptedClient([
        {"content": None, "tool_calls": [ToolCall("s1", "simulate_bf_formula", {"formula": "vw(2021:2023)"})]},
        {"content": None, "tool_calls": [ToolCall("r1", "get_analysis_state", {})]},
        {"content": None, "tool_calls": [ToolCall("s2", "simulate_bf_formula", {"formula": "vw(2021:2023)"})]},
        {"content": "2023 IBNR değişimi …", "tool_calls": []},
    ])
    res = run_agent_turn(c, [{"role": "user", "content": "vw(2021:2023) uygularsak 2023 IBNR nasıl değişir?"}], _payload())
    outs = [t["output"] for t in res.tool_invocations]
    assert "get_analysis_state" in outs[0]["error"]
    assert "error" not in outs[2] or "get_analysis_state" not in str(outs[2].get("error"))


def test_unknown_branch_id_lists_the_valid_ones():
    ss = {"periods": [{"id": "p2", "label": "2026Q2", "branches": [{"id": "p2-eng", "name": "ENGINEERING"}]}]}
    out = dispatch_tool("get_branch_state", {"branch_id": "ENGINEERING#yanlış"}, session_state=ss)
    assert out["valid_branches"] == [{"branch_id": "p2-eng", "name": "ENGINEERING", "period": "2026Q2"}]
