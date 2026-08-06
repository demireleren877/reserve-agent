import type { FileData, FileLeaf, Triangle } from "@/types/triangle";
import { fileOs, filePaid } from "@/types/triangle";
import { reconcileFileDataSnapshots } from "@/lib/roll-forward-util";

export type FileMetric = "inc" | "p" | "o";

export interface FileValue {
  p: number;
  o: number;
  inc: number;
}

export type FileSnapshot = Record<string, Record<string, FileValue>>;

export type ClaimChangeTag =
  | "new"
  | "removed"
  | "closed"
  | "reopened"
  | "up"
  | "down"
  | "same";

export interface ClaimComparisonRow {
  dosya: string;
  orig: string;
  curr: number;
  comp: number;
  delta: number;
  tag: ClaimChangeTag;
}

export function fileMetricValue(value: FileValue, metric: FileMetric): number {
  return metric === "p" ? value.p : metric === "o" ? value.o : value.inc;
}

/**
 * Returns the latest reconciled cumulative claim snapshot for each origin.
 * Reconciliation is important for legacy roll-forward data where the last paid
 * cell may have been persisted as an incremental movement.
 */
export function latestFileSnapshots(triangle: Triangle, fileData: FileData): FileSnapshot {
  const reconciled = reconcileFileDataSnapshots(triangle, fileData);
  const out: FileSnapshot = {};
  for (const origin of triangle.origin_periods) {
    const dates = Object.keys(reconciled[origin] ?? {});
    const latest = dates.length ? reconciled[origin][dates[dates.length - 1]] : {};
    out[origin] = Object.fromEntries(
      Object.entries(latest as Record<string, FileLeaf>).map(([claim, leaf]) => {
        const p = filePaid(leaf);
        const o = fileOs(leaf);
        return [claim, { p, o, inc: p + o }];
      }),
    );
  }
  return out;
}

export function originSnapshotTotals(snapshot: FileSnapshot, metric: FileMetric): Record<string, number> {
  return Object.fromEntries(
    Object.entries(snapshot).map(([origin, files]) => [
      origin,
      Object.values(files).reduce((sum, value) => sum + fileMetricValue(value, metric), 0),
    ]),
  );
}

function classifyClaimChange(
  current: FileValue | undefined,
  comparison: FileValue | undefined,
  delta: number,
): ClaimChangeTag {
  if (!comparison && current) return "new";
  if (comparison && !current) return "removed";
  if (comparison && current && comparison.o !== 0 && current.o === 0) return "closed";
  if (comparison && current && comparison.o === 0 && current.o !== 0) return "reopened";
  return delta > 0 ? "up" : delta < 0 ? "down" : "same";
}

export function buildClaimComparison(
  current: FileSnapshot,
  comparison: FileSnapshot,
  metric: FileMetric,
): ClaimComparisonRow[] {
  const out: ClaimComparisonRow[] = [];
  const origins = new Set([...Object.keys(current), ...Object.keys(comparison)]);
  for (const orig of origins) {
    const currentFiles = current[orig] ?? {};
    const comparisonFiles = comparison[orig] ?? {};
    const claims = new Set([...Object.keys(currentFiles), ...Object.keys(comparisonFiles)]);
    for (const dosya of claims) {
      const currentValue = currentFiles[dosya];
      const comparisonValue = comparisonFiles[dosya];
      const curr = currentValue ? fileMetricValue(currentValue, metric) : 0;
      const comp = comparisonValue ? fileMetricValue(comparisonValue, metric) : 0;
      if (curr === 0 && comp === 0 && !currentValue && !comparisonValue) continue;
      const delta = curr - comp;
      out.push({
        dosya,
        orig,
        curr,
        comp,
        delta,
        tag: classifyClaimChange(currentValue, comparisonValue, delta),
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
