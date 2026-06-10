import { describe, it, expect } from "vitest";
import {
  discountOrigin,
  discountBranch,
  buildFlatRateFn,
  buildCurveFn,
} from "@/lib/discount-engine";

describe("buildFlatRateFn / buildCurveFn", () => {
  it("flat her ayda aynı oran", () => {
    const f = buildFlatRateFn(0.3);
    expect(f(1)).toBe(0.3);
    expect(f(120)).toBe(0.3);
  });
  it("curve aya göre en yakın alt düğümü seçer", () => {
    const f = buildCurveFn([
      { month: 12, rate: 0.2 },
      { month: 24, rate: 0.4 },
    ]);
    expect(f(6)).toBe(0.2); // ilk düğümün altında → ilk oran
    expect(f(12)).toBe(0.2);
    expect(f(18)).toBe(0.2);
    expect(f(24)).toBe(0.4);
    expect(f(36)).toBe(0.4);
  });
});

describe("discountOrigin", () => {
  it("flat %10 ile iki ödemeli pattern", () => {
    const r = discountOrigin(
      "2020",
      1000,
      [
        { month: 12, weight: 0.5 },
        { month: 24, weight: 0.5 },
      ],
      buildFlatRateFn(0.1),
    );
    const v12 = 1 / Math.pow(1.1, 12 / 12);
    const v24 = 1 / Math.pow(1.1, 24 / 12);
    const expBel = 1000 * 0.5 * v12 + 1000 * 0.5 * v24;
    expect(r.bel).toBeCloseTo(expBel);
    expect(r.discountPct).toBeCloseTo((1000 - expBel) / 1000);
  });
  it("duration = son ödeme ayı (mevcut davranış)", () => {
    const r = discountOrigin(
      "2020",
      1000,
      [
        { month: 6, weight: 0.9 },
        { month: 36, weight: 0.1 },
      ],
      buildFlatRateFn(0.1),
    );
    expect(r.duration).toBe(36);
  });
  it("month=0 ödemesi iskonto edilmez (v=1)", () => {
    const r = discountOrigin("2020", 1000, [{ month: 0, weight: 1 }], buildFlatRateFn(0.5));
    expect(r.bel).toBeCloseTo(1000);
    expect(r.discountPct).toBeCloseTo(0);
  });
  it("boş pattern → bel 0", () => {
    const r = discountOrigin("2020", 1000, [], buildFlatRateFn(0.1));
    expect(r.bel).toBe(0);
  });
});

describe("discountBranch", () => {
  it("origin'leri toplar, totals tutarlı", () => {
    const pattern = {
      "2020": [{ month: 12, weight: 1 }],
      "2021": [{ month: 24, weight: 1 }],
    };
    const res = discountBranch(
      [
        { origin: "2020", unpaid: 1000 },
        { origin: "2021", unpaid: 2000 },
      ],
      pattern,
      buildFlatRateFn(0.1),
    );
    expect(res.totals.unpaid).toBe(3000);
    const expBel =
      1000 / Math.pow(1.1, 1) + 2000 / Math.pow(1.1, 2);
    expect(res.totals.bel).toBeCloseTo(expBel);
    expect(res.totals.discountPct).toBeCloseTo((3000 - expBel) / 3000);
    // toplam duration = max origin duration
    expect(res.totals.duration).toBe(24);
  });
  it("pattern eksik origin → o origin bel 0", () => {
    const res = discountBranch(
      [{ origin: "2099", unpaid: 1000 }],
      {},
      buildFlatRateFn(0.1),
    );
    expect(res.origins[0].bel).toBe(0);
  });
});

// ─── Standart katmanı (IFRS 4 / IFRS 17) ─────────────────────────────────────

import {
  buildRateFn,
  defaultDiscountConfig,
  discountWithStandard,
  riskAdjustmentForOrigin,
  SEDDK_FLAT_RATE_2025,
  type DiscountConfig,
} from "@/lib/discount-engine";

describe("defaultDiscountConfig", () => {
  it("ifrs4: SEDDK sabit oran, RA yok", () => {
    const c = defaultDiscountConfig("ifrs4");
    expect(c.rateMode).toBe("flat");
    expect(c.flatRate).toBe(SEDDK_FLAT_RATE_2025);
    expect(c.illiquidityPremiumBps).toBe(0);
    expect(c.riskAdjustment.method).toBe("none");
  });

  it("ifrs17: eğri + 100bp illikidite + RA %6", () => {
    const c = defaultDiscountConfig("ifrs17");
    expect(c.rateMode).toBe("curve");
    expect(c.curveNodes.length).toBeGreaterThan(0);
    expect(c.illiquidityPremiumBps).toBe(100);
    expect(c.riskAdjustment.method).toBe("pct_of_bel");
    expect(c.riskAdjustment.pctOfBel).toBeCloseTo(0.06);
  });
});

