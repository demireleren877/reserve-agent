"""Gerçek veriden, bir rezerv aktüerinin gerçekten karşılaşacağı proje durumu.

data/paid.xlsx + os.xlsx gerçek çeyreklik üçgenlerdir (26 kaza yılı × 104
gelişim çeyreği). Buradan iki dönem (2026Q1, 2026Q2) ve iki branş kurulur;
Q1, Q2'nin bir çeyrek geri alınmış hâlidir — yani dönemsel gelişim (Q1→Q2
IBNR hareketi) sorularının doğru cevabı hesaplanabilir.

Tüm sayılar burada üretilir ve değerlendirmede DOĞRU CEVAP olarak kullanılır;
agent'ın söylediğiyle karşılaştırılır.
"""

from __future__ import annotations

import os
from typing import Any

from app.core.excel_parser import ParseOptions, parse_triangle_from_excel
from app.core.ldf import LDFMethod, compute_ldfs
from app.core.triangle import Triangle, TriangleType

DATA_DIR = os.environ.get(
    "ACTUARIUS_DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "data"),
)

# Veride TEK gerçek branş var (Mapping 1 = FIRE AND OTHER DAMAGE / Mapping 2 =
# FIRE HOME, 4571 kayıt). İkinci branş çapraz-branş sorularını test edebilmek
# için ondan TÜRETİLİR (ölçeklenmiş) — üçgeni ve primi gerçek desenden gelir,
# ama gerçek bir portföy değildir.
BRANCHES = ["FIRE HOME", "ENGINEERING (türetilmiş)"]

# Gerçek kazanılmış prim dosyaları: kolonlar Brans / Accident Year / ep.
PREMIUM_FILES = {"2026Q2": "ep.xlsx", "2026Q1": "ep26q1.xlsx"}


def real_premiums(filename: str, brans: str = "FIRE HOME") -> dict[str, float]:
    """data/<filename> içinden kaza yılı → kazanılmış prim."""
    import openpyxl

    path = os.path.join(DATA_DIR, filename)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out: dict[str, float] = {}
    for row in wb.active.iter_rows(min_row=2, values_only=True):
        if not row or row[0] is None:
            continue
        if str(row[0]).strip().upper() != brans.upper():
            continue
        try:
            out[str(row[1]).strip()] = float(row[2] or 0)
        except (TypeError, ValueError):
            continue
    return out


def _load(name: str) -> Triangle:
    path = os.path.join(DATA_DIR, name)
    with open(path, "rb") as fh:
        return parse_triangle_from_excel(
            fh.read(), ParseOptions(triangle_type=TriangleType.PAID)
        )[0]


def _incurred() -> Triangle:
    paid, os_ = _load("paid.xlsx"), _load("os.xlsx")
    values = [
        [None if p is None else float(p) + float(o or 0.0) for p, o in zip(pr, orow)]
        for pr, orow in zip(paid.values, os_.values)
    ]
    return Triangle(
        origin_periods=paid.origin_periods,
        development_periods=paid.development_periods,
        values=values,
        triangle_type=TriangleType.INCURRED,
        origin_granularity=paid.origin_granularity,
        development_granularity=paid.development_granularity,
    )


def _scaled(tri: Triangle, factor: float) -> Triangle:
    """İkinci branş: aynı gelişim deseni, farklı hacim."""
    return Triangle(
        origin_periods=tri.origin_periods,
        development_periods=tri.development_periods,
        values=[[None if v is None else v * factor for v in row] for row in tri.values],
        triangle_type=tri.triangle_type,
        origin_granularity=tri.origin_granularity,
        development_granularity=tri.development_granularity,
    )


