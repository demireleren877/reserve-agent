"use client";

import { useState, useEffect } from "react";
import { useDataStore } from "@/lib/data-store";
import type { ClaimRecord } from "@/lib/data-store";
import type { CashflowRecord } from "@/lib/api";

interface Props {
  onLoad: (records: CashflowRecord[], meta: { periodLabel: string; brans: string; recordCount: number }) => void;
  onClose: () => void;
}

export function LoadCashflowFromDataStore({ onLoad, onClose }: Props) {
  const store = useDataStore();

  const periodsWithHasar = store.periods.filter((p) => p.datasets["hasar"]);

  const [periodId, setPeriodId] = useState<string>(
    periodsWithHasar.find((p) => p.id === store.activePeriodId)?.id ?? periodsWithHasar[0]?.id ?? ""
  );
  const [brans, setBrans] = useState<string>("");
  const [bransList, setBransList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dönem değişince branş listesi güncelle
  useEffect(() => {
    if (!periodId) return;
    const period = store.periods.find((p) => p.id === periodId);
    const meta = period?.datasets["hasar"]?.meta;
    if (meta?.brans_list?.length) {
      setBransList(meta.brans_list);
      setBrans((b) => (meta.brans_list!.includes(b) ? b : meta.brans_list![0]));
    } else if (period) {
      setLoading(true);
      store.loadDatasetRecords(periodId, "hasar")
        .then((ds) => {
          const list = ds?.meta.brans_list ?? [];
          setBransList(list);
          setBrans(list[0] ?? "");
        })
        .catch(() => setBransList([]))
        .finally(() => setLoading(false));
    }
  }, [periodId, store]);

  async function handleLoad() {
    if (!periodId || !brans) return;
    setError(null);
    setLoading(true);
    try {
      const period = store.periods.find((p) => p.id === periodId);
      let ds = period?.datasets["hasar"];
      if (!ds?.records?.length) {
        ds = await store.loadDatasetRecords(periodId, "hasar") ?? undefined;
      }
      if (!ds?.records?.length) throw new Error("Kayıt bulunamadı");

      const claimRecords = (ds.records as ClaimRecord[]).filter((r) => r.brans === brans);
      if (!claimRecords.length) throw new Error(`${brans} branşına ait kayıt yok`);

      // origin_year + dev_date bazında odeme topla
      const grouped = new Map<string, number>();
      for (const r of claimRecords) {
        const originYear = parseInt(r.hasar_tarihi.substring(0, 4));
        if (isNaN(originYear)) continue;
        const key = `${originYear}__${r.gelisim_tarihi}`;
        grouped.set(key, (grouped.get(key) ?? 0) + r.odeme);
      }

      const cashflowRecords: CashflowRecord[] = Array.from(grouped.entries()).map(([key, paid]) => {
        const [year, devDate] = key.split("__");
        return { origin_year: parseInt(year), dev_date: devDate, paid };
      });

      if (!cashflowRecords.length) throw new Error("Dönüştürülebilir kayıt bulunamadı");

      onLoad(cashflowRecords, {
        periodLabel: period?.label ?? periodId,
        brans,
        recordCount: cashflowRecords.length,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-md shadow-xl border border-[color:var(--border)]">
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Veri Modülünden Yükle</h2>
          <button onClick={onClose} className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg px-1">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Dönem */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Dönem</label>
            {periodsWithHasar.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                Hasar verisi yüklü dönem bulunamadı. Veri modülünden yükleyin.
              </p>
            ) : (
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
              >
                {periodsWithHasar.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Branş */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Branş</label>
            {loading ? (
              <p className="text-xs text-[color:var(--muted)]">Yükleniyor…</p>
            ) : bransList.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">Bu döneme hasar verisi yüklenmemiş.</p>
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

          <p className="text-xs text-[color:var(--muted)] leading-relaxed">
            Hasar kayıtlarındaki ödeme tutarları kaza yılı ve gelişim tarihine göre gruplanarak nakit akışı hesaplamasına aktarılır.
          </p>

          {error && (
            <p className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-border,#dc262655)] rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
          >
            İptal
          </button>
          <button
            onClick={handleLoad}
            disabled={loading || !periodId || !brans || bransList.length === 0}
            className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Yükleniyor…" : "Yükle"}
          </button>
        </div>
      </div>
    </div>
  );
}
