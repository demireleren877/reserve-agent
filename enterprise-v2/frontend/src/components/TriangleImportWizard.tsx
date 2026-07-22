"use client";

import { useRef, useState } from "react";
import { uploadExcel } from "@/lib/api";
import { TriangleGrid } from "@/components/TriangleGrid";
import type { Triangle, Granularity } from "@/types/triangle";
import type { TriangleRecord } from "@/lib/data-store";

export interface TriangleWizardResult {
  filename: string;
  records: TriangleRecord[]; // [paid, incurred]
}

interface Props {
  onDone: (result: TriangleWizardResult) => void;
  onCancel: () => void;
}

// incurred = kümülatif ödeme + dönem sonu muallak (hücre bazlı, origin/gelişim eşleştirilir)
function addOutstanding(paid: Triangle, os: Triangle): Triangle {
  const osOriginIdx = new Map(os.origin_periods.map((o, i) => [o, i]));
  const values = paid.values.map((row, i) => {
    const origin = paid.origin_periods[i];
    const oi = osOriginIdx.get(origin);
    return row.map((pv, j) => {
      if (pv == null) return null;
      const dev = paid.development_periods[j];
      let ov = 0;
      if (oi != null) {
        const dj = os.development_periods.indexOf(dev);
        if (dj >= 0) ov = (os.values[oi]?.[dj] as number | null) ?? 0;
      }
      return pv + ov;
    });
  });
  return { ...paid, values, triangle_type: "incurred" };
}

function toRecord(brans: string, tri: Triangle, type: "paid" | "incurred"): TriangleRecord {
  return {
    brans: brans.trim() || "—",
    triangle_type: type,
    origin_granularity: tri.origin_granularity,
    development_granularity: tri.development_granularity,
    origin_periods: tri.origin_periods,
    development_periods: tri.development_periods,
    values: tri.values,
  };
}

