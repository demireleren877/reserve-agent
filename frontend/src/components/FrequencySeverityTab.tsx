"use client";

/**
 * Frekans-Şiddet (Average Cost per Claim) sekmesi.
 * Adet üçgeni × ortalama hasar maliyeti gelişimi → ult hasar / IBNR.
 * Saf CL IBNR ile yan yana karşılaştırma (makullük kontrolü).
 */

import { useMemo } from "react";
import type { Triangle } from "@/types/triangle";
import type { Window } from "@/lib/ldf";
import { computeFrequencySeverity } from "@/lib/frequency-severity";
import { formatNumber } from "@/lib/api";

const TR2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TR4 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] mb-0.5">{label}</div>
      <div className="text-lg font-semibold tabular">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function FrequencySeverityTab({
  amountTriangle,
  countTriangle,
  window,
  clIbnr,
}: {
  amountTriangle: Triangle | null;
  countTriangle: Triangle | null | undefined;
  window: Window;
  clIbnr: number | null;
}) {
  const result = useMemo(() => {
    if (!amountTriangle || !countTriangle) return null;
    return computeFrequencySeverity(amountTriangle, countTriangle, { nYears: window });
  }, [amountTriangle, countTriangle, window]);

  if (!countTriangle) {
    return (
      <div className="max-w-xl mx-auto mt-10 rounded-xl px-5 py-4 text-[13px] leading-relaxed"
        style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--muted-strong)" }}>
        <div className="font-semibold mb-1 text-[color:var(--foreground)]">Frequency-Severity unavailable</div>
        This method requires the <strong>reported claim count</strong> for each accident year.
        The count triangle is derived automatically only from <strong>claim data containing a
        CLAIM_NO column</strong> (loaded via the Data module). This branch was created by loading a
        triangle directly, so count information is not available.
      </div>
    );
  }

  if (!result) return null;

  const fsIbnr = result.totals.ibnr;
  const diff = clIbnr != null ? fsIbnr - clIbnr : null;
  const diffPct = clIbnr != null && clIbnr !== 0 ? (diff! / clIbnr) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Ult Count" value={TR2.format(result.totals.ultimateCount)} sub="reported count projection" />
        <Stat label="Total Ult Claims" value={formatNumber(result.totals.ultimateLoss)} sub="count × average cost" />
        <Stat label="IBNR (Frequency-Severity)" value={formatNumber(fsIbnr)} sub="ult − latest" />
        <Stat
          label="Diff vs CL"
          value={diff != null ? formatNumber(diff) : "—"}
          sub={diffPct != null ? `vs CL IBNR ${TR2.format(diffPct)}%` : "No CL comparison"}
        />
      </div>

      {/* Gelişim faktörleri */}
      <div className="card p-4 overflow-x-auto">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-strong)] mb-2">
          Development Factors (volume weighted)
        </div>
        <table className="text-[12px] border-collapse">
          <tbody>
            <tr>
              <td className="pr-4 py-1 font-medium text-[color:var(--muted-strong)] whitespace-nowrap">Count LDF</td>
              {result.countLdfs.map((f, i) => (
                <td key={i} className="px-3 py-1 tabular-nums text-right">{TR4.format(f)}</td>
              ))}
            </tr>
            <tr>
              <td className="pr-4 py-1 font-medium text-[color:var(--muted-strong)] whitespace-nowrap">Severity LDF</td>
              {result.severityLdfs.map((f, i) => (
                <td key={i} className="px-3 py-1 tabular-nums text-right">{TR4.format(f)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-origin */}
      <div className="card p-0 overflow-x-auto">
        <table className="text-[12px] border-collapse w-full">
          <thead className="sticky top-0" style={{ background: "var(--surface)" }}>
            <tr>
              {["Accident Year", "Latest Count", "Ult Count", "Latest Severity", "Ult Severity", "Ult Claims", "IBNR"].map((h) => (
                <th key={h} className="px-4 py-2 text-right font-semibold whitespace-nowrap first:text-left"
                  style={{ borderBottom: "2px solid var(--border)", color: "var(--muted-strong)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.origin} className="hover:bg-[color:var(--surface-alt)]">
                <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)" }}>{r.origin}</td>
                <td className="px-4 py-1 tabular-nums text-right" style={{ borderBottom: "1px solid var(--border)" }}>{TR2.format(r.latestCount)}</td>
                <td className="px-4 py-1 tabular-nums text-right" style={{ borderBottom: "1px solid var(--border)" }}>{TR2.format(r.ultimateCount)}</td>
                <td className="px-4 py-1 tabular-nums text-right" style={{ borderBottom: "1px solid var(--border)" }}>{r.latestSeverity != null ? formatNumber(r.latestSeverity) : "—"}</td>
                <td className="px-4 py-1 tabular-nums text-right" style={{ borderBottom: "1px solid var(--border)" }}>{r.ultimateSeverity != null ? formatNumber(r.ultimateSeverity) : "—"}</td>
                <td className="px-4 py-1 tabular-nums text-right" style={{ borderBottom: "1px solid var(--border)" }}>{formatNumber(r.ultimateLoss)}</td>
                <td className="px-4 py-1 tabular-nums text-right font-medium" style={{ borderBottom: "1px solid var(--border)" }}>{formatNumber(r.ibnr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[color:var(--muted)] leading-relaxed px-1">
        {"Severity = cumulative amount / cumulative reported count (average claim cost based on the incurred triangle). " +
          "Count and severity are developed separately and multiplied — a different estimate than pure Chain-Ladder; the " +
          "gap shows the divergence of frequency/severity development, use it as a sanity check."}
      </p>
    </div>
  );
}
