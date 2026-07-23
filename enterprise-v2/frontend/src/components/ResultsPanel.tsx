"use client";

import { useEffect, useState } from "react";
import type { ComputeResponse, LDFMethod } from "@/types/triangle";
import { formatFactor, formatNumber } from "@/lib/api";

interface Props {
  result: ComputeResponse;
  developmentPeriods: number[];
  method: LDFMethod;
  excludedOrigins: string[];
  nYears: number | null;
  ldfOverride: number[] | null;
  onMethodChange: (m: LDFMethod) => void;
  onToggleExclusion: (origin: string) => void;
  onNYearsChange: (n: number | null) => void;
  onLDFOverride: (override: number[] | null) => void;
}

export function ResultsPanel(props: Props) {
  const {
    result,
    developmentPeriods,
    method,
    excludedOrigins,
    nYears,
    ldfOverride,
    onMethodChange,
    onToggleExclusion,
    onNYearsChange,
    onLDFOverride,
  } = props;

  const [editingLDF, setEditingLDF] = useState<number[]>(result.ldfs);

  useEffect(() => {
    if (!ldfOverride) setEditingLDF(result.ldfs);
  }, [result.ldfs, ldfOverride]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Metod">
          <select
            value={method}
            onChange={(e) => onMethodChange(e.target.value as LDFMethod)}
            className="input"
          >
            <option value="volume_weighted">Volume Weighted</option>
            <option value="simple_average">Basit Ortalama</option>
            <option value="geometric_average">Geometrik Ortalama</option>
          </select>
        </Field>
        <Field label="Last N periods">
          <input
            type="number"
            min={1}
            value={nYears ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onNYearsChange(v === "" ? null : Number.parseInt(v, 10));
            }}
            className="input"
            placeholder="All"
          />
        </Field>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            Excluded
          </h3>
          {excludedOrigins.length > 0 && (
            <button
              onClick={() => excludedOrigins.forEach(onToggleExclusion)}
              className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              temizle
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {result.origin_periods.map((origin) => {
            const excluded = excludedOrigins.includes(origin);
            return (
              <button
                key={origin}
                onClick={() => onToggleExclusion(origin)}
                className={
                  excluded
                    ? "px-2 py-0.5 text-xs rounded border border-[color:var(--border)] bg-transparent text-[color:var(--muted)] line-through"
                    : "px-2 py-0.5 text-xs rounded border border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--foreground)]"
                }
              >
                {origin}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            LDF'ler
          </h3>
          {ldfOverride && (
            <button
              onClick={() => onLDFOverride(null)}
              className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              reset
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {result.ldfs.map((ldf, i) => {
            const from = developmentPeriods[i];
            const to = developmentPeriods[i + 1];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[11px] text-[color:var(--muted)] w-12 tabular-nums">
                  {from}→{to}
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={editingLDF[i] ?? ldf}
                  onChange={(e) => {
                    const next = [...editingLDF];
                    next[i] = Number.parseFloat(e.target.value);
                    setEditingLDF(next);
                  }}
                  className="input flex-1 tabular-nums"
                />
              </div>
            );
          })}
        </div>
        <button
          onClick={() => onLDFOverride(editingLDF)}
          className="mt-2 w-full text-xs rounded-md border py-1.5 hover:border-[color:var(--foreground)]"
        >
          Manuel LDF'leri uygula
        </button>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)] mb-2">
          Results
        </h3>
        <div className="overflow-x-auto -mx-1">
          <table className="text-sm w-full tabular-nums">
            <thead>
              <tr className="text-[color:var(--muted)] text-[11px] uppercase tracking-wide">
                <th className="text-left px-1 py-1 font-medium">Accident</th>
                <th className="text-right px-1 py-1 font-medium">Current</th>
                <th className="text-right px-1 py-1 font-medium">CDF</th>
                <th className="text-right px-1 py-1 font-medium">Ult.</th>
                <th className="text-right px-1 py-1 font-medium">Reserve</th>
              </tr>
            </thead>
            <tbody>
              {result.origin_periods.map((o, i) => (
                <tr key={o} className="border-t border-[color:var(--border)]">
                  <td className="px-1 py-1.5 font-medium">{o}</td>
                  <td className="text-right px-1 py-1.5">
                    {formatNumber(result.latest_per_origin[i])}
                  </td>
                  <td className="text-right px-1 py-1.5 text-[color:var(--muted)]">
                    {formatFactor(result.cdfs[i])}
                  </td>
                  <td className="text-right px-1 py-1.5">
                    {formatNumber(result.ultimate_per_origin[i])}
                  </td>
                  <td className="text-right px-1 py-1.5 font-semibold">
                    {formatNumber(result.reserve_per_origin[i])}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[color:var(--foreground)] font-semibold">
                <td className="px-1 py-1.5">Total</td>
                <td className="text-right px-1 py-1.5">
                  {formatNumber(result.total_latest)}
                </td>
                <td />
                <td className="text-right px-1 py-1.5">
                  {formatNumber(result.total_ultimate)}
                </td>
                <td className="text-right px-1 py-1.5">
                  {formatNumber(result.total_reserve)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--foreground);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--foreground);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
