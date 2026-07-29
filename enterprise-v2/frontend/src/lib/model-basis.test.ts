import { describe, expect, it } from "vitest";
import { deriveOutstandingTriangle, fileValueForBasis, selectModelTriangle, type Triangle } from "@/types/triangle";

function triangle(type: "paid" | "incurred", values: (number | null)[][]): Triangle {
  return {
    origin_periods: ["2024", "2025"],
    development_periods: [0, 1],
    values,
    triangle_type: type,
    origin_granularity: "yearly",
    development_granularity: "yearly",
  };
}

describe("model value basis", () => {
  const paid = triangle("paid", [[100, 180], [80, null]]);
  const incurred = triangle("incurred", [[250, 300], [190, null]]);

  it("derives outstanding cell by cell as incurred minus paid", () => {
    const outstanding = deriveOutstandingTriangle(paid, incurred);
    expect(outstanding?.triangle_type).toBe("outstanding");
    expect(outstanding?.values).toEqual([[150, 120], [110, null]]);
  });

  it("selects the requested modeling triangle", () => {
    expect(selectModelTriangle(paid, incurred, "paid")).toBe(paid);
    expect(selectModelTriangle(paid, incurred, "incurred")).toBe(incurred);
    expect(selectModelTriangle(paid, incurred, "outstanding")?.values[0][1]).toBe(120);
  });

  it("uses the same basis for file-level LDF impact", () => {
    const leaf = { p: 180, o: 120 };
    expect(fileValueForBasis(leaf, "paid")).toBe(180);
    expect(fileValueForBasis(leaf, "outstanding")).toBe(120);
    expect(fileValueForBasis(leaf, "incurred")).toBe(300);
  });
});
