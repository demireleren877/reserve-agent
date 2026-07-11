"use client";

import { useState, useEffect } from "react";
import { useDataStore, type PrimRecord, type Dataset } from "@/lib/data-store";

// Prim dataset'i typeId ile bulunur (datasetId rastgeledir; sabit "prim" anahtarı yanlış).
function findPrim(datasets?: Record<string, Dataset>): Dataset | undefined {
  return datasets ? Object.values(datasets).find((d) => d.typeId === "prim") : undefined;
}

interface Props {
  /** Mevcut triangle'ın origin period'ları — eşleştirme için */
  originPeriods: string[];
  onLoad: (premiums: Record<string, number>) => void;
  onClose: () => void;
}

export function LoadPrimsFromDataStore({ originPeriods, onLoad, onClose }: Props) {
  const store = useDataStore();

  const [periodId, setPeriodId] = useState<string>(store.activePeriodId ?? "");
  const [brans, setBrans] = useState<string>("");
  const [bransList, setBransList] = useState<string[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ donem: string; ep: number; matched: string | null }[]>([]);

  const selectedPeriod = store.periods.find((p) => p.id === periodId);

  // Dönem değişince branş listesi güncelle
  useEffect(() => {
    if (!periodId) return;
    const period = store.periods.find((p) => p.id === periodId);
    const primDs = findPrim(period?.datasets);
    const meta = primDs?.meta;
    if (meta?.brans_list?.length) {
      setBransList(meta.brans_list);
      setBrans((b) => (meta.brans_list!.includes(b) ? b : meta.brans_list![0]));
    } else if (period && primDs) {
      setLoadingRecords(true);
      store.loadDatasetRecords(periodId, primDs.datasetId)
        .then((ds) => {
          const list = ds?.meta.brans_list ?? [];
          setBransList(list);
          setBrans(list[0] ?? "");
        })
        .catch(() => setBransList([]))
        .finally(() => setLoadingRecords(false));
    }
  }, [periodId, store]);

  // Branş değişince eşleştirme önizlemesi (records yoksa önce yükle)
  useEffect(() => {
    if (!brans || !periodId) { setPreview([]); return; }
    let cancelled = false;

    async function buildPreview() {
      const period = store.periods.find((p) => p.id === periodId);
      const primDs = findPrim(period?.datasets);
      let records = (primDs?.records ?? []) as PrimRecord[];

      if (!records.length && primDs) {
        try {
          const ds = await store.loadDatasetRecords(periodId, primDs.datasetId);
          records = (ds?.records ?? []) as PrimRecord[];
        } catch {
          records = [];
        }
      }

      if (cancelled) return;
      const filtered = records.filter((r) => r.brans === brans);
      const rows = filtered.map((r) => {
        const matched = originPeriods.find((op) => op === r.donem) ?? null;
        return { donem: r.donem, ep: r.ep, matched };
      });
      setPreview(rows.sort((a, b) => a.donem.localeCompare(b.donem)));
    }

    buildPreview();
    return () => { cancelled = true; };
  }, [brans, periodId, store, originPeriods]);

  async function handleLoad() {
    setError(null);
    const period = store.periods.find((p) => p.id === periodId);
    const primDs = findPrim(period?.datasets);
    let records = (primDs?.records ?? []) as PrimRecord[];

    if (!records.length && primDs) {
      setLoadingRecords(true);
      try {
        const ds = await store.loadDatasetRecords(periodId, primDs.datasetId);
        records = (ds?.records ?? []) as PrimRecord[];
      } catch {
        setError("Kayıtlar yüklenemedi");
        return;
      } finally {
        setLoadingRecords(false);
      }
    }

    const filtered = records.filter((r) => r.brans === brans);
    const premiums: Record<string, number> = {};
    for (const r of filtered) {
      const matched = originPeriods.find((op) => op === r.donem);
      if (matched) premiums[matched] = r.ep;
    }

    if (!Object.keys(premiums).length) {
      setError("Hiçbir dönem eşleşmedi. Granülarite uyumsuzluğu olabilir.");
      return;
    }

    onLoad(premiums);
    onClose();
  }

  const matchedCount = preview.filter((r) => r.matched).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-md shadow-xl border border-[color:var(--border)]">
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Veri Modülünden Prim Yükle</h2>
          <button onClick={onClose} className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg px-1">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Dönem */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Dönem</label>
            {store.periods.filter((p) => findPrim(p.datasets)).length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                Prim verisi yüklü dönem bulunamadı. Veri modülünden yükleyin.
              </p>
            ) : (
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
              >
                {store.periods.filter((p) => findPrim(p.datasets)).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Branş */}
          {bransList.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Branş</label>
              {loadingRecords ? (
                <p className="text-xs text-[color:var(--muted)]">Yükleniyor…</p>
              ) : (
                <select
                  value={brans}
                  onChange={(e) => setBrans(e.target.value)}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                >
                  {bransList.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Önizleme */}
          {preview.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[color:var(--muted-strong)] mb-1.5">
                Eşleştirme önizlemesi
                <span className="ml-2 font-normal text-[color:var(--muted)]">
                  {matchedCount}/{preview.length} dönem eşleşti
                </span>
              </div>
              <div className="rounded-lg border border-[color:var(--border)] overflow-hidden max-h-44 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[color:var(--surface-alt)]">
                      <th className="px-3 py-1.5 text-left font-medium text-[color:var(--muted-strong)]">Dönem</th>
                      <th className="px-3 py-1.5 text-right font-medium text-[color:var(--muted-strong)]">EP</th>
                      <th className="px-3 py-1.5 text-center font-medium text-[color:var(--muted-strong)]">Eşleşme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.donem} className="border-t border-[color:var(--border)]">
                        <td className="px-3 py-1.5 font-mono">{r.donem}</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(r.ep)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {r.matched
                            ? <span className="text-green-600">✓</span>
                            : <span className="text-[color:var(--muted)]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-border,#dc262655)] rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition">
            İptal
          </button>
          <button
            onClick={handleLoad}
            disabled={!brans || bransList.length === 0 || matchedCount === 0}
            className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {matchedCount > 0 ? `${matchedCount} Dönemi Yükle` : "Yükle"}
          </button>
        </div>
      </div>
    </div>
  );
}
