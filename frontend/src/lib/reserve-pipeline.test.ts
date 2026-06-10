import { describe, it, expect } from "vitest";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import type { Branch } from "@/types/project";
import type { Triangle } from "@/types/triangle";

function tri(values: (number | null)[][], origins?: string[]): Triangle {
  return {
    origin_periods: origins ?? values.map((_, i) => String(2020 + i)),
    development_periods: values[0].map((_, j) => j + 1),
    values,
    triangle_type: "paid",
    origin_granularity: "yearly",
    development_granularity: "yearly",
  } as Triangle;
}

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: "b1",
    name: "Test",
    frequency: "yearly",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    triangle: tri([
      [1000, 1500, 1700, 1750],
      [1100, 1600, 1800, null],
      [1200, 1700, null, null],
      [1300, null, null, null],
    ]),
    method: "volume_weighted",
    window: "all",
    excludedCells: [],
    premiums: {},
    lrInputPerOrigin: {},
    basisPerOrigin: {},
    correctionPerOrigin: {},
    cdfInitial: {},
    cdfChoicePerPeriod: {},
    cdfModelPerPeriod: {},
    curveIncludePerPeriod: {},
    history: [],
    ...overrides,
  } as Branch;
}

describe("computeBranchSummary", () => {
  it("üçgensiz branş boş özet döner", () => {
    const s = computeBranchSummary(branch({ triangle: null }));
    expect(s.has_triangle).toBe(false);
    expect(s.rows).toEqual([]);
    expect(s.totals.ibnr).toBe(0);
    expect(s.totals.ulr).toBeNull();
  });

  it("temel CL hesabı: full-developed origin IBNR=0, gençler CDF ile büyür", () => {
    const s = computeBranchSummary(branch());
    expect(s.has_triangle).toBe(true);
    expect(s.n_origins).toBe(4);
    expect(s.selected_ldfs[0]).toBeCloseTo(4800 / 3300, 6);

    const r2020 = s.rows.find((r) => r.origin === "2020")!;
    expect(r2020.cdf).toBe(1);
    expect(r2020.cl_ultimate).toBe(1750);
    expect(r2020.ibnr).toBe(0);

    const r2023 = s.rows.find((r) => r.origin === "2023")!;
    expect(r2023.cl_ultimate).toBeCloseTo(1300 * s.effective_cdfs[0], 6);
    expect(r2023.ibnr).toBeCloseTo(r2023.cl_ultimate - 1300, 6);
  });

  it("toplamlar satırların toplamıyla tutarlı", () => {
    const s = computeBranchSummary(branch({ premiums: { "2023": 2000 } }));
    const sum = (f: (r: (typeof s.rows)[0]) => number) =>
      s.rows.reduce((a, r) => a + f(r), 0);
    expect(s.totals.latest).toBeCloseTo(sum((r) => r.latest), 6);
    expect(s.totals.selected_ultimate).toBeCloseTo(
      sum((r) => r.selected_ultimate),
      6,
    );
    expect(s.totals.ibnr).toBeCloseTo(
      s.totals.selected_ultimate - s.totals.latest,
      6,
    );
    expect(s.totals.ulr).toBeCloseTo(s.totals.selected_ultimate / 2000, 6);
  });

  it("BF basis: manuel LR + correction ile bf_ultimate seçilir", () => {
    const s = computeBranchSummary(
      branch({
        premiums: { "2023": 1000 },
        correctionPerOrigin: { "2023": 2 },
        lrInputPerOrigin: { "2023": "75%" },
        basisPerOrigin: { "2023": "bf" },
      }),
    );
    const r = s.rows.find((x) => x.origin === "2023")!;
    expect(r.basis).toBe("bf");
    expect(r.correction).toBe(2);
    expect(r.premium_annual).toBe(2000);
    expect(r.selected_lr).toBeCloseTo(0.75, 6);
    expect(r.selected_lr_input).toBe("75%");
    // bf_ult_annual = latest + LR × premium_annual × (1−%dev); bf_ult = /k
    const expectedAnnual =
      1300 + 0.75 * 2000 * (1 - r.pct_developed!);
    expect(r.bf_ultimate).toBeCloseTo(expectedAnnual / 2, 6);
    expect(r.selected_ultimate).toBeCloseTo(r.bf_ultimate, 6);
  });

  it("manuel LR yoksa pattern ratio, o da yoksa 0.7 fallback", () => {
    const s = computeBranchSummary(
      branch({ premiums: { "2023": 2000 } }),
    );
    const withPrem = s.rows.find((r) => r.origin === "2023")!;
    expect(withPrem.selected_lr).toBeCloseTo(
      withPrem.cl_ultimate / 2000,
      6,
    );
    const noPrem = s.rows.find((r) => r.origin === "2022")!;
    expect(noPrem.selected_lr).toBe(0.7);
  });

  it("hücre eleme LDF'yi değiştirir", () => {
    const base = computeBranchSummary(branch());
    const excluded = computeBranchSummary(
      branch({ excludedCells: ["2022|0"] }),
    );
    // 2022 step0 elenince: (1500+1600)/(1000+1100)
    expect(excluded.selected_ldfs[0]).toBeCloseTo(3100 / 2100, 6);
    expect(excluded.selected_ldfs[0]).not.toBeCloseTo(
      base.selected_ldfs[0],
      6,
    );
  });

  it("curve user override effective CDF'e yansır", () => {
    // dev "3" (idx 2) için user anchor 1.05 — o yaştaki origin'in CDF'i olur
    const s = computeBranchSummary(
      branch({
        cdfChoicePerPeriod: { "3": "user" },
        cdfInitial: { "3": 1.05 },
      }),
    );
    expect(s.effective_cdfs[2]).toBeCloseTo(1.05, 6);
    const r2021 = s.rows.find((r) => r.origin === "2021")!;
    expect(r2021.cl_ultimate).toBeCloseTo(1800 * 1.05, 6);
  });

  it("formula_context '2022.0' origin'ini '2022' olarak normalize eder", () => {
    const s = computeBranchSummary(
      branch({
        triangle: tri(
          [
            [1000, 1500],
            [1100, null],
          ],
          ["2021.0", "2022.0"],
        ),
        premiums: { "2022.0": 500 },
      }),
    );
    expect(Object.keys(s.formula_context.cl_ult)).toEqual(["2021", "2022"]);
    expect(s.formula_context.exposure["2022"]).toBe(500);
    expect(s.formula_context.pattern["2022"]).toBeGreaterThan(0);
  });

  it("lrInput formülü pipeline içinde değerlendirilir (vw)", () => {
    const s = computeBranchSummary(
      branch({
        premiums: { "2020": 2000, "2023": 1000 },
        lrInputPerOrigin: { "2023": "vw(2020)" },
        basisPerOrigin: { "2023": "bf" },
      }),
    );
    const r = s.rows.find((x) => x.origin === "2023")!;
    // vw(2020) = cl_ult(2020) / exposure(2020) = 1750/2000
    expect(r.selected_lr).toBeCloseTo(1750 / 2000, 6);
  });
});