def _rolled_back(tri: Triangle) -> Triangle:
    """Bir önceki dönem: en son köşegen henüz yok."""
    values = []
    for i, row in enumerate(tri.values):
        last = max((j for j, v in enumerate(row) if v is not None), default=-1)
        values.append([None if j == last else v for j, v in enumerate(row)])
    return Triangle(
        origin_periods=tri.origin_periods,
        development_periods=tri.development_periods,
        values=values,
        triangle_type=tri.triangle_type,
        origin_granularity=tri.origin_granularity,
        development_granularity=tri.development_granularity,
    )


def cdfs_from(ldfs: list[float]) -> list[float]:
    out = [1.0] * (len(ldfs) + 1)
    acc = 1.0
    for j in range(len(ldfs) - 1, -1, -1):
        acc *= ldfs[j]
        out[j] = acc
    return out


def _latest(tri: Triangle, i: int) -> tuple[float, int]:
    last, idx = 0.0, 0
    for j, v in enumerate(tri.values[i]):
        if v is not None:
            last, idx = float(v), j
    return last, idx


def build_branch(
    branch_id: str,
    name: str,
    tri: Triangle,
    *,
    premiums: dict[str, float],
    bf_origins: set[str],
    corrections: dict[str, float] | None = None,
    cdf_overrides: dict[str, float] | None = None,
    excluded: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    corrections = corrections or {}
    cdf_overrides = cdf_overrides or {}
    ldfs = compute_ldfs(tri, method=LDFMethod.VOLUME_WEIGHTED)
    cdfs = cdfs_from(ldfs)
    # Kullanıcının kuyruk kesmesi: bu gelişim adımlarında CDF elle 1.0'a çekilmiş.
    for dev, val in cdf_overrides.items():
        idx = tri.development_periods.index(int(dev))
        cdfs[idx] = val

    rows: list[dict[str, Any]] = []
    tot = dict(
        latest=0.0, exposure_raw=0.0, exposure_annual=0.0, cl_ultimate=0.0,
        bf_ultimate=0.0, selected_ultimate=0.0, ibnr=0.0,
    )
    ctx_cl, ctx_exp, ctx_pat = {}, {}, {}

    for i, origin in enumerate(tri.origin_periods):
        latest, li = _latest(tri, i)
        cdf = cdfs[li] if li < len(cdfs) else 1.0
        cl = latest * cdf
        prem = float(premiums.get(origin, 0.0))
        k = float(corrections.get(origin, 1.0))
        pa = prem * k
        pct = latest / cl if cl > 0 else 1.0
        pattern = cl / pa if pa > 0 else 0.0
        bfa = pa * pattern * (1 - pct) + latest if pa > 0 else cl
        bf = bfa / k if k else bfa
        basis = "bf" if origin in bf_origins else "cl"
        sel = cl if basis == "cl" else bf
        rows.append(dict(
            origin=origin, latest=latest, premium=prem, premium_annual=pa,
            correction=k, cdf=cdf, cl_ultimate=cl, bf_ultimate=bf,
            bf_ultimate_annual=bfa, selected_ultimate=sel, ibnr=sel - latest,
            ulr=(sel / prem if prem > 0 else None), basis=basis,
            selected_lr=pattern, selected_lr_input=None, pct_developed=pct,
        ))
        ctx_cl[origin], ctx_exp[origin], ctx_pat[origin] = cl, pa, pattern
        tot["latest"] += latest
        tot["exposure_raw"] += prem
        tot["exposure_annual"] += pa
        tot["cl_ultimate"] += cl
        tot["bf_ultimate"] += bf
        tot["selected_ultimate"] += sel
        tot["ibnr"] += sel - latest

    return dict(
        id=branch_id, name=name, frequency="quarterly", is_active=False,
        has_triangle=True, method="volume_weighted", window="all",
        n_origins=len(rows), n_developments=tri.n_developments,
        triangle_type=tri.triangle_type.value,
        origin_first=tri.origin_periods[0], origin_last=tri.origin_periods[-1],
        per_origin=rows, selected_ldfs=ldfs, effective_cdfs=cdfs, totals=tot,
        excluded_cells=excluded or [],
        formula_context=dict(cl_ult=ctx_cl, exposure=ctx_exp, pattern=ctx_pat),
        curve_state=dict(
            development_periods=[str(d) for d in tri.development_periods],
            effective_cdfs=cdfs,
            choices=[
                {"dev_period": str(d),
                 "choice": "user" if str(d) in cdf_overrides else "initial",
                 "user_value": cdf_overrides.get(str(d))}
                for d in tri.development_periods
            ],
            has_overrides=bool(cdf_overrides),
        ),
        _triangle=tri,
    )


def build_project() -> dict[str, Any]:
    """İki dönem × iki branş. Aktif: 2026Q2 / FIRE."""
    q2 = _incurred()
    q1 = _rolled_back(q2)
    # Ödenmiş üçgen modelle aynı kesimde: iskontolanan ödenmemiş tutar
    # nihai − ödenmiş (muallak + IBNR) olarak hesaplansın diye.
    p2 = _load("paid.xlsx")
    p1 = _rolled_back(p2)

    spec = [
        ("2026Q2", "p2", q2, p2),
        ("2026Q1", "p1", q1, p1),
    ]
    periods = []
    for label, pid, tri, paid in spec:
        prem = real_premiums(PREMIUM_FILES[label])
        fire = build_branch(
            f"{pid}-fire", BRANCHES[0], tri,
            premiums=prem,
            bf_origins={"2023", "2024", "2025"},
            corrections={"2025": 4.0},
            cdf_overrides={"8": 1.0, "9": 1.0},
            excluded=[{"origin": "2017", "step": 0}, {"origin": "2018", "step": 1}],
        )
        eng = build_branch(
            f"{pid}-eng", BRANCHES[1], _scaled(tri, 0.35),
            premiums={k: v * 0.35 for k, v in prem.items()},
            bf_origins={"2024", "2025"},
        )
        fire["_paid"] = paid
        eng["_paid"] = _scaled(paid, 0.35)
        periods.append(dict(id=pid, label=label, branches=[fire, eng]))

    active_branch = periods[0]["branches"][0]
    active_branch["is_active"] = True

    all_tot = dict(ibnr=0.0, selected_ultimate=0.0, latest=0.0)
    for p in periods:
        for b in p["branches"]:
            for k in ("ibnr", "selected_ultimate", "latest"):
                all_tot[k] += b["totals"][k]

    # Bridge'in gerçekte gönderdiği alanlar. Eskiden fixture bunları hiç
    # doldurmuyordu; durum bloğu "0 branş" yazıyor ve dönem bazlı toplamlar
    # görünmüyordu — yani eval, üretimdeki bloğu test etmiyordu.
    all_tot["branch_count"] = sum(len(p["branches"]) for p in periods)
    all_tot["branch_with_data_count"] = all_tot["branch_count"]
    all_tot["grand_total_ibnr"] = all_tot["ibnr"]
    all_tot["per_period_ibnr"] = [
        dict(period_id=p["id"], label=p["label"],
             ibnr=sum(b["totals"]["ibnr"] for b in p["branches"]),
             branch_count=len(p["branches"]))
        for p in periods
    ]
    _active_pid = periods[0]["id"]
    all_tot["active_period_id"] = _active_pid
    all_tot["active_period_ibnr"] = next(
        r["ibnr"] for r in all_tot["per_period_ibnr"] if r["period_id"] == _active_pid
    )

    return dict(periods=periods, active_branch=active_branch,
                totals_all_branches=all_tot)


def session_state_for(project: dict[str, Any]) -> dict[str, Any]:
    """Bridge'in ürettiği snapshot'ın birebir karşılığı."""
    active = project["active_branch"]
    period = next(p for p in project["periods"] if active in p["branches"])
    ss = {
        "active": dict(period_id=period["id"], period_label=period["label"],
                       branch_id=active["id"], branch_name=active["name"],
                       frequency=active["frequency"]),
        "periods": [
            dict(id=p["id"], label=p["label"],
                 branches=[{k: v for k, v in b.items() if k != "_triangle"}
                           for b in p["branches"]])
            for p in project["periods"]
        ],
        "totals_all_branches": project["totals_all_branches"],
        "method": active["method"], "window": active["window"],
        "excluded_cells": active["excluded_cells"],
        "selected_ldfs": active["selected_ldfs"], "cdfs": active["effective_cdfs"],
        "per_origin": active["per_origin"],
        "formula_context": active["formula_context"],
        "curve_state": active["curve_state"],
        "total_latest": active["totals"]["latest"],
        "total_exposure": active["totals"]["exposure_annual"],
        "total_ultimate": active["totals"]["cl_ultimate"],
        "total_bf_ultimate": active["totals"]["bf_ultimate"],
        "total_selected_ultimate": active["totals"]["selected_ultimate"],
        "total_selected_ibnr": active["totals"]["ibnr"],
        "total_ibnr": active["totals"]["ibnr"],
        "project_context": dict(period=period["label"], branch=active["name"],
                                frequency=active["frequency"]),
    }
    return ss


def triangle_payload(tri: Triangle) -> dict[str, Any]:
    return dict(
        origin_periods=list(tri.origin_periods),
        development_periods=list(tri.development_periods),
        values=tri.values,
        triangle_type=tri.triangle_type.value,
        origin_granularity=tri.origin_granularity.value,
        development_granularity=tri.development_granularity.value,
    )


# ── Diğer modüllerin snapshot'ları ───────────────────────────────────────────
# Bunlar olmadan "nakit akışı hazır mı" / "iskonto hesaplandı mı" soruları
# adil değil: modül özeti "yüklenmemiş" der, model doğru olarak araç çağırmadan
# cevaplar. Gerçek bir kapanışta bu modüller DOLUDUR.

def cashflow_session_state(project: dict[str, Any]) -> dict[str, Any]:
    """CashflowAgentBridge'in ürettiği payload'ın karşılığı."""
    periods = []
    for p in project["periods"]:
        branches = []
        for b in p["branches"]:
            # Desen yalnız aktif dönemin FIRE branşında kurulmuş olsun —
            # "hazır mı" sorusunun cevabı kısmi, yani gerçekçi.
            has_pattern = b["is_active"]
            branches.append(dict(
                id=b["id"], name=b["name"], frequency=b["frequency"],
                is_active=b["is_active"], has_paid_triangle=True,
                n_origins=b["n_origins"], n_developments=b["n_developments"],
                ldf_window="all", excluded_cells_count=0,
                cdf_model_overrides=[], cdf_user_values=[],
                has_pattern=has_pattern,
                pattern_origin_count=b["n_origins"] if has_pattern else 0,
            ))
        periods.append(dict(id=p["id"], label=p["label"], branches=branches))
    active = project["active_branch"]
    return dict(
        periods=periods, active_branch_id=active["id"],
        totals=dict(branch_count=sum(len(p["branches"]) for p in periods),
                    with_pattern=1),
        note="Cashflow modülü: branş bazlı ödeme deseni durumu.",
    )


# Belirlenimci aylık ödeme deseni (her kaza yılı için aynı): ödemenin yarısı
# 6. ayda, %30'u 18., %20'si 30. ayda.
DISCOUNT_PATTERN: list[list[float]] = [[6, 0.5], [18, 0.3], [30, 0.2]]


def _last_diagonal(tri: Triangle) -> dict[str, float]:
    out: dict[str, float] = {}
    for origin, row in zip(tri.origin_periods, tri.values):
        vals = [v for v in row if v is not None]
        if vals:
            out[str(origin)] = float(vals[-1])
    return out


def _discount_rows(b: dict[str, Any]) -> list[dict[str, Any]]:
    """DiscountAgentBridge'in gönderdiği per_origin satırlarının karşılığı."""
    wsum = sum(w for _, w in DISCOUNT_PATTERN)
    avg = sum(m * w for m, w in DISCOUNT_PATTERN) / wsum
    paid = _last_diagonal(b["_paid"])
    return [dict(origin=r["origin"], unpaid=r["selected_ultimate"] - paid.get(r["origin"], 0.0), avg_month=avg,
                 months=[list(x) for x in DISCOUNT_PATTERN]) for r in b["per_origin"]]


def flat_discount(b: dict[str, Any], rate: float) -> dict[str, Any]:
    """Arayüzün discountBranch'ının sabit oranlı karşılığı (bağımsız referans)."""
    unpaid = bel = 0.0
    for row in _discount_rows(b):
        unpaid += row["unpaid"]
        bel += sum(row["unpaid"] * w / (1 + rate) ** (m / 12) for m, w in row["months"])
    return dict(unpaid_liability=round(unpaid), discounted_unpaid=round(bel),
                discount_amount=round(unpaid - bel),
                discount_pct=round((unpaid - bel) / unpaid * 10000) / 100 if unpaid else 0,
                duration_months=max(m for m, _ in DISCOUNT_PATTERN))


def discount_session_state(project: dict[str, Any]) -> dict[str, Any]:
    # Eskiden quick_discount uydurma bir "unpaid × 0,88" sayısıydı ve per_origin
    # hiç yoktu — gerçek bridge gibi. compute_discount bu yüzden her çağrıda
    # hata veriyordu ve eval bunu görmüyordu (yalnız çağrıyı sayıyordu).
    branches = []
    for p in project["periods"]:
        for b in p["branches"]:
            # Ödenmemiş = nihai − ödenmiş (incurred bazında muallak + IBNR).
            unpaid = sum(r["unpaid"] for r in _discount_rows(b))
            has_pattern = b["is_active"]
            branches.append(dict(
                branch_id=b["id"], branch_name=b["name"],
                period_id=p["id"], period_label=p["label"],
                frequency=b["frequency"], is_active=b["is_active"],
                has_cashflow_pattern=has_pattern,
                per_origin=_discount_rows(b) if has_pattern else [],
                origin_count=b["n_origins"],
                total_unpaid_liability=round(unpaid),
                quick_discount_at_30pct=flat_discount(b, 0.30) if has_pattern else None,
                note=("compute_discount ile özel oran/eğri kullanabilirsiniz."
                      if has_pattern else "Nakit akışı deseni yok."),
            ))
    return dict(branches=branches,
                active_branch_id=project["active_branch"]["id"],
                note="İskonto modülü: branş bazlı Unpaid Liability ve iskonto özeti.")


def data_session_state(project: dict[str, Any]) -> dict[str, Any]:
    """DataAgentBridge'in ürettiği payload'ın karşılığı.

    Bu modül olmadan navigate_to ve list_data_periods modele HİÇ sunulmuyor
    (araçların sahibi data modülü) — navigasyon senaryoları o yüzden
    "agent yapmadı" gibi görünüyordu.
    """
    return dict(
        periods=[
            dict(
                id=p["id"], label=p["label"],
                datasets=[
                    dict(dataset_id=f"{p['id']}-hasar", type_id="hasar",
                         brans_list=[b["name"] for b in p["branches"]],
                         hasar_tarihi_min="2000-01-01", hasar_tarihi_max="2025-12-31",
                         total_odeme=None, total_muallak=None),
                    dict(dataset_id=f"{p['id']}-prim", type_id="prim",
                         brans_list=[b["name"] for b in p["branches"]],
                         donem_list=[p["label"]], total_ep=None),
                ],
            )
            for p in project["periods"]
        ],
        active_period_id=project["periods"][0]["id"],
        note="Veri modülü: yüklü dönemler ve dataset meta verisi.",
    )
