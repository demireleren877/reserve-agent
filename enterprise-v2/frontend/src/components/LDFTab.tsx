"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LDFMethod, Triangle, FileData } from "@/types/triangle";
import { formatNumber } from "@/lib/api";
import { devDate } from "@/lib/roll-forward-util";
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

/** LDF hücresi hover popup'ı için önceki dönem karşılaştırma verisi. */
export interface LDFPriorRef {
  label: string;
  triangle: Triangle;
  fileData?: FileData | null;
}

interface Props {
  triangle: Triangle | null;
  window: Window;
  excludedCells: Set<string>;
  /** Güncel dönem dosya kırılımı (origin→dev→{dosya_no: kümülatif ödeme}). */
  fileData?: FileData | null;
  /** Önceki dönem — hover'da değişim ve sebep dosyalar için. */
  prior?: LDFPriorRef | null;
  /** Curve cascade uygulanmış CDF zinciri. Verilirse CDF satırında
   *  bu değerler gösterilir. */
  cdfsOverride?: number[];
  /** Karma volume: her dev step için ayrı window. Key = step index string. */
  karmaWindowPerStep?: Record<string, Window>;
  onWindowChange: (w: Window) => void;
  onToggleCell: (origin: string, step: number) => void;
  onClearCells: () => void;
  /** Tüm eleme setini değiştir (kaza yılı satırının toptan elenmesi için). */
  onSetExcluded?: (next: Set<string>) => void;
  onSetKarmaWindow?: (step: string, w: Window) => void;
  onInitKarma?: (stepCount: number, globalWindow: Window) => void;
  onClearKarma?: () => void;
}

const FIXED_METHOD: LDFMethod = "volume_weighted";

