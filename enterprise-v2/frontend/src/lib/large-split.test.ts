import { describe, it, expect } from "vitest";
import {
  subtractTriangle,
  deriveAttritional,
  hasLarge,
  computeLargeSummary,
  combineTotals,
} from "@/lib/large-split";
import type { Triangle } from "@/types/triangle";
import type { Branch } from "@/types/project";

function tri(values: (number | null)[][], type: "paid" | "incurred" = "incurred"): Triangle {
  return {
    origin_periods: ["2021", "2022", "2023"].slice(0, values.length),
    development_periods: [0, 1, 2],
    values,
    triangle_type: type,
    origin_granularity: "yearly",
    development_granularity: "yearly",
  };
}

function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: "b", name: "T", frequency: "yearly", createdAt: "", updatedAt: "",
    triangle: null, method: "volume_weighted", window: "all", excludedCells: [],
    premiums: {}, lrInputPerOrigin: {}, basisPerOrigin: {}, correctionPerOrigin: {},
    cdfInitial: {}, cdfChoicePerPeriod: {}, cdfModelPerPeriod: {}, curveIncludePerPeriod: {},
    ...over,
  } as unknown as Branch;
}

describe("subtractTriangle", () => {
  it("hücre bazında gross − large, null korunur", () => {
    const g = tri([
      [100, 150, 165],
      [120, 180, null],
      [130, null, null],
    ]);
    const l = tri([
      [10, 20, 25],
      [15, 30, null],
      [20, null, null],
    ]);
    const { tri: a, negativeCells } = subtractTriangle(g, l);
    expect(a.values).toEqual([
      [90, 130, 140],
      [105, 150, null],
      [110, null, null],
    ]);
    expect(negativeCells).toEqual([]);
  });

  it("large yoksa gross aynen döner", () => {
    const g = tri([[100, 150, 165]]);
    const { tri: a } = subtractTriangle(g, null);
    expect(a).toBe(g);
  });

  it("large > gross → 0'a kırpar + flag", () => {
    const g = tri([[100, 150, 165]]);
    const l = tri([[120, 40, 10]]); // ilk hücre gross'tan büyük
    const { tri: a, negativeCells } = subtractTriangle(g, l);
    expect(a.values[0]).toEqual([0, 110, 155]);
    expect(negativeCells).toEqual(["2021|0"]);
  });

  it("large'da olmayan origin/hücre = 0 çıkarılır (gross korunur)", () => {
    const g = tri([
      [100, 150, 165],
      [120, 180, null],
    ]);
    const l = tri([[10, 20, 25]]); // sadece 2021 var
    const { tri: a } = subtractTriangle(g, l);
    expect(a.values[0]).toEqual([90, 130, 140]);
    expect(a.values[1]).toEqual([120, 180, null]); // 2022 large yok → gross
  });

  it("large daha az gelişim sütunu → eksik dev = 0", () => {
    const g = tri([[100, 150, 165]]);
    const l: Triangle = { ...tri([[10]]), development_periods: [0] };
    const { tri: a } = subtractTriangle(g, l);
    expect(a.values[0]).toEqual([90, 150, 165]);
  });
});

describe("deriveAttritional & hasLarge", () => {
  it("hasLarge doğru", () => {
    expect(hasLarge(branch())).toBe(false);
    expect(hasLarge(branch({ largePaidTriangle: tri([[1]]) }))).toBe(true);
  });

  it("paid ve incurred ayrı ayrı çıkarılır", () => {
    const b = branch({
      triangle: tri([[100, 150, 165]], "incurred"),
      paidTriangle: tri([[60, 90, 100]], "paid"),
      incurredTriangle: tri([[100, 150, 165]], "incurred"),
      largePaidTriangle: tri([[10, 15, 20]], "paid"),
      largeIncurredTriangle: tri([[20, 30, 40]], "incurred"),
    });
    const a = deriveAttritional(b);
    expect(a.paid!.values[0]).toEqual([50, 75, 80]);
    expect(a.incurred!.values[0]).toEqual([80, 120, 125]);
  });
});

describe("computeLargeSummary (düz CL)", () => {
  it("large incurred üçgeninde CL ultimate/ibnr", () => {
    // large incurred:
    //  2021: 20, 30, 33
    //  2022: 24, 36, —
    //  2023: 26, —, —
    // LDF0 = (30+36)/(20+24)=66/44=1.5 ; LDF1 = 33/30=1.1 ; CDF=[1.65,1.1,1]
    const b = branch({
      triangle: tri([[0]], "incurred"),
      largeIncurredTriangle: tri([
        [20, 30, 33],
        [24, 36, null],
        [26, null, null],
      ], "incurred"),
    });
    const s = computeLargeSummary(b)!;
    const r23 = s.rows.find((r) => r.origin === "2023")!;
    expect(r23.cl_ultimate).toBeCloseTo(42.9, 4); // 26*1.65
    expect(r23.ibnr).toBeCloseTo(16.9, 4);
    // 2022: 36*1.1=39.6, ibnr 3.6 ; 2021: 33, ibnr 0
    expect(s.totals.ibnr).toBeCloseTo(20.5, 4); // 16.9 + 3.6
  });

  it("large yoksa null", () => {
    expect(computeLargeSummary(branch())).toBeNull();
  });
});

describe("combineTotals", () => {
  it("attritional + large = toplam", () => {
    const c = combineTotals(
      { totals: { latest: 400, selected_ultimate: 577.5, ibnr: 102.5 } as never },
      { totals: { latest: 80, selected_ultimate: 115.5, ibnr: 20.5 } as never },
    );
    expect(c.total.ibnr).toBeCloseTo(123, 4);
    expect(c.total.selected_ultimate).toBeCloseTo(693, 4);
    expect(c.total.latest).toBe(480);
  });
});
