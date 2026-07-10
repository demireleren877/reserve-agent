/**
 * Bir branş için tam pipeline (LDF → cascade → BF → selected ult → IBNR).
 * runPipeline'ın page.tsx'teki versiyonu sadece aktif branş içindi; bu
 * versiyon herhangi bir branch objesi alır → agent bridge tüm branşların
 * snapshot'ını üretirken kullanır.
 */

import type { Branch } from "@/types/project";
import {
  aggregateLDFs,
  cascadeCDFs,
  cumulativeFactors,
  developmentRatios,
} from "@/lib/ldf";
import { evalFormula, type FormulaContext } from "@/lib/formula";

export interface BranchOriginRow {
  origin: string;
  latest: number;
  premium: number;
  premium_annual: number;
  correction: number;
  cdf: number;
  cl_ultimate: number;
  bf_ultimate: number;
  bf_ultimate_annual: number;
  selected_ultimate: number;
  ibnr: number;
  ulr: number | null;
  basis: "cl" | "bf";
  selected_lr: number;
  selected_lr_input: string | null;
  pct_developed: number | null;
}

export interface BranchSummary {
  has_triangle: boolean;
  n_origins: number;
  n_developments: number;
  selected_ldfs: number[];
  effective_cdfs: number[];
  rows: BranchOriginRow[];
  totals: {
    latest: number;
    exposure_raw: number;
    exposure_annual: number;
    cl_ultimate: number;
    bf_ultimate: number;
    selected_ultimate: number;
    ibnr: number;
    ulr: number | null;
  };
  /** Formül değerlendirme bağlamı — backend'e aynen iletilir, orada vw/avg
   *  hesaplarken bu değerler kullanılır (per_origin'deki cl_ultimate ile
   *  ayrışabilir çünkü burada CDF cascade tam uygulanmış halde). */
  formula_context: {
    cl_ult: Record<string, number>;
    exposure: Record<string, number>;
    pattern: Record<string, number>;
  };
}

