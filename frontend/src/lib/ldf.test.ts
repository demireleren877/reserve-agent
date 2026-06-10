import { describe, it, expect } from "vitest";
import {
  developmentRatios,
  aggregateLDFs,
  cumulativeFactors,
  ldfAt,
  cascadeCDFs,
  cellKey,
} from "@/lib/ldf";
import type { Triangle } from "@/types/triangle";

function tri(values: (number | null)[][]): Triangle {
  return {
    origin_periods: values.map((_, i) => String(2020 + i)),
    development_periods: values[0].map((_, j) => j + 1),
    values,
    triangle_type: "paid",
    origin_granularity: "yearly",
    development_granularity: "yearly",
  } as Triangle;
}

const SAMPLE = tri([
  [1000, 1500, 1700, 1750],
  [1100, 1600, 1800, null],
  [1200, 1700, null, null],
  [1300, null, null, null],
]);

describe("developmentRatios", () => {
  it("b/a oranı hesaplar", () => {
    const r = developmentRatios(SAMPLE, new Set());
    expect(r[0][0].value).toBeCloseTo(1500 / 1000);
    expect(r[0][1].value).toBeCloseTo(1700 / 1500);
  });
  it("eksik hücre null", () => {
    const r = developmentRatios(SAMPLE, new Set());
    expect(r[1][2].value).toBeNull(); // 1800→null
  });
  it("elenen hücre işaretli", () => {
    const r = developmentRatios(SAMPLE, new Set([cellKey("2020", 0)]));
    expect(r[0][0].excluded).toBe(true);
    expect(r[1][0].excluded).toBe(false);
  });
});

describe("aggregateLDFs — volume_weighted", () => {
  it("Σb/Σa tüm origin", () => {
    const r = developmentRatios(SAMPLE, new Set());
    const ldfs = aggregateLDFs(SAMPLE, r, "all", "volume_weighted");
    // step0: (1500+1600+1700)/(1000+1100+1200) = 4800/3300
    expect(ldfs[0]).toBeCloseTo(4800 / 3300);
    // step1: (1700+1800)/(1500+1600) = 3500/3100
    expect(ldfs[1]).toBeCloseTo(3500 / 3100);
  });
  it("window=2 son 2 origin", () => {
    const r = developmentRatios(SAMPLE, new Set());
    const ldfs = aggregateLDFs(SAMPLE, r, 2, "volume_weighted");
    // step0 son 2 qualifying origin: 2021(1100→1600), 2022(1200→1700)
    expect(ldfs[0]).toBeCloseTo((1600 + 1700) / (1100 + 1200));
  });
  it("elenen hücre hariç", () => {
    const r = developmentRatios(SAMPLE, new Set([cellKey("2020", 0)]));
    const ldfs = aggregateLDFs(SAMPLE, r, "all", "volume_weighted");
    expect(ldfs[0]).toBeCloseTo((1600 + 1700) / (1100 + 1200));
  });
});

describe("aggregateLDFs — simple & geometric", () => {
  it("simple_average", () => {
    const r = developmentRatios(SAMPLE, new Set());
    const ldfs = aggregateLDFs(SAMPLE, r, "all", "simple_average");
    const exp = (1500 / 1000 + 1600 / 1100 + 1700 / 1200) / 3;
    expect(ldfs[0]).toBeCloseTo(exp);
  });
  it("geometric_average", () => {
    const r = developmentRatios(SAMPLE, new Set());
    const ldfs = aggregateLDFs(SAMPLE, r, "all", "geometric_average");
    const exp = Math.cbrt((1500 / 1000) * (1600 / 1100) * (1700 / 1200));
    expect(ldfs[0]).toBeCloseTo(exp);
  });
  it("boş pairs → 1", () => {
    const t = tri([[1000, null]]);
    const r = developmentRatios(t, new Set());
    const ldfs = aggregateLDFs(t, r, "all", "volume_weighted");
    expect(ldfs[0]).toBe(1);
  });
});

describe("aggregateLDFs — perStepWindow (karma)", () => {
  it("step bazlı pencere override", () => {
    const r = developmentRatios(SAMPLE, new Set());
    // step0 için window=2, diğerleri all
    const ldfs = aggregateLDFs(SAMPLE, r, "all", "volume_weighted", { "0": 2 });
    expect(ldfs[0]).toBeCloseTo((1600 + 1700) / (1100 + 1200));
    // step1 hâlâ all
    expect(ldfs[1]).toBeCloseTo(3500 / 3100);
  });
});

describe("cumulativeFactors", () => {
  it("cdfs[j] = ldfs[j..end] çarpımı", () => {
    const cdfs = cumulativeFactors([1.5, 1.2, 1.1]);
    expect(cdfs[2]).toBeCloseTo(1.1);
    expect(cdfs[1]).toBeCloseTo(1.2 * 1.1);
    expect(cdfs[0]).toBeCloseTo(1.5 * 1.2 * 1.1);
  });
  it("boş → boş", () => {
    expect(cumulativeFactors([])).toEqual([]);
  });
});

describe("ldfAt", () => {
  it("cdf[i]/cdf[i+1] tek adım LDF", () => {
    const cdfs = [1.98, 1.32, 1.1];
    expect(ldfAt(cdfs, 0)).toBeCloseTo(1.98 / 1.32);
    expect(ldfAt(cdfs, 2)).toBeCloseTo(1.1 / 1); // son: cdf[2]/1
  });
  it("aralık dışı → null", () => {
    expect(ldfAt([1.1], 5)).toBeNull();
  });
});

describe("cascadeCDFs", () => {
  const devs = [1, 2, 3, 4];
  const selected = [1.5, 1.2, 1.1]; // 3 LDF, 4 dev

  it("override yoksa initial cascade = cumulativeFactors", () => {
    const { effective, initial } = cascadeCDFs(devs, selected, {}, {});
    const base = cumulativeFactors(selected);
    // effective[i] ≈ initial[i] ≈ base[i] (son period = 1)
    expect(effective[0]).toBeCloseTo(base[0]);
    expect(effective[3]).toBeCloseTo(1);
    expect(initial[0]).toBeCloseTo(base[0]);
  });

  it("user value (model 6) ankor olur", () => {
    // dev "3" period (idx 2) için user CDF = 1.05
    const { effective } = cascadeCDFs(
      devs,
      selected,
      { "3": "user" },
      { "3": 1.05 },
    );
    expect(effective[2]).toBeCloseTo(1.05);
    // önceki period idx1 = LDF[1] × eff[2] = 1.2 × 1.05
    expect(effective[1]).toBeCloseTo(1.2 * 1.05);
  });

  it("tail truncation: ileri user=1 önceki yaşları indirir", () => {
    const { effective } = cascadeCDFs(
      devs,
      selected,
      { "3": "user", "4": "user" },
      { "3": 1, "4": 1 },
    );
    expect(effective[2]).toBeCloseTo(1);
    expect(effective[1]).toBeCloseTo(1.2);
    expect(effective[0]).toBeCloseTo(1.5 * 1.2);
  });

  it("effLDFs effective'den türetilir", () => {
    const { effective, effLDFs } = cascadeCDFs(devs, selected, {}, {});
    expect(effLDFs[0]).toBeCloseTo(effective[0] / effective[1]);
  });
});
