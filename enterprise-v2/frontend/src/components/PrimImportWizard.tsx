"use client";

import { useRef, useState } from "react";
import { inspectPrimFile, importPrimFile, type PrimInspectResult, type PrimImportResult } from "@/lib/api";

const FIELDS = [
  { id: "brans", label: "Branş" },
  { id: "donem", label: "Dönem (Yıl)" },
  { id: "ep",    label: "EP (Earned Premium)" },
] as const;

type FieldId = typeof FIELDS[number]["id"];

type Step = "upload" | "sheet" | "mapping" | "importing";

export interface PrimWizardResult {
  filename: string;
  sheetName: string | null;
  columnMapping: Record<string, string>;
  importResult: PrimImportResult;
}

interface Props {
  onDone: (result: PrimWizardResult) => void;
  onCancel: () => void;
}

function resolveHeaders(inspect: PrimInspectResult, sheet: string | null): string[] {
  const key = sheet ?? "null";
  return inspect.headers[key] ?? [];
}

function resolveSuggested(inspect: PrimInspectResult, sheet: string | null): Record<string, string> {
  const key = sheet ?? "null";
  return inspect.suggested_mapping[key] ?? {};
}

export function PrimImportWizard({ onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [inspect, setInspect] = useState<PrimInspectResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<FieldId, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    setLoading(true);
    try {
      const result = await inspectPrimFile(f);
      setInspect(result);
      const sheets = result.sheets;
      if (sheets.length > 1 && sheets[0] !== null) {
        setSelectedSheet(sheets[0] as string);
        setStep("sheet");
      } else {
        const sh = sheets[0] ?? null;
        setSelectedSheet(sh);
        setMapping(resolveSuggested(result, sh) as Partial<Record<FieldId, string>>);
        setStep("mapping");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya okunamadı");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !inspect) return;
    const m = mapping as Record<string, string>;
    const missing = FIELDS.filter((f) => !m[f.id]).map((f) => f.label);
    if (missing.length) {
      setError(`Eksik eşleştirme: ${missing.join(", ")}`);
      return;
    }
    setStep("importing");
    setError(null);
    try {
      const importResult = await importPrimFile(file, selectedSheet, m);
      onDone({ filename: file.name, sheetName: selectedSheet, columnMapping: m, importResult });
    } catch (e) {
      setError(e instanceof Error ? e.message : "İçeri aktarma hatası");
      setStep("mapping");
    }
  }

  const headers = inspect ? resolveHeaders(inspect, selectedSheet).filter((h) => h.trim() !== "") : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-lg shadow-xl border border-[color:var(--border)]">

        {/* Başlık */}
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Prim Verisi İçeri Aktar</h2>
          <button onClick={onCancel} className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg px-1">×</button>
        </div>

        <div className="p-5 space-y-4">

          {/* UPLOAD */}
          {step === "upload" && (
            <>
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className="border-2 border-dashed border-[color:var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[color:var(--primary)] transition"
              >
                <p className="text-sm text-[color:var(--muted-strong)]">
                  CSV veya Excel dosyası sürükleyin / tıklayın
                </p>
                <p className="text-xs text-[color:var(--muted)] mt-1">
                  Beklenen sütunlar: Branş, Dönem, EP
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {loading && <p className="text-xs text-[color:var(--muted)] text-center">İnceleniyor…</p>}
            </>
          )}

          {/* SHEET */}
          {step === "sheet" && inspect && (
            <>
              <p className="text-sm text-[color:var(--muted-strong)]">Excel sayfası seçin:</p>
              <div className="space-y-1.5">
                {inspect.sheets.filter((s): s is string => s !== null).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSelectedSheet(s);
                      setMapping(resolveSuggested(inspect, s) as Partial<Record<FieldId, string>>);
                      setStep("mapping");
                    }}
                    className="w-full text-left px-4 py-2.5 rounded-lg border border-[color:var(--border)] hover:border-[color:var(--primary)] hover:bg-[color:var(--primary-soft)] transition text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* MAPPING */}
          {step === "mapping" && inspect && (
            <>
              <p className="text-xs text-[color:var(--muted-strong)] mb-2">
                Her alan için dosyadaki sütunu eşleştirin:
              </p>
              <div className="space-y-3">
                {FIELDS.map((field) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-40 text-[color:var(--muted-strong)]">{field.label}</span>
                    <select
                      value={mapping[field.id] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [field.id]: e.target.value }))}
                      className="flex-1 text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                    >
                      <option value="">— Seçin —</option>
                      {headers.map((h, i) => (
                        <option key={`${i}:${h}`} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === "importing" && (
            <p className="text-sm text-[color:var(--muted)] text-center py-4">Aktarılıyor…</p>
          )}

          {error && (
            <p className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-border,#dc262655)] rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
          >
            İptal
          </button>
          {step === "mapping" && (
            <button
              onClick={handleImport}
              disabled={FIELDS.some((f) => !mapping[f.id])}
              className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              İçeri Aktar
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
