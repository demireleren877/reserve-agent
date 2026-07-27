"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LDFMethod, Triangle, FileData } from "@/types/triangle";
import { filePaid, fileIncurred } from "@/types/triangle";
import { formatNumber } from "@/lib/api";
import { devDate } from "@/lib/roll-forward-util";
import {
  type Window,
  aggregateLDFs,
  applyAvgPairs,
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
  /** LDF yumuşatma çiftleri (anahtar `origin|j` = çiftin sol hücresi). */
  avgPairs?: Set<string>;
  onWindowChange: (w: Window) => void;
  /** Düzenlenebilir volume presetleri (branşa özel). Yoksa [4,5,6,7]. */
  windowPresets?: number[];
  onWindowPresetsChange?: (next: number[]) => void;
  onToggleCell: (origin: string, step: number) => void;
  /** Long-press: aynı satırda (j, j+1) çiftini ortalamaya al / geri al. */
  onToggleAvgPair?: (origin: string, step: number) => void;
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
    avgPairs,
    cdfsOverride,
    karmaWindowPerStep,
    onWindowChange,
    windowPresets,
    onWindowPresetsChange,
    onToggleCell,
    onToggleAvgPair,
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
  // Düzenlenebilir volume presetleri — BRANŞA özel (varsayılan 4,5,6,7). "All" sabit.
  // onWindowPresetsChange verilirse branşa yazılır; yoksa yerel (oturumluk) fallback.
  const [localPresets, setLocalPresets] = useState<number[]>([4, 5, 6, 7]);
  const presetWindows =
    windowPresets && windowPresets.length ? windowPresets : localPresets;
  const updatePresets = (next: number[]) => {
    if (onWindowPresetsChange) onWindowPresetsChange(next);
    else setLocalPresets(next);
  };
  const ff = useMemo(() => {
    const nf = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return (n: number) => nf.format(n);
  }, [decimals]);
  const [hover, setHover] = useState<
    { o: string; i: number; j: number; x: number; y: number } | null
  >(null);
  // Sağ tıkla açılan SABİT (pinned) detay popup'ı — hover'ın aksine etkileşimli:
  // içine girip tüm sebep dosyaları okuyabilir/kaydırabilirsin.
  const [pinned, setPinned] = useState<
    { o: string; i: number; j: number; x: number; y: number } | null
  >(null);
  const pinnedRef = useRef<HTMLDivElement>(null);

  const ratios = useMemo(
    () => (triangle ? applyAvgPairs(developmentRatios(triangle, excludedCells), avgPairs ?? new Set<string>(), triangle.origin_periods) : []),
    [triangle, excludedCells, avgPairs],
  );

  // Long-press ayrımı: kısa tık = eleme (onToggleCell); basılı tut = ortalama çifti (onToggleAvgPair).
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const HOLD_MS = 350;
  function startHold(o: string, j: number, hasNext: boolean) {
    didLongPress.current = false;
    if (!onToggleAvgPair || !hasNext) return;
    holdTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onToggleAvgPair(o, j); // (j, j+1) çiftini aç/kapat
    }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  }

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

  // Bir hücre için karşılaştırma verisi: bu dönem / önceki dönem LDF + değişime
  // sebep dosyalar. Hem hover hem sağ-tık (pinned) popup bunu kullanır.
  const buildCellInfo = useCallback(
    (o: string, i: number, j: number) => {
      if (!triangle) return null;
      const cur = ratios[i]?.[j]?.value ?? null;
      const median = columnStats[j]?.median ?? null;
      const pIdx = priorIdxByLabel.get(o);
      const hasPrior = !!prior && pIdx != null;
      const priorVal = hasPrior ? priorRatios[pIdx as number]?.[j]?.value ?? null : null;
      const delta = cur != null && priorVal != null ? cur - priorVal : null;

      type FileRow = { file: string; prev: number; cur: number; delta: number; tag: string; side: string };
      const files: FileRow[] = [];
      let sumPrev = 0;
      let sumCur = 0;
      // LDF üçgeni incurred ise dosya değişimini de INCURRED (ödeme+muallak) üzerinden
      // hesapla — aksi halde SADECE muallak (OS) düzeltilen dosyalar (paid aynı kalır)
      // görünmez. Paid üçgende paid bazına düş.
      const fileVal = triangle.triangle_type === "incurred" ? fileIncurred : filePaid;
      // Oran = num/den. Değişim iki taraftan da gelebilir; bu yüzden HEM numerator
      // (dev j+1) HEM denominator (dev j) hücresinin dosya değişimlerini tara.
      const cfd = fileData ?? {};
      const pfd = prior?.fileData ?? {};
      if ((fileData || prior?.fileData) && pIdx != null) {
        const seen = new Set<string>();
        const sides: [string, string][] = [
          [devDate(o, j + 1, triangle), "numerator"],
          [devDate(o, j, triangle), "denominator"],
        ];
        for (const [devLabel, side] of sides) {
          const curF = cfd[o]?.[devLabel] ?? {};
          const prevF = pfd[o]?.[devLabel] ?? {};
          for (const f of new Set([...Object.keys(curF), ...Object.keys(prevF)])) {
            const pv = fileVal(prevF[f]);
            const cv = fileVal(curF[f]);
            if (side === "numerator") {
              sumPrev += pv;
              sumCur += cv;
            }
            if (seen.has(f)) continue; // dosyayı bir kez göster (numerator öncelik)
            const d = cv - pv;
            if (Math.abs(d) < 1) continue;
            seen.add(f);
            // Negatif attritional pay = dosya o dönem LARGE'da (gross−large<0). İşaret
            // değişimi large ↔ attritional geçişini gösterir.
            const tag =
              pv < 0 && cv >= 0 ? "from large"        // large'dan çıktı → att'a girdi
              : pv >= 0 && cv < 0 ? "to large"         // att'tan çıktı → large'a girdi
              : pv > 0 && cv === 0 ? "moved to large"
              : pv === 0 && cv > 0 ? "new"
              : d > 0 ? "increased" : "decreased";
            files.push({ file: f, prev: pv, cur: cv, delta: d, tag, side });
          }
        }
        files.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      }
      return { o, j, cur, priorVal, delta, median, files, hasPrior, sumPrev, sumCur };
    },
    [triangle, ratios, columnStats, prior, priorRatios, priorIdxByLabel, fileData],
  );

  const hoverInfo = useMemo(
    () => (hover ? buildCellInfo(hover.o, hover.i, hover.j) : null),
    [hover, buildCellInfo],
  );
  const pinnedInfo = useMemo(
    () => (pinned ? buildCellInfo(pinned.o, pinned.i, pinned.j) : null),
    [pinned, buildCellInfo],
  );

  // Pinned popup: dışına tıkla veya Esc ile kapat.
  useEffect(() => {
    if (!pinned) return;
    function onDown(e: MouseEvent) {
      if (pinnedRef.current && !pinnedRef.current.contains(e.target as Node)) setPinned(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinned(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const windowLDFs = useMemo(() => {
    if (!triangle) return {} as Record<string, number[]>;
    const map: Record<string, number[]> = {};
    for (const w of presetWindows) map[String(w)] = aggregateLDFs(triangle, ratios, w, FIXED_METHOD);
    map["all"] = aggregateLDFs(triangle, ratios, "all", FIXED_METHOD);
    return map;
  }, [triangle, ratios, presetWindows]);

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
  // Dosya kırılımı bazı — LDF üçgeni incurred ise incurred, değilse paid.
  const fileBasis = triangle.triangle_type === "incurred" ? "incurred" : "paid";

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
            Change vs previous period ({prior.label}) · hover for a quick look, right-click for full details
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
              {window === "all" ? "All" : `Last ${window}`}
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
                    // Ortalama çiftinin parçası mı? (sol hücre o|j, sağ hücre o|j-1)
                    const isAvg = !!avgPairs && (avgPairs.has(key) || avgPairs.has(cellKey(o, j - 1)));
                    const hasNext = j + 1 < steps && ratios[i]?.[j + 1]?.value != null;
                    return (
                      <td key={j} className="px-0.5 py-0" style={cellHeat}>
                        <button
                          onClick={() => { if (didLongPress.current) { didLongPress.current = false; return; } onToggleCell(o, j); }}
                          onPointerDown={(e) => { if (e.button === 0) startHold(o, j, hasNext); }}
                          onPointerUp={cancelHold}
                          onPointerLeave={() => { cancelHold(); setHover(null); }}
                          onMouseEnter={(e) =>
                            setHover({ o, i, j, x: e.clientX, y: e.clientY })
                          }
                          onMouseMove={(e) =>
                            setHover((h) =>
                              h && h.o === o && h.j === j
                                ? { ...h, x: e.clientX, y: e.clientY }
                                : h,
                            )
                          }
                          onMouseLeave={() => setHover(null)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setHover(null);
                            setPinned({ o, i, j, x: e.clientX, y: e.clientY });
                          }}
                          title={hasNext ? "Long-press to average · right-click for change details" : "Right-click for change details"}
                          className={
                            "relative w-full text-right px-1.5 py-0.5 rounded text-[11px] transition leading-tight " +
                            (cell.excluded
                              ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)] line-through"
                              : isAvg
                              ? "font-semibold text-[color:var(--primary)] ring-1 ring-[color:var(--primary)]/50"
                              : changed
                              ? "font-semibold ring-1 ring-[color:var(--warning)] text-[color:var(--warning)]"
                              : "hover:ring-1 hover:ring-[color:var(--primary)]/40")
                          }
                          style={
                            isAvg && !cell.excluded
                              ? { background: "var(--primary-soft)" }
                              : changed && !cell.excluded
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
              {/* Düzenlenebilir presetler — her satırın N değeri kullanıcı tarafından değiştirilebilir */}
              {presetWindows.map((wv, idx) => {
                const ldfs = windowLDFs[String(wv)] ?? [];
                const rowActive = !isKarmaActive && window === wv;
                return (
                  <tr
                    key={idx}
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
                        onWindowChange(wv);
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
                          value={wv}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            updatePresets(presetWindows.map((x, i) => (i === idx ? n : x)));
                            if (!isKarmaActive && window === wv) onWindowChange(n); // aktif satırsa global volume'u da güncelle
                          }}
                          className="w-12 text-[11px] tabular border border-[color:var(--border)] rounded px-1 py-0.5 text-right"
                          title="Editable volume — last N accident periods"
                        />
                      </span>
                    </td>
                    {ldfs.map((v, j) => {
                      const stepWin = karmaWindowPerStep?.[String(j)] ?? window;
                      const cellActive = stepWin === wv;
                      return (
                        <td
                          key={j}
                          className="px-0.5 py-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetKarmaWindow?.(String(j), wv);
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

              {/* All — sabit */}
              {(() => {
                const ldfs = windowLDFs["all"] ?? [];
                const rowActive = !isKarmaActive && window === "all";
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
                        onWindowChange("all");
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
                        All
                      </span>
                    </td>
                    {ldfs.map((v, j) => {
                      const stepWin = karmaWindowPerStep?.[String(j)] ?? window;
                      const cellActive = stepWin === "all";
                      return (
                        <td
                          key={j}
                          className="px-0.5 py-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetKarmaWindow?.(String(j), "all");
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

      {hover && hoverInfo && !pinned && (
        <div
          style={{
            position: "fixed",
            left: Math.min(hover.x + 14, (globalThis.innerWidth || 1200) - 316),
            top: Math.max(8, Math.min(hover.y + 14, (globalThis.innerHeight || 800) - 240)),
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
                  Files causing the change · {fileBasis}
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
                        (f.tag === "moved to large" || f.tag === "to large"
                          ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                          : f.tag === "new" || f.tag === "from large"
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
        </div>
      )}

      {pinned && pinnedInfo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40">
        <div
          ref={pinnedRef}
          style={{ maxHeight: "min(82vh, 640px)" }}
          className="card shadow-2xl text-[12px] flex flex-col overflow-hidden w-[440px] max-w-full"
        >
          {/* Başlık */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[color:var(--border)]">
            <div className="min-w-0">
              <div className="font-semibold text-[12px]">
                {pinnedInfo.o} · {pinnedInfo.j + 1}→{pinnedInfo.j + 2}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-[color:var(--muted)]">
                Development factor · change vs {prior?.label ?? "prior"}
              </div>
            </div>
            <button
              onClick={() => setPinned(null)}
              className="shrink-0 w-6 h-6 rounded grid place-items-center text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Özet */}
          <div className="px-3 py-2 border-b border-[color:var(--border)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--muted)]">This period</span>
              <b className="tabular">{pinnedInfo.cur != null ? ff(pinnedInfo.cur) : "—"}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--muted)]">
                Previous{prior?.label ? ` (${prior.label})` : ""}
              </span>
              <span className="tabular">
                {pinnedInfo.hasPrior && pinnedInfo.priorVal != null ? ff(pinnedInfo.priorVal) : "—"}
              </span>
            </div>
            {pinnedInfo.delta != null && (
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--muted)]">Change</span>
                <b
                  className={
                    "tabular " +
                    (pinnedInfo.delta > 0
                      ? "text-[color:var(--danger)]"
                      : "text-[color:var(--primary)]")
                  }
                >
                  {pinnedInfo.delta > 0 ? "+" : ""}
                  {ff(pinnedInfo.delta)}
                </b>
              </div>
            )}
            {pinnedInfo.median != null && (
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--muted)]">Column median</span>
                <span className="tabular text-[color:var(--muted)]">{ff(pinnedInfo.median)}</span>
              </div>
            )}
          </div>

          {/* Sebep dosyalar — TAMAMI, kaydırılabilir */}
          {!pinnedInfo.hasPrior ? (
            <div className="px-3 py-3 text-[color:var(--muted)]">
              No previous period to compare.
            </div>
          ) : pinnedInfo.files.length === 0 ? (
            <div className="px-3 py-3 text-[color:var(--muted)]">
              {pinnedInfo.delta != null && Math.abs(pinnedInfo.delta) < 0.0001
                ? "Ratio unchanged — no file-level movement."
                : "No file-level breakdown available for this cell."}
            </div>
          ) : (
            <>
              <div className="px-3 pt-2 pb-1 flex items-center justify-between text-[9px] uppercase tracking-wide text-[color:var(--muted)]">
                <span>Files causing the change · {fileBasis}</span>
                <span>{pinnedInfo.files.length}</span>
              </div>
              <div className="overflow-y-auto px-2 pb-1">
                {pinnedInfo.files.map((f) => (
                  <div
                    key={f.file}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[color:var(--surface-alt)]/60"
                  >
                    <span className="font-medium truncate flex-1 min-w-0" title={f.file}>
                      {f.file}
                    </span>
                    <span
                      className="shrink-0 text-[8px] uppercase tracking-wide text-[color:var(--muted)] px-1 py-px rounded bg-[color:var(--surface-alt)]"
                      title={f.side === "numerator" ? `Numerator (dev ${pinnedInfo.j + 2})` : `Denominator (dev ${pinnedInfo.j + 1})`}
                    >
                      {f.side === "numerator" ? "num" : "den"}
                    </span>
                    <span className="tabular text-[color:var(--muted)] whitespace-nowrap text-[10px]">
                      {formatNumber(f.prev)}→{formatNumber(f.cur)}
                    </span>
                    <span
                      className={
                        "tabular whitespace-nowrap text-[10px] font-semibold " +
                        (f.delta > 0
                          ? "text-[color:var(--danger)]"
                          : "text-[color:var(--primary)]")
                      }
                    >
                      {f.delta > 0 ? "+" : ""}
                      {formatNumber(f.delta)}
                    </span>
                    <span
                      className={
                        "shrink-0 px-1 py-px rounded text-[9px] font-semibold " +
                        (f.tag === "moved to large" || f.tag === "to large"
                          ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                          : f.tag === "new" || f.tag === "from large"
                          ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                          : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                      }
                    >
                      {f.tag}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-3 py-1.5 border-t border-[color:var(--border)] flex items-center justify-between text-[10px]">
                <span className="text-[color:var(--muted)]">Numerator {fileBasis} total</span>
                <span className="tabular">
                  {formatNumber(pinnedInfo.sumPrev)}→{formatNumber(pinnedInfo.sumCur)}{" "}
                  <span
                    className={
                      pinnedInfo.sumCur - pinnedInfo.sumPrev >= 0
                        ? "text-[color:var(--danger)]"
                        : "text-[color:var(--primary)]"
                    }
                  >
                    ({pinnedInfo.sumCur - pinnedInfo.sumPrev >= 0 ? "+" : ""}
                    {formatNumber(pinnedInfo.sumCur - pinnedInfo.sumPrev)})
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
        </div>
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
