/**
 * Large-loss ayrımı: kullanıcı GROSS (ödeme+muallak) ve LARGE (ödeme+muallak)
 * üçgenleri yükler. Ana model ATTRITIONAL = GROSS − LARGE üzerinde çalışır;
 * LARGE ayrıca modellenir. Toplam = Attritional + Large.
 *
 * Bu modül SADECE saf hesap yapar (veri değiştirmez, UI bilmez) — kolay test.
 */

import type { Triangle } from "@/types/triangle";
import type { Branch, Window } from "@/types/project";
import { computeBranchSummary, type BranchSummary } from "@/lib/reserve-pipeline";

/** Branch large veri içeriyor mu? */
export function hasLarge(branch: Branch | null | undefined): boolean {
  return !!(branch?.largePaidTriangle || branch?.largeIncurredTriangle);
}

/**
 * Hücre bazında `gross − large`. Hizalama origin ETİKETİ + gelişim indeksiyle;
 * large'da olmayan hücre = 0; sonuç negatifse 0'a kırpılır (flag'lenir);
 * gross'ta null (üçgen boşluğu) korunur. GROSS grid'i şekli belirler.
 */
export function subtractTriangle(
  gross: Triangle,
  large: Triangle | null | undefined,
): { tri: Triangle; negativeCells: string[] } {
  if (!large) return { tri: gross, negativeCells: [] };
  const largeByOrigin = new Map<string, (number | null)[]>();
  large.origin_periods.forEach((o, i) => largeByOrigin.set(o, large.values[i] ?? []));

  const negativeCells: string[] = [];
  const values = gross.values.map((row, i) => {
    const o = gross.origin_periods[i];
    const lrow = largeByOrigin.get(o);
    return row.map((g, j) => {
      if (g == null) return null;
      const l = lrow?.[j] ?? 0;
      const a = g - (l ?? 0);
      if (a < 0) {
        negativeCells.push(`${o}|${j}`);
        return 0;
      }
      return a;
    });
  });
  return { tri: { ...gross, values }, negativeCells };
}

export interface AttritionalTriangles {
  paid: Triangle | null;
  incurred: Triangle | null;
  /** large > gross çıkan hücreler (0'a kırpıldı) — veri kalitesi uyarısı. */
  negativeCells: string[];
}

/** Branch'ten attritional (paid & incurred) üçgenlerini türetir. */
export function deriveAttritional(branch: Branch): AttritionalTriangles {
  const gp = branch.paidTriangle ?? null;
  const gi = branch.incurredTriangle ?? null;
  const neg = new Set<string>();
  let paid: Triangle | null = gp;
  let incurred: Triangle | null = gi;
  if (gp) {
    const r = subtractTriangle(gp, branch.largePaidTriangle);
    paid = r.tri;
    r.negativeCells.forEach((c) => neg.add("paid:" + c));
  }
  if (gi) {
    const r = subtractTriangle(gi, branch.largeIncurredTriangle);
    incurred = r.tri;
    r.negativeCells.forEach((c) => neg.add("incurred:" + c));
  }
  return { paid, incurred, negativeCells: [...neg] };
}

/** Model için attritional çalışma üçgeni (incurred öncelikli, yoksa paid). */
export function attritionalWorkingTriangle(branch: Branch): Triangle | null {
  if (!hasLarge(branch)) return branch.triangle ?? null;
  const a = deriveAttritional(branch);
  // Çalışma üçgeni gross ile aynı tipte olmalı (branch.triangle hangi tipse).
  const t = branch.triangle?.triangle_type;
  if (t === "paid") return a.paid ?? a.incurred;
  return a.incurred ?? a.paid;
}

/** LARGE üçgeni + largeModel parametreleriyle özet (kendi bağımsız modeli). */
export function computeLargeSummary(branch: Branch): BranchSummary | null {
  if (!hasLarge(branch)) return null;
  const t = branch.triangle?.triangle_type;
  const tri =
    t === "paid"
      ? branch.largePaidTriangle ?? branch.largeIncurredTriangle ?? null
      : branch.largeIncurredTriangle ?? branch.largePaidTriangle ?? null;
  if (!tri) return null;
  const lm = branch.largeModel ?? {};
  const synthetic: Branch = {
    ...branch,
    triangle: tri,
    method: lm.method ?? "volume_weighted",
    window: lm.window ?? branch.largeWindow ?? "all",
    excludedCells: lm.excludedCells ?? [],
    karmaWindowPerStep: lm.karmaWindowPerStep ?? {},
    premiums: lm.premiums ?? {},
    lrInputPerOrigin: lm.lrInputPerOrigin ?? {},
    basisPerOrigin: lm.basisPerOrigin ?? {},
    correctionPerOrigin: lm.correctionPerOrigin ?? {},
    cdfInitial: lm.cdfInitial ?? {},
    cdfChoicePerPeriod: lm.cdfChoicePerPeriod ?? {},
    cdfModelPerPeriod: lm.cdfModelPerPeriod ?? {},
    curveIncludePerPeriod: lm.curveIncludePerPeriod ?? {},
  };
  return computeBranchSummary(synthetic);
}

/** ATTRITIONAL (Gross − Large) + ana parametrelerle özet — Toplam kırılımı için. */
export function computeAttritionalSummary(branch: Branch): BranchSummary | null {
  if (!hasLarge(branch)) return computeBranchSummary(branch);
  const tri = attritionalWorkingTriangle(branch);
  return computeBranchSummary({ ...branch, triangle: tri });
}

export interface SegmentTotals {
  latest: number;
  selected_ultimate: number;
  ibnr: number;
}

/** Attritional + Large toplamı (segment kırılımıyla). */
export function combineTotals(
  attritional: { totals: SegmentTotals } | null,
  large: { totals: SegmentTotals } | null,
): { attritional: SegmentTotals; large: SegmentTotals; total: SegmentTotals } {
  const z: SegmentTotals = { latest: 0, selected_ultimate: 0, ibnr: 0 };
  const a = attritional?.totals ?? z;
  const l = large?.totals ?? z;
  return {
    attritional: a,
    large: l,
    total: {
      latest: a.latest + l.latest,
      selected_ultimate: a.selected_ultimate + l.selected_ultimate,
      ibnr: a.ibnr + l.ibnr,
    },
  };
}
