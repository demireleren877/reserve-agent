import { describe, expect, it } from "vitest";
import type { Triangle } from "@/types/triangle";
import { developmentRatios } from "@/lib/ldf";
import {
  analyzeLDFDiagnostics,
  findLDFOutlierCandidates,
} from "@/lib/ldf-diagnostics";

function triangle(values: (number | null)[][], type: "paid" | "incurred" = "paid"): Triangle {
  return {
    origin_periods: values.map((_, i) => String(2018 + i)),
    development_periods: [0, 1], values,
    triangle_type: type, origin_granularity: "yearly", development_granularity: "yearly",
  };
}

describe("analyzeLDFDiagnostics", () => {
  it("aykırı ve maddi hücreyi öncelikli sınıflandırır", () => {
    const tri = triangle([[100, 120], [100, 121], [100, 119], [100, 200], [100, 120]]);
    const ratios = developmentRatios(tri, new Set());
    const impacts = new Map([["2021|0", -50]]);
    const result = analyzeLDFDiagnostics(tri, ratios, new Set(), {
      baseIbnr: 1_000, totalLatest: 10_000, impactByCell: impacts,
    });
    expect(result.find((x) => x.key === "2021|0")?.kind).toBe("outlier_material");
  });

  it("aykırı olmayan hücreyi, finansal etkisi olsa bile önermez", () => {
    const tri = triangle([[100, 120], [100, 121], [100, 119], [100, 122], [100, 120]]);
    const result = analyzeLDFDiagnostics(tri, developmentRatios(tri, new Set()), new Set(), {
      baseIbnr: 100, totalLatest: 1_000, impactByCell: new Map([["2021|0", 10]]),
    });
    expect(result.some((x) => x.key === "2021|0")).toBe(false);
  });

  it("halen elenmiş hücre için yeniden öneri üretmez", () => {
    const tri = triangle([[100, 120], [100, 90], [100, 119], [100, 121]]);
    const excluded = new Set(["2019|0"]);
    const result = analyzeLDFDiagnostics(tri, developmentRatios(tri, excluded), excluded, {
      baseIbnr: 100, totalLatest: 1_000, impactByCell: new Map(),
    });
    expect(result.some((x) => x.key === "2019|0")).toBe(false);
  });

  it("Ultimate/IBNR etkisi ekranda sıfır olan sinyali göstermez", () => {
    const tri = triangle([[100, 120], [100, 90], [100, 119], [100, 121]]);
    const result = analyzeLDFDiagnostics(tri, developmentRatios(tri, new Set()), new Set(), {
      baseIbnr: 100,
      totalLatest: 1_000,
      impactByCell: new Map([["2019|0", 0.49]]),
    });
    expect(result.some((x) => x.key === "2019|0")).toBe(false);
  });

  it("pahalı etki hesabı için yalnız aykırı hücreleri aday gösterir", () => {
    const tri = triangle([[100, 120], [100, 121], [100, 119], [100, 200], [100, 120]]);
    const ratios = developmentRatios(tri, new Set());

    expect(findLDFOutlierCandidates(tri, ratios, new Set())).toEqual(["2021|0"]);
  });

  it("aday ön filtresi mevcut tanı sonucundaki tüm hücreleri kapsar", () => {
    const tri = triangle([[100, 120], [100, 121], [100, 119], [100, 200], [100, 70]]);
    const ratios = developmentRatios(tri, new Set());
    const impacts = new Map([
      ["2018|0", 10], ["2019|0", 10], ["2020|0", 10],
      ["2021|0", 50], ["2022|0", -40],
    ]);
    const diagnostics = analyzeLDFDiagnostics(tri, ratios, new Set(), {
      baseIbnr: 1_000,
      totalLatest: 10_000,
      impactByCell: impacts,
    });
    const candidates = new Set(findLDFOutlierCandidates(tri, ratios, new Set()));

    expect(diagnostics.every((item) => candidates.has(item.key))).toBe(true);
  });

  it("büyük üçgende leave-one-out çalıştırma sayısını adaylarla sınırlar", () => {
    const size = 44;
    const values = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, step) =>
        step < size - row ? 100 * Math.pow(1.05, step) : null,
      ),
    );
    values[0][1] = 180;
    const tri: Triangle = {
      origin_periods: Array.from({ length: size }, (_, index) => String(1980 + index)),
      development_periods: Array.from({ length: size }, (_, index) => index),
      values,
      triangle_type: "paid",
      origin_granularity: "quarterly",
      development_granularity: "quarterly",
    };
    const validRatioCells = (size * (size - 1)) / 2;
    const candidates = findLDFOutlierCandidates(
      tri,
      developmentRatios(tri, new Set()),
      new Set(),
    );

    expect(validRatioCells).toBe(946);
    expect(candidates.length).toBeLessThanOrEqual(2);
  });
});
