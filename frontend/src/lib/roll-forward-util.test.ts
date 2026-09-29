import { describe, expect, it } from "vitest";
import { newDiagonalToFileData, reconcileFileDataSnapshots } from "@/lib/roll-forward-util";
import type { FileData, Triangle } from "@/types/triangle";

describe("newDiagonalToFileData", () => {
  it("artımsal ödemeyi önceki dosya snapshot'ına ekler ve güncel muallağı kullanır", () => {
    const triangle: Triangle = {
      origin_periods: ["2024"],
      development_periods: [0, 1],
      values: [[100, 135]],
      triangle_type: "paid",
      origin_granularity: "yearly",
      development_granularity: "yearly",
    };
    const prior: FileData = {
      "2024": { "2024": { A: { p: 70, o: 20 }, B: { p: 30, o: 10 } } },
    };

    const result = newDiagonalToFileData(
      triangle,
      { "2024": { A: { p: 25, o: 8 }, C: { p: 10, o: 4 } } },
      prior,
    );

    expect(result["2024"]["2025"]).toEqual({
      A: { p: 95, o: 8 },
      B: { p: 30, o: 0 },
      C: { p: 10, o: 4 },
    });
  });

  it("önceki snapshot'ı nesne ekleme sırasına göre değil kronolojik olarak seçer", () => {
    const paidTriangle: Triangle = {
      origin_periods: ["2024"], development_periods: [0, 1, 2], values: [[10, 20, 25]],
      triangle_type: "paid", origin_granularity: "yearly", development_granularity: "yearly",
    };
    const prior: FileData = {
      "2024": {
        "2025": { A: { p: 20, o: 0 } },
        "2024": { A: { p: 10, o: 0 } },
      },
    };
    expect(newDiagonalToFileData(paidTriangle, { "2024": { A: { p: 5, o: 0 } } }, prior)["2024"]["2026"].A)
      .toEqual({ p: 25, o: 0 });
  });

  it("eski artımsal snapshot'ı üçgen toplamıyla mutabıklaştırarak onarır", () => {
    const triangle: Triangle = {
      origin_periods: ["2024"], development_periods: [0, 1], values: [[100, 135]],
      triangle_type: "paid", origin_granularity: "yearly", development_granularity: "yearly",
    };
    const legacy: FileData = {
      "2024": {
        "2024": { A: { p: 70, o: 20 }, B: { p: 30, o: 10 } },
        "2025": { A: { p: 25, o: 8 }, C: { p: 10, o: 4 } },
      },
    };
    expect(reconcileFileDataSnapshots(triangle, legacy)["2024"]["2025"]).toEqual({
      A: { p: 95, o: 8 }, B: { p: 30, o: 0 }, C: { p: 10, o: 4 },
    });
  });

  it("quarterly tarih etiketi kaymış eski veriyi gözlem sırasıyla eşleştirir", () => {
    const triangle: Triangle = {
      origin_periods: ["2024"], development_periods: [0, 1], values: [[100, 135]],
      triangle_type: "paid", origin_granularity: "yearly", development_granularity: "quarterly",
    };
    const shifted: FileData = {
      "2024": {
        "2024Q1": { A: { p: 100, o: 0 } },
        "2024Q2": { A: { p: 135, o: 0 } },
      },
    };
    const result = reconcileFileDataSnapshots(triangle, shifted);
    expect(result["2024"]["2023Q4"].A).toEqual({ p: 100, o: 0 });
    expect(result["2024"]["2024Q1"].A).toEqual({ p: 135, o: 0 });
  });
});
