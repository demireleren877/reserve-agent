"use client";

import { useEffect } from "react";
import { formatFactor, formatNumber } from "@/lib/api";

interface ExclusionImpact {
  origin: string;
  step: number;
  ldfValue: number | null;
  median: number | null;
  deviationPct: number | null;
  ibnrImpact: number;
}

interface Props {
  impacts: ExclusionImpact[];
  excludedCount: number;
  onClose: () => void;
}

export function ExclusionDetailModal({ impacts, excludedCount, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const net = impacts.reduce((s, e) => s + e.ibnrImpact, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          width: "min(760px, 96vw)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between shrink-0"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-alt)",
          }}
        >
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Exclusion Impact Detail
              {excludedCount > 0 && (
                <span className="text-[color:var(--muted)] font-normal">
                  {" "}
                  · {excludedCount} cells
                </span>
              )}
            </h3>
            <p className="text-[11px] text-[color:var(--muted)] mt-0.5">
              For each step, how much total IBNR would change if that exclusion were not applied.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md text-[18px] flex items-center justify-center hover:bg-[color:var(--surface)] transition shrink-0"
            style={{ color: "var(--muted)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Net özet */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            Elemelerin net IBNR etkisi
          </span>
          <span
            className={
              "text-lg font-semibold tabular " +
              (net > 0
                ? "text-[color:var(--success)]"
                : net < 0
                ? "text-[color:var(--danger)]"
                : "")
            }
          >
            {net > 0 ? "+" : ""}
            {formatNumber(net)}
          </span>
        </div>

        {/* Tablo */}
        <div className="overflow-auto">
          {impacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-[color:var(--muted)]">
              No cells excluded.
            </div>
          ) : (
            <table className="text-[12.5px] w-full tabular">
              <thead className="sticky top-0 bg-[color:var(--surface)]">
                <tr className="text-[color:var(--muted)] text-[10px] uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-2.5">Accident</th>
                  <th className="text-left font-medium px-3 py-2.5">Step</th>
                  <th className="text-right font-medium px-3 py-2.5">LDF</th>
                  <th className="text-right font-medium px-3 py-2.5">
                    Column median
                  </th>
                  <th className="text-right font-medium px-3 py-2.5">Sapma</th>
                  <th className="text-right font-medium px-5 py-2.5">
                    IBNR&apos;a etkisi
                  </th>
                </tr>
              </thead>
              <tbody>
                {impacts.map((e) => (
                  <tr
                    key={`${e.origin}|${e.step}`}
                    className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]/50"
                  >
                    <td className="px-5 py-2 font-medium">{e.origin}</td>
                    <td className="px-3 py-2 text-[color:var(--muted)]">
                      {e.step + 1}→{e.step + 2}
                    </td>
                    <td className="text-right px-3 py-2">
                      {e.ldfValue != null ? formatFactor(e.ldfValue) : "—"}
                    </td>
                    <td className="text-right px-3 py-2 text-[color:var(--muted-strong)]">
                      {e.median != null ? formatFactor(e.median) : "—"}
                    </td>
                    <td
                      className={
                        "text-right px-3 py-2 font-medium " +
                        (e.deviationPct == null
                          ? ""
                          : e.deviationPct > 0
                          ? "text-[color:var(--danger)]"
                          : "text-[color:var(--primary)]")
                      }
                    >
                      {e.deviationPct == null
                        ? "—"
                        : `${e.deviationPct > 0 ? "+" : ""}${e.deviationPct.toFixed(1)}%`}
                    </td>
                    <td
                      className={
                        "text-right px-5 py-2 font-semibold " +
                        (e.ibnrImpact > 0
                          ? "text-[color:var(--success)]"
                          : e.ibnrImpact < 0
                          ? "text-[color:var(--danger)]"
                          : "text-[color:var(--muted)]")
                      }
                    >
                      {e.ibnrImpact > 0 ? "+" : ""}
                      {formatNumber(e.ibnrImpact)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer açıklama */}
        <div
          className="px-5 py-2.5 shrink-0 text-[11px] text-[color:var(--muted)]"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          Positive (+) = exclusion lowered the reserve · Negative (−) = raised it.
        </div>
      </div>
    </div>
  );
}
