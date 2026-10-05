#!/usr/bin/env python3
"""Aktüerya yönetmeni gözüyle kapsamlı agent değerlendirmesi.

CANLI bir LLM gerektirir (pytest ile koşmaz — ayrı çalıştırılır):

    python tests/agent_eval/run_eval.py \
        --base-url http://192.168.1.112:1234/v1 --model qwen/qwen3.5-9b

Uzak sağlayıcı da olur — Anthropic'in OpenAI-uyumlu ucu:

    ANTHROPIC_API_KEY=... python tests/agent_eval/run_eval.py \
        --base-url https://api.anthropic.com/v1 --model claude-haiku-4-5-20251001

Sorular gerçek bir rezerv aktüerinin soracağı sırada ve dilde yazıldı:
durum tespiti → tek değer → kırılım → dönemsel gelişim → çapraz branş →
varsayım denetimi → senaryo → veri kalitesi → tuzak. Her cevap, fixture'dan
BAĞIMSIZ hesaplanan doğru değerle karşılaştırılır.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.agent.client import AgentClient


class RetryingClient:
    """Geçici sağlayıcı hatalarında (429, 5xx) geri çekilerek yeniden dener.

    Pilotta bir senaryo DeepInfra'nın "temporarily rate-limited upstream"
    429'uyla çöktü ve rapor bunu ajan hatası gibi gösterdi. Sağlayıcının
    anlık kapasitesi ajanın davranışı değil; ama gizlenmesin diye yeniden
    deneme sayısı rapora yazılır.
    """

    TRANSIENT = ("LLM 429", "LLM 500", "LLM 502", "LLM 503", "LLM 504", "timed out", "ReadTimeout")

    def __init__(self, inner: AgentClient, attempts: int = 6) -> None:
        self.inner = inner
        self.attempts = attempts
        self.retries = 0

    def chat(self, messages, tools, tool_choice="auto"):
        # Zorunlu çağrı başarısızsa döngü zaten normal çağrıya düşüyor; burada
        # tekrar denemek takılan bir çağrıyı katlar (D3: 1360 sn).
        attempts = 1 if tool_choice == "required" else self.attempts
        for i in range(attempts):
            try:
                return self.inner.chat(messages=messages, tools=tools, tool_choice=tool_choice)
            except Exception as e:  # noqa: BLE001
                msg = f"{type(e).__name__}: {e}"
                if i == attempts - 1 or not any(t in msg for t in self.TRANSIENT):
                    raise
                self.retries += 1
                time.sleep(min(60, 5 * 2 ** i))
from app.agent.loop import run_agent_turn
from tests.agent_eval.cases import build_cases
from tests.agent_eval.checks import evaluate
from tests.agent_eval.fixture import (
    BRANCHES, build_project, cashflow_session_state, data_session_state,
    discount_session_state, session_state_for, triangle_payload,
)



def _label(case: dict) -> str:
    """Rapor satırında gösterilecek metin — çok turluysa turları birleştir."""
    turns = case.get("turns")
    return " ⟶ ".join(turns) if turns else case["q"]


def run_case(client, case: dict, payload: dict, max_iterations: int) -> dict:
    """Bir senaryoyu koştur; çok turluysa geçmişi taşı.

    Dönen sözlük TÜM turların birleşimidir (araçlar, aksiyonlar) ama cevap
    son turunkidir — ölçütler böyle yazıldı: "şunu yap, sonra söyle" gibi
    senaryolarda son söz kullanıcıya giden cevaptır.
    """
    turns = case.get("turns") or [case["q"]]
    history: list[dict] = []
    convo: list[dict] = []
    tools: list[str] = []
    actions: list[str] = []
    answer, stop = "", "final"

    for text in turns:
        convo.append({"role": "user", "content": text})
        res = run_agent_turn(
            client, convo, payload,
            max_iterations=max_iterations,
            full_history=history or None,
        )
        tools += [t["name"] for t in res.tool_invocations]
        actions += [a.get("type") for a in res.actions]
        answer, stop = res.assistant_message, res.stopped_reason
        history = list(history) + list(res.raw_additions)
        convo.append({"role": "assistant", "content": answer})
        if stop == "awaiting_input":
            break   # form bekliyor; sonraki turu göndermek anlamsız

    return {"answer": answer, "tools": tools, "actions": actions, "stop": stop}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.getenv("AGENT_BASE_URL", "http://localhost:1234/v1"))
    ap.add_argument("--model", default=os.getenv("AGENT_MODEL", "qwen/qwen3.5-9b"))
    ap.add_argument("--api-key", default=os.getenv("AGENT_API_KEY"),
                    help="uzak sağlayıcı için anahtar; lokal sunucularda gereksiz")
    ap.add_argument("--api-format", default="openai", choices=["openai", "ollama_chat", "ollama_generate"],
                    help="Ollama biçimlerinde --base-url TAM uç adresidir (…/api/chat, …/api/generate)")
    ap.add_argument("--reasoning-effort",
                    help="OpenAI biçimli reasoning_effort (LM Studio: 'none' düşünmeyi kapatır, ~17x hızlı)")
    ap.add_argument("--no-reasoning", action="store_true",
                    help="OpenRouter: düşünme kipini kapat (LM Studio koşularıyla karşılaştırılabilir olsun)")
    ap.add_argument("--provider",
                    help="OpenRouter: yalnız bu sağlayıcı(lar), virgülle; yedeğe düşme kapalı. "
                         "Sağlayıcılar farklı sayısallaştırma kullanıyor — sabitlenmezse ölçüm "
                         "modeli değil sağlayıcı karışımını ölçer.")
    ap.add_argument("--max-iterations", type=int, default=6)
    ap.add_argument("--only", help="yalnız bu kategori")
    ap.add_argument("--ids", help="yalnız bu soru id'leri (virgülle)")
    ap.add_argument("--timeout", type=float, default=120.0,
                    help="tek LLM çağrısı için saniye (kaçak zinciri erken kes)")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    project = build_project()
    ss = session_state_for(project)
    payload = {
        "reserve": {
            "triangle": triangle_payload(project["active_branch"]["_triangle"]),
            "session_state": ss,
        },
        "cashflow": {"session_state": cashflow_session_state(project)},
        "discount": {"session_state": discount_session_state(project)},
        "data": {"session_state": data_session_state(project)},
    }
    # Anthropic'in OpenAI-uyumlu ucu aynı istemciyle çalışır (Bearer +
    # /chat/completions), o yüzden ayrı sağlayıcı koduna gerek yok. Anahtar
    # bayrakla ya da ANTHROPIC_API_KEY/AGENT_API_KEY ile gelir.
    key = a.api_key or os.getenv("OPENROUTER_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or "local"
    extra: dict = {}
    if a.no_reasoning:
        extra["reasoning"] = {"enabled": False}
    if a.reasoning_effort:
        extra["reasoning_effort"] = a.reasoning_effort
    if a.provider:
        extra["provider"] = {"order": [p.strip() for p in a.provider.split(",")], "allow_fallbacks": False}
    client = RetryingClient(AgentClient(model=a.model, base_url=a.base_url, api_key=key,
                                        timeout=a.timeout, extra_body=extra, api_format=a.api_format))

    cases = build_cases(project)
    if a.only:
        cases = [c for c in cases if c["kat"] == a.only]
    if a.ids:
        want = {x.strip().upper() for x in a.ids.split(",")}
        cases = [c for c in cases if c["id"].upper() in want]

    print(f"model: {a.model}  ·  {len(cases)} senaryo\n" + "=" * 92, flush=True)
    passed, results, t_all = 0, [], time.time()
    for c in cases:
        t0 = time.time()
        try:
            out = run_case(client, c, payload, a.max_iterations)
        except Exception as e:
            out = {"answer": "", "tools": [], "actions": [], "stop": "error"}
            print(f"  {c['id']} ÇÖKTÜ: {type(e).__name__}: {str(e)[:120]}", flush=True)
        answer, tools = out["answer"], out["tools"]
        ok, problems = evaluate(c, out)
        passed += ok
        dt = time.time() - t0
        results.append((c, ok, problems, answer, tools, dt))
        print(f"[{'GEÇTİ' if ok else 'KALDI'}] {c['id']:<4} {c['kat']:<13} {dt:>5.1f}s  {_label(c)[:52]}", flush=True)
        for p in problems:
            print(f"          → {p}", flush=True)
        if a.verbose and answer:
            print(f"          « {answer[:200].replace(chr(10),' ')}")

    print("=" * 92)
    print(f"SONUÇ: {passed}/{len(cases)} geçti  ·  {time.time()-t_all:.0f} sn"
          f"  ·  geçici sağlayıcı hatası nedeniyle yeniden deneme: {client.retries}")
    by: dict[str, list[int]] = {}
    for c, ok, *_ in results:
        by.setdefault(c["kat"], [0, 0])
        by[c["kat"]][0] += ok
        by[c["kat"]][1] += 1
    for k, (p, n) in sorted(by.items()):
        print(f"   {k:<14} {p}/{n}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
