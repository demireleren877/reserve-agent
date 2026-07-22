/**
 * Veri modülünde bir dataset yüklendiğinde REZERV modülünde SADECE model iskeleti
 * oluşturur: eşleşen dönem (yoksa) + branş başına boş model (branch).
 *
 * Veriyi (üçgen/large/prim) modele BAĞLAMA işi kullanıcıya bırakılır — rezerv
 * modülündeki "Veri modülünden yükle" akışında granülarite/roll-forward seçilerek
 * yapılır. Burada üçgen kurulmaz, parametre atanmaz.
 *
 * Idempotent: aynı (dönem, branş, frekans) modeli zaten varsa dokunulmaz.
 */

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";
import {
  useDataStore,
  type PrimRecord,
  type TriangleRecord,
  type DataPeriod,
  type Dataset,
} from "@/lib/data-store";
import {
  buildTriangleFromRecords,
  rollForwardTriangle,
  type ClaimRecord,
} from "@/lib/api";
import { newDiagonalToFileData, mergeFileData } from "@/lib/roll-forward-util";
import type { Frequency } from "@/types/project";
import type { Triangle, FileData } from "@/types/triangle";

export function useProvisionModels() {
  const { project, actions } = useProject();

  const ensurePeriod = useCallback(
    (label: string): { periodId: string; existing: boolean } => {
      const found = project.periods.find((p) => p.label === label);
      if (found) return { periodId: found.id, existing: true };
      return { periodId: actions.createPeriod(label), existing: false };
    },
    [project.periods, actions],
  );

  /** Dönem + branş başına boş model iskeleti oluştur (varsa dokunma). */
  const provisionShells = useCallback(
    (label: string, bransList: string[], frequency: Frequency) => {
      if (!bransList.length) return;
      const { periodId, existing } = ensurePeriod(label);
      for (const brans of bransList) {
        if (existing) {
          const period = project.periods.find((p) => p.id === periodId);
          const has = period?.branches.some((b) => b.name === brans && b.frequency === frequency);
          if (has) continue; // zaten var
        }
        actions.createBranch(periodId, frequency, brans);
      }
    },
    [ensurePeriod, project.periods, actions],
  );

  return { provisionShells };
}

/**
 * Veri ↔ model DİNAMİK bağ: bir modelin exposure'ını, veri modülündeki prim
 * verisinden CANLI türetir (kopyalamaz). Prim sonradan yüklense/güncellense de
 * model otomatik yansıtır. Eşleşme: dönem etiketi + branş adı; origin = prim dönemi.
 * Elle girilen exposure (branch.premiums) bunun ÜSTÜNE override olur.
 */
export function useDataPremiums(
  periodLabel: string | null | undefined,
  brans: string | null | undefined,
): Record<string, number> {
  const { periods, loadDatasetRecords } = useDataStore();
  const [premiums, setPremiums] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!periodLabel || !brans) {
      setPremiums({});
      return;
    }
    const period = periods.find((p) => p.label === periodLabel);
    const primDs = period
      ? Object.values(period.datasets).find((d) => d.typeId === "prim")
      : undefined;
    if (!period || !primDs) {
      setPremiums({});
      return;
    }
    let cancelled = false;
    (async () => {
      let recs = primDs.records as PrimRecord[] | undefined;
      if (!recs?.length) {
        const ds = await loadDatasetRecords(period.id, primDs.datasetId);
        recs = (ds?.records ?? []) as PrimRecord[];
      }
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const r of recs) if (r.brans === brans) map[r.donem] = r.ep;
      setPremiums(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [periodLabel, brans, periods, loadDatasetRecords]);

  return premiums;
}

// ─── DİNAMİK LARGE (veri ↔ model) ───────────────────────────────────────────────

export interface LargeTriangles {
  paid: Triangle | null;
  incurred: Triangle | null;
  fileData?: FileData | null;
}

type LoadRecords = (periodId: string, datasetId: string) => Promise<Dataset | null>;

function triFromRecord(rec: TriangleRecord): Triangle {
  return {
    origin_periods: rec.origin_periods,
    development_periods: rec.development_periods,
    values: rec.values,
    triangle_type: rec.triangle_type,
    origin_granularity: rec.origin_granularity,
    development_granularity: rec.development_granularity,
  };
}

async function recordsOf(ds: Dataset, periodId: string, load: LoadRecords): Promise<unknown[]> {
  if (ds.records?.length) return ds.records;
  const loaded = await load(periodId, ds.datasetId);
  return loaded?.records ?? [];
}

