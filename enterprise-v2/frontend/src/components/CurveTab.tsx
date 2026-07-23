"use client";

import { useEffect, useRef, useState } from "react";
import type { Triangle } from "@/types/triangle";
import { formatFactor } from "@/lib/api";
import type { TailFit } from "@/lib/tail-fit";
import { ldfAt } from "@/lib/ldf";
import { CurveFitModal } from "@/components/CurveFitModal";

interface Props {
  triangle: Triangle | null;
  initialCDFs: number[];
  effectiveCdfs?: number[];
  selectedLDFs: number[];
  cdfInitial: Record<string, number>;
  cdfModelPerPeriod: Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
  curveIncludePerPeriod: Record<string, boolean>;
  tailFits: {
    exp: TailFit;
    invPower: TailFit;
    power: TailFit;
    weibull: TailFit;
  };
  onSetUserValue: (devPeriod: string, value: number) => void;
  onSetModel: (devPeriod: string, model: 1 | 2 | 3 | 4 | 5 | 6) => void;
  onToggleInclude: (devPeriod: string, include: boolean) => void;
  onReset: () => void;
}

export function CurveTab({
  triangle,
  initialCDFs,
  effectiveCdfs,
  selectedLDFs,
  cdfInitial,
  cdfModelPerPeriod,
  curveIncludePerPeriod,
  tailFits,
  onSetUserValue,
  onSetModel,
  onToggleInclude,
  onReset,
}: Props) {
  const [dragModel, setDragModel] = useState<1 | 2 | 3 | 4 | 5 | 6 | null>(null);
  const dragModelRef = useRef<1 | 2 | 3 | 4 | 5 | 6 | null>(null);
  const draggedKeys = useRef<Set<string>>(new Set());
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    if (dragModel === null) return;
    const stop = () => {
      dragModelRef.current = null;
      setDragModel(null);
      draggedKeys.current.clear();
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [dragModel]);

  if (!triangle) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Load a triangle from the Data tab first.
      </div>
    );
  }

  function startDrag(key: string, model: 1 | 2 | 3 | 4 | 5 | 6) {
    dragModelRef.current = model;
    draggedKeys.current = new Set([key]);
    setDragModel(model);
    onSetModel(key, model);
  }

  function enterDrag(key: string) {
    if (dragModelRef.current === null || draggedKeys.current.has(key)) return;
    draggedKeys.current.add(key);
    onSetModel(key, dragModelRef.current);
  }

  const rows = triangle.development_periods.map((dev, i) => {
    const key = String(dev);
    const model = cdfModelPerPeriod[key] ?? 1;
    const initLDF = i < selectedLDFs.length ? selectedLDFs[i] : null;
    const autoExcluded = initLDF !== null && initLDF <= 1;
    const included = !autoExcluded && curveIncludePerPeriod[key] !== false;
    const expLDF = tailFits.exp.ok ? ldfAt(tailFits.exp.cdfs, i) : null;
    const ipLDF  = tailFits.invPower.ok ? ldfAt(tailFits.invPower.cdfs, i) : null;
    const pwLDF  = tailFits.power.ok ? ldfAt(tailFits.power.cdfs, i) : null;
    const wbLDF  = tailFits.weibull.ok ? ldfAt(tailFits.weibull.cdfs, i) : null;
    const userCDF = cdfInitial[key] ?? null;

    const expCDF = tailFits.exp.ok && i < tailFits.exp.cdfs.length ? tailFits.exp.cdfs[i] : null;
    const ipCDF  = tailFits.invPower.ok && i < tailFits.invPower.cdfs.length ? tailFits.invPower.cdfs[i] : null;
    const pwCDF  = tailFits.power.ok && i < tailFits.power.cdfs.length ? tailFits.power.cdfs[i] : null;
    const wbCDF  = tailFits.weibull.ok && i < tailFits.weibull.cdfs.length ? tailFits.weibull.cdfs[i] : null;
    const initCDF = i < initialCDFs.length ? initialCDFs[i] : 1;

    const modelCDF =
      model === 2 ? (expCDF ?? initCDF)
      : model === 3 ? (ipCDF ?? initCDF)
      : model === 4 ? (pwCDF ?? initCDF)
      : model === 5 ? (wbCDF ?? initCDF)
      : model === 6 ? (userCDF ?? 1)
      : initCDF;

    const selectedLdf =
      model === 2 ? expLDF
      : model === 3 ? ipLDF
      : model === 4 ? pwLDF
      : model === 5 ? wbLDF
      : model === 6 ? (userCDF ?? 1)
      : initLDF;

    return { i, key, dev, model, included, autoExcluded, initLDF, expLDF, ipLDF, pwLDF, wbLDF, userCDF, modelCDF, selectedLdf };
  });

  // effectiveCdfs varsa (cascade sonucu) kullan; yoksa modelCDF fallback
  const displayCdfs = rows.map((r, i) =>
    effectiveCdfs && i < effectiveCdfs.length ? effectiveCdfs[i] : r.modelCDF
  );
  const cumulPct = displayCdfs.map(c => (c > 0 ? 100 / c : 0));
  const incrPct  = cumulPct.map((p, i) => i === 0 ? p : p - cumulPct[i - 1]);

  const hasOverrides = rows.some(r => r.model !== 1);
  const hasExcludes  = rows.some(r => !r.included);

  const ip = tailFits.invPower.params;
  const ep = tailFits.exp.params;
  const pp = tailFits.power.params;
  const wb = tailFits.weibull.params;

  const includeFlags = rows.map(r => r.included);

  return (
    <div className="space-y-3">
      {showChart && (
        <CurveFitModal
          selectedLDFs={selectedLDFs}
          includeFlags={includeFlags}
          devPeriods={triangle.development_periods}
          fits={tailFits}
          onClose={() => setShowChart(false)}
        />
      )}
      <div className="card p-2.5 flex items-center gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-medium">CDF Curve</span>
          <span className="text-[10px] text-[color:var(--muted)]">
            Click or drag to select · User Value: double-click
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {(tailFits.exp.ok || tailFits.invPower.ok || tailFits.power.ok || tailFits.weibull.ok) && (
            <button
              onClick={() => setShowChart(true)}
              className="btn text-[11px] py-1 px-2"
            >
              Chart
            </button>
          )}
          {(hasOverrides || hasExcludes) && (
            <button
              onClick={() => { if (confirm("Clear all selections and overrides?")) onReset(); }}
              className="btn text-[11px] py-1 px-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {(tailFits.exp.ok || tailFits.invPower.ok || tailFits.power.ok || tailFits.weibull.ok) && (
        <div className="flex gap-2 flex-wrap text-[10px] text-[color:var(--muted-strong)]">
          {tailFits.exp.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Exp: a={ep.a?.toFixed(4)}, b={ep.b?.toFixed(4)}
              {tailFits.exp.r2 != null && <> R²={tailFits.exp.r2.toFixed(3)}</>}
            </span>
          )}
          {tailFits.invPower.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Inv.Power: a={ip.a?.toFixed(4)}, b={ip.b?.toFixed(4)}, c={ip.c?.toFixed(1)}
              {tailFits.invPower.r2 != null && <> R²={tailFits.invPower.r2.toFixed(3)}</>}
            </span>
          )}
          {tailFits.power.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Power: a={pp.a?.toFixed(4)}, b={pp.b?.toFixed(4)}
              {tailFits.power.r2 != null && <> R²={tailFits.power.r2.toFixed(3)}</>}
            </span>
          )}
          {tailFits.weibull.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Weibull: a={wb.a?.toFixed(4)}, b={wb.b?.toFixed(4)}
              {tailFits.weibull.r2 != null && <> R²={tailFits.weibull.r2.toFixed(3)}</>}
            </span>
          )}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-[12px] tabular w-full select-none">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[10px] uppercase tracking-wide bg-[color:var(--surface-alt)]">
                <th className="text-left px-2 py-1.5 font-semibold w-[70px]">Dev.</th>
                <th className="text-center px-2 py-1.5 font-semibold w-[60px]">Include</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px]">Initial</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px] text-[color:var(--muted)]">Exp. Decay</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px] text-[color:var(--muted)]">Inv. Power</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px] text-[color:var(--muted)]">Power</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px] text-[color:var(--muted)]">Weibull</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px]">User Value</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px]">Selected</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[90px]">Cumul CDF</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[70px]">Cumul%</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[70px]">Incr%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rowIdx) => (
                <tr
                  key={r.key}
                  className={"border-t hover:bg-[color:var(--surface-alt)]/20"}
                >
                  <td className="px-2 py-0.5 font-medium leading-tight tabular text-[11px]">{r.i + 1}</td>

                  {/* Include */}
                  <td className="text-center px-2 py-0.5">
                    <button
                      onClick={() => !r.autoExcluded && onToggleInclude(r.key, !r.included)}
                      disabled={r.autoExcluded}
                      title={r.autoExcluded ? "LDF ≤ 1: auto-excluded" : undefined}
                      className={
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded transition " +
                        (r.autoExcluded ? "opacity-40 cursor-not-allowed" : "")
                      }
                      style={
                        r.autoExcluded
                          ? { background: "var(--surface-alt)", color: "var(--muted)" }
                          : r.included
                          ? { background: "#16a34a", color: "#ffffff" }   // dahil: koyu yeşil, full opak
                          : { background: "#dcfce7", color: "#6b7280" }   // diğerleri: soft yeşil, gri metin
                      }
                    >
                      {r.included ? "Yes" : "No"}
                    </button>
                  </td>

                  <DragCell value={r.initLDF} active={r.model === 1} faded={!r.included}
                    onMouseDown={() => startDrag(r.key, 1)} onMouseEnter={() => enterDrag(r.key)} />
                  <DragCell value={r.expLDF} active={r.model === 2}
                    onMouseDown={() => startDrag(r.key, 2)} onMouseEnter={() => enterDrag(r.key)} />
                  <DragCell value={r.ipLDF} active={r.model === 3}
                    onMouseDown={() => startDrag(r.key, 3)} onMouseEnter={() => enterDrag(r.key)} />
                  <DragCell value={r.pwLDF} active={r.model === 4}
                    onMouseDown={() => startDrag(r.key, 4)} onMouseEnter={() => enterDrag(r.key)} />
                  <DragCell value={r.wbLDF} active={r.model === 5}
                    onMouseDown={() => startDrag(r.key, 5)} onMouseEnter={() => enterDrag(r.key)} />

                  <UserValueCell
                    value={r.userCDF}
                    active={r.model === 6}
                    onMouseDown={() => startDrag(r.key, 6)}
                    onMouseEnter={() => enterDrag(r.key)}
                    onCommit={v => { onSetUserValue(r.key, v); onSetModel(r.key, 6); }}
                  />

                  {/* Selected */}
                  <td className="text-right px-2 py-0.5 font-semibold text-[color:var(--success)] text-[12px]">
                    {r.selectedLdf != null ? formatFactor(r.selectedLdf) : "—"}
                  </td>

                  {/* Cumul CDF */}
                  <td className="text-right px-2 py-0.5 text-[12px]">
                    {formatFactor(displayCdfs[rowIdx])}
                  </td>

                  {/* Cumul% */}
                  <td className="text-right px-2 py-0.5 text-[11px] text-[color:var(--muted-strong)]">
                    {cumulPct[rowIdx].toFixed(2)}%
                  </td>

                  {/* Incr% */}
                  <td className="text-right px-2 py-0.5 text-[11px] text-[color:var(--muted)]">
                    {incrPct[rowIdx].toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DragCell({
  value, active, faded, onMouseDown, onMouseEnter,
}: {
  value: number | null; active: boolean; faded?: boolean;
  onMouseDown: () => void; onMouseEnter: () => void;
}) {
  if (value == null) {
    return <td className="text-right px-2 py-0.5 text-[color:var(--muted)] text-[11px]">—</td>;
  }
  return (
    <td
      onMouseDown={e => { e.preventDefault(); onMouseDown(); }}
      onMouseEnter={onMouseEnter}
      className={
        "text-right px-2 py-0.5 text-[12px] tabular cursor-pointer transition " +
        (active
          ? "font-semibold "
          : "text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] ") +
        (faded ? "opacity-50" : "")
      }
      style={active ? { background: "#16a34a", color: "#ffffff" } : undefined}
    >
      {formatFactor(value)}
    </td>
  );
}

function UserValueCell({
  value, active, onMouseDown, onMouseEnter, onCommit,
}: {
  value: number | null; active: boolean;
  onMouseDown: () => void; onMouseEnter: () => void;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(String(value ?? 1)); }, [value, editing]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  if (editing) {
    return (
      <td className="p-0">
        <input
          ref={ref}
          type="number"
          step="0.0001"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(draft);
            if (Number.isFinite(n) && n > 0) onCommit(n);
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="w-full text-right text-[12px] tabular bg-[color:var(--primary-soft)] border-0 outline-none px-2 py-0.5"
        />
      </td>
    );
  }

  return (
    <td
      onMouseDown={e => { e.preventDefault(); onMouseDown(); }}
      onMouseEnter={onMouseEnter}
      onDoubleClick={() => { setEditing(true); }}
      title="Click / drag · Double-click: enter value"
      className={
        "text-right px-2 py-0.5 text-[12px] tabular cursor-pointer transition " +
        (active
          ? "font-semibold "
          : value != null
          ? "text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)] "
          : "text-[color:var(--muted)] hover:bg-[color:var(--surface-alt)] ")
      }
      style={active ? { background: "#16a34a", color: "#ffffff" } : undefined}
    >
      {formatFactor(value ?? 1)}
    </td>
  );
}
