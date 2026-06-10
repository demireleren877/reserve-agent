/**
 * Frekans-Şiddet (Frequency-Severity / Average Cost per Claim) yöntemi.
 * Backend app/core/frequency_severity.py ile birebir aynı mantık.
 *
 *   1. Adet üçgeni (kümülatif ihbar adedi) → CL → ult adet
 *   2. Şiddet üçgeni (tutar/adet) → CL → ult şiddet
 *   3. Ult hasar = ult adet × ult şiddet ;  IBNR = ult − latest tutar
 *
 * Şiddet, adet=0 hücrelerde tanımsızdır (None); None-toleranslı gelişim
 * faktörü kullanılır.
 */

import type { Triangle } from "@/types/triangle";

export type FSMethod = "volume_weighted" | "simple_average" | "geometric_average";

export interface FSOriginRow {
  origin: string;
  latestCount: number;
  ultimateCount: number;
  countCdf: number;
  latestSeverity: number | null;
  ultimateSeverity: number | null;
  severityCdf: number;
  latestAmount: number;
  ultimateLoss: number;
  ibnr: number;
}

export interface FSResult {
  countLdfs: number[];
  severityLdfs: number[];
  rows: FSOriginRow[];
  totals: {
    latestAmount: number;
    ultimateCount: number;
    ultimateLoss: number;
    ibnr: number;
  };
}

function buildSeverityMatrix(
  amount: (number | null)[][],
  count: (number | null)[][],
): (number | null)[][] {
  return amount.map((arow, i) =>
    arow.map((a, j) => {
      const c = count[i]?.[j];
      if (a == null || c == null || c === 0) return null;
      return a / c;
    }),
  );
}

function latest(row: (number | null)[]): { value: number | null; idx: number } {
  let value: number | null = null;
  let idx = -1;
  for (let j = 0; j < row.length; j++) {
    if (row[j] != null) {
      value = row[j];
      idx = j;
    }
  }
  return { value, idx };
}

function aggregate(pairs: { a: number; b: number }[], method: FSMethod): number {
  if (pairs.length === 0) return 1;
  if (method === "volume_weighted") {
    const den = pairs.reduce((s, p) => s + p.a, 0);
    const num = pairs.reduce((s, p) => s + p.b, 0);
    return den === 0 ? 1 : num / den;
  }
  if (method === "simple_average") {
    const r = pairs.filter((p) => p.a !== 0).map((p) => p.b / p.a);
    return r.length ? r.reduce((s, x) => s + x, 0) / r.length : 1;
  }
  const r = pairs.filter((p) => p.a > 0).map((p) => p.b / p.a);
  if (!r.length) return 1;
  return Math.exp(r.reduce((s, x) => s + Math.log(x), 0) / r.length);
}

function devFactors(
  values: (number | null)[][],
  nDev: number,
  method: FSMethod,
  nYears: number | "all",
  excludedIdx: Set<number>,
): number[] {
  const ldfs: number[] = [];
  for (let j = 0; j < nDev - 1; j++) {
    const indexed: { i: number; a: number; b: number }[] = [];
    for (let i = 0; i < values.length; i++) {
      if (excludedIdx.has(i)) continue;
      const a = values[i][j];
      const b = values[i][j + 1];
      if (a == null || b == null) continue;
      indexed.push({ i, a, b });
    }
    const used =
      typeof nYears === "number" && nYears > 0
        ? indexed.sort((x, y) => x.i - y.i).slice(-nYears)
        : indexed;
    ldfs.push(aggregate(used.map(({ a, b }) => ({ a, b })), method));
  }
  return ldfs;
}

function cdfToUltimate(ldfs: number[], fromIdx: number): number {
  let cdf = 1;
  for (let k = fromIdx; k < ldfs.length; k++) cdf *= ldfs[k];
  return cdf;
}

export function computeFrequencySeverity(
  amount: Triangle,
  count: Triangle,
  opts?: { method?: FSMethod; nYears?: number | "all"; excludedOrigins?: Set<string> },
): FSResult {
  const method = opts?.method ?? "volume_weighted";
  const nYears = opts?.nYears ?? "all";
  const excl = opts?.excludedOrigins ?? new Set<string>();
  const excludedIdx = new Set<number>();
  amount.origin_periods.forEach((o, i) => {
    if (excl.has(o)) excludedIdx.add(i);
  });

  const nDev = amount.development_periods.length;
  const severity = buildSeverityMatrix(amount.values, count.values);
  const countLdfs = devFactors(count.values, nDev, method, nYears, excludedIdx);
  const severityLdfs = devFactors(severity, nDev, method, nYears, excludedIdx);

  const rows: FSOriginRow[] = [];
  let totLatest = 0;
  let totCount = 0;
  let totLoss = 0;

  amount.origin_periods.forEach((origin, i) => {
    const lc = latest(count.values[i]);
    const la = latest(amount.values[i]);
    const ls = latest(severity[i]);
    const latestCount = lc.value ?? 0;
    const latestAmount = la.value ?? 0;

    const countCdf = lc.idx >= 0 ? cdfToUltimate(countLdfs, lc.idx) : 1;
    const ultimateCount = latestCount * countCdf;

    let severityCdf = 1;
    let ultimateSeverity: number | null = null;
    let ultimateLoss = 0;
    if (ls.value != null) {
      severityCdf = ls.idx >= 0 ? cdfToUltimate(severityLdfs, ls.idx) : 1;
      ultimateSeverity = ls.value * severityCdf;
      ultimateLoss = ultimateCount * ultimateSeverity;
    }
    const ibnr = ultimateLoss - latestAmount;

    rows.push({
      origin,
      latestCount,
      ultimateCount,
      countCdf,
      latestSeverity: ls.value,
      ultimateSeverity,
      severityCdf,
      latestAmount,
      ultimateLoss,
      ibnr,
    });
    totLatest += latestAmount;
    totCount += ultimateCount;
    totLoss += ultimateLoss;
  });

  return {
    countLdfs,
    severityLdfs,
    rows,
    totals: {
      latestAmount: totLatest,
      ultimateCount: totCount,
      ultimateLoss: totLoss,
      ibnr: totLoss - totLatest,
    },
  };
}
