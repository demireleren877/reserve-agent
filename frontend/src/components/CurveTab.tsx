"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Triangle } from "@/types/triangle";
import { formatFactor } from "@/lib/api";
import { fitInversePower, fitExponential, fitWeibull } from "@/lib/tail-fit";

type CdfChoice = "initial" | "user";

interface Props {
  triangle: Triangle | null;
  initialCDFs: number[];
  /** Raw aggregated LDFs (pre-cascade) — used for tail fitting */
  selectedLDFs: number[];
  cdfInitial: Record<string, number>;
  cdfChoicePerPeriod: Record<string, CdfChoice>;
  onSetInitial: (devPeriod: string, value: number) => void;
  onResetInitial: () => void;
  onSetChoice: (devPeriod: string, choice: CdfChoice) => void;
  onSetChoiceBulk: (items: { devPeriod: string; choice: CdfChoice }[]) => void;
}

export function CurveTab({
  triangle,
  initialCDFs,
  selectedLDFs,
  cdfInitial,
  cdfChoicePerPeriod,
  onSetInitial,
  onResetInitial,
  onSetChoice,
  onSetChoiceBulk,
}: Props) {
  const [dragChoice, setDragChoice] = useState<CdfChoice | null>(null);
  const dragKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (dragChoice === null) return;
    const end = () => {
      setDragChoice(null);
      dragKeysRef.current.clear();
    };
    window.addEventListener("mouseup", end);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("dragend", end);
    };
  }, [dragChoice]);

  // Tail fits — computed once per selectedLDFs change
  const tailFits = useMemo(() => ({
    inversePower: fitInversePower(selectedLDFs),
    exponential: fitExponential(selectedLDFs),
    weibull: fitWeibull(selectedLDFs),
  }), [selectedLDFs]);

  const rows = useMemo(() => {
    if (!triangle) return [];
    return triangle.development_periods.map((dev, i) => {
      const key = String(dev);
      return {
        index: i + 1,
        devPeriod: dev,
        key,
        initialSelection: i < initialCDFs.length ? initialCDFs[i] : 1,
        userValue: cdfInitial[key] ?? 1,
        choice: (cdfChoicePerPeriod[key] ?? "initial") as CdfChoice,
        invPowerCDF: tailFits.inversePower.ok ? tailFits.inversePower.cdfs[i] : null,
        expCDF: tailFits.exponential.ok ? tailFits.exponential.cdfs[i] : null,
        weibullCDF: tailFits.weibull.ok ? tailFits.weibull.cdfs[i] : null,
      };
    });
  }, [triangle, initialCDFs, cdfInitial, cdfChoicePerPeriod, tailFits]);

  if (!triangle) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Önce Veri sekmesinden bir üçgen yükleyin.
      </div>
    );
  }

  const overrideCount = rows.filter(r => r.choice === "user").length;

  function handleDown(key: string, choice: CdfChoice) {
    setDragChoice(choice);
    dragKeysRef.current = new Set([key]);
    onSetChoice(key, choice);
  }

  function handleEnter(key: string) {
    if (dragChoice === null) return;
    if (dragKeysRef.current.has(key)) return;
    dragKeysRef.current.add(key);
    onSetChoice(key, dragChoice);
  }

  // Param badges
  const ipParams = tailFits.inversePower.params;
  const exParams = tailFits.exponential.params;
  const wbParams = tailFits.weibull.params;

  return (
    <div className="space-y-3">
      <div className="card p-2.5 flex items-center gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-medium">CDF Curve</span>
          <span className="text-[10px] text-[color:var(--muted)]">
            tıkla · sürükle toplu seç · çift tıkla User Value gir
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] text-[color:var(--muted-strong)] tabular">
            {overrideCount}/{rows.length} override
          </span>
          {overrideCount > 0 && (
            <button
              onClick={() => {
                if (confirm("Tüm seçimler ve override'lar temizlensin mi?"))
                  onResetInitial();
              }}
              className="btn text-[11px] py-1 px-2"
            >
              Sıfırla
            </button>
          )}
        </div>
      </div>

      {/* Fit param summary */}
      {(tailFits.inversePower.ok || tailFits.exponential.ok || tailFits.weibull.ok) && (
        <div className="flex gap-2 flex-wrap text-[10px] text-[color:var(--muted-strong)]">
          {tailFits.inversePower.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Inv. Power: c={ipParams.c?.toFixed(4)}, β={ipParams.beta?.toFixed(3)}
            </span>
          )}
          {tailFits.exponential.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Exp.: c={exParams.c?.toFixed(4)}, β={exParams.beta?.toFixed(3)}
            </span>
          )}
          {tailFits.weibull.ok && (
            <span className="px-2 py-0.5 rounded bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
              Weibull: c={wbParams.c?.toFixed(4)}, β={wbParams.beta?.toFixed(3)}, γ={wbParams.gamma?.toFixed(1)}
            </span>
          )}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-[12px] tabular w-full">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[10px] uppercase tracking-wide bg-[color:var(--surface-alt)]">
                <th className="text-left px-2 py-1.5 font-semibold w-[90px]">Dev.</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[130px]">Initial</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[110px] text-[color:var(--muted)]">Inv. Power</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[110px] text-[color:var(--muted)]">Exponential</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[110px] text-[color:var(--muted)]">Weibull</th>
                <th className="text-right px-2 py-1.5 font-semibold w-[130px]">User Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-t hover:bg-[color:var(--surface-alt)]/30">
                  <td className="px-2 py-0.5 font-medium leading-tight tabular">{r.index}</td>
                  <td className="p-0">
                    <CdfCell
                      value={r.initialSelection}
                      selected={r.choice === "initial"}
                      onMouseDown={() => handleDown(r.key, "initial")}
                      onMouseEnter={() => handleEnter(r.key)}
                    />
                  </td>
                  <td className="text-right px-2 py-0.5 text-[color:var(--muted)] text-[11px]">
                    {r.invPowerCDF != null ? formatFactor(r.invPowerCDF) : "—"}
                  </td>
                  <td className="text-right px-2 py-0.5 text-[color:var(--muted)] text-[11px]">
                    {r.expCDF != null ? formatFactor(r.expCDF) : "—"}
                  </td>
                  <td className="text-right px-2 py-0.5 text-[color:var(--muted)] text-[11px]">
                    {r.weibullCDF != null ? formatFactor(r.weibullCDF) : "—"}
                  </td>
                  <td className="p-0">
                    <EditableUserCell
                      value={r.userValue}
                      selected={r.choice === "user"}
                      hasValue={cdfInitial[r.key] !== undefined}
                      onMouseDown={() => handleDown(r.key, "user")}
                      onMouseEnter={() => handleEnter(r.key)}
                      onCommit={v => {
                        onSetInitial(r.key, v);
                        onSetChoice(r.key, "user");
                      }}
                    />
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