export function LDFTab(props: Props) {
  const {
    triangle,
    window,
    excludedCells,
    cdfsOverride,
    karmaWindowPerStep,
    onWindowChange,
    onToggleCell,
    onClearCells,
    onSetExcluded,
    onSetKarmaWindow,
    onInitKarma,
    onClearKarma,
    fileData,
    prior,
  } = props;

  const [heatmap, setHeatmap] = useState(false);
  const [decimals, setDecimals] = useState(4);
  const [customWindow, setCustomWindow] = useState(10); // kullanıcı-input volume
  const ff = useMemo(() => {
    const nf = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return (n: number) => nf.format(n);
  }, [decimals]);
  // Kimlik (hangi hücre) ile fare konumunu AYIR: konum her piksel hareketinde
  // değişir ama hoverInfo (dosya kırılımı hesabı) yalnız kimliğe bağlı olsun —
  // aksi halde her harekette ağır yeniden-hesap + reflow titremesi olur.
  const [hover, setHover] = useState<{ o: string; i: number; j: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const ratios = useMemo(
    () => (triangle ? developmentRatios(triangle, excludedCells) : []),
    [triangle, excludedCells],
  );

  // Kaza yılı satırındaki tüm (geçerli) hücrelerin eleme durumu.
  function rowExclusion(o: string, i: number): { steps: number[]; allExcluded: boolean } {
    const steps: number[] = [];
    ratios[i]?.forEach((c, j) => { if (c && c.value != null) steps.push(j); });
    const allExcluded = steps.length > 0 && steps.every((j) => excludedCells.has(cellKey(o, j)));
    return { steps, allExcluded };
  }
  // Kaza yılına tıkla → o yılın tümünü ele / tümünü geri al (toggle).
  function toggleOrigin(o: string, i: number) {
    if (!onSetExcluded) return;
    const { steps, allExcluded } = rowExclusion(o, i);
    if (!steps.length) return;
    const next = new Set(excludedCells);
    steps.forEach((j) => (allExcluded ? next.delete(cellKey(o, j)) : next.add(cellKey(o, j))));
    onSetExcluded(next);
  }

  // Önceki dönem link-ratio üçgeni (eleme flag'i önemsiz, sadece değerler).
  const priorRatios = useMemo(
    () => (prior?.triangle ? developmentRatios(prior.triangle, new Set<string>()) : []),
    [prior?.triangle],
  );
  const priorIdxByLabel = useMemo(() => {
    const m = new Map<string, number>();
    prior?.triangle?.origin_periods.forEach((o, i) => m.set(o, i));
    return m;
  }, [prior?.triangle]);

  const columnStats = useMemo(() => {
    if (!triangle) return [] as ColStats[];
    return computeColumnStats(ratios, triangle.development_periods.length - 1);
  }, [triangle, ratios]);

  // Hover popup verisi: bu dönem / önceki dönem LDF + değişime sebep dosyalar.
  const hoverInfo = useMemo(() => {
    if (!hover || !triangle) return null;
    const { o, i, j } = hover;
    const cur = ratios[i]?.[j]?.value ?? null;
    const median = columnStats[j]?.median ?? null;
    const pIdx = priorIdxByLabel.get(o);
    const hasPrior = !!prior && pIdx != null;
    const priorVal = hasPrior ? priorRatios[pIdx as number]?.[j]?.value ?? null : null;
    const delta = cur != null && priorVal != null ? cur - priorVal : null;

    type FileRow = { file: string; prev: number; cur: number; delta: number; tag: string };
    let files: FileRow[] = [];
    if (prior?.fileData && fileData && pIdx != null) {
      const devLabel = devDate(o, j + 1, triangle); // numerator hücresi (dev j+1)
      const curF = fileData[o]?.[devLabel] ?? {};
      const prevF = prior.fileData[o]?.[devLabel] ?? {};
      for (const f of new Set([...Object.keys(curF), ...Object.keys(prevF)])) {
        const pv = prevF[f] ?? 0;
        const cv = curF[f] ?? 0;
        const d = cv - pv;
        if (Math.abs(d) < 1) continue;
        const tag =
          pv > 0 && cv === 0 ? "moved to large"
          : pv === 0 && cv > 0 ? "new"
          : d > 0 ? "increased" : "decreased";
        files.push({ file: f, prev: pv, cur: cv, delta: d, tag });
      }
      files.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }
    return { o, j, cur, priorVal, delta, median, files, hasPrior };
  }, [hover, triangle, ratios, columnStats, prior, priorRatios, priorIdxByLabel, fileData]);

  const windowLDFs = useMemo(() => {
    if (!triangle) return {} as Record<string, number[]>;
    const map: Record<string, number[]> = {};
    for (const w of WINDOWS) {
      map[String(w.id)] = aggregateLDFs(triangle, ratios, w.id, FIXED_METHOD);
    }
    return map;
  }, [triangle, ratios]);

  const customLDFs = useMemo(
    () => (triangle ? aggregateLDFs(triangle, ratios, customWindow, FIXED_METHOD) : []),
    [triangle, ratios, customWindow],
  );

  const isKarmaActive = !!karmaWindowPerStep && Object.keys(karmaWindowPerStep).length > 0;

  const selectedLDFs = useMemo(() => {
    if (!triangle) return [] as number[];
    // karmaWindowPerStep varsa per-step override uygula; yoksa global window ile aynı
    return aggregateLDFs(triangle, ratios, window, FIXED_METHOD,
      karmaWindowPerStep && Object.keys(karmaWindowPerStep).length > 0 ? karmaWindowPerStep : undefined);
  }, [triangle, ratios, window, karmaWindowPerStep]);
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
        {prior && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--muted)]">
            <span
              className="inline-block h-3 w-3 rounded-sm ring-1 ring-[color:var(--warning)]"
              style={{ background: "var(--accent-cell)" }}
            />
            Change vs previous period ({prior.label}) · hover a cell for details
          </span>
        )}
        <div className="flex items-center gap-3 ml-auto text-[11px] text-[color:var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <span className="uppercase tracking-wide font-semibold text-[10px]">Decimals</span>
            <span className="inline-flex items-center h-6 rounded-md border border-[color:var(--border)] overflow-hidden">
              <button
                onClick={() => setDecimals((d) => Math.max(0, d - 1))}
                disabled={decimals <= 0}
                className="w-6 h-full text-[13px] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] disabled:opacity-30"
                aria-label="azalt"
              >
                −
              </button>
              <span className="px-1.5 tabular font-medium text-[color:var(--foreground)] min-w-[18px] text-center border-x border-[color:var(--border)]">
                {decimals}
              </span>
              <button
                onClick={() => setDecimals((d) => Math.min(10, d + 1))}
                disabled={decimals >= 10}
                className="w-6 h-full text-[13px] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] disabled:opacity-30"
                aria-label="increase"
              >
                +
              </button>
            </span>
          </span>
          <button
            onClick={() => setHeatmap((v) => !v)}
            className={
              "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition " +
              (heatmap
                ? "bg-[color:var(--primary-soft)] border-[color:var(--primary-border)] text-[color:var(--primary)]"
                : "hover:border-[color:var(--border-strong)]")
            }
            title="Column-based outlier coloring"
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
                low
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: "rgba(220,38,38,0.35)" }} />
                high
              </span>
            </>
          )}
          {excludedCells.size > 0 && (
            <>
              <span className="border-l pl-3 ml-1">
                {excludedCells.size} cells excluded
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
          <h2 className="text-sm font-semibold">Development Ratios & CDF</h2>
          <span className="text-xs text-[color:var(--muted)]">
            Click a cell to exclude · selected volume:{" "}
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
                  Accident / Step
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
                  Development Ratios (Triangle)
                </td>
              </tr>
              {triangle.origin_periods.map((o, i) => {
                const rowEx = rowExclusion(o, i);
                return (
                <tr
                  key={o}
                  className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]/40"
                >
                  <td
                    onClick={() => onSetExcluded && rowEx.steps.length > 0 && toggleOrigin(o, i)}
                    title={rowEx.allExcluded ? "Kaza yılını geri al (tümü)" : "Kaza yılını tümüyle ele"}
                    className={
                      "px-2 py-0.5 font-medium sticky left-0 bg-[color:var(--surface)] z-[1] leading-tight select-none " +
                      (onSetExcluded && rowEx.steps.length > 0 ? "cursor-pointer hover:text-[color:var(--danger)] " : "") +
                      (rowEx.allExcluded ? "text-[color:var(--danger)] line-through" : "")
                    }
                  >
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
                    // Geçen döneme göre değişti mi? (uyarı vurgusu)
                    const pIdx = priorIdxByLabel.get(o);
                    const priorVal =
                      prior && pIdx != null ? priorRatios[pIdx]?.[j]?.value ?? null : null;
                    const changed =
                      priorVal != null &&
                      cell.value != null &&
                      Math.abs(cell.value - priorVal) >= 0.001;
                    return (
                      <td key={j} className="px-0.5 py-0" style={cellHeat}>
                        <button
                          onClick={() => onToggleCell(o, j)}
                          onMouseEnter={(e) => {
                            setHover({ o, i, j });
                            setPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHover(null)}
                          className={
                            "relative w-full text-right px-1.5 py-0.5 rounded text-[11px] transition leading-tight " +
                            (cell.excluded
                              ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)] line-through"
                              : changed
                              ? "font-semibold ring-1 ring-[color:var(--warning)] text-[color:var(--warning)]"
                              : "hover:ring-1 hover:ring-[color:var(--primary)]/40")
                          }
                          style={
                            changed && !cell.excluded
                              ? { background: "var(--accent-cell)" }
                              : undefined
                          }
                          data-key={key}
                        >
                          {ff(cell.value)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>

            {/* Window summary rows */}
            <tbody className="border-t-2 border-[color:var(--border-strong)]">
              <tr>
                <td
                  colSpan={steps + 1}
                  className="px-2 py-0.5 text-[9px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] bg-[color:var(--background)]"
                >
                  Selected LDF — click volume
                </td>
              </tr>
              {WINDOWS.map((w) => {
                const ldfs = windowLDFs[String(w.id)] ?? [];
                const rowActive = !isKarmaActive && w.id === window;
                return (
                  <tr
                    key={String(w.id)}
                    className={
                      "border-t transition " +
                      (rowActive
                        ? "bg-[color:var(--primary-soft)] font-semibold"
                        : "hover:bg-[color:var(--surface-alt)]/60")
                    }
                  >
                    <td
                      className={
                        "px-2 py-0.5 sticky left-0 z-[1] leading-tight cursor-pointer " +
                        (rowActive
                          ? "bg-[color:var(--primary-soft)]"
                          : "bg-[color:var(--surface)]")
                      }
                      onClick={() => {
                        onClearKarma?.();
                        onWindowChange(w.id);
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={
                            "inline-block h-2 w-2 rounded-full border " +
                            (rowActive
                              ? "bg-[color:var(--primary)] border-[color:var(--primary)]"
                              : "border-[color:var(--border-strong)]")
                          }
                        />
                        {w.label}
                      </span>
                    </td>
                    {/* Individual cells — click selects this window for just this step */}
                    {ldfs.map((v, j) => {
                      const stepWin = karmaWindowPerStep?.[String(j)] ?? window;
                      const cellActive = stepWin === w.id;
                      return (
                        <td
                          key={j}
                          className="px-0.5 py-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetKarmaWindow?.(String(j), w.id);
                          }}
                        >
                          <span
                            className={
                              "flex justify-end px-1.5 py-0.5 rounded transition " +
                              (cellActive
                                ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)] font-semibold ring-1 ring-[color:var(--primary-border)]"
                                : "hover:bg-[color:var(--surface-alt)]")
                            }
                          >
                            {ff(v)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Kullanıcı-input volume satırı — "Last N" (N serbest) */}
              {(() => {
                const rowActive = !isKarmaActive && window === customWindow;
                return (
                  <tr
                    className={
                      "border-t transition " +
                      (rowActive
                        ? "bg-[color:var(--primary-soft)] font-semibold"
                        : "hover:bg-[color:var(--surface-alt)]/60")
                    }
                  >
                    <td
                      className={
                        "px-2 py-0.5 sticky left-0 z-[1] leading-tight cursor-pointer " +
                        (rowActive ? "bg-[color:var(--primary-soft)]" : "bg-[color:var(--surface)]")
                      }
                      onClick={() => {
                        onClearKarma?.();
                        onWindowChange(customWindow);
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={
                            "inline-block h-2 w-2 rounded-full border " +
                            (rowActive
                              ? "bg-[color:var(--primary)] border-[color:var(--primary)]"
                              : "border-[color:var(--border-strong)]")
                          }
                        />
                        Last
                        <input
                          type="number"
                          min={1}
                          value={customWindow}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            const wasActive = window === customWindow;
                            setCustomWindow(n);
                            if (wasActive) onWindowChange(n);
                          }}
                          className="w-12 text-[11px] tabular border border-[color:var(--border)] rounded px-1 py-0.5 text-right"
                          title="User-defined volume (last N accident periods)"
                        />
                      </span>
                    </td>
                    {customLDFs.map((v, j) => {
                      const stepWin = karmaWindowPerStep?.[String(j)] ?? window;
                      const cellActive = stepWin === customWindow;
                      return (
                        <td
                          key={j}
                          className="px-0.5 py-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetKarmaWindow?.(String(j), customWindow);
                          }}
                        >
                          <span
                            className={
                              "flex justify-end px-1.5 py-0.5 rounded transition " +
                              (cellActive
                                ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)] font-semibold ring-1 ring-[color:var(--primary-border)]"
                                : "hover:bg-[color:var(--surface-alt)]")
                            }
                          >
                            {ff(v)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}
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
                    {ff(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {hover && hoverInfo && typeof document !== "undefined" &&
        createPortal(
        <div
          style={{
            position: "fixed",
            left: Math.min(pos.x + 14, (globalThis.innerWidth || 1200) - 316),
            top: Math.max(8, Math.min(pos.y + 14, (globalThis.innerHeight || 800) - 240)),
            zIndex: 60,
            pointerEvents: "none",
            width: 300,
          }}
          className="card shadow-lg p-2.5 text-[11px]"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold">
              {hoverInfo.o} · {hoverInfo.j + 1}→{hoverInfo.j + 2}
            </span>
            {hoverInfo.median != null && (
              <span className="text-[color:var(--muted)]">
                medyan {ff(hoverInfo.median)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 tabular flex-wrap">
            <span>
              This period:{" "}
              <b>{hoverInfo.cur != null ? ff(hoverInfo.cur) : "—"}</b>
            </span>
            {hoverInfo.hasPrior ? (
              <span className="text-[color:var(--muted)]">
                Previous{prior?.label ? ` (${prior.label})` : ""}:{" "}
                {hoverInfo.priorVal != null ? ff(hoverInfo.priorVal) : "—"}
              </span>
            ) : (
              <span className="text-[color:var(--muted)]">no previous period</span>
            )}
            {hoverInfo.delta != null && Math.abs(hoverInfo.delta) >= 0.0001 && (
              <span
                className={
                  "font-semibold " +
                  (hoverInfo.delta > 0
                    ? "text-[color:var(--danger)]"
                    : "text-[color:var(--primary)]")
                }
              >
                {hoverInfo.delta > 0 ? "+" : ""}
                {ff(hoverInfo.delta)}
              </span>
            )}
          </div>

          {hoverInfo.hasPrior &&
            (hoverInfo.files.length > 0 ? (
              <div className="border-t border-[color:var(--border)] mt-1.5 pt-1.5">
                <div className="text-[9px] uppercase tracking-wide text-[color:var(--muted)] mb-1">
                  Files causing the change · paid
                </div>
                {hoverInfo.files.slice(0, 6).map((f) => (
                  <div
                    key={f.file}
                    className="flex items-center justify-between gap-2 py-0.5"
                  >
                    <span className="font-medium truncate max-w-[96px]">{f.file}</span>
                    <span className="tabular text-[color:var(--muted)] whitespace-nowrap">
                      {formatNumber(f.prev)}→{formatNumber(f.cur)}
                    </span>
                    <span
                      className={
                        "shrink-0 px-1 py-px rounded text-[9px] font-semibold " +
                        (f.tag === "moved to large"
                          ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                          : f.tag === "new"
                          ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                          : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                      }
                    >
                      {f.tag}
                    </span>
                  </div>
                ))}
                {hoverInfo.files.length > 6 && (
                  <div className="text-[9px] text-[color:var(--muted)] mt-0.5">
                    +{hoverInfo.files.length - 6} dosya daha
                  </div>
                )}
              </div>
            ) : hoverInfo.delta != null && Math.abs(hoverInfo.delta) < 0.0001 ? (
              <div className="border-t border-[color:var(--border)] mt-1.5 pt-1.5 text-[color:var(--muted)]">
                no change
              </div>
            ) : null)}
        </div>,
        document.body,
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
      Load a triangle from the Data tab first.
    </div>
  );
}
