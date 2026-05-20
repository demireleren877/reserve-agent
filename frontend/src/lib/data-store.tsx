"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchPeriods,
  upsertPeriod,
  deletePeriod as remoteDel,
  putDataset,
  deleteDataset as remoteDelDs,
  getDataset,
  WorkerError,
} from "@/lib/sync/worker-client";

// ─── Veri türü tanımları ──────────────────────────────────────────────────────

export interface DataTypeDef {
  id: string;
  label: string;
  description: string;
  columns: string[];
}

export const DATA_TYPES: DataTypeDef[] = [
  {
    id: "hasar",
    label: "Hasar Verisi",
    description: "Dosya bazlı hasar kayıtları",
    columns: ["Dosya No", "Branş", "Hasar Tarihi", "Gelişim Tarihi", "Ödeme", "Muallak"],
  },
  {
    id: "prim",
    label: "Prim Verisi",
    description: "Dönemsel prim kazanım verileri",
    columns: ["Branş", "Dönem", "Prim"],
  },
  {
    id: "ucgen",
    label: "Üçgen Verisi",
    description: "Hazır paid veya incurred gelişim üçgeni",
    columns: ["Branş", "Üçgen Türü", "Kaza Dönemi", "Gelişim Dönemi"],
  },
];

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface ClaimRecord {
  dosya_no: string;
  brans: string;
  hasar_tarihi: string;
  gelisim_tarihi: string;
  odeme: number;
  muallak: number;
}

export interface PrimRecord {
  brans: string;
  donem: string;
  ep: number;
}

export interface TriangleRecord {
  brans: string;
  triangle_type: "paid" | "incurred";
  origin_granularity: "yearly" | "quarterly";
  development_granularity: "yearly" | "quarterly";
  origin_periods: string[];
  development_periods: number[];
  values: (number | null)[][];
}

export interface DatasetMeta {
  filename: string;
  uploadedAt: string;
  record_count: number;
  brans_list: string[];
  // hasar alanları
  hasar_tarihi_min?: string;
  hasar_tarihi_max?: string;
  gelisim_tarihi_min?: string;
  gelisim_tarihi_max?: string;
  total_odeme?: number;
  total_muallak?: number;
  // prim alanları
  donem_list?: string[];
  total_ep?: number;
}

export interface Dataset {
  datasetId: string;
  typeId: string;
  meta: DatasetMeta;
  records: ClaimRecord[] | PrimRecord[] | TriangleRecord[];
}

