"use client";

import { useState, useMemo } from "react";
import type { Triangle } from "@/types/triangle";
import { TriangleGrid } from "@/components/TriangleGrid";
import { formatNumber } from "@/lib/api";
import { LoadFromDataStore } from "@/components/LoadFromDataStore";

type TriTab = "paid_cum" | "paid_inc" | "muallak" | "incurred";

const TRI_TABS: { id: TriTab; label: string }[] = [
  { id: "paid_cum", label: "Kümülatif Ödeme" },
  { id: "paid_inc", label: "Artımsal Ödeme" },
  { id: "muallak", label: "Muallak" },
  { id: "incurred", label: "Gerçekleşen" },
];

interface Props {
  paidTriangle: Triangle | null;
  incurredTriangle: Triangle | null;
}

function toIncremental(tri: Triangle): Triangle {
  const values = tri.values.map(row =>
    row.map((v, j) => {
      if (v == null) return null;
      if (j === 0) return v;
      const prev = row[j - 1];
      return prev != null ? v - prev : null;
    })
  );
  return { ...tri, values };
}

function toMuallak(paid: Triangle, incurred: Triangle): Triangle | null {
  if (
    paid.origin_periods.length !== incurred.origin_periods.length ||
    paid.development_periods.length !== incurred.development_periods.length
  ) return null;
  const values = incurred.values.map((row, i) =>
    row.map((inc, j) => {
      const p = paid.values[i]?.[j];
      return inc != null && p != null ? inc - p : null;
    })
  );
  return { ...incurred, values };
}

export function DataTab({ paidTriangle, incurredTriangle }: Props) {
  const [tab, setTab] = useState<TriTab>("paid_cum");
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  const incrementalPaid = useMemo(
    () => (paidTriangle ? toIncremental(paidTriangle) : null),
    [paidTriangle],
  );

  const muallakTriangle = useMemo(
    () => (paidTriangle && incurredTriangle ? toMuallak(paidTriangle, incurredTriangle) : null),
    [paidTriangle, incurredTriangle],
  );

  const anyLoaded = paidTriangle || incurredTriangle;

  if (!anyLoaded) {
    return (
      <>
        <div className="card p-12 text-center">
          <div className="text-sm text-[color:var(--muted)] max-w-sm mx-auto space-y-4">
            <p>Üçgen verisi henüz yüklenmedi.</p>
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={() => setShowLoadDialog(true)}
                className="px-5 py-2.5 text-sm font-medium rounded-md bg-[color:var(--primary)] text-white hover:opacity-90 transition"
              >
                Veri Modülünden Yükle
              </button>
              <span className="text-xs text-[color:var(--muted)]">
                veya üst bardaki <strong>↑ Excel yükle</strong> butonunu kullanın
              </span>
            </div>
          </div>
        </div>
        {showLoadDialog && (
          <LoadFromDataStore
            onClose={() => setShowLoadDialog(false)}
            onLoaded={() => setShowLoadDialog(false)}
          />
        )}
      </>
    );
  }

  const primaryTri = paidTriangle ?? incurredTriangle!;

  const tabContent: Record<TriTab, { tri: Triangle | null; missing: string }> = {
    paid_cum: { tri: paidTriangle, missing: "Ödeme üçgeni yüklenmedi. Paid tipi Excel yükleyin." },
    paid_inc: { tri: incrementalPaid, missing: "Ödeme üçgeni yüklenmedi." },
    muallak: { tri: muallakTriangle, missing: "Muallak için hem Paid hem Incurred üçgeni yüklenmeli." },
    incurred: { tri: incurredTriangle, missing: "Gerçekleşen üçgeni yüklenmedi. Incurred tipi Excel yükleyin." },
  };

  const current = tabContent[tab];

  const triLabels: Record<TriTab, string> = {
    paid_cum: "Kümülatif Ödeme",
    paid_inc: "Artımsal Ödeme",
    muallak: "Muallak (Incurred − Paid)",
    incurred: "Gerçekleşen (Incurred)",
  };

  return (
    <div className="space-y-4">
      <SummaryStrip triangle={primaryTri} hasPaid={!!paidTriangle} hasIncurred={!!incurredTriangle} />

      <div className="card p-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <div className="flex gap-1">
            {TRI_TABS.map(t => {
              const available = tabContent[t.id].tri != null;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    "px-3 py-1 rounded text-xs font-medium transition " +
                    (tab === t.id
                      ? "bg-[color:var(--primary)] text-white"
                      : available
                      ? "bg-[color:var(--surface)] text-[color:var(--muted-strong)] hover:bg-[color:var(--border)]"
                      : "bg-[color:var(--surface)] text-[color:var(--muted)] opacity-50 cursor-not-allowed")
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-[color:var(--muted)] tabular">
            {current.tri
              ? `${current.tri.origin_periods.length}×${current.tri.development_periods.length}`
              : "—"}
          </span>
        </div>

        {/* Content */}
        {current.tri ? (
          <div className="p-2">
            <div className="text-[10px] text-[color:var(--muted-strong)] px-1 pb-1 font-semibold uppercase tracking-wide">
              {triLabels[tab]}
            </div>
            <TriangleGrid triangle={current.tri} />
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-[color:var(--muted)]">
            {current.missing}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStrip({
  triangle,
  hasPaid,
  hasIncurred,
}: {
  triangle: Triangle;
  hasPaid: boolean;
  hasIncurred: boolean;
}) {
  const latestSum = triangle.values.reduce((s, row) => {
    let latest = 0;
    for (const v of row) if (v != null) latest = v;
    return s + latest;
  }, 0);
  const lastOrigin = triangle.origin_periods[triangle.origin_periods.length - 1];
  const oldestOrigin = triangle.origin_periods[0];
  const loaded = [hasPaid && "Paid", hasIncurred && "Incurred"].filter(Boolean).join(" + ");
  return (
    <div className="grid grid-cols-4 gap-3">
      <Stat label="Üçgen" value={`${triangle.origin_periods.length}×${triangle.development_periods.length}`} sub={loaded} />
      <Stat label="Origin Aralığı" value={`${oldestOrigin} — ${lastOrigin}`} sub={`kaza ${triangle.origin_granularity === "quarterly" ? "çeyreklik" : "yıllık"}`} />
      <Stat label="Gelişim" value={triangle.development_granularity === "quarterly" ? "Çeyreklik" : "Yıllık"} sub={`${triangle.development_periods.length} dönem`} />
      <Stat label="Toplam Güncel" value={formatNumber(latestSum)} sub={triangle.triangle_type} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] mb-0.5">{label}</div>
      <div className="text-lg font-semibold tabular">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
