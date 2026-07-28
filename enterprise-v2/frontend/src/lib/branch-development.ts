import type { Branch, Period } from "@/types/project";
import type { Triangle } from "@/types/triangle";
import { sortByPeriodLabel } from "@/lib/period-order";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import { computeAttritionalSummary } from "@/lib/large-split";

export interface DevelopmentPoint {
  periodId: string;
  period: string;
  branchId: string;
  paid: number;
  incurred: number;
  outstanding: number;
  ibnr: number;
  ultimate: number;
  ep: number;
  ulr: number | null;
}

export interface DevelopmentBranchOption {
  key: string;
  name: string;
  frequency: Branch["frequency"];
  periodCount: number;
}

export function developmentBranchKey(branch: Pick<Branch, "name" | "frequency">): string {
  return `${branch.frequency}\u0000${branch.name.trim().toLocaleLowerCase("tr-TR")}`;
}

export function listDevelopmentBranches(periods: Period[]): DevelopmentBranchOption[] {
  const options = new Map<string, DevelopmentBranchOption>();
  for (const period of periods) {
    const seen = new Set<string>();
    for (const branch of period.branches) {
      const key = developmentBranchKey(branch);
      if (seen.has(key)) continue;
      seen.add(key);
      const current = options.get(key);
      options.set(key, {
        key,
        name: current?.name ?? branch.name,
        frequency: branch.frequency,
        periodCount: (current?.periodCount ?? 0) + 1,
      });
    }
  }
  return [...options.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "tr") || a.frequency.localeCompare(b.frequency),
  );
}

function cumulativeLatestTotal(triangle: Triangle | null | undefined): number {
  if (!triangle) return 0;
  return triangle.values.reduce((total, row) => {
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] != null) return total + (row[i] as number);
    }
    return total;
  }, 0);
}

export function computeDevelopmentPoint(period: Period, branch: Branch): DevelopmentPoint {
  const paidTriangle = branch.paidTriangle ?? (branch.triangle?.triangle_type === "paid" ? branch.triangle : null);
  const incurredTriangle = branch.incurredTriangle ?? (branch.triangle?.triangle_type === "incurred" ? branch.triangle : null);
  const paid = cumulativeLatestTotal(paidTriangle);
  const incurred = cumulativeLatestTotal(incurredTriangle);
  const grossSummary = computeBranchSummary(branch);

  // Reserve ekranının varsayılan model segmenti Attritional'dır. Large ayrımı
  // yoksa helper otomatik olarak normal branch özetine düşer.
  const modelSummary = computeAttritionalSummary(branch) ?? grossSummary;
  const ultimate = modelSummary.totals.selected_ultimate;
  const ibnr = modelSummary.totals.ibnr;

  // Dashboard'daki EP, veri modülünde yüklenen gerçek dönem primi olmalı.
  // Annualized exposure BF hesabının iç girdisidir; raporlanan EP/ULR paydası değildir.
  const ep = grossSummary.totals.exposure_raw;
  return {
    periodId: period.id,
    period: period.label,
    branchId: branch.id,
    paid,
    incurred,
    outstanding: incurred - paid,
    ibnr,
    ultimate,
    ep,
    ulr: ep !== 0 ? ultimate / ep : null,
  };
}

export function buildDevelopmentSeries(periods: Period[], branchKey: string): DevelopmentPoint[] {
  return sortByPeriodLabel(periods).flatMap((period) => {
    const branch = period.branches.find((candidate) => developmentBranchKey(candidate) === branchKey);
    return branch ? [computeDevelopmentPoint(period, branch)] : [];
  });
}