export interface DataPeriod {
  id: string;
  label: string;
  createdAt: string;
  datasets: Record<string, Dataset>; // datasetId → Dataset (records lazy-loaded)
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface DataStoreState {
  periods: DataPeriod[];
  activePeriodId: string | null;
  activePeriod: DataPeriod | null;
  syncing: boolean;

  addPeriod: (label: string) => Promise<DataPeriod>;
  deletePeriod: (id: string) => Promise<void>;
  setActivePeriod: (id: string | null) => void;
  setDataset: (periodId: string, dataset: Dataset) => Promise<void>;
  removeDataset: (periodId: string, datasetId: string) => Promise<void>;
  /** Records olmadan sadece meta döner; records için loadDatasetRecords kullan */
  loadDatasetRecords: (periodId: string, datasetId: string) => Promise<Dataset | null>;
}

const DataStoreContext = createContext<DataStoreState | null>(null);

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataStoreProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [periods, setPeriods] = useState<DataPeriod[]>([]);
  const [activePeriodId, setActivePeriodIdState] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);

  // İlk yüklemede D1'den dönemleri çek
  useEffect(() => {
    let cancelled = false;
    setSyncing(true);
    fetchPeriods()
      .then((remote) => {
        if (cancelled) return;
        // Remote'tan gelen dönemler — records henüz yok
        const loaded: DataPeriod[] = remote.map((r) => ({
          id: r.id,
          label: r.label,
          createdAt: r.createdAt,
          datasets: Object.fromEntries(
            Object.entries(r.datasetMetas).map(([datasetId, rawMeta]) => {
              const { typeId, ...meta } = rawMeta;
              return [datasetId, { datasetId, typeId, meta: meta as unknown as DatasetMeta, records: [] }];
            })
          ),
        }));
        setPeriods(loaded);
        if (loaded.length > 0) setActivePeriodIdState(loaded[0].id);
      })
      .catch(() => {/* offline veya hata — boş başla */})
      .finally(() => {
        if (!cancelled) { setSyncing(false); setReady(true); }
      });
    return () => { cancelled = true; };
  }, [userId]);

  // Dönem ekle
  const addPeriod = useCallback(async (label: string): Promise<DataPeriod> => {
    const period: DataPeriod = {
      id: newId(),
      label: label.trim(),
      createdAt: new Date().toISOString(),
      datasets: {},
    };
    setPeriods((prev) => [...prev, period]);
    setActivePeriodIdState(period.id);
    // D1'e yaz
    await upsertPeriod({ period_id: period.id, label: period.label, created_at: period.createdAt });
    return period;
  }, []);

  // Dönem sil
  const deletePeriod = useCallback(async (id: string) => {
    setPeriods((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActivePeriodIdState((cur) => cur === id ? (next[0]?.id ?? null) : cur);
      return next;
    });
    await remoteDel(id);
  }, []);

  // Aktif dönem seç
  const setActivePeriod = useCallback((id: string | null) => {
    setActivePeriodIdState(id);
  }, []);

  // Dataset kaydet (local + D1)
  const setDataset = useCallback(async (periodId: string, dataset: Dataset) => {
    setPeriods((prev) =>
      prev.map((p) =>
        p.id === periodId
          ? { ...p, datasets: { ...p.datasets, [dataset.datasetId]: dataset } }
          : p,
      ),
    );
    await putDataset(periodId, dataset.datasetId, dataset.typeId, dataset.meta, dataset.records);
  }, []);

  // Dataset sil
  const removeDataset = useCallback(async (periodId: string, datasetId: string) => {
    setPeriods((prev) =>
      prev.map((p) => {
        if (p.id !== periodId) return p;
        const { [datasetId]: _, ...rest } = p.datasets;
        return { ...p, datasets: rest };
      }),
    );
    await remoteDelDs(periodId, datasetId);
  }, []);

  // Records lazy-load (D1'den)
  const loadDatasetRecords = useCallback(async (
    periodId: string,
    datasetId: string,
  ): Promise<Dataset | null> => {
    // Zaten yüklüyse döndür
    const period = periods.find((p) => p.id === periodId);
    if (period?.datasets[datasetId]?.records?.length) {
      return period.datasets[datasetId];
    }
    try {
      const data = await getDataset(periodId, datasetId);
      const ds: Dataset = {
        datasetId,
        typeId: data.typeId,
        meta: data.meta as DatasetMeta,
        records: data.records as ClaimRecord[],
      };
      // State'e yaz
      setPeriods((prev) =>
        prev.map((p) =>
          p.id === periodId
            ? { ...p, datasets: { ...p.datasets, [datasetId]: ds } }
            : p,
        ),
      );
      return ds;
    } catch (e) {
      if (e instanceof WorkerError && e.status === 404) return null;
      throw e;
    }
  }, [periods]);

  const activePeriod = periods.find((p) => p.id === activePeriodId) ?? null;

  if (!ready) return null;

  return (
    <DataStoreContext.Provider
      value={{
        periods,
        activePeriodId,
        activePeriod,
        syncing,
        addPeriod,
        deletePeriod,
        setActivePeriod,
        setDataset,
        removeDataset,
        loadDatasetRecords,
      }}
    >
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore(): DataStoreState {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore: DataStoreProvider eksik");
  return ctx;
}

// Geriye dönük uyumluluk — ilk "hasar" datasetini döner
export function useDataset() {
  const store = useDataStore();
  const active = store.activePeriod;
  const hasarDs = active
    ? (Object.values(active.datasets).find((d) => d.typeId === "hasar") ?? null)
    : null;
  return {
    dataset: hasarDs,
    setDataset: async (ds: Dataset | null) => {
      if (!active) return;
      if (ds) await store.setDataset(active.id, ds);
      else if (hasarDs) await store.removeDataset(active.id, hasarDs.datasetId);
    },
    clearDataset: async () => {
      if (active && hasarDs) await store.removeDataset(active.id, hasarDs.datasetId);
    },
  };
}