function CdfCell({
  value, selected, onMouseDown, onMouseEnter,
}: {
  value: number; selected: boolean; onMouseDown: () => void; onMouseEnter: () => void;
}) {
  return (
    <div
      onMouseDown={e => { e.preventDefault(); onMouseDown(); }}
      onMouseEnter={onMouseEnter}
      title={selected ? "Seçili" : "Tıkla / sürükle"}
      className={
        "w-full h-full text-right px-2 py-0.5 text-[12px] tabular transition cursor-pointer select-none leading-tight " +
        (selected
          ? "bg-[color:var(--success-soft)] text-[color:var(--success)] font-semibold"
          : "text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)]")
      }
    >
      {formatFactor(value)}
    </div>
  );
}

function EditableUserCell({
  value, selected, hasValue, onMouseDown, onMouseEnter, onCommit,
}: {
  value: number; selected: boolean; hasValue: boolean;
  onMouseDown: () => void; onMouseEnter: () => void; onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        step="0.0001"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n)) onCommit(n);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        className="w-full text-right text-[12px] tabular bg-[color:var(--primary-soft)] border-0 outline-none px-2 py-0.5"
      />
    );
  }

  return (
    <div
      onMouseDown={e => { e.preventDefault(); onMouseDown(); }}
      onMouseEnter={onMouseEnter}
      onDoubleClick={() => setEditing(true)}
      title={selected ? "Seçili · çift tıkla düzenle" : "Tıkla seç · çift tıkla düzenle"}
      className={
        "w-full h-full text-right px-2 py-0.5 text-[12px] tabular transition cursor-pointer select-none leading-tight " +
        (selected
          ? "bg-[color:var(--success-soft)] text-[color:var(--success)] font-semibold"
          : hasValue
          ? "text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]"
          : "text-[color:var(--muted)] hover:bg-[color:var(--surface-alt)]")
      }
    >
      {formatFactor(value)}
    </div>
  );
}
