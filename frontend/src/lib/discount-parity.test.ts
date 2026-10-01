/**
 * Ajan ile İskonto ekranı aynı rakamı söylemeli.
 *
 * Aynı satırlar backend testinde (test_compute_discount_parity.py) compute_discount'a
 * verilir ve AYNI sabitler beklenir. Sabitler iki uygulamadan bağımsız, formülle
 * hesaplandı: BEL = Σ unpaid · w / (1 + r(m))^(m/12).
 * Satırlar kötü durumları da içeriyor: deseni boş kaza yılı (BEL'e 0 katar) ve
 * negatif tutar (atlanmaz).
 */
import { describe, it, expect } from "vitest";
import { buildCurveFn, buildFlatRateFn, discountBranch, DEFAULT_RISK_FREE_CURVE } from "@/lib/discount-engine";

const rows = [
  { origin: "2022", unpaid: -50_000 },
  { origin: "2023", unpaid: 1_000_000 },
  { origin: "2024", unpaid: 2_500_000 },
  { origin: "2025", unpaid: 400_000 },
];
const pattern = {
  "2022": [{ month: 12, weight: 1.0 }],
  "2023": [{ month: 6, weight: 0.5 }, { month: 18, weight: 0.3 }, { month: 30, weight: 0.2 }],
  "2024": [{ month: 3, weight: 0.4 }, { month: 15, weight: 0.4 }, { month: 40, weight: 0.2 }],
  // 2025 desensiz
};

describe("iskonto paralelliği (ekran tarafı)", () => {
  it("SEDDK %30 sabit oran", () => {
    const r = discountBranch(rows, pattern, buildFlatRateFn(0.3));
    expect(r.totals.unpaid).toBe(3_850_000);
    expect(r.totals.bel).toBeCloseTo(2_571_693.617067, 4);
  });
  it("varsayılan risksiz eğri", () => {
    const r = discountBranch(rows, pattern, buildCurveFn(DEFAULT_RISK_FREE_CURVE));
    expect(r.totals.bel).toBeCloseTo(2_630_228.273401, 4);
  });
});