export function computeBranchSummary(branch: Branch): BranchSummary {
  const triangle = branch.triangle;
  if (!triangle) {
    return {
      has_triangle: false,
      n_origins: 0,
      n_developments: 0,
      selected_ldfs: [],
      effective_cdfs: [],
      rows: [],
      formula_context: { cl_ult: {}, exposure: {}, pattern: {} },
      totals: {
        latest: 0,
        exposure_raw: 0,
        exposure_annual: 0,
        cl_ultimate: 0,
        bf_ultimate: 0,
        selected_ultimate: 0,
        ibnr: 0,
        ulr: null,
      },
    };
  }

  const excluded = new Set(branch.excludedCells ?? []);
  const r = developmentRatios(triangle, excluded);
  // Method sabit: hacim ağırlıklı (volume_weighted). Branch.method legacy alan.
  const ldfs = aggregateLDFs(triangle, r, branch.window, "volume_weighted");
  const cas = cascadeCDFs(
    triangle.development_periods,
    ldfs,
    branch.cdfChoicePerPeriod ?? {},
    branch.cdfInitial ?? {},
  );
  const effLDFs = cas.effLDFs.length ? cas.effLDFs : ldfs;
  const cdfs = cumulativeFactors(effLDFs);

  // Formula context (pattern ratios)
  const pattern = new Map<string, number>();
  const clUltMap = new Map<string, number>();
  const expMap = new Map<string, number>();
  for (let i = 0; i < triangle.origin_periods.length; i++) {
    let latest: number | null = null;
    let latestIdx = -1;
    for (let j = 0; j < triangle.values[i].length; j++) {
      const v = triangle.values[i][j];
      if (v != null) {
        latest = v;
        latestIdx = j;
      }
    }
    if (latest == null) continue;
    const o = triangle.origin_periods[i];
    // Normalize "2022.0" → "2022" so formula evaluator (which uses Math.floor) can find the key
    const ok = /^\d{4}\.0$/.test(o) ? o.slice(0, 4) : o;
    const cdf = latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
    const cl = latest * cdf;
    const k =
      branch.correctionPerOrigin?.[o] && branch.correctionPerOrigin[o] > 0
        ? branch.correctionPerOrigin[o]
        : 1;
    const expA = (branch.premiums?.[o] ?? 0) * k;
    clUltMap.set(ok, cl);
    expMap.set(ok, expA);
    if (expA > 0) pattern.set(ok, cl / expA);
  }
  const ctx: FormulaContext = {
    pattern,
    clUlt: clUltMap,
    exposure: expMap,
  };
  const evaluated: Record<string, number> = {};
  for (const [o, expr] of Object.entries(branch.lrInputPerOrigin ?? {})) {
    if (!expr || !expr.trim()) continue;
    const { value } = evalFormula(expr, ctx);
    if (value != null) evaluated[o] = value;
  }

  const rows: BranchOriginRow[] = [];
  let totalLatest = 0;
  let totalExposureRaw = 0;
  let totalExposureAnnual = 0;
  let totalCL = 0;
  let totalBF = 0;
  let totalSelected = 0;

  for (let i = 0; i < triangle.origin_periods.length; i++) {
    let latest: number | null = null;
    let latestIdx = -1;
    for (let j = 0; j < triangle.values[i].length; j++) {
      const v = triangle.values[i][j];
      if (v != null) {
        latest = v;
        latestIdx = j;
      }
    }
    if (latest == null) continue;
    const o = triangle.origin_periods[i];
    const cdf = latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
    const cl = latest * cdf;
    const premium = branch.premiums?.[o] ?? 0;
    const k =
      branch.correctionPerOrigin?.[o] && branch.correctionPerOrigin[o] > 0
        ? branch.correctionPerOrigin[o]
        : 1;
    const premiumAnnual = premium * k;
    const patternRatio = premiumAnnual > 0 ? cl / premiumAnnual : null;
    const userLR = evaluated[o];
    const selectedLR =
      userLR !== undefined
        ? userLR
        : patternRatio !== null
        ? patternRatio
        : 0.7;
    const pctDev = cl > 0 ? latest / cl : 1;
    const bfUltAnnual =
      latest + selectedLR * premiumAnnual * (1 - pctDev);
    const bfUlt = bfUltAnnual / k;
    const basis = branch.basisPerOrigin?.[o] ?? "cl";
    const selectedUlt = basis === "cl" ? cl : bfUlt;
    const ibnr = selectedUlt - latest;
    const ulr = premium > 0 ? selectedUlt / premium : null;

    rows.push({
      origin: o,
      latest,
      premium,
      premium_annual: premiumAnnual,
      correction: k,
      cdf,
      cl_ultimate: cl,
      bf_ultimate: bfUlt,
      bf_ultimate_annual: bfUltAnnual,
      selected_ultimate: selectedUlt,
      ibnr,
      ulr,
      basis,
      selected_lr: selectedLR,
      selected_lr_input: branch.lrInputPerOrigin?.[o] ?? null,
      pct_developed: cl > 0 ? pctDev : null,
    });

    totalLatest += latest;
    totalExposureRaw += premium;
    totalExposureAnnual += premiumAnnual;
    totalCL += cl;
    totalBF += bfUlt;
    totalSelected += selectedUlt;
  }

  return {
    has_triangle: true,
    n_origins: triangle.origin_periods.length,
    n_developments: triangle.development_periods.length,
    selected_ldfs: effLDFs,
    effective_cdfs: cas.effective,
    rows,
    totals: {
      latest: totalLatest,
      exposure_raw: totalExposureRaw,
      exposure_annual: totalExposureAnnual,
      cl_ultimate: totalCL,
      bf_ultimate: totalBF,
      selected_ultimate: totalSelected,
      ibnr: totalSelected - totalLatest,
      ulr: totalExposureRaw > 0 ? totalSelected / totalExposureRaw : null,
    },
    formula_context: {
      cl_ult: Object.fromEntries(clUltMap),
      exposure: Object.fromEntries(expMap),
      pattern: Object.fromEntries(pattern),
    },
  };
}
