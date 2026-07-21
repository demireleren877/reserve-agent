"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Triangle } from "@/types/triangle";
import { formatFactor, formatNumber } from "@/lib/api";
import { type Window } from "@/lib/ldf";
import { ExclusionDetailModal } from "@/components/ExclusionDetailModal";

interface PerOriginRow {
  origin: string;
  latest: number;
  premium: number;
  premiumAnnual: number;
  correction: number;
  cdf: number;
  clUltimate: number;
  bfUltimate: number;
  selectedUltimate: number;
  ibnr: number;
  ulr: number | null;
  basis: "cl" | "bf";
  selectedLR: number;
  selectedLRInput: string | null;
  pctDeveloped: number | null;
}

interface ExclusionImpact {
  origin: string;
  step: number;
  ldfValue: number | null;
  median: number | null;
  deviationPct: number | null;
  /** IBNR farkı: bu eleme uygulanmasaydı toplam IBNR ne kadar değişirdi.
   *  Pozitif → eleme IBNR'yi düşürmüş (riski tutucu indirmişiz).
   *  Negatif → eleme IBNR'yi yükseltmiş. */
  ibnrImpact: number;
}

interface Props {
  triangle: Triangle | null;
  branchName: string;
  frequency: "yearly" | "quarterly";
  periodLabel: string;
  window: Window;
  selectedLDFs: number[];
  effectiveCDFs: number[];
  initialCDFs: number[];
  excludedCells: Set<string>;
  rows: PerOriginRow[];
  totals: {
    latest: number;
    exposure: number;
    selectedUltimate: number;
    ibnr: number;
  };
  curveOverrides: { devPeriod: string; userValue: number }[];
  correctionEntries: { origin: string; value: number }[];
  manualLRCount: number;
  bfBasisCount: number;
  exclusionImpacts: ExclusionImpact[];
}

const DEFAULT_WINDOW: Window = "all";