/**
 * Bir dönemin large üçgenlerini veri modülünden türetir (yöntem: doğrudan / roll-forward).
 * Roll-forward zinciri taban dönemi rekürsif çözer (çevrim koruması var).
 */
async function resolveLargeTriangles(
  periodLabel: string,
  brans: string,
  og: Frequency,
  dg: Frequency,
  dataPeriods: DataPeriod[],
  load: LoadRecords,
  seen: Set<string>,
): Promise<LargeTriangles | null> {
  if (seen.has(periodLabel)) return null; // çevrim
  seen.add(periodLabel);
  const period = dataPeriods.find((p) => p.label === periodLabel);
  if (!period) return null;
  const datasets = Object.values(period.datasets);

  // Hazır large üçgeni (large_ucgen) → daima doğrudan.
  const ucgenDs = datasets.find((d) => d.typeId === "large_ucgen");
  if (ucgenDs) {
    const recs = (await recordsOf(ucgenDs, period.id, load)) as TriangleRecord[];
    const forBrans = recs.filter((r) => r.brans === brans);
    const pool = forBrans.length ? forBrans : recs;
    const paidRec = pool.find((r) => r.triangle_type === "paid");
    const incRec = pool.find((r) => r.triangle_type === "incurred");
    if (!paidRec && !incRec) return null;
    return {
      paid: paidRec ? triFromRecord(paidRec) : null,
      incurred: incRec ? triFromRecord(incRec) : null,
      fileData: null,
    };
  }

  // Dosya bazlı large (large) → yöntem: doğrudan / roll-forward.
  const largeDs = datasets.find((d) => d.typeId === "large");
  if (!largeDs) return null;
  const recs = (await recordsOf(largeDs, period.id, load)) as ClaimRecord[];
  const method = largeDs.meta.largeMethod ?? "direct";
  const baseLabel = largeDs.meta.largeBasePeriodLabel;

  if (method === "rollforward" && baseLabel) {
    const base = await resolveLargeTriangles(baseLabel, brans, og, dg, dataPeriods, load, seen);
    if (base?.paid) {
      const { paidTriangle, incurredTriangle, newDiagonalFiles } = await rollForwardTriangle(
        base.paid,
        base.incurred ?? null,
        recs,
        brans,
        og,
        dg,
      );
      const newFd = newDiagonalFiles ? newDiagonalToFileData(paidTriangle, newDiagonalFiles) : null;
      return {
        paid: paidTriangle,
        incurred: incurredTriangle ?? paidTriangle,
        fileData: mergeFileData(base.fileData ?? undefined, newFd),
      };
    }
    // taban çözülemedi → doğrudana düş
  }

  const t = await buildTriangleFromRecords(recs, brans, og, dg);
  return { paid: t.paidTriangle, incurred: t.incurredTriangle, fileData: t.fileData ?? null };
}

/**
 * Veri ↔ model DİNAMİK large bağı (EP gibi). Modelin large segmentini, veri
 * modülündeki large verisinden (yöntem: doğrudan/roll-forward) CANLI türetir.
 * Large sonradan yüklense/güncellense model otomatik yansıtır. Gross granülaritesi
 * (og/dg) hizalama için gerekir — gross bağlı değilse null döner.
 */
export function useDataLarge(
  periodLabel: string | null | undefined,
  brans: string | null | undefined,
  og: Frequency | null | undefined,
  dg: Frequency | null | undefined,
): LargeTriangles | null {
  const { periods, loadDatasetRecords } = useDataStore();
  const [large, setLarge] = useState<LargeTriangles | null>(null);

  useEffect(() => {
    if (!periodLabel || !brans || !og || !dg) {
      setLarge(null);
      return;
    }
    const period = periods.find((p) => p.label === periodLabel);
    const hasLargeDs =
      !!period &&
      Object.values(period.datasets).some((d) => d.typeId === "large" || d.typeId === "large_ucgen");
    if (!hasLargeDs) {
      setLarge(null);
      return;
    }
    let cancelled = false;
    resolveLargeTriangles(periodLabel, brans, og, dg, periods, loadDatasetRecords, new Set())
      .then((r) => {
        if (!cancelled) setLarge(r);
      })
      .catch(() => {
        if (!cancelled) setLarge(null);
      });
    return () => {
      cancelled = true;
    };
  }, [periodLabel, brans, og, dg, periods, loadDatasetRecords]);

  return large;
}
