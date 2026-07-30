import { describe, it, expect, vi } from "vitest";
import { loadDataLargeForModel, matchPremiumsToOrigins, normPeriodLabel, sameBrans } from "./provision-models";
import type { DataPeriod, PrimRecord, TriangleRecord } from "./data-store";

const ep = (brans: string, donem: string, epv: number): PrimRecord => ({ brans, donem, ep: epv });

describe("sameBrans", () => {
  it("case-insensitive (tr) eşleşir", () => {
    expect(sameBrans("eren", "EREN")).toBe(true);
    expect(sameBrans("fire", "FIRE")).toBe(true);
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

  it("aynı kanonik branş ve dönemdeki EP satırlarını toplar", () => {
    const recs = [ep("fire", "2023", 400), ep("FIRE", "2023", 600)];
    expect(matchPremiumsToOrigins(recs, "Fire", ["2023"])).toEqual({ "2023": 1000 });
  });
});

describe("loadDataLargeForModel cache", () => {
  it("aynı dataset revision için paralel kayıt yüklemesini tekilleştirir", async () => {
    const record: TriangleRecord = {
      brans: "FIRE",
      triangle_type: "incurred",
      origin_granularity: "yearly",
      development_granularity: "yearly",
      origin_periods: ["2023"],
      development_periods: [0],
      values: [[100]],
    };
    const period: DataPeriod = {
      id: "p1",
      label: "2026Q2",
      createdAt: "2026-06-30T00:00:00Z",
      datasets: {
        large1: {
          datasetId: "large1",
          typeId: "large_ucgen",
          meta: {
            filename: "large.xlsx",
            uploadedAt: "2026-06-30T00:00:00Z",
            record_count: 1,
            brans_list: ["fire"],
          },
          records: [],
        },
      },
    };
    const load = vi.fn(async () => ({ ...period.datasets.large1, records: [record] }));
    const [first, second] = await Promise.all([
      loadDataLargeForModel("2026Q2", "fire", "yearly", "yearly", [period], load),
      loadDataLargeForModel("2026Q2", "FIRE", "yearly", "yearly", [period], load),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first?.incurred?.values).toEqual([[100]]);
  });
});
