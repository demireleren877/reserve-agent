"use client";

import { useState } from "react";
import type { Triangle } from "@/types/triangle";
import { formatNumber } from "@/lib/api";

interface Props {
  triangle: Triangle | null;
  premiums: Record<string, number>;
  correctionPerOrigin: Record<string, number>;
  selectedLDFs: number[];
}

type Mode = "ilr" | "data";

export function ILRTab({ triangle, premiums, correctionPerOrigin, selectedLDFs }: Props) {
  const [mode, setMode] = useState<Mode>("ilr");

  if (!triangle) {
    return (
      <div className="card p-16 text-center text-sm text-[color:var(--muted)]">
        Load data first.
      </div>
    );
  }

  const hasPremiums = triangle.origin_periods.some(o => (premiums[o] ?? 0) > 0);

  if (!hasPremiums && mode === "ilr") {
    return (
      <div className="card p-0 overflow-hidden">
        <Header mode={mode} setMode={setMode} triangle={triangle} />
        <div className="p-8 text-center text-sm text-[color:var(--muted)]">
          For ILR, premiums must be entered for accident years in the BF tab.
        </div>
      </div>
    );
  }

  const devs = triangle.development_periods;

  // Project full triangle: observed values are kept, missing cells are filled with cumulative LDF projection
  // For each row, find latest non-null index, then for j > latest: proj[j] = proj[j-1] * ldf[j-1]
  const projected: (number | null)[][] = triangle.values.map(row => {
    const out: (number | null)[] = row.slice();
    let lastIdx = -1;
    let lastVal: number | null = null;
    for (let j = 0; j < out.length; j++) {
      if (out[j] != null) { lastIdx = j; lastVal = out[j]; }
    }
    if (lastVal == null) return out;
    let v = lastVal;
    for (let j = lastIdx + 1; j < out.length; j++) {
      const ldf = j - 1 < selectedLDFs.length ? selectedLDFs[j - 1] : 1;
      v = v * ldf;
      out[j] = v;
    }
    return out;
  });

  return (
    <div className="card p-0 overflow-hidden">
      <Header mode={mode} setMode={setMode} triangle={triangle} />

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular border-collapse">
          <thead>
            <tr className="bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)] text-[10px] uppercase tracking-wide border-b border-[color:var(--border)]">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-[color:var(--surface-alt)] z-10">
                Kaza
              </th>
              {mode === "ilr" && (
                <th className="text-right px-3 py-2 font-semibold min-w-[100px] border-r border-[color:var(--border)]">
                  Premium (adj.)
                </th>
              )}
              {devs.map((_, idx) => (
                <th key={idx} className="text-right px-2 py-2 font-semibold min-w-[80px]">
                  {idx + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {triangle.origin_periods.map((origin, i) => {
              const rawPrem = premiums[origin] ?? 0;
              const k = correctionPerOrigin[origin] > 0 ? correctionPerOrigin[origin] : 1;
              const adjPrem = rawPrem * k;

              return (
                <tr key={origin} className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]/40">
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-[color:var(--surface)] z-10">
                    {origin}
                  </td>
                  {mode === "ilr" && (
                    <td className="text-right px-3 py-1.5 border-r border-[color:var(--border)] text-[color:var(--muted)]">
                      {adjPrem > 0 ? formatNumber(adjPrem) : "—"}
                      {k !== 1 && rawPrem > 0 && (
                        <span className="ml-1 text-[9px] text-[color:var(--muted)]">×{k.toFixed(2)}</span>
                      )}
                    </td>
                  )}
                  {devs.map((_, j) => {
                    const observed = triangle.values[i][j];
                    const isObserved = observed != null;

                    if (mode === "ilr") {
                      const ilr = observed != null && adjPrem > 0 ? (observed / adjPrem) * 100 : null;
                      const textColor =
                        ilr == null
                          ? undefined
                          : ilr > 100
                          ? "var(--danger)"
                          : ilr > 80
                          ? "#f59e0b"
                          : undefined;
                      return (
                        <td key={j} className="text-right px-2 py-1.5"
                          style={{
                            color: observed == null ? "var(--muted)" : textColor,
                            fontWeight: ilr != null && ilr > 100 ? 600 : undefined,
                          }}>
                          {ilr != null ? `${ilr.toFixed(1)}%` : observed != null ? "—" : ""}
                        </td>
                      );
                    }

                    // Data mode: show observed value, or projected value if missing
                    const v = projected[i][j];
                    if (v == null) {
                      return <td key={j} className="text-right px-2 py-1.5 text-[color:var(--muted)]">—</td>;
                    }
                    return (
                      <td key={j}
                        className={
                          "text-right px-2 py-1.5 " +
                          (isObserved ? "" : "italic")
                        }
                        style={{
                          color: isObserved ? undefined : "var(--primary)",
                          background: isObserved ? undefined : "var(--primary-soft)",
                        }}
                        title={isObserved ? undefined : "LDF ile projeksiyon"}>
                        {formatNumber(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mode === "data" && (
        <div className="px-4 py-2.5 border-t border-[color:var(--border)] bg-[color:var(--surface-alt)] flex items-center gap-4 text-[11px] text-[color:var(--muted-strong)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[color:var(--border)]" style={{ background: "var(--surface)" }} />
            Observed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: "var(--primary-soft)", border: "1px solid var(--primary)" }} />
            <span style={{ color: "var(--primary)" }}>LDF projeksiyonu</span>
          </span>
        </div>
      )}
    </div>
  );
}

function Header({ mode, setMode, triangle }: { mode: Mode; setMode: (m: Mode) => void; triangle: Triangle }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)] gap-4">
      <h2 className="text-sm font-semibold shrink-0">
        {mode === "ilr" ? "Incurred Loss Ratio Triangle" : "Claims Triangle · Projected"}
      </h2>

      <div className="flex items-center gap-3 ml-auto">
        <span className="text-xs text-[color:var(--muted)] tabular hidden sm:inline">
          {mode === "ilr"
            ? `Claims / (Premium × Correction) · ${triangle.origin_periods.length}×${triangle.development_periods.length}`
            : `Observed + LDF · ${triangle.origin_periods.length}×${triangle.development_periods.length}`}
        </span>
        <div className="inline-flex rounded-md p-0.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <button
            onClick={() => setMode("ilr")}
            className={
              "text-[11px] font-medium px-2.5 py-1 rounded transition " +
              (mode === "ilr"
                ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                : "text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")
            }
          >
            ILR %
          </button>
          <button
            onClick={() => setMode("data")}
            className={
              "text-[11px] font-medium px-2.5 py-1 rounded transition " +
              (mode === "data"
                ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                : "text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")
            }
          >
            Hasar
          </button>
        </div>
      </div>
    </div>
  );
}
