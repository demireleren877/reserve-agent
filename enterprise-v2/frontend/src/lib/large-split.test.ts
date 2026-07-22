import { describe, it, expect } from "vitest";
import {
  subtractTriangle,
  completeLarge,
  deriveAttritional,
  hasLarge,
  computeLargeSummary,
  computeAttritionalSummary,
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

  it("large > gross → SIFIRLAMA YOK, negatif değer korunur + flag", () => {
    const g = tri([[100, 150, 165]]);
    const l = tri([[120, 40, 10]]); // ilk hücre gross'tan büyük
    const { tri: a, negativeCells } = subtractTriangle(g, l);
    expect(a.values[0]).toEqual([-20, 110, 155]); // -20 kırpılmadı
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

  it("large daha az gelişim sütunu → kümülatif CARRY-FORWARD (rapor dönemine kadar)", () => {
    // Large 2017 dev0'da 10 ile başlayıp durur → dev1,dev2'de de 10 (kümülatif korunur).
    const g = tri([[100, 150, 165]]);
    const l: Triangle = { ...tri([[10]]), development_periods: [0] };
    const { tri: a } = subtractTriangle(g, l);
    expect(a.values[0]).toEqual([90, 140, 155]); // 150−10, 165−10
  });

  it("carry-forward: large son hareketten sonra aynı tutarla taşınır", () => {
    const g = tri([[100, 150, 165]]);
    const l = tri([[10, 20, null]]); // dev2 hareketi yok → 20 taşınır
    const { tri: a } = subtractTriangle(g, l);
    expect(a.values[0]).toEqual([90, 130, 145]); // 165−20
  });
});

describe("completeLarge — gross şekline carry-forward", () => {
  it("large'ı gross boyutuna tamamlar, son değeri taşır", () => {
    const g = tri([
      [100, 150, 165],
      [120, 180, null],
      [130, null, null],
    ]);
    const l: Triangle = { ...tri([[10, 20]]), development_periods: [0, 1] };
    const c = completeLarge(g, l)!;
    // 2021: 10, 20, 20 (dev2 taşındı) ; 2022: large yok → 0 ; 2023: 0
    expect(c.values[0]).toEqual([10, 20, 20]);
    expect(c.values[1]).toEqual([0, 0, null]); // gross null olan hücre null
    expect(c.development_periods).toEqual([0, 1, 2]); // gross şekli
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

describe("computeAttritionalSummary", () => {
  it("attritional = gross − large CL (ana parametrelerle)", () => {
    const b = branch({
      triangle: tri([
        [100, 160, 182],
        [120, 192, null],
        [130, null, null],
      ], "incurred"),
      incurredTriangle: tri([
        [100, 160, 182],
        [120, 192, null],
        [130, null, null],
      ], "incurred"),
      largeIncurredTriangle: tri([
        [20, 40, 50],
        [24, 48, null],
        [26, null, null],
      ], "incurred"),
    });
    // Attritional: 80,120,132 / 96,144 / 104 → LDF0=1.5, LDF1=1.1
    // 2023:104*1.65=171.6 (ibnr67.6); 2022:144*1.1=158.4 (14.4); 2021:132 (0)
    const s = computeAttritionalSummary(b)!;
    expect(s.totals.ibnr).toBeCloseTo(82.0, 4);
    expect(s.totals.selected_ultimate).toBeCloseTo(462.0, 4);
  });
});

describe("computeLargeSummary largeModel", () => {
  it("largeModel.window son 1 → yalnız son link kullanılır", () => {
    // 4 gelişim large incurred; window=1 sadece son diyagonal LDF'ini alır.
    const b = branch({
      triangle: tri([[0]], "incurred"),
      largeIncurredTriangle: {
        origin_periods: ["2020", "2021", "2022", "2023"],
        development_periods: [0, 1, 2, 3],
        values: [
          [100, 200, 240, 252],
          [100, 200, 240, null],
          [100, 210, null, null],
          [100, null, null, null],
        ],
        triangle_type: "incurred",
        origin_granularity: "yearly",
        development_granularity: "yearly",
      },
      largeModel: { window: "all" },
    });
    const all = computeLargeSummary(b)!;
    const win1 = computeLargeSummary({ ...b, largeModel: { window: 1 } })!;
    // İlk LDF farkı: all → (200+200+210)/(100+100+100)=2.033; win1 → 210/100=2.1
    // Bu yüzden toplam IBNR farklı olmalı (window largeModel'den okunuyor kanıtı).
    expect(win1.totals.ibnr).not.toBeCloseTo(all.totals.ibnr, 1);
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
