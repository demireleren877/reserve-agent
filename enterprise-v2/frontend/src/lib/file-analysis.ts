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

// ─── Agent özeti ──────────────────────────────────────────────────────────────

export interface FileSummaryOriginRow {
  origin: string;
  n_files: number;
  total: number;
  top1_share: number;
  top3_share: number;
}

export interface FileSummaryLargest {
  origin: string;
  dosya_no: string;
  amount: number;
  share_of_origin: number;
}

export interface FileSummary {
  has_file_data: true;
  metric: FileMetric;
  origin_count: number;
  n_files: number;
  grand_total: number;
  per_origin: FileSummaryOriginRow[];
  largest: FileSummaryLargest[];
}

/**
 * Son diagonal'deki dosya bazlı kırılımın agent özeti (get_file_summary okur).
 *
 * Bu alan doldurulmadığında agent, branşta DOSYA_NO verisi olsa bile
 * "bu branşta dosya kırılımı yok" diyordu. Metrik varsayılan olarak `inc`
 * (ödeme + muallak): rezerv üçgeni incurred bazlı, tutarlı kalsın.
 */
export function buildFileSummary(
  triangle: Triangle | null | undefined,
  fileData: FileData | null | undefined,
  topN = 15,
  metric: FileMetric = "inc",
): FileSummary | null {
  if (!triangle || !fileData || Object.keys(fileData).length === 0) return null;

  const snapshot = latestFileSnapshots(triangle, fileData);
  const perOrigin: FileSummaryOriginRow[] = [];
  const all: FileSummaryLargest[] = [];

  for (const origin of triangle.origin_periods) {
    const files = Object.entries(snapshot[origin] ?? {})
      .map(([dosya, v]) => [dosya, fileMetricValue(v, metric)] as const)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!files.length) continue;

    const total = files.reduce((s, [, v]) => s + v, 0);
    const top3 = files.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    perOrigin.push({
      origin,
      n_files: files.length,
      total: Math.round(total),
      top1_share: total > 0 ? files[0][1] / total : 0,
      top3_share: total > 0 ? top3 / total : 0,
    });
    for (const [dosya, amount] of files) {
      all.push({
        origin,
        dosya_no: dosya,
        amount: Math.round(amount),
        share_of_origin: total > 0 ? amount / total : 0,
      });
    }
  }

  if (!perOrigin.length) return null;
  all.sort((a, b) => b.amount - a.amount);

  return {
    has_file_data: true,
    metric,
    origin_count: perOrigin.length,
    n_files: all.length,
    grand_total: perOrigin.reduce((s, o) => s + o.total, 0),
    per_origin: perOrigin,
    largest: all.slice(0, topN),
  };
}
