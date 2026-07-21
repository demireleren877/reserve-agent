import { describe, it, expect } from "vitest";
import {
  buildDisplayMatrix,
  originLengthOptions,
  devLengthOptions,
  type ViewOptions,
} from "@/lib/triangle-view";
import type { Triangle } from "@/types/triangle";

// Yıllık/yıllık kümülatif üçgen:
//   2000: 100, 150, 165
//   2001: 120, 180, —
//   2002: 130,  —,  —
function tri(over: Partial<Triangle> = {}): Triangle {
  return {
    origin_periods: ["2000", "2001", "2002"],
    development_periods: [0, 1, 2],
    values: [
      [100, 150, 165],
      [120, 180, null],
      [130, null, null],
    ],
    triangle_type: "paid",
    origin_granularity: "yearly",
    development_granularity: "yearly",
    ...over,
  };
}

const base: ViewOptions = {
  cumulative: true,
  transposed: false,
  view: "development",
  originLenMonths: 12,
  devLenMonths: 12,
  decimals: 0,
};

describe("buildDisplayMatrix — development", () => {
  it("kümülatif, toplama yok → girdiyle aynı", () => {
    const m = buildDisplayMatrix(tri(), base);
    expect(m.rows.map((r) => r.header)).toEqual(["2000", "2001", "2002"]);
    expect(m.rows[0].cells).toEqual([100, 150, 165]);
    expect(m.rows[1].cells).toEqual([120, 180, null]);
    expect(m.rows[2].cells).toEqual([130, null, null]);
  });

  it("artımsal → satır farkları", () => {
    const m = buildDisplayMatrix(tri(), { ...base, cumulative: false });
    expect(m.rows[0].cells).toEqual([100, 50, 15]);
    expect(m.rows[1].cells).toEqual([120, 60, null]);
  });

  it("origin toplama (24 ay = 2 yıl grupla)", () => {
    const m = buildDisplayMatrix(tri(), { ...base, originLenMonths: 24 });
    expect(m.rows.map((r) => r.header)).toEqual(["2000–2001", "2002"]);
    // grup0 artımsal: 220,110,15 → kümülatif 220,330,345
    expect(m.rows[0].cells).toEqual([220, 330, 345]);
    expect(m.rows[1].cells).toEqual([130, null, null]);
  });

  it("development toplama (24 ay = 2 dev grupla)", () => {
    const m = buildDisplayMatrix(tri(), { ...base, devLenMonths: 24 });
    // 2000 inc 100,50,15 → grup[0,1]=150, grup[2]=15 → kümülatif 150,165
    expect(m.rows[0].cells).toEqual([150, 165]);
    expect(m.rows[1].cells).toEqual([180, null]);
    expect(m.rows[2].cells).toEqual([130, null]);
  });
});

describe("buildDisplayMatrix — calendar", () => {
  it("takvim görünümü köşegenleri sütuna taşır (artımsal)", () => {
    const m = buildDisplayMatrix(tri(), {
      ...base,
      view: "calendar",
      cumulative: false,
    });
    // Son sütun = rapor dönemi (2002); boş gelecek dönemler (2003, 2004) YOK
    expect(m.columns).toEqual(["2000", "2001", "2002"]);
    // 2000 satırı: cal2000=100, cal2001=50, cal2002=15
    expect(m.rows[0].cells).toEqual([100, 50, 15]);
    // 2001 satırı: cal2001=120, cal2002=60
    expect(m.rows[1].cells).toEqual([null, 120, 60]);
    // takvim sütun toplamı (köşegen): 2001 = 50+120 = 170
    expect(m.totals[1]).toBe(170);
  });
});

describe("transpose", () => {
  it("eksenleri takas eder", () => {
    const m = buildDisplayMatrix(tri(), { ...base, transposed: true });
    expect(m.corner).toBe("Gelişim");
    expect(m.rows.length).toBe(3); // 3 gelişim satırı
    expect(m.columns).toEqual(["2000", "2001", "2002"]); // origin sütun
    // ilk gelişim satırı (dev1) tüm originlerin latest'i: 100,120,130
    expect(m.rows[0].cells).toEqual([100, 120, 130]);
  });
});

describe("uzunluk seçenekleri", () => {
  it("yıllık origin → 12,24,36; dev tavan 12", () => {
    const t = tri();
    expect(originLengthOptions(t)).toEqual([12, 24, 36]);
    expect(devLengthOptions(t)).toEqual([12]);
  });

  it("çeyreklik dev → 3,6,9,12", () => {
    const t = tri({ development_granularity: "quarterly" });
    expect(devLengthOptions(t)).toEqual([3, 6, 9, 12]);
  });

  it("çeyreklik origin → 3,6,9,12,24…", () => {
    const t = tri({
      origin_granularity: "quarterly",
      origin_periods: ["2000Q1", "2000Q2", "2000Q3", "2000Q4", "2001Q1"],
      development_periods: [0, 1, 2],
      values: [
        [100, 150, 165],
        [120, 180, null],
        [130, null, null],
        [140, null, null],
        [90, null, null],
      ],
    });
    // span = 5*3 = 15 ay → 3,6,9,12 (12 dahil)
    expect(originLengthOptions(t)).toEqual([3, 6, 9, 12]);
  });
});