describe("buildRateFn", () => {
  it("rateMode none → her ay 0", () => {
    const c: DiscountConfig = { ...defaultDiscountConfig("ifrs4"), rateMode: "none" };
    expect(buildRateFn(c)(24)).toBe(0);
  });

  it("ifrs17 illikidite primi eğriye eklenir", () => {
    const c = defaultDiscountConfig("ifrs17"); // 12. ay %28 + 100bp
    expect(buildRateFn(c)(12)).toBeCloseTo(0.29, 6);
  });

  it("ifrs4'te illikidite primi uygulanmaz", () => {
    const c: DiscountConfig = {
      ...defaultDiscountConfig("ifrs4"),
      illiquidityPremiumBps: 500, // standard ifrs4 → yok sayılır
    };
    expect(buildRateFn(c)(12)).toBeCloseTo(SEDDK_FLAT_RATE_2025, 6);
  });
});

describe("discountWithStandard", () => {
  const rows = [{ origin: "2024", unpaid: 1_000_000 }];
  const pattern = {
    "2024": [
      { month: 12, weight: 0.6 },
      { month: 24, weight: 0.4 },
    ],
  };

  it("ifrs4: RA=0, lic = iskontolu unpaid", () => {
    const r = discountWithStandard(rows, pattern, defaultDiscountConfig("ifrs4"));
    expect(r.riskAdjustment.total).toBe(0);
    expect(r.lic).toBeCloseTo(r.base.totals.bel, 6);
    // %30 flat: 600k/1.3 + 400k/1.3²
    const expected = 600_000 / 1.3 + 400_000 / 1.3 ** 2;
    expect(r.base.totals.bel).toBeCloseTo(expected, 0);
  });

  it("ifrs4 nominal: BEL = unpaid", () => {
    const c: DiscountConfig = { ...defaultDiscountConfig("ifrs4"), rateMode: "none" };
    const r = discountWithStandard(rows, pattern, c);
    expect(r.base.totals.bel).toBeCloseTo(1_000_000, 6);
  });

  it("ifrs17 pct_of_bel: LIC = BEL × 1.06", () => {
    const r = discountWithStandard(rows, pattern, defaultDiscountConfig("ifrs17"));
    expect(r.riskAdjustment.total).toBeCloseTo(r.base.totals.bel * 0.06, 4);
    expect(r.lic).toBeCloseTo(r.base.totals.bel * 1.06, 4);
    expect(r.riskAdjustment.byOrigin["2024"]).toBeCloseTo(r.riskAdjustment.total, 6);
  });

  it("ifrs17 BEL, illikidite primi nedeniyle ifrs4-eğriden düşük", () => {
    const c17 = defaultDiscountConfig("ifrs17");
    const cNoIlp: DiscountConfig = { ...c17, illiquidityPremiumBps: 0 };
    const withIlp = discountWithStandard(rows, pattern, c17);
    const withoutIlp = discountWithStandard(rows, pattern, cNoIlp);
    expect(withIlp.base.totals.bel).toBeLessThan(withoutIlp.base.totals.bel);
  });

  it("cost_of_capital RA: adım adım kalan yükümlülük üzerinden", () => {
    const c: DiscountConfig = {
      ...defaultDiscountConfig("ifrs17"),
      rateMode: "flat",
      flatRate: 0.0, // iskontoyu sıfırla — RA hesabını izole et
      illiquidityPremiumBps: 0,
      riskAdjustment: {
        method: "cost_of_capital",
        pctOfBel: 0.06,
        cocRate: 0.06,
        capitalRatio: 0.1,
      },
    };
    const r = discountWithStandard(rows, pattern, c);
    // Kalan: [0,12] ayda 1.0M, [12,24] ayda 0.4M →
    // RA = 0.006 × (1.0M×1 + 0.4M×1) = 8400
    expect(r.riskAdjustment.total).toBeCloseTo(8_400, 0);
  });

  it("riskAdjustmentForOrigin none → 0", () => {
    const r = discountWithStandard(rows, pattern, defaultDiscountConfig("ifrs4"));
    expect(
      riskAdjustmentForOrigin(
        r.base.origins[0],
        { method: "none", pctOfBel: 0.06, cocRate: 0.06, capitalRatio: 0.1 },
        () => 0.3,
      ),
    ).toBe(0);
  });
});
