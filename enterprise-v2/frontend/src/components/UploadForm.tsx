"use client";

import { useRef, useState } from "react";
import type { Granularity, Triangle, TriangleType } from "@/types/triangle";
import { uploadExcel } from "@/lib/api";

interface Props {
  onLoaded: (triangle: Triangle) => void;
}

export function UploadForm({ onLoaded }: Props) {
  const [triangleType, setTriangleType] = useState<TriangleType>("paid");
  const [originGranularity, setOriginGranularity] = useState<Granularity>("yearly");
  const [devGranularity, setDevGranularity] = useState<Granularity>("quarterly");
  const [cumulative, setCumulative] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    setFileName(file.name);
    try {
      const { triangle } = await uploadExcel(file, {
        triangle_type: triangleType,
        origin_granularity: originGranularity,
        development_granularity: devGranularity,
        cumulative,
      });
      onLoaded(triangle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tip">
          <select
            value={triangleType}
            onChange={(e) => setTriangleType(e.target.value as TriangleType)}
            className="input-base"
          >
            <option value="paid">Paid</option>
            <option value="incurred">Incurred</option>
          </select>
        </Field>
        <Field label="Değer">
          <select
            value={cumulative ? "cum" : "inc"}
            onChange={(e) => setCumulative(e.target.value === "cum")}
            className="input-base"
          >
            <option value="cum">Kümülatif</option>
            <option value="inc">Artımsal</option>
          </select>
        </Field>
        <Field label="Kaza">
          <select
            value={originGranularity}
            onChange={(e) => setOriginGranularity(e.target.value as Granularity)}
            className="input-base"
          >
            <option value="yearly">Yıllık</option>
            <option value="quarterly">Çeyreklik</option>
          </select>
        </Field>
        <Field label="Gelişim">
          <select
            value={devGranularity}
            onChange={(e) => setDevGranularity(e.target.value as Granularity)}
            className="input-base"
          >
            <option value="yearly">Yıllık</option>
            <option value="quarterly">Çeyreklik</option>
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full rounded-md border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-alt)] py-6 px-3 text-sm text-[color:var(--muted-strong)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] hover:bg-[color:var(--primary-soft)] disabled:opacity-50"
      >
        {loading
          ? "Yükleniyor…"
          : fileName
          ? fileName
          : "Excel seç (.xlsx)"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        aria-label="Excel dosyası seç"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-[color:var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <p className="text-[11px] text-[color:var(--muted)] leading-relaxed">
        Beklenen kolonlar: <strong>ACCIDENT_YEAR</strong>,{" "}
        <strong>DEVELOPMENT_DATE</strong>, <strong>PAID</strong> (veya INCURRED).
        Çeyreklik formatlar: <code>2024Q1</code>, <code>2024-Q1</code>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)]">
        {label}
      </span>
      {children}
    </label>
  );
}
