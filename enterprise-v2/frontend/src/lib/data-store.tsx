"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  ApiError as WorkerError,
} from "@/lib/sync/worker-client";
import { sortByPeriodLabel } from "@/lib/period-order";

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
    label: "Claim Data",
    description: "File-level claim records",
    columns: ["Claim No", "Branch", "Loss Date", "Development Date", "Paid", "Outstanding"],
  },
  {
    id: "large",
    label: "Large Loss",
    description: "File-level large-loss records — separated out for Attritional",
    columns: ["Claim No", "Branch", "Loss Date", "Development Date", "Paid", "Outstanding"],
  },
  {
    id: "prim",
    label: "Premium Data",
    description: "Periodic earned premium data",
    columns: ["Branch", "Period", "Premium"],
  },
  {
    id: "ucgen",
    label: "Triangle Data",
    description: "Prebuilt paid or incurred development triangle",
    columns: ["Branch", "Triangle Type", "Accident Period", "Development Period"],
  },
  {
    id: "large_ucgen",
    label: "Large Triangle",
    description: "Prebuilt large paid/incurred development triangle",
    columns: ["Branch", "Triangle Type", "Accident Period", "Development Period"],
  },
];

/** Üçgen tipli veri tipleri (gross + large hazır üçgen). */
export const TRIANGLE_TYPE_IDS = ["ucgen", "large_ucgen"] as const;
export function isTriangleType(typeId: string): boolean {
  return typeId === "ucgen" || typeId === "large_ucgen";
}

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
  // large alanları — modele DİNAMİK uygulanır (EP gibi). Yöntem yüklemede seçilir.
  /** "direct" → tüm large kayıtlarından kümülatif üçgen; "rollforward" → taban dönemin
   *  üzerine bu dönemin hareketi taşınır. large_ucgen daima doğrudandır. */
  largeMethod?: "direct" | "rollforward";
  /** Roll-forward için taban (önceki) dönemin etiketi. */
  largeBasePeriodLabel?: string;
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
  const periodsRef = useRef<DataPeriod[]>([]);
  periodsRef.current = periods;
  const datasetGenerationRef = useRef(new Map<string, number>());
  const datasetRequestsRef = useRef(new Map<string, Promise<Dataset | null>>());

  const datasetKey = (periodId: string, datasetId: string) => `${periodId}\u0000${datasetId}`;
  const invalidateDatasetRequest = (periodId: string, datasetId: string) => {
    const key = datasetKey(periodId, datasetId);
    datasetGenerationRef.current.set(key, (datasetGenerationRef.current.get(key) ?? 0) + 1);
    datasetRequestsRef.current.delete(key);
  };

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
        const sorted = sortByPeriodLabel(loaded);
        setPeriods(sorted);
        if (sorted.length > 0) setActivePeriodIdState(sorted[0].id);
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
    setPeriods((prev) => sortByPeriodLabel([...prev, period]));
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
    invalidateDatasetRequest(periodId, dataset.datasetId);
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
    invalidateDatasetRequest(periodId, datasetId);
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
    const key = datasetKey(periodId, datasetId);
    // Zaten yüklüyse döndür. Ref kullanımı callback kimliğini periods
    // değişimlerinden bağımsız tutar; veri hook'ları gereksiz yere yeniden çalışmaz.
    const period = periodsRef.current.find((p) => p.id === periodId);
    if (period?.datasets[datasetId]?.records?.length) {
      return period.datasets[datasetId];
    }
    const pending = datasetRequestsRef.current.get(key);
    if (pending) return pending;

    const generation = datasetGenerationRef.current.get(key) ?? 0;
    let request!: Promise<Dataset | null>;
    request = (async (): Promise<Dataset | null> => {
      try {
        const data = await getDataset(periodId, datasetId);
        const ds: Dataset = {
          datasetId,
          typeId: data.typeId,
          meta: data.meta as DatasetMeta,
          records: data.records as ClaimRecord[],
        };
        // Dataset bu sırada silinmediyse/değişmediyse state'e yaz.
        if ((datasetGenerationRef.current.get(key) ?? 0) === generation) {
          setPeriods((prev) =>
            prev.map((p) =>
              p.id === periodId
                ? { ...p, datasets: { ...p.datasets, [datasetId]: ds } }
                : p,
            ),
          );
        }
        return ds;
      } catch (e) {
        if (e instanceof WorkerError && e.status === 404) return null;
        throw e;
      } finally {
        if (datasetRequestsRef.current.get(key) === request) {
          datasetRequestsRef.current.delete(key);
        }
      }
    })();
    datasetRequestsRef.current.set(key, request);
    return request;
  }, []);

  const activePeriod = useMemo(
    () => periods.find((p) => p.id === activePeriodId) ?? null,
    [periods, activePeriodId],
  );

  const contextValue = useMemo<DataStoreState>(
    () => ({
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
    }),
    [
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
    ],
  );

  if (!ready) return null;

  return (
    <DataStoreContext.Provider value={contextValue}>
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
