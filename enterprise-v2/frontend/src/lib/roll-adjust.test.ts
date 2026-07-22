import { describe, it, expect } from "vitest";
import { aggregateClaims, applyAdjustments } from "@/lib/roll-adjust";
import type { ClaimRecord } from "@/lib/api";

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
