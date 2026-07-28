import { describe, expect, it } from "vitest";
import type { Triangle } from "@/types/triangle";
import { developmentRatios } from "@/lib/ldf";
import { analyzeLDFDiagnostics } from "@/lib/ldf-diagnostics";

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
});
