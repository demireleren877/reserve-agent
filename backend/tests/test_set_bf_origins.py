"""set_bf_origins — BF yılları + CL dönüşü + LR tek çağrıda.

Qwen 3.5 9B "sadece son kaza yılına son 4 yılın ağırlıklı ortalamasını kullanan
BF, gerisi DFM" komutunu üç araca bölerken yıl aralığını yanlış hesapladı
(vw(2024:2025)), CL dönüşünü unuttu ya da hiçbir şey yapmadı.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.tools import dispatch_tool

ACTIVE = {"active": {"branch_id": "b1", "branch_name": "FIRE"}}
SS = {**ACTIVE, "per_origin": [{"origin": str(y), "basis": "bf" if y >= 2023 else "cl"} for y in range(2015, 2026)]}


def _actions(out):
    return {a["type"]: a["payload"]["items"] for a in out.get("_actions", [])}


def test_only_last_year_bf_rest_cl_with_last_four_weighted():
    out = dispatch_tool("set_bf_origins", {"origins": ["2025"], "lr_last_n": 4}, session_state=SS)
    acts = _actions(out)
    # 2025 zaten BF → yalnız 2023, 2024 CL'ye döner
    assert acts["set_basis_bulk"] == [{"origin": "2023", "basis": "cl"}, {"origin": "2024", "basis": "cl"}]
    # aralığı araç hesaplar: 2025'ten ÖNCEKİ 4 yıl
    assert acts["set_selected_loss_ratios"] == [{"origin": "2025", "formula": "vw(2021:2024)"}]


def test_basis_only_when_no_rate_given():
    out = dispatch_tool("set_bf_origins", {"origins": ["2022"]}, session_state=SS)
    acts = _actions(out)
    assert {"origin": "2022", "basis": "bf"} in acts["set_basis_bulk"]
    assert "set_selected_loss_ratios" not in acts


def test_keep_other_bf_years_when_asked():
    out = dispatch_tool("set_bf_origins", {"origins": ["2022"], "others_to_cl": False}, session_state=SS)
    assert _actions(out)["set_basis_bulk"] == [{"origin": "2022", "basis": "bf"}]


def test_nothing_to_do_is_said_plainly():
    ss = {**ACTIVE, "per_origin": [{"origin": "2024", "basis": "cl"}, {"origin": "2025", "basis": "bf"}]}
    out = dispatch_tool("set_bf_origins", {"origins": ["2025"]}, session_state=ss)
    assert "_actions" not in out and "Değişiklik gerekmedi" in out["note"]


def test_unknown_year_and_short_history_are_errors():
    assert "Bilinmeyen" in dispatch_tool("set_bf_origins", {"origins": ["2031"]}, session_state=SS)["error"]
    assert "öncesinde 4" in dispatch_tool("set_bf_origins", {"origins": ["2016"], "lr_last_n": 4}, session_state=SS)["error"]


def test_loop_applies_both_actions():
    from app.agent.client import ToolCall
    from app.agent.loop import run_agent_turn
    from tests.test_agent_loop_robustness import ScriptedClient, _payload
    payload = _payload()
    payload["reserve"]["session_state"] = {**payload["reserve"].get("session_state", {}), **SS,
                                           "active": {"branch_id": "b1", "branch_name": "FIRE"}}
    client = ScriptedClient([
        {"content": None, "tool_calls": [ToolCall("c1", "set_bf_origins", {"origins": ["2025"], "lr_last_n": 4})]},
        {"content": "Uygulandı.", "tool_calls": []},
    ])
    res = run_agent_turn(client, [{"role": "user", "content": "sadece 2025 BF, son 4 yılın ağırlıklı ortalamasıyla, gerisi DFM"}], payload)
    assert [a["type"] for a in res.actions] == ["set_basis_bulk", "set_selected_loss_ratios"]
