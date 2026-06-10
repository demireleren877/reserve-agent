import { describe, it, expect } from "vitest";
import { computeCashflowBranchSummary } from "@/lib/cashflow-pipeline";
import type { Branch } from "@/types/project";
import type { Triangle } from "@/types/triangle";

function paidTri(values: (number | null)[][]): Triangle {
  return {
    origin_periods: values.map((_, i) => String(2020 + i)),
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
    triangle: null,
    paidTriangle: paidTri([
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

describe("computeCashflowBranchSummary", () => {
  it("paid üçgeni olmayan branş boş özet döner", () => {
    const s = computeCashflowBranchSummary(branch({ paidTriangle: null }));
    expect(s.has_paid_triangle).toBe(false);
    expect(s.per_dev).toEqual([]);
    expect(s.ldf_window).toBe("all");
  });

  it("paid üçgeninden LDF/CDF hesaplar", () => {
    const s = computeCashflowBranchSummary(branch());
    expect(s.has_paid_triangle).toBe(true);
    expect(s.n_origins).toBe(4);
    expect(s.selected_ldfs[0]).toBeCloseTo(4800 / 3300, 6);
    // cdfs[j] = ldfs[j..end] çarpımı; son eleman = son LDF
    expect(s.initial_cdfs).toHaveLength(3);
    expect(s.initial_cdfs[2]).toBeCloseTo(1750 / 1700, 6);
    expect(s.initial_cdfs[0]).toBeGreaterThan(s.initial_cdfs[2]);
  });

  it("cashflow'a özel window kullanılır (rezerv window'undan bağımsız)", () => {
    const all = computeCashflowBranchSummary(branch());
    const w = computeCashflowBranchSummary(
      branch({ window: "all", cashflowLdfWindow: 2 } as Partial<Branch>),
    );
    // Son 2 origin bazlı agregasyon farklı LDF üretir
    expect(w.ldf_window).toBe("2");
    expect(w.selected_ldfs[0]).not.toBeCloseTo(all.selected_ldfs[0], 6);
  });

  it("elenen hücreler LDF hesabından çıkar ve listelenir", () => {
    const s = computeCashflowBranchSummary(
      branch({ cashflowLdfExcludedCells: ["2022|0"] } as Partial<Branch>),
    );
    expect(s.excluded_cells_count).toBe(1);
    expect(s.excluded_cells).toEqual([{ origin: "2022", step: 0 }]);
    expect(s.selected_ldfs[0]).toBeCloseTo(3100 / 2100, 6);
  });

  it("model 6 (user value) per_dev satırında görünür ve CDF'e yansır", () => {
    const s = computeCashflowBranchSummary(
      branch({
        cashflowCdfModelPerPeriod: { "4": 6 },
        cashflowCdfInitial: { "4": 1.3 },
      } as Partial<Branch>),
    );
    const last = s.per_dev[s.per_dev.length - 1];
    expect(last.model).toBe(6);
    expect(last.user_value).toBe(1.3);
    expect(s.effective_cdfs[3]).toBeCloseTo(1.3, 6);
  });

  it("model 1 satırlarında user_value null", () => {
    const s = computeCashflowBranchSummary(branch());
    expect(s.per_dev.every((d) => d.model === 1 && d.user_value === null)).toBe(
      true,
    );
    expect(s.per_dev.map((d) => d.step_idx)).toEqual([0, 1, 2, 3]);
  });
});
