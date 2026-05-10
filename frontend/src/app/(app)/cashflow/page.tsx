"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useUserPlan } from "@/lib/auth/user-plan-context";
import {
  type CashflowComputeResult,
  type CashflowRecord,
  type DevFactorRow,
  computeCashflow,
  formatNumber,
  uploadCashflowFile,
} from "@/lib/api";

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

const TR4 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const TR6 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function fmt4(n: number) { return TR4.format(n); }
function fmt6(n: number) { return TR6.format(n); }
function fmtPct(n: number) { return `${(n * 100).toFixed(4)}%`; }

type Tab = "triangle" | "devfactors" | "pattern" | "monthly";

// ─── Upload ekranı ─────────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  loading,
  error,
}: {
  onFile: (f: File) => void;
  loading: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-[22px] font-bold mb-2" style={{ color: "var(--foreground)" }}>
            Nakit Akışı Analizi
          </h1>
          <p className="text-[13.5px]" style={{ color: "var(--muted-strong)" }}>
            CSV veya Excel dosyası yükle — ödeme üçgeni, development faktörleri ve nakit akışı
            pattern hesaplanır.
          </p>
        </div>

        <div
          onClick={() => !loading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="rounded-2xl border-2 border-dashed p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors"
          style={{
            borderColor: dragging ? "var(--primary)" : "var(--border)",
            background: dragging ? "var(--primary-soft)" : "var(--surface)",
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--primary-soft)" }}
          >
            <UploadIcon />
          </div>
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Spinner />
              <span className="text-[13px]" style={{ color: "var(--muted-strong)" }}>
                Dosya işleniyor...
              </span>
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                  Dosyayı sürükle veya tıkla
                </div>
                <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                  CSV, TXT veya XLSX — maks. 50 MB
                </div>
              </div>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />

        {error && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-[13px]"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
          >
            {error}
          </div>
        )}

        <div
          className="mt-6 rounded-xl p-4 text-[12px] space-y-1.5"
          style={{ background: "var(--surface-alt)", color: "var(--muted-strong)" }}
        >
          <div className="font-semibold text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            Beklenen sütunlar
          </div>
          {[
            ["origin_year / accident_year", "Kaza / hasar yılı (sayısal)"],
            ["development_date", "Geliştirme tarihi (GG.AA.YYYY veya YYYY-AA-GG)"],
            ["paid_tl / paid", "Ödenen tutar (virgül veya nokta ondalık)"],
          ].map(([col, desc]) => (
            <div key={col} className="flex gap-2">
              <code
                className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-mono"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {col}
              </code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Üçgen tablosu ─────────────────────────────────────────────────────────────

function TriangleTable({ result }: { result: CashflowComputeResult }) {
  const years = result.origin_years;
  // Tüm period'ları topla
  const periodSet = new Set<number>();
  for (const row of Object.values(result.triangle)) {
    Object.keys(row).forEach((p) => periodSet.add(Number(p)));
  }
  const periods = Array.from(periodSet).sort((a, b) => a - b);

  // Maksimum değeri bul (renklendirme için)
  let maxVal = 0;
  for (const row of Object.values(result.triangle)) {
    for (const v of Object.values(row)) {
      if (v > maxVal) maxVal = v;
    }
  }

  function cellBg(val: number | undefined) {
    if (!val || maxVal === 0) return undefined;
    const intensity = Math.min(val / maxVal, 1);
    const alpha = Math.round(intensity * 180);
    return `rgba(37,83,228,${(alpha / 255).toFixed(2)})`;
  }

  function cellColor(val: number | undefined) {
    if (!val || maxVal === 0) return "var(--muted)";
    const intensity = val / maxVal;
    return intensity > 0.55 ? "#fff" : "var(--foreground)";
  }

  return (
    <div className="overflow-auto">
      <table className="text-[11.5px] border-collapse w-full">
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10 px-3 py-2 text-left font-semibold whitespace-nowrap"
              style={{
                background: "var(--surface)",
                borderBottom: "2px solid var(--border)",
                color: "var(--muted-strong)",
              }}
            >
              Kaza Yılı
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className="px-2 py-2 text-right font-medium whitespace-nowrap"
                style={{
                  borderBottom: "2px solid var(--border)",
                  color: "var(--muted)",
                  minWidth: 80,
                }}
              >
                Q{Number(p) + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year} className="hover:bg-[color:var(--surface-alt)]">
              <td
                className="sticky left-0 z-10 px-3 py-2 font-semibold whitespace-nowrap"
                style={{
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {year}
              </td>
              {periods.map((p) => {
                const val = result.triangle[String(year)]?.[String(p)];
                return (
                  <td
                    key={p}
                    className="px-2 py-2 text-right tabular-nums"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: cellBg(val),
                      color: cellColor(val),
                    }}
                  >
                    {val !== undefined ? formatNumber(val) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Dev Factors tablosu ───────────────────────────────────────────────────────

function DevFactorsTable({ rows }: { rows: DevFactorRow[] }) {
  return (
    <div className="overflow-auto">
      <table className="text-[11.5px] border-collapse w-full">
        <thead>
          <tr>
            {["Period", "Dev Factor", "CDF", "100/CDF", "100/CDF Inc.", "Global Ağırlık"].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-right font-semibold first:text-left whitespace-nowrap"
                style={{
                  borderBottom: "2px solid var(--border)",
                  color: "var(--muted-strong)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period} className="hover:bg-[color:var(--surface-alt)]">
              <td className="px-3 py-2 font-medium" style={{ borderBottom: "1px solid var(--border)", color: "var(--foreground)" }}>
                Q{r.period + 1}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ borderBottom: "1px solid var(--border)" }}>
                {fmt4(r.df)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ borderBottom: "1px solid var(--border)" }}>
                {fmt4(r.cdf)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ borderBottom: "1px solid var(--border)" }}>
                {fmt4(r.inv_cdf_100)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ borderBottom: "1px solid var(--border)" }}>
                {fmt4(r.inv_cdf_100_inc)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ borderBottom: "1px solid var(--border)" }}>
                {r.global_weight > 0 ? fmtPct(r.global_weight) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pattern tablosu ───────────────────────────────────────────────────────────
// Long-format: Kaza Yılı | Period | Normalize Ağırlık

function PatternTable({
  result,
  mode,
}: {
  result: CashflowComputeResult;
  mode: "quarterly" | "monthly";
}) {
  const years = result.origin_years;
  const source = mode === "quarterly" ? result.quarterly_pattern : result.monthly_pattern;
  const periodLabel = mode === "quarterly" ? "Period (Çeyrek)" : "Ay";

  return (
    <div className="overflow-auto">
      <table className="text-[12px] border-collapse w-full">
        <thead className="sticky top-0" style={{ background: "var(--surface)", zIndex: 1 }}>
          <tr>
            {["Kaza Yılı", periodLabel, "Normalize Ağırlık"].map((h) => (
              <th
                key={h}
                className="px-4 py-2 text-left font-semibold whitespace-nowrap"
                style={{ borderBottom: "2px solid var(--border)", color: "var(--muted-strong)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.flatMap((year) =>
            (source[String(year)] ?? []).map((entry) => {
              const w = entry.weight;
              const period = (entry as { period?: number; month?: number }).period
                ?? (entry as { period?: number; month?: number }).month
                ?? 0;
              return (
                <tr key={`${year}-${period}`} className="hover:bg-[color:var(--surface-alt)]">
                  <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)", color: "var(--foreground)" }}>
                    {year}
                  </td>
                  <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)", color: "var(--foreground)" }}>
                    {period}
                  </td>
                  <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)", color: w === 0 ? "var(--muted)" : "var(--foreground)" }}>
                    {w === 0 ? 0 : fmt6(w)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Ana sayfa ─────────────────────────────────────────────────────────────────

export default function CashflowPage() {
  const plan = useUserPlan();

  if (plan !== "pro") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "linear-gradient(135deg,#7c3aed22,#4f46e522)", border: "1px solid #ddd6fe" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-[20px] font-bold mb-2" style={{ color: "var(--foreground)" }}>
            Pro üyelik gerekli
          </h1>
          <p className="text-[13.5px] leading-relaxed mb-8" style={{ color: "var(--muted-strong)" }}>
            Nakit Akışı modülü Pro plana dahildir.
          </p>
          <Link
            href="/onboarding/plan"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)" }}
          >
            Pro'ya yükselt
          </Link>
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<CashflowRecord[] | null>(null);
  const [result, setResult] = useState<CashflowComputeResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("triangle");
  const [uploadMeta, setUploadMeta] = useState<{ record_count: number; report_date: string } | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const uploaded = await uploadCashflowFile(file);
      setRecords(uploaded.records);
      setUploadMeta({ record_count: uploaded.record_count, report_date: uploaded.report_date });
      // Hemen hesapla
      const computed = await computeCashflow(uploaded.records);
      setResult(computed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setRecords(null);
    setResult(null);
    setError(null);
    setUploadMeta(null);
  }

  if (!result) {
    return <UploadZone onFile={handleFile} loading={loading} error={error} />;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "triangle", label: "Kümülatif Üçgen" },
    { key: "devfactors", label: "Development Faktörleri" },
    { key: "pattern", label: "Cashflow Pattern (Çeyreklik)" },
    { key: "monthly", label: "Aylık Pattern (180 ay)" },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div>
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--foreground)" }}>
            Nakit Akışı Analizi
          </h1>
          {uploadMeta && (
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                {formatNumber(uploadMeta.record_count)} kayıt
              </span>
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                Rapor tarihi: {uploadMeta.report_date}
              </span>
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                {result.origin_years.length} kaza yılı
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition hover:bg-[color:var(--surface-alt)]"
          style={{ color: "var(--muted-strong)", border: "1px solid var(--border)" }}
        >
          Yeni dosya yükle
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 px-6 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-3 py-3 text-[12.5px] font-medium border-b-2 transition whitespace-nowrap"
            style={{
              borderColor: activeTab === t.key ? "var(--primary)" : "transparent",
              color: activeTab === t.key ? "var(--primary)" : "var(--muted-strong)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-auto p-6" style={{ background: "var(--background)" }}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="p-5">
            {activeTab === "triangle" && <TriangleTable result={result} />}
            {activeTab === "devfactors" && <DevFactorsTable rows={result.dev_factors} />}
            {activeTab === "pattern" && <PatternTable result={result} mode="quarterly" />}
            {activeTab === "monthly" && <PatternTable result={result} mode="monthly" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── İkonlar ───────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function Spinner() {
  return (
    <div
      className="w-6 h-6 rounded-full border-2 animate-spin"
      style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }}
    />
  );
}