export function SummaryTab(props: Props) {
  const {
    triangle,
    branchName,
    frequency,
    periodLabel,
    window,
    excludedCells,
    rows,
    totals,
    curveOverrides,
    correctionEntries,
    manualLRCount,
    bfBasisCount,
    exclusionImpacts,
  } = props;

  const [showExclusionModal, setShowExclusionModal] = useState(false);

  const totalRawPremium = rows.reduce((s, r) => s + r.premium, 0);
  const totalULR =
    totalRawPremium > 0 ? totals.selectedUltimate / totalRawPremium : null;

  const triangleLabel =
    triangle?.triangle_type === "incurred" ? "Incurred" : "Paid";

  // Origin başına elemelerin net IBNR etkisi (satırdaki tüm adımların toplamı)
  const exclusionByOrigin = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exclusionImpacts) {
      m.set(e.origin, (m.get(e.origin) ?? 0) + e.ibnrImpact);
    }
    return m;
  }, [exclusionImpacts]);

  const interventions = useMemo(() => {
    const items: { label: string; value: string; tone?: "muted" | "accent" }[] = [];
    if (String(window) !== String(DEFAULT_WINDOW)) {
      items.push({ label: "Volume", value: `Son ${window}` });
    }
    if (excludedCells.size > 0) {
      items.push({
        label: "Hücre eleme",
        value: `${excludedCells.size} hücre`,
        tone: "accent",
      });
    }
    if (curveOverrides.length > 0) {
      items.push({
        label: "Curve override",
        value: `${curveOverrides.length} period`,
        tone: "accent",
      });
    }
    if (correctionEntries.length > 0) {
      items.push({
        label: "BF correction",
        value: `${correctionEntries.length} origin`,
        tone: "accent",
      });
    }
    if (manualLRCount > 0) {
      items.push({ label: "Manuel LR", value: `${manualLRCount} origin` });
    }
    if (bfBasisCount > 0) {
      items.push({ label: "BF temeli", value: `${bfBasisCount} origin` });
    }
    return items;
  }, [
    window,
    excludedCells.size,
    curveOverrides.length,
    correctionEntries.length,
    manualLRCount,
    bfBasisCount,
  ]);

  if (!triangle) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Önce Veri sekmesinden bir üçgen yükleyin.
      </div>
    );
  }

  const originRange =
    triangle.origin_periods.length > 0
      ? `${triangle.origin_periods[0]} – ${triangle.origin_periods[triangle.origin_periods.length - 1]}`
      : "—";

  const ibnrSavedByExclusions = exclusionImpacts.reduce(
    (s, e) => s + e.ibnrImpact,
    0,
  );
  const hasExclusionCol = exclusionImpacts.length > 0;

  // Kompozisyon: Latest (gelişmiş) + IBNR (rezerv) = Ultimate
  const ult = totals.selectedUltimate;
  const devFrac = ult > 0 ? totals.latest / ult : 0;
  const ibnrFrac = ult > 0 ? totals.ibnr / ult : 0;
  const devPct = devFrac * 100;
  const ibnrPct = ibnrFrac * 100;

  return (
    <div className="space-y-6">
      {/* ── Başlık ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{branchName}</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            {periodLabel} · {frequency === "yearly" ? "Yıllık" : "Çeyreklik"} ·{" "}
            {triangleLabel} · {originRange} · {triangle.origin_periods.length}×
            {triangle.development_periods.length}
          </p>
        </div>
        {interventions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {interventions.map((it, i) => (
              <span
                key={i}
                className={
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tabular " +
                  (it.tone === "accent"
                    ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                    : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                }
              >
                <span className="opacity-60 font-normal">{it.label}</span>
                {it.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Hero: IBNR + kompozisyon + ikincil metrikler ── */}
      <div className="card p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-10">
          {/* Sol: hero IBNR + kompozisyon çubuğu */}
          <div className="min-w-0">
            <div className="label mb-1.5">Seçili IBNR</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[2.75rem] leading-none font-semibold tabular text-[color:var(--primary)] tracking-tight">
                {formatNumber(totals.ibnr)}
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Ultimate&apos;ın{" "}
                <span className="font-semibold text-[color:var(--muted-strong)]">
                  %{ibnrPct.toFixed(1)}
                </span>
                &apos;i
              </span>
            </div>

            {/* Kompozisyon çubuğu: gelişmiş vs rezerv */}
            <div className="mt-6">
              <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[color:var(--surface-alt)]">
                <div
                  className="h-full"
                  style={{
                    width: `${devPct}%`,
                    background: "var(--border-strong)",
                  }}
                  title={`${triangleLabel}: ${formatNumber(totals.latest)}`}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${ibnrPct}%`,
                    background: "var(--primary)",
                  }}
                  title={`IBNR: ${formatNumber(totals.ibnr)}`}
                />
              </div>
              <div className="flex justify-between mt-2.5 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-[color:var(--muted-strong)]">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--border-strong)" }}
                  />
                  {triangleLabel} · {formatNumber(totals.latest)}{" "}
                  <span className="text-[color:var(--muted)]">
                    (%{devPct.toFixed(1)} gelişmiş)
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[color:var(--primary)] font-medium">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--primary)" }}
                  />
                  IBNR
                </span>
              </div>
            </div>
          </div>

          {/* Sağ: ikincil metrikler */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:border-l lg:pl-10 content-center">
            <Metric label="Seçili Ultimate" value={formatNumber(ult)} />
            <Metric
              label={`Toplam ${triangleLabel}`}
              value={formatNumber(totals.latest)}
            />
            <Metric
              label="Exposure (yıllık)"
              value={formatNumber(totals.exposure)}
            />
            <Metric
              label="Selected ULR"
              value={totalULR != null ? `${(totalULR * 100).toFixed(1)}%` : "—"}
            />
          </div>
        </div>
      </div>

      {/* ── Origin Bazında Final ── */}
      <section>
        <SectionHeader
          title="Origin Bazında Final"
          hint="Seçili temel (CL/BF) başına ultimate & IBNR"
          action={
            hasExclusionCol ? (
              <button
                onClick={() => setShowExclusionModal(true)}
                className="btn text-[11px] py-1 px-2.5"
              >
                Eleme detayı · {exclusionImpacts.length}
              </button>
            ) : undefined
          }
        />
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular">
              <thead>
                <tr className="text-[color:var(--muted)] text-[10.5px] uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-2.5">Kaza</th>
                  <th className="text-right font-medium px-3 py-2.5">Latest</th>
                  <th className="text-right font-medium px-3 py-2.5">Exposure</th>
                  <th className="text-right font-medium px-3 py-2.5">k</th>
                  <th className="text-right font-medium px-3 py-2.5">CDF</th>
                  <th className="text-right font-medium px-3 py-2.5">% Dev</th>
                  <th className="text-center font-medium px-3 py-2.5">Temel</th>
                  <th className="text-right font-medium px-3 py-2.5">Sel. LR</th>
                  <th className="text-right font-medium px-3 py-2.5">Seçili Ult</th>
                  <th className="text-right font-medium px-4 py-2.5">IBNR</th>
                  {hasExclusionCol && (
                    <th
                      className="text-right font-medium px-3 py-2.5"
                      title="Bu origin'deki elemelerin net IBNR etkisi"
                    >
                      Eleme
                    </th>
                  )}
                  <th className="text-right font-medium px-4 py-2.5">ULR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const exc = exclusionByOrigin.get(r.origin);
                  return (
                    <tr
                      key={r.origin}
                      className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]/50 transition-colors"
                    >
                      <td className="px-4 py-2 font-medium">{r.origin}</td>
                      <td className="text-right px-3 py-2">
                        {formatNumber(r.latest)}
                      </td>
                      <td className="text-right px-3 py-2 text-[color:var(--muted-strong)]">
                        {r.premium > 0 ? formatNumber(r.premium) : "—"}
                      </td>
                      <td
                        className={
                          "text-right px-3 py-2 " +
                          (r.correction !== 1
                            ? "text-[color:var(--primary)] font-medium"
                            : "text-[color:var(--muted)]")
                        }
                      >
                        {r.correction !== 1 ? `×${r.correction}` : "—"}
                      </td>
                      <td className="text-right px-3 py-2 text-[color:var(--muted-strong)]">
                        {formatFactor(r.cdf)}
                      </td>
                      <td className="px-3 py-2">
                        {r.pctDeveloped != null ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-11 h-1.5 rounded-full bg-[color:var(--surface-alt)] overflow-hidden hidden sm:block">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, r.pctDeveloped * 100)}%`,
                                  background: "var(--border-strong)",
                                }}
                              />
                            </div>
                            <span className="text-[color:var(--muted-strong)] tabular w-11 text-right">
                              {(r.pctDeveloped * 100).toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <div className="text-right text-[color:var(--muted)]">
                            —
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide " +
                            (r.basis === "bf"
                              ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                              : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                          }
                        >
                          {r.basis}
                        </span>
                      </td>
                      <td
                        className="text-right px-3 py-2 text-[color:var(--muted-strong)]"
                        title={r.selectedLRInput ?? undefined}
                      >
                        {`${(r.selectedLR * 100).toFixed(1)}%`}
                        {r.selectedLRInput && (
                          <span className="ml-1 text-[9px] font-semibold text-[color:var(--primary)]">
                            ƒ
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2 font-medium">
                        {formatNumber(r.selectedUltimate)}
                      </td>
                      <td className="text-right px-4 py-2 font-semibold text-[color:var(--primary)]">
                        {formatNumber(r.ibnr)}
                      </td>
                      {hasExclusionCol && (
                        <td className="text-right px-3 py-2">
                          {exc == null || exc === 0 ? (
                            <span className="text-[color:var(--muted)]">—</span>
                          ) : (
                            <span
                              className={
                                "tabular font-medium " +
                                (exc > 0
                                  ? "text-[color:var(--success)]"
                                  : "text-[color:var(--danger)]")
                              }
                            >
                              {exc > 0 ? "+" : ""}
                              {formatNumber(exc)}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="text-right px-4 py-2 text-[color:var(--muted-strong)]">
                        {r.ulr != null ? `${(r.ulr * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[color:var(--border-strong)] font-semibold bg-[color:var(--surface-alt)]/60">
                  <td className="px-4 py-2.5">Toplam</td>
                  <td className="text-right px-3 py-2.5">
                    {formatNumber(totals.latest)}
                  </td>
                  <td className="text-right px-3 py-2.5">
                    {formatNumber(totals.exposure)}
                  </td>
                  <td colSpan={5} />
                  <td className="text-right px-3 py-2.5">{formatNumber(ult)}</td>
                  <td className="text-right px-4 py-2.5 text-[color:var(--primary)]">
                    {formatNumber(totals.ibnr)}
                  </td>
                  {hasExclusionCol && (
                    <td
                      className={
                        "text-right px-3 py-2.5 " +
                        (ibnrSavedByExclusions > 0
                          ? "text-[color:var(--success)]"
                          : ibnrSavedByExclusions < 0
                          ? "text-[color:var(--danger)]"
                          : "")
                      }
                    >
                      {ibnrSavedByExclusions > 0 ? "+" : ""}
                      {formatNumber(ibnrSavedByExclusions)}
                    </td>
                  )}
                  <td className="text-right px-4 py-2.5">
                    {totalULR != null ? `${(totalULR * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        {hasExclusionCol && (
          <p className="text-[11px] text-[color:var(--muted)] mt-2 px-0.5">
            <span className="font-medium">Eleme</span> sütunu: o origin&apos;deki
            elemelerin net IBNR etkisi (pozitif + düşürmüş, negatif − yükseltmiş).
            Adım bazlı döküm için{" "}
            <button
              onClick={() => setShowExclusionModal(true)}
              className="text-[color:var(--primary)] font-medium hover:underline"
            >
              Eleme detayı
            </button>
            .
          </p>
        )}
      </section>

      {showExclusionModal && (
        <ExclusionDetailModal
          impacts={exclusionImpacts}
          excludedCount={excludedCells.size}
          onClose={() => setShowExclusionModal(false)}
        />
      )}
    </div>
  );
}

function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2.5 px-0.5">
      <h3 className="text-sm font-semibold tracking-tight shrink-0">{title}</h3>
      <div className="flex items-baseline gap-3 min-w-0">
        {hint && (
          <span className="text-[11px] text-[color:var(--muted)] truncate hidden sm:inline">
            {hint}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
        {label}
      </div>
      <div className="text-lg font-semibold tabular mt-0.5 tracking-tight truncate">
        {value}
      </div>
    </div>
  );
}
