import type { Branch } from "@/types/project";
import type { Triangle } from "@/types/triangle";
import { computeBranchSummary } from "@/lib/reserve-pipeline";

export interface AvERow {
  origin: string;
  development: string;
  actual: number;
  expected: number;
  priorCumulative: number;
  currentCumulative: number;
  variance: number;
  variancePct: number | null;
}

export interface AvEResult {
  rows: AvERow[];
  totals: { actual: number; expected: number; variance: number; variancePct: number | null };
}

function latestIndex(row: (number | null)[]): number {
  for (let i = row.length - 1; i >= 0; i--) if (row[i] != null) return i;
  return -1;
}

/** Önceki değerlemenin seçilmiş LDF'i ile bir sonraki beklenen gelişimi üretir. */
export function calculateActualVsExpected(prior: Branch, currentTriangle: Triangle, priorTriangleOverride?: Triangle | null): AvEResult | null {
  const priorTriangle = priorTriangleOverride ?? prior.incurredTriangle ?? prior.paidTriangle ?? prior.triangle;
  if (!priorTriangle) return null;
  const selectedLdfs = computeBranchSummary(prior).selected_ldfs;
  const rows: AvERow[] = [];
  for (let i = 0; i < priorTriangle.origin_periods.length; i++) {
    const origin = priorTriangle.origin_periods[i];
    const priorRow = priorTriangle.values[i] ?? [];
    const start = latestIndex(priorRow);
    if (start < 0) continue;
    const currentIndex = currentTriangle.origin_periods.indexOf(origin);
    const currentRow = currentIndex >= 0 ? currentTriangle.values[currentIndex] : null;
    const end = currentRow ? latestIndex(currentRow) : -1;
    if (end <= start || end >= priorTriangle.development_periods.length) continue;
    const actualCumulative = currentRow?.[end];
    const previousCumulative = priorRow[start];
    if (actualCumulative == null || previousCumulative == null) continue;
    let expectedCumulative = previousCumulative;
    let valid = true;
    for (let j = start; j < end; j++) {
      if (!Number.isFinite(selectedLdfs[j])) { valid = false; break; }
      expectedCumulative *= selectedLdfs[j];
    }
    if (!valid) continue;
    const expected = expectedCumulative - previousCumulative;
    const actual = actualCumulative - previousCumulative;
    const variance = actual - expected;
    rows.push({
      origin,
      development: `${priorTriangle.development_periods[start]}→${priorTriangle.development_periods[end]}`,
      actual,
      expected,
      priorCumulative: previousCumulative,
      currentCumulative: actualCumulative,
      variance,
      variancePct: expected !== 0 ? variance / Math.abs(expected) : null,
    });
  }
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  const variance = actual - expected;
  return { rows, totals: { actual, expected, variance, variancePct: expected !== 0 ? variance / Math.abs(expected) : null } };
}
