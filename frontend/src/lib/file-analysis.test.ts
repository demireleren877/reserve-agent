import { describe, expect, it } from "vitest";
import type { FileData, Triangle } from "@/types/triangle";
import {
  buildClaimComparison,
  latestFileSnapshots,
  originSnapshotTotals,
} from "@/lib/file-analysis";

const triangle: Triangle = {
  origin_periods: ["2024"],
  development_periods: [0, 1],
  values: [[100, 135]],
  triangle_type: "paid",
  origin_granularity: "yearly",
  development_granularity: "yearly",
};

describe("file analysis snapshots", () => {
  it("reconciles a legacy incremental last snapshot before reporting totals", () => {
    const fileData: FileData = {
      "2024": {
        "2024": { A: { p: 70, o: 20 }, B: { p: 30, o: 10 } },
        "2025": { A: { p: 25, o: 8 }, C: { p: 10, o: 4 } },
      },
    };
    const snapshot = latestFileSnapshots(triangle, fileData);
    expect(snapshot["2024"]).toEqual({
      A: { p: 95, o: 8, inc: 103 },
      B: { p: 30, o: 0, inc: 30 },
      C: { p: 10, o: 4, inc: 14 },
    });
    expect(originSnapshotTotals(snapshot, "inc")["2024"]).toBe(147);
  });

  it("uses the selected metric consistently", () => {
    const snapshot = {
      "2024": { A: { p: 80, o: 20, inc: 100 }, B: { p: 0, o: 40, inc: 40 } },
    };
    expect(originSnapshotTotals(snapshot, "p")["2024"]).toBe(80);
    expect(originSnapshotTotals(snapshot, "o")["2024"]).toBe(60);
    expect(originSnapshotTotals(snapshot, "inc")["2024"]).toBe(140);
  });
});

describe("claim runoff classification", () => {
  it("distinguishes new, removed, closed and reopened claims", () => {
    const previous = {
      "2024": {
        CLOSED: { p: 50, o: 20, inc: 70 },
        REOPENED: { p: 30, o: 0, inc: 30 },
        REMOVED: { p: 10, o: 5, inc: 15 },
      },
    };
    const current = {
      "2024": {
        CLOSED: { p: 70, o: 0, inc: 70 },
        REOPENED: { p: 30, o: 12, inc: 42 },
        NEW: { p: 0, o: 25, inc: 25 },
      },
    };
    const tags = Object.fromEntries(buildClaimComparison(current, previous, "inc").map(row => [row.dosya, row.tag]));
    expect(tags).toEqual({ NEW: "new", REMOVED: "removed", REOPENED: "reopened", CLOSED: "closed" });
  });
});
