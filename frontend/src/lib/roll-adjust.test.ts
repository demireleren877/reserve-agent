import { describe, it, expect } from "vitest";
import {
  aggregateClaims,
  applyAdjustments,
  applyBaseAdjustments,
  originByDosyaFromFileData,
} from "@/lib/roll-adjust";
import type { ClaimRecord } from "@/lib/api";
import type { Triangle } from "@/types/triangle";

function rec(over: Partial<ClaimRecord>): ClaimRecord {
  return {
    dosya_no: "1", brans: "MTPL", hasar_tarihi: "2024-01-01",
    gelisim_tarihi: "2026-03-31", odeme: 0, muallak: 0, ...over,
  };
}

describe("aggregateClaims", () => {
  it("dosya bazında toplar; ödeme toplam, muallak son tarihte", () => {
    const recs = [
      rec({ dosya_no: "A", gelisim_tarihi: "2026-01-01", odeme: 100, muallak: 500 }),
      rec({ dosya_no: "A", gelisim_tarihi: "2026-03-31", odeme: 50, muallak: 300 }),
      rec({ dosya_no: "B", odeme: 10, muallak: 20 }),
    ];
    const agg = aggregateClaims(recs, "MTPL");
    const a = agg.find((x) => x.dosya === "A")!;
    expect(a.odeme).toBe(150); // toplam ödeme
    expect(a.muallak).toBe(300); // son tarihteki muallak (stok)
    expect(a.kazaYili).toBe("2024");
    expect(agg.find((x) => x.dosya === "B")!.muallak).toBe(20);
  });

  it("branş filtresi uygular", () => {
    const recs = [rec({ dosya_no: "A" }), rec({ dosya_no: "B", brans: "CASCO" })];
    expect(aggregateClaims(recs, "MTPL").map((x) => x.dosya)).toEqual(["A"]);
  });
});

describe("applyAdjustments", () => {
  const recs = [
    rec({ dosya_no: "X", odeme: 200, muallak: 24_000_000 }),
    rec({ dosya_no: "Y", odeme: 30, muallak: 40 }),
  ];

  it("düzeltme yoksa aynı referans döner", () => {
    expect(applyAdjustments(recs, {})).toBe(recs);
    expect(applyAdjustments(recs, undefined)).toBe(recs);
  });

  it("muallak override: ödeme korunur, muallak değişir", () => {
    const out = applyAdjustments(recs, { X: { muallak: 970_000 } });
    const x = out.find((r) => r.dosya_no === "X")!;
    expect(x.muallak).toBe(970_000);
    expect(x.odeme).toBe(200); // ödeme orijinal
    expect(out.find((r) => r.dosya_no === "Y")).toBe(recs[1]); // dokunulmayan aynen
  });

  it("ödeme override: muallak korunur", () => {
    const out = applyAdjustments(recs, { Y: { odeme: 99 } });
    const y = out.find((r) => r.dosya_no === "Y")!;
    expect(y.odeme).toBe(99);
    expect(y.muallak).toBe(40);
  });

  it("çok satırlı dosyayı tek kayda toplar, aggregate = istenen değer", () => {
    const multi = [
      rec({ dosya_no: "Z", gelisim_tarihi: "2026-01-01", odeme: 10, muallak: 5 }),
      rec({ dosya_no: "Z", gelisim_tarihi: "2026-03-31", odeme: 20, muallak: 8 }),
    ];
    const out = applyAdjustments(multi, { Z: { muallak: 0 } });
    const z = out.filter((r) => r.dosya_no === "Z");
    expect(z).toHaveLength(1);
    expect(z[0].muallak).toBe(0);
    expect(z[0].odeme).toBe(30); // 10+20 toplam ödeme korunur
  });

  it("orijinal records mutasyona uğramaz", () => {
    const snap = JSON.parse(JSON.stringify(recs));
    applyAdjustments(recs, { X: { muallak: 1 } });
    expect(recs).toEqual(snap);
  });
});

