import { describe, it, expect } from "vitest";
import { formatNumber, formatFactor } from "./api";

describe("formatNumber", () => {
  it("formats Turkish locale with dot thousands separator", () => {
    expect(formatNumber(1234567.89)).toMatch(/1\.234\.567,89/);
  });

  it("returns dash for null/undefined/NaN", () => {
    expect(formatNumber(null)).toBe("-");
    expect(formatNumber(undefined)).toBe("-");
    expect(formatNumber(NaN)).toBe("-");
  });

  it("formats integers without decimal", () => {
    expect(formatNumber(1000)).toBe("1.000");
  });
});

describe("formatFactor", () => {
  it("formats with 4 decimal places Turkish style", () => {
    expect(formatFactor(1.4545)).toBe("1,4545");
  });
});
