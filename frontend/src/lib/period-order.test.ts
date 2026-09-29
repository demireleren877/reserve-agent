import { describe, it, expect } from "vitest";
import { periodOrder, sortByPeriodLabel } from "@/lib/period-order";

describe("periodOrder", () => {
  it("yıl ve çeyreği kronolojik sıralar", () => {
    expect(periodOrder("2025Q4")).toBeLessThan(periodOrder("2026Q1"));
    expect(periodOrder("2025")).toBeLessThan(periodOrder("2025Q1"));
    expect(periodOrder("2024Q4")).toBeLessThan(periodOrder("2025Q1"));
  });
  it("farklı yazımları tolere eder", () => {
    expect(periodOrder("2026 Q2")).toBe(periodOrder("2026Q2"));
    expect(periodOrder("2026q3")).toBe(periodOrder("2026Q3"));
  });
  it("bilinmeyen etiket sona düşer", () => {
    expect(periodOrder("Taslak")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("sortByPeriodLabel", () => {
  it("küçükten büyüğe sıralar, orijinali değiştirmez", () => {
    const arr = [{ label: "2026Q2" }, { label: "2025Q4" }, { label: "2026Q1" }];
    const sorted = sortByPeriodLabel(arr);
    expect(sorted.map((x) => x.label)).toEqual(["2025Q4", "2026Q1", "2026Q2"]);
    expect(arr[0].label).toBe("2026Q2"); // orijinal korunur
  });
});
