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
import { useDataStore, type PrimRecord } from "@/lib/data-store";
import type { Frequency } from "@/types/project";

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
