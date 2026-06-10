import type { Branch } from "@/types/project";
import {
  aggregateLDFs,
  cascadeCDFs,
  cumulativeFactors,
  developmentRatios,
  type Window,
} from "@/lib/ldf";

export interface CashflowDevRow {
  dev_period: string | number;
  step_idx: number;
  selected_ldf: number;
  initial_cdf: number;
  effective_cdf: number;
  model: number;
  user_value: number | null;
}

export interface CashflowBranchSummary {
  has_paid_triangle: boolean;
  n_origins: number;
  n_developments: number;
  ldf_window: string;
  excluded_cells_count: number;
  excluded_cells: { origin: string; step: number }[];
  selected_ldfs: number[];
  initial_cdfs: number[];
  effective_cdfs: number[];
  per_dev: CashflowDevRow[];
}

export function computeCashflowBranchSummary(branch: Branch): CashflowBranchSummary {
  const triangle = branch.paidTriangle ?? null;
  if (!triangle) {
    return {
      has_paid_triangle: false,
      n_origins: 0,
      n_developments: 0,
      ldf_window: "all",
      excluded_cells_count: 0,
      excluded_cells: [],
      selected_ldfs: [],
      initial_cdfs: [],
      effective_cdfs: [],
      per_dev: [],
    };
  }

  const excludedSet = new Set(branch.cashflowLdfExcludedCells ?? []);
  const excludedCells = Array.from(excludedSet).map((k) => {
    const [origin, step] = k.split("|");
    return { origin, step: Number(step) };
  });

  const ratios = developmentRatios(triangle, excludedSet);
  const ldfWindow: Window = branch.cashflowLdfWindow ?? "all";
  const karmaMap =
    Object.keys(branch.cashflowKarmaWindowPerStep ?? {}).length > 0
      ? branch.cashflowKarmaWindowPerStep
      : undefined;
  const selectedLDFs = aggregateLDFs(
    triangle,
    ratios,
    ldfWindow,
    "volume_weighted",
    karmaMap,
  );

  const initialCdfs = cumulativeFactors(selectedLDFs);

  const model = (branch.cashflowCdfModelPerPeriod ?? {}) as Record<
    string,
    1 | 2 | 3 | 4 | 5 | 6
  >;
  const cdfInit = branch.cashflowCdfInitial ?? {};
  // model 2-5 (tail fit) için fitCDFs sağlanmıyor — initial'a fallback eder.
  // Tam tail fit hesabı cashflow sayfasına özgüdür (fitExponential vb.).
  const cas = cascadeCDFs(triangle.development_periods, selectedLDFs, {}, cdfInit, {
    model,
  });
  const effectiveCdfs = cas.effective.length ? cas.effective : initialCdfs;

  const per_dev: CashflowDevRow[] = triangle.development_periods.map((d, i) => {
    const key = String(d);
    const m = model[key] ?? 1;
    return {
      dev_period: d,
      step_idx: i,
      selected_ldf: selectedLDFs[i] ?? 1,
      initial_cdf: initialCdfs[i] ?? 1,
      effective_cdf: effectiveCdfs[i] ?? 1,
      model: m,
      user_value: m === 6 ? (cdfInit[key] ?? null) : null,
    };
  });

  return {
    has_paid_triangle: true,
    n_origins: triangle.origin_periods.length,
    n_developments: triangle.development_periods.length,
    ldf_window: String(ldfWindow),
    excluded_cells_count: excludedSet.size,
    excluded_cells: excludedCells.slice(0, 50),
    selected_ldfs: selectedLDFs,
    initial_cdfs: initialCdfs,
    effective_cdfs: effectiveCdfs,
    per_dev,
  };
}
