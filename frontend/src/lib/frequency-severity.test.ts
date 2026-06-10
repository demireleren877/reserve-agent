import { describe, it, expect } from "vitest";
import { computeFrequencySeverity } from "@/lib/frequency-severity";
import type { Triangle } from "@/types/triangle";

function tri(values: (number | null)[][]): Triangle {
  return {
    origin_periods: values.map((_, i) => String(2020 + i)),
    development_periods: values[0].map((_, j) => j),
    values,
    triangle_type: "incurred",
    origin_granularity: "yearly",
    development_granularity: "yearly",
  } as Triangle;
}

const COUNT = tri([
  [10, 15, 17],
  [12, 18, null],
  [14, null, null],
]);
const AMOUNT = tri([
  [1000, 1800, 2210],
  [1320, 2520, null],
  [1680, null, null],
]);

describe("computeFrequencySeverity — backend ile birebir", () => {
  const res = computeFrequencySeverity(AMOUNT, COUNT);

  it("adet LDF volume-weighted", () => {
    expect(res.countLdfs[0]).toBeCloseTo(33 / 22); // (15+18)/(10+12)
    expect(res.countLdfs[1]).toBeCloseTo(17 / 15);
  });
  it("şiddet LDF (tutar/adet)", () => {
    // sev: o0=100,120,130 ; o1=110,140 ; o2=120
    expect(res.severityLdfs[0]).toBeCloseTo(260 / 210); // (120+140)/(100+110)
    expect(res.severityLdfs[1]).toBeCloseTo(130 / 120);
  });
  it("2022 ult adet × ult şiddet = ult hasar", () => {
    const r = res.rows.find((x) => x.origin === "2022")!;
    const expUltCount = 14 * (33 / 22) * (17 / 15);
    const expUltSev = 120 * (260 / 210) * (130 / 120);
    expect(r.ultimateCount).toBeCloseTo(expUltCount);
    expect(r.ultimateSeverity).toBeCloseTo(expUltSev);
    expect(r.ultimateLoss).toBeCloseTo(expUltCount * expUltSev);
    expect(r.ibnr).toBeCloseTo(expUltCount * expUltSev - 1680);
  });
  it("totals tutarlı", () => {
    expect(res.totals.ibnr).toBeCloseTo(res.totals.ultimateLoss - res.totals.latestAmount);
  });
});

describe("computeFrequencySeverity — edge", () => {
  it("tam gelişmiş origin IBNR≈0", () => {
    const c = tri([[10, 15], [12, null]]);
    const a = tri([[1000, 1800], [1320, null]]);
    const res = computeFrequencySeverity(a, c);
    const r0 = res.rows.find((x) => x.origin === "2020")!;
    expect(r0.countCdf).toBeCloseTo(1);
    expect(r0.ibnr).toBeCloseTo(0);
  });
  it("adet=0 origin → şiddet null, ult hasar 0", () => {
    const c = tri([[10, 15], [0, null]]);
    const a = tri([[1000, 1800], [0, null]]);
    const res = computeFrequencySeverity(a, c);
    const r1 = res.rows.find((x) => x.origin === "2021")!;
    expect(r1.latestSeverity).toBeNull();
    expect(r1.ultimateLoss).toBe(0);
  });
  it("excludedOrigins LDF'i değiştirir", () => {
    const c = tri([[10, 15], [12, 30]]);
    const a = tri([[1000, 1500], [1200, 3000]]);
    const full = computeFrequencySeverity(a, c);
    const excl = computeFrequencySeverity(a, c, { excludedOrigins: new Set(["2021"]) });
    expect(excl.countLdfs[0]).toBeCloseTo(1.5); // sadece origin0
    expect(full.countLdfs[0]).not.toBeCloseTo(1.5);
  });
  it("nYears penceresi", () => {
    const c = tri([[10, 15], [20, 28], [30, null]]);
    const a = tri([[1000, 1500], [2000, 2800], [3000, null]]);
    const res = computeFrequencySeverity(a, c, { nYears: 1 });
    expect(res.countLdfs[0]).toBeCloseTo(28 / 20); // en yeni qualifying origin
  });
});
