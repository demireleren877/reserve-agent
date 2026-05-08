import type { LDFMethod, Triangle } from "@/types/triangle";

export type Window = number | "all";

export const WINDOWS: { id: Window; label: string }[] = [
  { id: 4, label: "Son 4" },
  { id: 5, label: "Son 5" },
  { id: 7, label: "Son 7" },
  { id: "all", label: "Tüm" },
];

export function cellKey(origin: string, step: number): string {
  return `${origin}|${step}`;
}

export interface RatioCell {
  value: number | null;
  excluded: boolean;
}

export function developmentRatios(
  triangle: Triangle,
  excludedCells: Set<string>,
): RatioCell[][] {
  const rows: RatioCell[][] = [];
  const steps = triangle.development_periods.length - 1;
  for (let i = 0; i < triangle.values.length; i++) {
    const row: RatioCell[] = [];
    for (let j = 0; j < steps; j++) {
      const a = triangle.values[i][j];
      const b = triangle.values[i][j + 1];
      const value = a != null && b != null && a !== 0 ? b / a : null;
      const excluded = excludedCells.has(cellKey(triangle.origin_periods[i], j));
      row.push({ value, excluded });
    }
    rows.push(row);
  }
  return rows;
}

export function aggregateLDFs(
  triangle: Triangle,
  ratios: RatioCell[][],
  window: Window,
  method: LDFMethod,
): number[] {
  const steps = triangle.development_periods.length - 1;
  const result: number[] = [];
  for (let j = 0; j < steps; j++) {
    const pairs: { a: number; b: number }[] = [];
    // Walk bottom-up; "last N" picks N newest origins that qualify at this step.
    for (let i = triangle.values.length - 1; i >= 0; i--) {
      const cell = ratios[i][j];
      if (cell.value == null || cell.excluded) continue;
      const a = triangle.values[i][j] as number;
      const b = triangle.values[i][j + 1] as number;
      pairs.push({ a, b });
      if (typeof window === "number" && pairs.length >= window) break;
    }
    result.push(aggregate(pairs, method));
  }
  return result;
}

function aggregate(
  pairs: { a: number; b: number }[],
  method: LDFMethod,
): number {
  if (pairs.length === 0) return 1;
  switch (method) {
    case "volume_weighted": {
      const den = pairs.reduce((s, p) => s + p.a, 0);
      const num = pairs.reduce((s, p) => s + p.b, 0);
      return den === 0 ? 1 : num / den;
    }
    case "simple_average": {
      const ratios = pairs.filter((p) => p.a !== 0).map((p) => p.b / p.a);
      return ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 1;
    }
    case "geometric_average": {
      const ratios = pairs.filter((p) => p.a > 0).map((p) => p.b / p.a);
      if (!ratios.length) return 1;
      const logSum = ratios.reduce((s, r) => s + Math.log(r), 0);
      return Math.exp(logSum / ratios.length);
    }
  }
}

/** cdfs[j] = product of ldfs[j..end]. So cdfs[0] is age-0 → ultimate. */
export function cumulativeFactors(ldfs: number[]): number[] {
  const out: number[] = new Array(ldfs.length).fill(1);
  let acc = 1;
  for (let j = ldfs.length - 1; j >= 0; j--) {
    acc *= ldfs[j];
    out[j] = acc;
  }
  return out;
}

/**
 * Curve sekmesindeki kullanıcı seçimleri cascade mantığıyla uygulanır.
 * Bir period "user" ise effCDF = kullanıcı değeri (anchor).
 * Diğer periodlar için effCDF[i] = selected_LDF[i→i+1] × effCDF[i+1] (sondan başa).
 *
 * Returned:
 *   effective[i]  — fiili CDF (BF/Ultimate hesapları için)
 *   initial[i]    — aynı cascade ama choice="initial" varsayımıyla (Curve'de
 *                   "Initial Selection" sütunu ve LDF tab CDF satırı için)
 *   effLDFs[j]    — effective CDF'lerden türetilen LDF zinciri
 */
export function cascadeCDFs(
  devs: (string | number)[],
  selectedLDFs: number[],
  cdfChoicePerPeriod: Record<string, "initial" | "user">,
  cdfInitial: Record<string, number>,
  opts?: {
    model?: Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
    fitCDFs?: { exp: number[]; invPower: number[]; power: number[]; weibull: number[] };
  },
): { effective: number[]; initial: number[]; effLDFs: number[] } {
  const n = devs.length;
  const baseCDFs = cumulativeFactors(selectedLDFs);
  const selExt: number[] = [...baseCDFs, 1];
  const effective: number[] = new Array(n).fill(1);
  const initial: number[] = new Array(n).fill(1);
  const fit = opts?.fitCDFs;
  const modelMap = opts?.model ?? {};

  for (let i = n - 1; i >= 0; i--) {
    const key = String(devs[i]);
    if (i === n - 1) {
      initial[i] = 1;
    } else {
      const next = selExt[i + 1] || 1;
      const ldfStep = next !== 0 ? selExt[i] / next : 1;
      initial[i] = ldfStep * effective[i + 1];
    }
    const model: 1 | 2 | 3 | 4 | 5 | 6 =
      modelMap[key] ??
      (cdfChoicePerPeriod[key] === "user" ? 6 : 1);
    if (model === 6) {
      effective[i] = cdfInitial[key] ?? 1;
    } else if (model === 2 && fit?.exp[i] != null) {
      effective[i] = fit.exp[i];
    } else if (model === 3 && fit?.invPower[i] != null) {
      effective[i] = fit.invPower[i];
    } else if (model === 4 && fit?.power[i] != null) {
      effective[i] = fit.power[i];
    } else if (model === 5 && fit?.weibull[i] != null) {
      effective[i] = fit.weibull[i];
    } else {
      effective[i] = initial[i];
    }
  }

  const effLDFs: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    const a = effective[j];
    const b = effective[j + 1] || 1;
    effLDFs.push(b !== 0 ? a / b : 1);
  }
  return { effective, initial, effLDFs };
}