export function TriangleImportWizard({ onDone, onCancel }: Props) {
  const [step, setStep] = useState<"configure" | "preview">("configure");
  const [brans, setBrans] = useState("");
  const [originGran, setOriginGran] = useState<Granularity>("yearly");
  const [devGran, setDevGran] = useState<Granularity>("yearly");
  const [paidCumulative, setPaidCumulative] = useState(true);

  const [paidFile, setPaidFile] = useState<File | null>(null);
  const [muallakFile, setMuallakFile] = useState<File | null>(null);
  const [paidTri, setPaidTri] = useState<Triangle | null>(null);
  const [muallakTri, setMuallakTri] = useState<Triangle | null>(null);
  const [incurredTri, setIncurredTri] = useState<Triangle | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const muallakRef = useRef<HTMLInputElement>(null);

  async function parseOne(f: File, cumulative: boolean): Promise<Triangle> {
    const result = await uploadExcel(f, {
      triangle_type: "paid",
      origin_granularity: originGran,
      development_granularity: devGran,
      cumulative,
    });
    return result.triangle;
  }

  async function handlePaid(f: File) {
    setError(null); setLoading(true);
    try {
      setPaidFile(f);
      setPaidTri(await parseOne(f, paidCumulative));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read paid triangle");
    } finally { setLoading(false); }
  }

  async function handleMuallak(f: File) {
    setError(null); setLoading(true);
    try {
      setMuallakFile(f);
      // Muallak = bakiye (stok) → olduğu gibi al (akümüle etme)
      setMuallakTri(await parseOne(f, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read outstanding triangle");
    } finally { setLoading(false); }
  }

  function goPreview() {
    if (!paidTri || !muallakTri) return;
    try {
      setIncurredTri(addOutstanding(paidTri, muallakTri));
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compute incurred");
    }
  }

  function handleConfirm() {
    if (!paidTri || !incurredTri || !paidFile) return;
    onDone({
      filename: paidFile.name,
      records: [toRecord(brans, paidTri, "paid"), toRecord(brans, incurredTri, "incurred")],
    });
  }

  const canPreview = !!paidTri && !!muallakTri && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="card w-full shadow-xl border border-[color:var(--border)] flex flex-col"
        style={{ maxWidth: step === "preview" ? 720 : 560, maxHeight: "90vh" }}
      >
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">Import Triangle Data</h2>
          <button onClick={onCancel} className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg px-1">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {step === "configure" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Branch Name</label>
                  <input
                    value={brans} onChange={(e) => setBrans(e.target.value)} placeholder="e.g. Motor"
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Accident Period</label>
                  <select value={originGran} onChange={(e) => setOriginGran(e.target.value as Granularity)}
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]">
                    <option value="yearly">Yearly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Development Period</label>
                  <select value={devGran} onChange={(e) => setDevGran(e.target.value as Granularity)}
                    className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]">
                    <option value="yearly">Yearly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="paidcum" checked={paidCumulative}
                  onChange={(e) => setPaidCumulative(e.target.checked)} className="w-4 h-4 rounded" />
                <label htmlFor="paidcum" className="text-xs text-[color:var(--muted-strong)] cursor-pointer">
                  Paid triangle is cumulative (if unchecked, treated as incremental)
                </label>
              </div>

              <p className="text-[11px] text-[color:var(--muted)]">
                Both triangles are required. <b>incurred = paid + outstanding</b> is computed automatically;
                so both paid and outstanding are available in the prior period for roll-forward.
              </p>

              {/* İki yükleme kutusu */}
              <div className="grid grid-cols-2 gap-3">
                <UploadZone
                  label="Paid triangle" done={!!paidTri} fileName={paidFile?.name}
                  onPick={() => paidRef.current?.click()}
                  onDrop={(f) => handlePaid(f)}
                />
                <UploadZone
                  label="Outstanding triangle" done={!!muallakTri} fileName={muallakFile?.name}
                  onPick={() => muallakRef.current?.click()}
                  onDrop={(f) => handleMuallak(f)}
                />
              </div>
              <input ref={paidRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePaid(f); }} />
              <input ref={muallakRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMuallak(f); }} />

              {loading && <p className="text-xs text-[color:var(--muted)] text-center">Parsing…</p>}
            </>
          )}

          {step === "preview" && incurredTri && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[color:var(--muted-strong)]">
                  {incurredTri.origin_periods.length} accident periods · {incurredTri.development_periods.length} development steps
                </span>
                <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#15803d" }}>
                  {brans.trim() || "—"} · Paid + Outstanding = Incurred
                </span>
              </div>
              <div className="overflow-auto rounded-lg border border-[color:var(--border)]">
                <TriangleGrid triangle={incurredTri} />
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-border,#dc262655)] rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2 flex-shrink-0">
          {step === "preview" && (
            <button onClick={() => setStep("configure")}
              className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition">← Geri</button>
          )}
          <button onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition">Cancel</button>
          {step === "configure" && (
            <button onClick={goPreview} disabled={!canPreview}
              className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed">Preview →</button>
          )}
          {step === "preview" && (
            <button onClick={handleConfirm}
              className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition">Save</button>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadZone({ label, done, fileName, onPick, onDrop }: {
  label: string; done: boolean; fileName?: string; onPick: () => void; onDrop: (f: File) => void;
}) {
  return (
    <div
      onClick={onPick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onDrop(f); }}
      className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition"
      style={{ borderColor: done ? "#22c55e" : "var(--border)", background: done ? "#f0fdf4" : "transparent" }}
    >
      <p className="text-xs font-semibold" style={{ color: done ? "#15803d" : "var(--muted-strong)" }}>
        {done ? "✓ " : ""}{label}
      </p>
      <p className="text-[10.5px] text-[color:var(--muted)] mt-1 truncate">
        {fileName ?? "Drag or click an Excel file"}
      </p>
    </div>
  );
}