function agg(dosya: string, kazaYili: string, odeme: number, muallak: number) {
  return { dosya, brans: "MTPL", kazaYili, hasarTarihi: `${kazaYili}-01-01`, gelisimTarihi: "2026-03-31", odeme, muallak };
}

describe("originByDosyaFromFileData", () => {
  it("dosya → origin etiketi çıkarır", () => {
    const m = originByDosyaFromFileData({
      "2023": { "0": { A: 100 }, "1": { A: 120, B: 50 } },
      "2024": { "0": { C: 30 } },
    });
    expect(m.get("A")).toBe("2023");
    expect(m.get("B")).toBe("2023");
    expect(m.get("C")).toBe("2024");
  });
});

describe("applyBaseAdjustments", () => {
  // Temel (26Q1) paid & incurred — origin satırları, diagonal = son non-null
  const paid: Triangle = {
    origin_periods: ["2023", "2024"],
    development_periods: [0, 1],
    values: [[100, 130], [120, null]], // 2023 diag=idx1(130); 2024 diag=idx0(120)
    triangle_type: "paid", origin_granularity: "yearly", development_granularity: "yearly",
  };
  const incurred: Triangle = {
    ...paid, triangle_type: "incurred",
    values: [[500, 600], [1000, null]], // 2024 incurred 1000 = paid120 + muallak880
  };
  const baseAggs = [
    agg("K1", "2024", 120, 880), // 2024'ün tek dosyası
    agg("K2", "2023", 130, 470),
  ];

  it("muallak override: yalnız incurred diagonaline delta, paid değişmez", () => {
    // K1 muallağı 880 → 100 (dMual=-780); paid sabit
    const r = applyBaseAdjustments(paid, incurred, baseAggs, { K1: { muallak: 100 } });
    expect(r.paid.values[1][0]).toBe(120); // paid dokunulmadı
    expect(r.incurred!.values[1][0]).toBe(220); // 1000 - 780
    expect(r.unplaced).toEqual([]);
  });

  it("ödeme override: paid + incurred diagonaline aynı delta", () => {
    const r = applyBaseAdjustments(paid, incurred, baseAggs, { K2: { odeme: 200 } });
    // K2 origin 2023, diag idx1. dPaid=+70
    expect(r.paid.values[0][1]).toBe(200); // 130+70
    expect(r.incurred!.values[0][1]).toBe(670); // 600+70
  });

  it("origin FileData ile eşlenir (kaza yılı yanlış olsa bile)", () => {
    const m = new Map([["K1", "2023"]]); // FileData K1'i 2023'e koyuyor
    const r = applyBaseAdjustments(paid, incurred, baseAggs, { K1: { muallak: 0 } }, m);
    // 2023 diagonaline (idx1) uygulanmalı, 2024'e değil
    expect(r.incurred!.values[0][1]).toBe(600 - 880);
    expect(r.incurred!.values[1][0]).toBe(1000); // 2024 dokunulmadı
  });

  it("temel dönemde olmayan dosya → unplaced, üçgen değişmez", () => {
    const r = applyBaseAdjustments(paid, incurred, baseAggs, { YOK: { muallak: 5 } });
    expect(r.unplaced).toEqual(["YOK"]);
    expect(r.paid.values).toEqual(paid.values);
  });

  it("düzeltme yoksa aynı referans", () => {
    const r = applyBaseAdjustments(paid, incurred, baseAggs, {});
    expect(r.paid).toBe(paid);
    expect(r.incurred).toBe(incurred);
  });

  it("orijinal üçgen mutasyona uğramaz", () => {
    const snap = JSON.parse(JSON.stringify(paid.values));
    applyBaseAdjustments(paid, incurred, baseAggs, { K1: { odeme: 999 } });
    expect(paid.values).toEqual(snap);
  });
});
