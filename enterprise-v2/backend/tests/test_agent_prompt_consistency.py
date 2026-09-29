"""Prompt ile araç kataloğu tutarlılığı.

NEDEN: Prompt'ta bir araç tanıtılıp TOOL_SCHEMAS'a eklenmezse model onu
çağırmaya kalkar ve "Tool bulunamadı" alır — tur boşa gider, kullanıcı
cevapsız kalır. Bu sessizce olur: ne derleme ne test hata verir, çünkü
prompt sadece bir string.

Tersi de tuzak: araç var ama hiçbir prompt'ta anılmıyorsa model onu
yalnızca şema listesinden keşfedebilir; davranış kuralları olmadan yanlış
bağlamda çağırabilir.
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.loop import GLOBAL_PROMPT
from app.agent.modules import get_modules
from app.agent.tools import TOOL_SCHEMAS

REAL = {s["function"]["name"] for s in TOOL_SCHEMAS}


def _all_prompts() -> str:
    parts = [GLOBAL_PROMPT]
    parts += [m.system_prompt for m in get_modules(None)]
    return "\n".join(parts)


# Prompt'ta `ad(` biçiminde geçen ve araç adına benzeyen (snake_case) sözcükler.
# Alan adları ve formül işlevleri (vw, avg, sum_cl…) araç değildir; araç
# adlandırma deseni fiil_nesne olduğu için bilinen fiil öneklerine bakıyoruz.
_VERBS = ("get_", "set_", "list_", "run_", "simulate_", "exclude_", "include_",
          "clear_", "reset_", "create_", "switch_", "select_", "describe_",
          "navigate_", "load_", "roll_", "average_", "ask_", "compute_")


def _tool_like_mentions(text: str) -> set[str]:
    hits = set(re.findall(r"\b([a-z][a-z0-9_]{3,})\s*\(", text))
    return {h for h in hits if h.startswith(_VERBS)}


def test_no_ghost_tools_in_prompts():
    """Prompt'un tanıttığı her araç gerçekten var olmalı."""
    ghosts = sorted(_tool_like_mentions(_all_prompts()) - REAL)
    assert not ghosts, (
        "Prompt var olmayan araç tanıtıyor; model çağırıp hata alacak: "
        + ", ".join(ghosts)
    )


def test_write_tools_are_documented():
    """Model durumu DEĞİŞTİREN araçları kör kullanmamalı.

    Yazma araçları en az bir prompt'ta anılmalı — şema tek başına ne zaman
    kullanılacağını söylemiyor, kural prompt'ta yaşıyor.
    """
    prompts = _all_prompts()
    writes = {n for n in REAL if n.startswith(("set_", "exclude_", "include_", "clear_", "reset_"))}

    def documented(n: str) -> bool:
        if n in prompts:
            return True
        # Toplu sürümler kendi kendini anlatır: açıklaması tekil aracı işaret
        # eder ("set_premium toplu versiyonu"), tekil araç da prompt'ta.
        for base in (n[: -len("_bulk")] if n.endswith("_bulk") else None, n.rstrip("s")):
            if base and base != n and base in prompts and base in REAL:
                return True
        return False

    missing = sorted(n for n in writes if not documented(n))
    assert not missing, f"prompt'ta hiç anılmayan yazma araçları: {missing}"


def test_prompt_does_not_hide_enum_options():
    """Prompt, aracın sunduğu seçenekleri gizlememeli.

    Regresyon: LDF bölümü "Tek metod: hacim ağırlıklı" diyordu, oysa
    set_method üç yöntem sunuyor ve üçü de uçtan uca çalışıyor. Model kendi
    talimatına uyup simple/geometric isteğini reddediyordu.
    """
    prompts = _all_prompts()
    watched = {"set_method", "set_window", "set_karma_window"}
    missing: list[str] = []
    for s in TOOL_SCHEMAS:
        f = s["function"]
        if f["name"] not in watched:
            continue
        for pname, spec in f.get("parameters", {}).get("properties", {}).items():
            for val in spec.get("enum", []):
                if str(val) not in prompts:
                    missing.append(f"{f['name']}.{pname}={val}")
    assert not missing, f"prompt'ta geçmeyen seçenekler: {missing}"


def test_every_tool_has_description():
    empty = [s["function"]["name"] for s in TOOL_SCHEMAS if not s["function"].get("description", "").strip()]
    assert not empty, f"açıklamasız araç: {empty}"
