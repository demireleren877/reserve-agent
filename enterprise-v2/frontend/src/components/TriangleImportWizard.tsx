"use client";

import { useRef, useState } from "react";
import { uploadExcel } from "@/lib/api";
import { TriangleGrid } from "@/components/TriangleGrid";
import type { Triangle, TriangleType, Granularity } from "@/types/triangle";
import type { TriangleRecord } from "@/lib/data-store";

export interface TriangleWizardResult {
  filename: string;
  record: TriangleRecord;
}

interface Props {
  onDone: (result: TriangleWizardResult) => void;
  onCancel: () => void;
}

type Step = "configure" | "preview";

export function TriangleImportWizard({ onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>("configure");
  const [brans, setBrans] = useState("");
  const [triangleType, setTriangleType] = useState<TriangleType>("paid");
  const [originGran, setOriginGran] = useState<Granularity>("yearly");
  const [devGran, setDevGran] = useState<Granularity>("yearly");
  const [cumulative, setCumulative] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Triangle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    setLoading(true);
    try {
      const result = await uploadExcel(f, {
        triangle_type: triangleType,
        origin_granularity: originGran,
        development_granularity: devGran,
        cumulative,
      });
      setParsed(result.triangle);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya okunamadı");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!parsed || !file) return;
    const record: TriangleRecord = {
      brans: brans.trim() || "—",
      triangle_type: triangleType,
      origin_granularity: originGran,
      development_granularity: devGran,
      origin_periods: parsed.origin_periods,
      development_periods: parsed.development_periods,
      values: parsed.values,
    };
    onDone({ filename: file.name, record });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="card w-full shadow-xl border border-[color:var(--border)] flex flex-col"
        style={{ maxWidth: step === "preview" ? 720 : 520, maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">Üçgen Verisi İçeri Aktar</h2>
          <button
            onClick={onCancel}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg px-1"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {step === "configure" && (
            <>
              {/* Options */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                    Branş Adı
                  </label>
                  <input
                    value={brans}
                    onChange={(e) => setBrans(e.target.value)}
                    placeholder="örn. Kasko"
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                    Üçgen Türü
                  </label>
                  <select
                    value={triangleType}
                    onChange={(e) => setTriangleType(e.target.value as TriangleType)}
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  >
                    <option value="paid">Paid (Ödeme)</option>
                    <option value="incurred">Incurred (Muallak+Ödeme)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                    Kaza Dönemi
                  </label>
                  <select
                    value={originGran}
                    onChange={(e) => setOriginGran(e.target.value as Granularity)}
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  >
                    <option value="yearly">Yıllık</option>
                    <option value="quarterly">Çeyreklik</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                    Gelişim Dönemi
                  </label>
                  <select
                    value={devGran}
                    onChange={(e) => setDevGran(e.target.value as Granularity)}
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  >
                    <option value="yearly">Yıllık</option>
                    <option value="quarterly">Çeyreklik</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cumulative"
                  checked={cumulative}
                  onChange={(e) => setCumulative(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="cumulative" className="text-xs text-[color:var(--muted-strong)] cursor-pointer">
                  Kümülatif değerler (işaretlenmezse artımsal kabul edilir)
                </label>
              </div>

              {/* Upload dropzone */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                className="border-2 border-dashed border-[color:var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-[color:var(--primary)] transition"
              >
                <p className="text-sm text-[color:var(--muted-strong)]">
                  Excel dosyası sürükleyin veya tıklayın
                </p>
                <p className="text-xs text-[color:var(--muted)] mt-1">
                  İlk sütun: kaza dönemi · Kalan sütunlar: gelişim dönemleri
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {loading && (
                <p className="text-xs text-[color:var(--muted)] text-center">Ayrıştırılıyor…</p>
              )}
            </>
          )}

          {step === "preview" && parsed && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[color:var(--muted-strong)]">
                  {parsed.origin_periods.length} kaza dönemi · {parsed.development_periods.length} gelişim adımı
                </span>
                <span
                  className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#dcfce7", color: "#15803d" }}
                >
                  {brans.trim() || "—"} · {triangleType === "paid" ? "Paid" : "Incurred"}
                </span>
              </div>
              <div className="overflow-auto rounded-lg border border-[color:var(--border)]">
                <TriangleGrid triangle={parsed} />
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-border,#dc262655)] rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2 flex-shrink-0">
          {step === "preview" && (
            <button
              onClick={() => { setStep("configure"); setParsed(null); }}
              className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
            >
              ← Geri
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
          >
            İptal
          </button>
          {step === "preview" && (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition"
            >
              Kaydet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
