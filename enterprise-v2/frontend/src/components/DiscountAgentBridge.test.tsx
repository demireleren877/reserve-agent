/**
 * buildDiscountSnapshot — compute_discount'un hesaplayacağı satırlar.
 *
 * Regresyon: snapshot iskonto branşlarına `per_origin` göndermiyordu; ajanın
 * compute_discount aracı her çağrıda "iskonto edilecek ödeme satırı yok" dedi.
 */
import { describe, it, expect } from "vitest";
import { buildDiscountSnapshot } from "@/components/DiscountAgentBridge";
import { buildFlatRateFn, discountBranch } from "@/lib/discount-engine";
import type { Branch, Period } from "@/types/project";
import type { Triangle } from "@/types/triangle";

const tri = {
  origin_periods: ["2021", "2022", "2023"],
  development_periods: [0, 1, 2],
  values: [[100, 150, 165], [120, 180, null], [130, null, null]],
  triangle_type: "incurred",
  origin_granularity: "yearly",
  development_granularity: "yearly",
} as Triangle;

const PATTERN = {
  "2021": [{ month: 3, weight: 1 }],
  "2022": [{ month: 6, weight: 0.6 }, { month: 18, weight: 0.4 }],
  "2023": [{ month: 6, weight: 0.3 }, { month: 18, weight: 0.4 }, { month: 30, weight: 0.3 }],
};

function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: "b1", name: "Fire", frequency: "yearly", createdAt: "", updatedAt: "",
    triangle: tri, paidTriangle: tri,
    method: "volume_weighted", window: "all", excludedCells: [],
    premiums: {}, lrInputPerOrigin: {}, basisPerOrigin: {},
    correctionPerOrigin: {}, cdfInitial: {}, cdfChoicePerPeriod: {},
    cdfModelPerPeriod: {}, curveIncludePerPeriod: {}, history: [],
    ...over,
  } as unknown as Branch;
}

const period = (b: Branch) => ({ id: "p1", label: "2026Q2", branches: [b] }) as unknown as Period;

describe("buildDiscountSnapshot", () => {
  it("desen varsa compute_discount için kaza yılı satırlarını gönderir", () => {
    const b = branch({ cashflowMonthlyPattern: PATTERN } as Partial<Branch>);
    const snap = buildDiscountSnapshot([period(b)], b);
    const row = snap.branches[0];
    expect(row.per_origin.map((r) => r.origin)).toEqual(["2021", "2022", "2023"]);
    expect(row.per_origin[1].months).toEqual([[6, 0.6], [18, 0.4]]);
    expect(row.per_origin[1].avg_month).toBeCloseTo(6 * 0.6 + 18 * 0.4, 9);
  });

  it("gönderilen satırlar bridge'in hazır %30 özetiyle aynı BEL'i verir", () => {
    const b = branch({ cashflowMonthlyPattern: PATTERN } as Partial<Branch>);
    const row = buildDiscountSnapshot([period(b)], b).branches[0];
    const pattern = Object.fromEntries(
      row.per_origin.map((r) => [r.origin, r.months.map(([month, weight]) => ({ month, weight }))]),
    );
    const bel = discountBranch(row.per_origin, pattern, buildFlatRateFn(0.3)).totals.bel;
    expect(Math.round(bel)).toBe(row.quick_discount_at_30pct!.discounted_unpaid);
  });

  it("desen yoksa satır göndermez (araç nakit akışı uyarısı verir)", () => {
    const b = branch();
    expect(buildDiscountSnapshot([period(b)], b).branches[0].per_origin).toEqual([]);
  });
});
