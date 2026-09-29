import { describe, it, expect } from "vitest";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import type { Branch } from "@/types/project";

// Üçgen (paid, yıllık): 3 kaza yılı × 3 gelişim
//   2021: 100, 150, 165
//   2022: 120, 180, —
//   2023: 130,  —,  —
// LDF 0→1 (volume) = (150+180)/(100+120) = 330/220 = 1.5
// LDF 1→2         = 165/150 = 1.1
// CDF (curve/override yok) = [1.65, 1.1, 1]
function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: "b", name: "T", frequency: "yearly", createdAt: "", updatedAt: "",
    triangle: {
      origin_periods: ["2021", "2022", "2023"],
      development_periods: [0, 1, 2],
      values: [
        [100, 150, 165],
        [120, 180, null],
        [130, null, null],
      ],
      triangle_type: "paid",
      origin_granularity: "yearly",
      development_granularity: "yearly",
    },
    method: "volume_weighted",
    window: "all",
    excludedCells: [],
    premiums: {},
    lrInputPerOrigin: {},
    basisPerOrigin: {},
    cdfInitial: {},
    cdfChoicePerPeriod: {},
    cdfModelPerPeriod: {},
    curveIncludePerPeriod: {},
    correctionPerOrigin: {},
    history: [],
    ...over,
  } as unknown as Branch;
}

describe("computeBranchSummary — Ultimate/IBNR ile aynı yöntem", () => {
  it("chain-ladder IBNR elle hesapla tutar (curve yok)", () => {
    const s = computeBranchSummary(branch());
    // 2023: latest 130 @dev0, cdf 1.65 → cl 214.5, ibnr 84.5
    // 2022: latest 180 @dev1, cdf 1.1  → cl 198,   ibnr 18
    // 2021: latest 165 @dev2, cdf 1    → cl 165,   ibnr 0
    const r23 = s.rows.find((r) => r.origin === "2023")!;
    const r22 = s.rows.find((r) => r.origin === "2022")!;
    expect(r23.cl_ultimate).toBeCloseTo(214.5, 4);
    expect(r23.ibnr).toBeCloseTo(84.5, 4);
    expect(r22.cl_ultimate).toBeCloseTo(198, 4);
    expect(r22.ibnr).toBeCloseTo(18, 4);
    expect(s.totals.ibnr).toBeCloseTo(102.5, 4);   // 84.5 + 18
    expect(s.totals.selected_ultimate).toBeCloseTo(577.5, 4); // 165+198+214.5
  });

  it("BF basis + kullanıcı ELR elle hesapla tutar", () => {
    const s = computeBranchSummary(branch({
      premiums: { "2023": 200 } as Record<string, number>,
      basisPerOrigin: { "2023": "bf" } as Record<string, "cl" | "bf">,
      lrInputPerOrigin: { "2023": "1.0" } as Record<string, string>,
    }));
    // 2023: cl 214.5 → pctDev 130/214.5 = 0.606061
    // bfUlt = 130 + 1.0*200*(1-0.606061) = 130 + 78.7879 = 208.7879
    const r23 = s.rows.find((r) => r.origin === "2023")!;
    expect(r23.basis).toBe("bf");
    expect(r23.bf_ultimate).toBeCloseTo(208.7879, 3);
    expect(r23.selected_ultimate).toBeCloseTo(208.7879, 3);
    expect(r23.ibnr).toBeCloseTo(78.7879, 3);
    // Toplam: 2023 bf ibnr + 2022 cl 18 + 2021 0
    expect(s.totals.ibnr).toBeCloseTo(96.7879, 3);
  });

  it("kullanıcı CDF override uygulanır (dev0 → 2.0)", () => {
    const s = computeBranchSummary(branch({
      cdfChoicePerPeriod: { "0": "user" } as Record<string, "initial" | "user">,
      cdfInitial: { "0": 2.0 } as Record<string, number>,
    }));
    // dev0 CDF 2.0 → 2023 cl = 130*2 = 260, ibnr = 130
    const r23 = s.rows.find((r) => r.origin === "2023")!;
    expect(r23.cl_ultimate).toBeCloseTo(260, 4);
    expect(r23.ibnr).toBeCloseTo(130, 4);
  });

  it("curve modeli (exp) effektif LDF'i değiştirir → düz CL'den farklı sonuç (fix kanıtı)", () => {
    // 4 gelişim → 3 LDF [2.0, 1.2, 1.05]; exp fit 3 noktaya birebir oturmaz → farklılaşır.
    const tri = {
      origin_periods: ["2020", "2021", "2022", "2023"],
      development_periods: [0, 1, 2, 3],
      values: [
        [100, 200, 240, 252],
        [100, 200, 240, null],
        [100, 200, null, null],
        [100, null, null, null],
      ],
      triangle_type: "paid",
      origin_granularity: "yearly",
      development_granularity: "yearly",
    };
    const plain = computeBranchSummary(branch({ triangle: tri } as Partial<Branch>));
    const withModel = computeBranchSummary(branch({
      triangle: tri,
      cdfModelPerPeriod: { "1": 2 } as Record<string, 1 | 2 | 3 | 4 | 5 | 6>, // dev1 = Exp. Decay
    } as Partial<Branch>));
    // Model uygulandığında effektif LDF (dolayısıyla IBNR) düz CL'den farklı olmalı.
    expect(withModel.totals.ibnr).not.toBeCloseTo(plain.totals.ibnr, 2);
  });
});
