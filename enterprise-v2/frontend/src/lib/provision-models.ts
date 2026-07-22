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

import { useCallback } from "react";
import { useProject } from "@/lib/project-store";
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
