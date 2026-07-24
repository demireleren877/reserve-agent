import { describe, it, expect } from "vitest";
import { matchPremiumsToOrigins, normPeriodLabel, sameBrans } from "./provision-models";
import type { PrimRecord } from "./data-store";

const ep = (brans: string, donem: string, epv: number): PrimRecord => ({ brans, donem, ep: epv });

describe("sameBrans", () => {
  it("case-insensitive (tr) eşleşir", () => {
    expect(sameBrans("eren", "EREN")).toBe(true);
    expect(sameBrans(" Kasko ", "KASKO")).toBe(true);
    expect(sameBrans("eren", "eren hasar")).toBe(false);
  });
});

describe("normPeriodLabel", () => {
  it("yıl/çeyrek etiketlerini kanonikleştirir", () => {
    expect(normPeriodLabel("2023")).toBe("2023");
    expect(normPeriodLabel("2023.0")).toBe("2023");
    expect(normPeriodLabel("2023Q1")).toBe("2023Q1");
    expect(normPeriodLabel("2023 q1")).toBe("2023Q1");
    expect(normPeriodLabel("2023-Q1")).toBe("2023Q1");
  });
});

describe("matchPremiumsToOrigins — EP büyük/küçük harf + yıllık dönem", () => {
  // GERÇEK SENARYO: model hasar'dan "EREN" (büyük), EP dosyasında "eren" (küçük),
  // kaza yılı YILLIK. Büyük/küçük harf fark etmeden EP gelmeli.
  it("EP küçük harf 'eren' → model 'EREN', yıllık origin'e bağlanır", () => {
    const recs = [
      ep("eren", "2022", 5000),
      ep("eren", "2023", 6000),
      ep("kasko", "2023", 9999), // farklı branş — sızmamalı
    ];
    const out = matchPremiumsToOrigins(recs, "EREN", ["2022", "2023"]);
    expect(out["2022"]).toBe(5000);
    expect(out["2023"]).toBe(6000);
  });

  it("EP büyük harf 'EREN' → model 'eren' (ters yön) de bağlanır", () => {
    const recs = [ep("EREN", "2023", 6000)];
    const out = matchPremiumsToOrigins(recs, "eren", ["2022", "2023"]);
    expect(out["2023"]).toBe(6000);
  });

  it("granülarite farklıysa (yıllık EP vs çeyreklik origin) uydurma yapmaz", () => {
    const recs = [ep("eren", "2023", 4000)];
    const out = matchPremiumsToOrigins(recs, "EREN", ["2023Q1", "2023Q2"]);
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("branş eşleşmezse EP gelmez", () => {
    const recs = [ep("kasko", "2023", 500)];
    const out = matchPremiumsToOrigins(recs, "EREN", ["2023"]);
    expect(Object.keys(out)).toHaveLength(0);
  });
});
