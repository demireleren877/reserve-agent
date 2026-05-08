"use client";

import { useMemo, useState } from "react";
import type { LDFMethod, Triangle } from "@/types/triangle";
import { formatFactor } from "@/lib/api";
import {
  WINDOWS,
  type Window,
  aggregateLDFs,
  cellKey,
  cumulativeFactors,
  developmentRatios,
} from "@/lib/ldf";

interface ColStats {
  median: number;
  mad: number;
  count: number;
}

function computeColumnStats(
  ratios: { value: number | null; excluded: boolean }[][],
  steps: number,
): ColStats[] {
  const out: ColStats[] = [];
  for (let j = 0; j < steps; j++) {
    const values: number[] = [];
    for (let i = 0; i < ratios.length; i++) {
      const c = ratios[i]?.[j];
      if (c && c.value != null && !c.excluded) values.push(c.value);
    }
    if (values.length === 0) {
      out.push({ median: 0, mad: 0, count: 0 });
      continue;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const devs = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = devs[Math.floor(devs.length / 2)] || 0;
    out.push({ median, mad, count: values.length });
  }
  return out;
}

function heatmapStyle(
  value: number,
  stats: ColStats,
): React.CSSProperties {
  if (stats.count < 2 || stats.mad === 0) return {};
  const scale = stats.mad * 1.4826;
  const z = (value - stats.median) / scale;
  const clamped = Math.max(-3, Math.min(3, z));
  const intensity = Math.min(1, Math.abs(clamped) / 2.5);
  if (Math.abs(clamped) < 0.3) return {};
  const alpha = 0.08 + intensity * 0.32;
  if (clamped > 0) {
    return { backgroundColor: `rgba(220, 38, 38, ${alpha})` };
  }
  return { backgroundColor: `rgba(37, 99, 235, ${alpha})` };
}

interface Props {
  triangle: Triangle | null;
  window: Window;
  excludedCells: Set<string>;
  /** Curve cascade uygulanmış CDF zinciri. Verilirse CDF satırında
   *  bu değerler gösterilir. */
  cdfsOverride?: number[];
  onWindowChange: (w: Window) => void;
  onToggleCell: (origin: string, step: number) => void;
  onClearCells: () => void;
}

const FIXED_METHOD: LDFMethod = "volume_weighted";

export function LDFTab(props: Props) {
  const {
    triangle,
    window,
    excludedCells,
    cdfsOverride,
    onWindowChange,
    onToggleCell,
    onClearCells,
  } = props;

  const [heatmap, setHeatmap] = useState(true);

  const ratios = useMemo(
    () => (triangle ? developmentRatios(triangle, excludedCells) : []),
    [triangle, excludedCells],
  );

  const columnStats = useMemo(() => {
    if (!triangle) return [] as ColStats[];
    return computeColumnStats(ratios, triangle.development_periods.length - 1);
  }, [triangle, ratios]);

  const windowLDFs = useMemo(() => {
    if (!triangle) return {} as Record<string, number[]>;
    const map: Record<string, number[]> = {};
    for (const w of WINDOWS) {
      map[String(w.id)] = aggregateLDFs(triangle, ratios, w.id, FIXED_METHOD);
    }
    return map;
  }, [triangle, ratios]);

  const selectedLDFs = windowLDFs[String(window)] ?? [];
  const localCDFs = useMemo(() => cumulativeFactors(selectedLDFs), [selectedLDFs]);
  // cdfsOverride[n_dev] içinde son age 1 olur; LDF tablosunda steps = n_dev-1
  // olduğu için baş tarafı (n_dev-1 eleman) alınır.
  const cdfs =
    cdfsOverride && cdfsOverride.length >= localCDFs.length
      ? cdfsOverride.slice(0, localCDFs.length)
      : localCDFs;

  if (!triangle) {
    return <EmptyState />;
  }

  const steps = triangle.development_periods.length - 1;

  return (
    <div className="space-y-4">
      {/* Controls strip */}
      <div className="card p-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 ml-auto text-[11px] text-[color:var(--muted)]">
          <button
            onClick={() => setHeatmap((v) => !v)}
            className={
              "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition " +
              (heatmap
                ? "bg-[color:var(--primary-soft)] border-[color:var(--primary-border)] text-[color:var(--primary)]"
                : "hover:border-[color:var(--border-strong)]")
            }
            title="Kolon bazlı aykırı değer renklendirmesi"
          >
            <span
              className={
                "inline-block h-3.5 w-6 rounded-full relative transition " +
                (heatmap ? "bg-[color:var(--primary)]" : "bg-[color:var(--border-strong)]")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition " +
                  (heatmap ? "left-3" : "left-0.5")
                }
              />
            </span>
            Heatmap
          </button>
          {heatmap && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: "rgba(37,99,235,0.35)" }} />
                düşük
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: "rgba(220,38,38,0.35)" }} />
                yüksek
              </span>
            </>
          )}
          {excludedCells.size > 0 && (
            <>
              <span className="border-l pl-3 ml-1">
                {excludedCells.size} hücre hariç
              </span>
              <button onClick={onClearCells} className="btn text-xs">
                temizle
              </button>
            </>
          )}
        </div>
      </div>

      {/* Combined horizontal-scroll panel: LDF triangle + window rows + CDFs */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h2 className="text-sm font-semibold">Gelişim Oranları & CDF</h2>
          <span className="text-xs text-[color:var(--muted)]">
            Hücreye tıklayarak eleyin · seçili volume:{" "}
            <strong className="text-[color:var(--foreground)]">
              {WINDOWS.find((w) => w.id === window)?.label}
            </strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="text-[11px] tabular" style={{ minWidth: "100%" }}>
            <thead>
              <tr className="text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-2 py-1 font-semibold sticky left-0 bg-[color:var(--surface-alt)] z-[1] min-w-[88px]">
                  Kaza / Adım
                </th>
                {Array.from({ length: steps }).map((_, j) => (
                  <th
                    key={j}
                    className="text-right px-1.5 py-1 font-semibold min-w-[64px]"
                  >
                    {j + 1}
                  </th>
                ))}
              </tr>
            </thead>

            {/* LDF triangle */}
            <tbody>
              <tr>
                <td
                  colSpan={steps + 1}
                  className="px-2 py-0.5 text-[9px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] bg-[color:var(--background)]"
                >
                  Gelişim Oranları (Üçgen)
                </td>
              </tr>
              {triangle.origin_periods.map((o, i) => (
                <tr
                  key={o}
                  className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]/40"
                >
                  <td className="px-2 py-0.5 font-medium sticky left-0 bg-[color:var(--surface)] z-[1] leading-tight">
                    {o}
                  </td>
                  {Array.from({ length: steps }).map((_, j) => {
                    const cell = ratios[i]?.[j];
                    if (!cell || cell.value == null) {
                      return (
                        <td
                          key={j}
                          className="text-right px-1.5 py-0.5 text-[color:var(--muted)]"
                        >
                          —
                        </td>
                      );
                    }
                    const key = cellKey(o, j);
                    const cellHeat =
                      cell.excluded || !heatmap
                        ? {}
                        : heatmapStyle(cell.value, columnStats[j]);
                    return (
                      <td key={j} className="px-0.5 py-0" style={cellHeat}>
                        <button
                          onClick={() => onToggleCell(o, j)}
                          title={
                            cell.excluded
                              ? "Dahil et"
                              : `Medyan: ${formatFactor(columnStats[j]?.median ?? 0)} — tıkla eleme`
                          }
                          className={
                            "w-full text-right px-1.5 py-0.5 rounded text-[11px] transition leading-tight " +
                            (cell.excluded
                              ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)] line-through"
                              : "hover:ring-1 hover:ring-[color:var(--primary)]/40")
                          }
                          data-key={key}
                        >
                          {formatFactor(cell.value)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            {/* Window summary rows */}
            <tbody className="border-t-2 border-[color:var(--border-strong)]">
              <tr>
                <td
                  colSpan={steps + 1}
                  className="px-2 py-0.5 text-[9px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] bg-[color:var(--background)]"
                >
                  Seçilmiş LDF — volume'a tıkla
                </td>
              </tr>
              {WINDOWS.map((w) => {
                const ldfs = windowLDFs[String(w.id)] ?? [];
                const active = w.id === window;
                return (
                  <tr
                    key={String(w.id)}
                    onClick={() => onWindowChange(w.id)}
                    className={
                      "border-t cursor-pointer transition " +
                      (active
                        ? "bg-[color:var(--primary-soft)] font-semibold"
                        : "hover:bg-[color:var(--surface-alt)]")
                    }
                  >
                    <td
                      className={
                        "px-2 py-0.5 sticky left-0 z-[1] leading-tight " +
                        (active
                          ? "bg-[color:var(--primary-soft)]"
                          : "bg-[color:var(--surface)]")
                      }
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={
                            "inline-block h-2 w-2 rounded-full border " +
                            (active
                              ? "bg-[color:var(--primary)] border-[color:var(--primary)]"
                              : "border-[color:var(--border-strong)]")
                          }
                        />
                        {w.label}
                      </span>
                    </td>
                    {ldfs.map((v, j) => (
                      <td key={j} className="text-right px-1.5 py-0.5">
                        {formatFactor(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>

            {/* CDF row */}
            <tbody className="border-t-2 border-[color:var(--primary)]">
              <tr className="bg-[color:var(--primary-soft)]">
                <td className="px-2 py-1 font-semibold sticky left-0 bg-[color:var(--primary-soft)] z-[1] text-[color:var(--primary)] leading-tight">
                  CDF → Ult
                </td>
                {cdfs.map((v, j) => (
                  <td
                    key={j}
                    className="text-right px-1.5 py-1 font-semibold text-[color:var(--primary)]"
                  >
                    {formatFactor(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
      Önce Veri sekmesinden bir üçgen yükleyin.
    </div>
  );
}
