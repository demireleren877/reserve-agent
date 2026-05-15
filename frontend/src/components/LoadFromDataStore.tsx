"use client";

import { useState, useEffect } from "react";
import { useDataStore } from "@/lib/data-store";
import { buildTriangleFromRecords } from "@/lib/api";
import { useBranchSetters } from "@/lib/project-store";

interface Props {
  onClose: () => void;
  onLoaded: () => void;
}

type Granularity = "yearly" | "quarterly";

export function LoadFromDataStore({ onClose, onLoaded }: Props) {
  const store = useDataStore();
  const setters = useBranchSetters("user");

  const [periodId, setPeriodId] = useState<string>(store.activePeriodId ?? "");
  const [brans, setBrans] = useState<string>("");
  const [originGran, setOriginGran] = useState<Granularity>("yearly");
  const [devGran, setDevGran] = useState<Granularity>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [bransList, setBransList] = useState<string[]>([]);

  // Seçili dönem değişince branş listesini güncelle
  useEffect(() => {
    if (!periodId) return;
    const period = store.periods.find((p) => p.id === periodId);
    const meta = period?.datasets["hasar"]?.meta;
    if (meta) {
      setBransList(meta.brans_list ?? []);
      setBrans((b) => (meta.brans_list?.includes(b) ? b : meta.brans_list?.[0] ?? ""));
    } else if (period) {
      setLoadingRecords(true);
      store.loadDatasetRecords(periodId, "hasar")
        .then((ds) => {
          const list = ds?.meta.brans_list ?? [];
          setBransList(list);
          setBrans(list[0] ?? "");
        })
        .catch(() => setBransList([]))
        .finally(() => setLoadingRecords(false));
    }
  }, [periodId, store]);

  const selectedPeriod = store.periods.find((p) => p.id === periodId);
  const hasarDs = selectedPeriod?.datasets["hasar"] ?? null;

  async function handleBuild() {
    if (!periodId || !brans) return;
    setError(null);
    setLoading(true);
    try {
      let ds = hasarDs;
      if (!ds?.records?.length) {
        ds = await store.loadDatasetRecords(periodId, "hasar");
      }
      if (!ds?.records?.length) throw new Error("Kayıt bulunamadı");

      const { paidTriangle, incurredTriangle } = await buildTriangleFromRecords(
        ds.records as import("@/lib/api").ClaimRecord[],
        brans,
        originGran,
        devGran,
      );

      const fileName = `${selectedPeriod?.label ?? ""} – ${brans}`;
      setters.setBothTriangles(paidTriangle, incurredTriangle, fileName);
      onLoaded();
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
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Dönem */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
              Dönem
            </label>
            {store.periods.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                Henüz dönem eklenmemiş. Veri modülüne gidip dönem oluşturun.
              </p>
            ) : (
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
              >
                {store.periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Branş */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
              Branş
            </label>
            {loadingRecords ? (
              <p className="text-xs text-[color:var(--muted)]">Yükleniyor…</p>
            ) : bransList.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                Bu döneme hasar verisi yüklenmemiş.
              </p>
            ) : (
              <select
                value={brans}
                onChange={(e) => setBrans(e.target.value)}
                className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
              >
                {bransList.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
          </div>

          {/* Granülarite */}
          <div className="grid grid-cols-2 gap-3">
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

          <p className="text-xs text-[color:var(--muted)] leading-relaxed">
            Paid üçgeni (kümülatif ödeme) ve Incurred üçgeni (kümülatif ödeme + dönem sonu muallak) otomatik oluşturulur.
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
            onClick={handleBuild}
            disabled={loading || !periodId || !brans || bransList.length === 0}
            className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Oluşturuluyor…" : "Üçgenleri Yükle"}
          </button>
        </div>
      </div>
    </div>
  );
}
