import { describe, it, expect } from "vitest";
import { formatNumber, formatFactor } from "./api";

describe("formatNumber", () => {
  it("formats Turkish locale with dot thousands separator (rounded to integer)", () => {
    expect(formatNumber(1234567.89)).toBe("1.234.568");
  });

  it("returns em-dash for null/undefined/NaN", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(NaN)).toBe("—");
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
