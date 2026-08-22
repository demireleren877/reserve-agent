#!/usr/bin/env python3
"""Aktüerya yönetmeni gözüyle kapsamlı agent değerlendirmesi.

CANLI bir LLM gerektirir (pytest ile koşmaz — ayrı çalıştırılır):

    python tests/agent_eval/run_eval.py \
        --base-url http://192.168.1.112:1234/v1 --model qwen/qwen3.5-9b

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
from app.agent.loop import run_agent_turn
from tests.agent_eval.checks import evaluate
from tests.agent_eval.fixture import (
    BRANCHES, build_project, cashflow_session_state, discount_session_state,
    session_state_for, triangle_payload,
)


def build_cases(project: dict) -> list[dict]:
    per = {p["label"]: p for p in project["periods"]}
    q2f = per["2026Q2"]["branches"][0]
    q2e = per["2026Q2"]["branches"][1]
    q1f = per["2026Q1"]["branches"][0]

    ibnr_q2 = q2f["totals"]["ibnr"]
    ibnr_q1 = q1f["totals"]["ibnr"]
    ult_q2 = q2f["totals"]["selected_ultimate"]
    eng_ibnr = q2e["totals"]["ibnr"]
    rows = {r["origin"]: r for r in q2f["per_origin"]}
    bf_origins = sorted(r["origin"] for r in q2f["per_origin"] if r["basis"] == "bf")
    grand_ibnr = sum(b["totals"]["ibnr"] for p in project["periods"] for b in p["branches"])

    # "2024 LR %25 olsaydı" senaryosunun DOĞRU cevabı — BF formülünün aynısı:
    #   BF_ult_annual = exposure_annual × LR × (1 − geliştirilmiş oran) + latest
    _r24 = rows["2024"]
    _bf_annual = _r24["premium_annual"] * 0.25 * (1 - _r24["pct_developed"]) + _r24["latest"]
    _bf = _bf_annual / _r24["correction"] if _r24["correction"] else _bf_annual
    bf_2024_at_25 = _bf - _r24["latest"]   # IBNR

    READ = ["get_analysis_state", "get_branch_state", "list_project"]

    return [
        # ── 1. Durum tespiti ────────────────────────────────────────────────
        dict(id="G1", kat="genel", q="Merhaba, elimizde hangi branşlar ve hangi dönemler var?",
             expect_tools=["list_project"],
             expect_text=["fire", "engineering", "2026q1", "2026q2"],
             forbid_text=["kasko", "trafik"]),
        dict(id="G2", kat="genel", q="Şu an hangi branş ve dönem üzerinde çalışıyorum?",
             expect_text=["fire", "2026q2"], forbid_text=["kasko"]),
        dict(id="G3", kat="genel", q="Bu branşta model hangi yöntemle kurulmuş, kısaca özetler misin?",
             expect_tools=READ, expect_text=["volume"]),

        # ── 2. Tek değer ────────────────────────────────────────────────────
        dict(id="T1", kat="tek-değer", q="Toplam IBNR ne kadar?",
             expect_tools=READ, expect_numbers=[ibnr_q2]),
        dict(id="T2", kat="tek-değer", q="Seçilmiş ultimate toplamı kaç?",
             expect_tools=READ, expect_numbers=[ult_q2]),
        dict(id="T3", kat="tek-değer", q="IBNR neden negatif çıkıyor, kısaca açıkla.",
             # Kavramsal soru — araç şartı yersiz. Ölçüt MEKANİZMANIN doğru
             # anlatılması: latest (gerçekleşen) nihai tahmini aşıyor.
             expect_text=["latest"], expect_numbers=[]),

        # ── 3. Kırılım ──────────────────────────────────────────────────────
        dict(id="K1", kat="kırılım", q="2024 kaza yılının IBNR'ı ne kadar?",
             expect_tools=READ, expect_numbers=[rows["2024"]["ibnr"]]),
        dict(id="K2", kat="kırılım", q="2023 kaza yılının latest ve CDF değerleri neler?",
             expect_tools=READ,
             expect_numbers=[rows["2023"]["latest"], rows["2023"]["cdf"]], tol=0.05),
        dict(id="K3", kat="kırılım", q="Hangi kaza yılları BF basis'te, hangileri CL?",
             # Agent aralık yazabiliyor ("2023 – 2025"), tek tek de sayabiliyor;
             # ikisi de doğru. Aralığın UÇLARINI ve iki basis adını ara.
             expect_tools=READ,
             expect_text=[bf_origins[0], bf_origins[-1], "bf", "cl"]),
        dict(id="K4", kat="kırılım", q="En yüksek IBNR hangi kaza yılında?",
             expect_tools=READ),

        # ── 4. Dönemsel gelişim ─────────────────────────────────────────────
        dict(id="D1", kat="dönemsel", q="2026Q1'den 2026Q2'ye IBNR nasıl gelişti?",
             # Her iki dönemin branş bazlı IBNR'ı DURUM bloğunda var; araç
             # çağırmadan cevaplamak doğru ve hızlı. Ölçüt İKİ dönemin de
             # sayısının doğru verilmesi.
             expect_numbers=[ibnr_q1, ibnr_q2], tol=0.03),
        dict(id="D2", kat="dönemsel", q="2026Q1 dönemindeki FIRE branşının toplam IBNR'ı neydi?",
             # Bu rakam da DURUM bloğunda (dönem/branş × IBNR listesi). C3 ve D1
             # ile aynı gerekçe: araç çağırmadan cevaplamak doğru ve hızlı.
             expect_numbers=[ibnr_q1], tol=0.03),
        dict(id="D3", kat="dönemsel", q="İki dönem arasındaki ultimate değişimi ne kadar?",
             expect_tools=["get_branch_state", "list_project", "get_analysis_state"],
             expect_numbers=[], tol=0.05),

        # ── 5. Çapraz branş (aktif olmayan) ─────────────────────────────────
        dict(id="C1", kat="çapraz-branş", q="ENGINEERING branşının IBNR'ı ne kadar?",
             # Bu branşın IBNR'ı da DURUM bloğunda (her branş IBNR'ıyla listeli).
             # C3/D1/D2 ile aynı gerekçe: ölçüt araç değil, SAYININ doğruluğu —
             # yanlış branşın rakamını verirse burada yakalanır.
             expect_numbers=[eng_ibnr], tol=0.03),
        dict(id="C2", kat="çapraz-branş", q="İki branşı IBNR açısından karşılaştır.",
             expect_tools=["get_branch_state", "list_project"],
             expect_numbers=[ibnr_q2, eng_ibnr], tol=0.03),
        dict(id="C3", kat="çapraz-branş", q="Tüm branşların toplam IBNR'ı nedir?",
             # Bu rakam DURUM bloğunda zaten var; araç çağırmadan cevaplamak
             # doğru ve hızlı. Ölçüt toplamın doğruluğu.
             expect_numbers=[grand_ibnr], tol=0.02),

        # ── 6. Varsayım denetimi ────────────────────────────────────────────
        dict(id="V1", kat="varsayım", q="Kuyruk nereden kesildi, hangi CDF override'ları var?",
             expect_tools=READ, expect_text=["8"]),
        dict(id="V2", kat="varsayım", q="Correction nerede uygulanmış ve neden?",
             expect_tools=READ, expect_text=["2025"]),
        dict(id="V3", kat="varsayım", q="Kaç hücre elendi, hangileri?",
             expect_tools=READ, expect_numbers=[2], tol=0.01),
        dict(id="V4", kat="varsayım", q="LDF hesabında hangi volume seçili?",
             expect_tools=READ, expect_text=["all"]),
        dict(id="V5", kat="varsayım", q="BF kullanılan yerlerde hangi loss ratio kullanılıyor?",
             expect_tools=READ, expect_text=bf_origins[:1]),

        # ── 7. Senaryo ──────────────────────────────────────────────────────
        dict(id="S1", kat="senaryo", q="2024 için loss ratio %25 olsaydı IBNR ne olurdu?",
             # İki araç da meşru: simulate_bf_formula açıklamasında '75%' gibi
             # sabit oranları da kabul ettiğini ve simulate_bf'yi kapsadığını
             # söylüyor. Ölçüt araç değil, SAYI.
             expect_tools=["simulate_bf", "simulate_bf_formula"],
             expect_numbers=[bf_2024_at_25], tol=0.03),
        dict(id="S2", kat="senaryo", q="BF oranına vw(2021:2023) uygulasak ne değişir?",
             expect_tools=["simulate_bf_formula", "get_analysis_state"],
             forbid_text=["fark yok", "değişmez"]),
        dict(id="S3", kat="senaryo", q="2024 kaza yılının primini 300 milyon yap.",
             expect_tools=["set_premium"]),

        # ── 8. Diğer modüller ───────────────────────────────────────────────
        dict(id="M1", kat="modül", q="Nakit akışı deseni hangi branşlarda hazır?",
             expect_tools=["get_cashflow_state", "get_cashflow_pattern_state"],
             expect_text=["fire"]),
        dict(id="M2", kat="modül", q="İskonto modülünde aktif branşın unpaid liability'si ne kadar?",
             expect_tools=["get_discount_state", "compute_discount"],
             expect_numbers=[q2f["totals"]["latest"] + q2f["totals"]["ibnr"]], tol=0.03),

        # ── 9. Tuzak: uydurmamalı ───────────────────────────────────────────
        dict(id="X1", kat="tuzak", q="Kasko branşının IBNR'ı ne kadar?",
             forbid_text=["kasko branşının ibnr'ı", "kasko için toplam ibnr"]),
        dict(id="X2", kat="tuzak", q="2019Q3 dönemindeki rezerv ne kadardı?",
             forbid_text=["2019q3 döneminde toplam"]),
        dict(id="X3", kat="tuzak", q="Bu branşta dosya bazlı en büyük hasar hangisi?",
             forbid_tools=[]),
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.getenv("AGENT_BASE_URL", "http://localhost:1234/v1"))
    ap.add_argument("--model", default=os.getenv("AGENT_MODEL", "qwen/qwen3.5-9b"))
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
    }
    client = AgentClient(model=a.model, base_url=a.base_url, api_key="local",
                         timeout=a.timeout)

    cases = build_cases(project)
    if a.only:
        cases = [c for c in cases if c["kat"] == a.only]
    if a.ids:
        want = {x.strip().upper() for x in a.ids.split(",")}
        cases = [c for c in cases if c["id"].upper() in want]

    print(f"model: {a.model}  ·  {len(cases)} soru\n" + "=" * 92)
    passed, results, t_all = 0, [], time.time()
    for c in cases:
        t0 = time.time()
        try:
            res = run_agent_turn(client, [{"role": "user", "content": c["q"]}],
                                 payload, max_iterations=a.max_iterations)
            answer, tools = res.assistant_message, [t["name"] for t in res.tool_invocations]
        except Exception as e:
            answer, tools = "", []
            print(f"  {c['id']} ÇÖKTÜ: {type(e).__name__}: {str(e)[:120]}")
        ok, problems = evaluate(c, answer, tools)
        passed += ok
        dt = time.time() - t0
        results.append((c, ok, problems, answer, tools, dt))
        print(f"[{'GEÇTİ' if ok else 'KALDI'}] {c['id']:<4} {c['kat']:<13} {dt:>5.1f}s  {c['q'][:52]}", flush=True)
        for p in problems:
            print(f"          → {p}", flush=True)
        if a.verbose and answer:
            print(f"          « {answer[:200].replace(chr(10),' ')}")

    print("=" * 92)
    print(f"SONUÇ: {passed}/{len(cases)} geçti  ·  {time.time()-t_all:.0f} sn")
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
