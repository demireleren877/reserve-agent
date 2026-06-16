"use client";

/**
 * Veri modülünün agent snapshot'ını register eder.
 * Tüm dönem ve dataset meta bilgilerini agent'a sunar (read-only).
 */

import { useEffect, useMemo } from "react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useDataStore } from "@/lib/data-store";

export function DataAgentBridge() {
  const store = useDataStore();
  const { registerSnapshot, registerActionHandler, unregisterActionHandler } =
    useAgentRegistry();

  const snapshot = useMemo(() => {
    // session_state sarmalı: backend payload.get("session_state") ile okur
    const sessionState = {
      periods: store.periods.map((p) => ({
        period_id: p.id,
        label: p.label,
        created_at: p.createdAt,
        is_active: store.activePeriodId === p.id,
        datasets: Object.values(p.datasets).map((ds) => ({
          dataset_id: ds.datasetId,
          type_id: ds.typeId,
          filename: ds.meta.filename,
          uploaded_at: ds.meta.uploadedAt,
          record_count: ds.meta.record_count,
          brans_list: ds.meta.brans_list,
          // hasar alanları
          hasar_tarihi_min: ds.meta.hasar_tarihi_min ?? null,
          hasar_tarihi_max: ds.meta.hasar_tarihi_max ?? null,
          total_odeme: ds.meta.total_odeme ?? null, // kümülatif ödeme (akış)
          total_muallak: ds.meta.total_muallak ?? null, // son dönem muallağı (stok)
          total_incurred: ds.meta.total_incurred ?? null,
          // prim alanları
          donem_list: ds.meta.donem_list ?? null,
          total_ep: ds.meta.total_ep ?? null,
        })),
      })),
      active_period_id: store.activePeriodId,
      note: "Veri modülü: yüklü dönemler ve dataset meta bilgileri. Veri yükleme/silme agent tarafından yapılamaz.",
    };
    return { session_state: sessionState };
  }, [store.periods, store.activePeriodId]);

  useEffect(() => {
    registerSnapshot("data", snapshot);
  }, [registerSnapshot, snapshot]);

  useEffect(() => {
    // Veri modülü write action desteklemiyor — sadece read
    const handler = () => {};
    registerActionHandler("data", handler);
    return () => unregisterActionHandler("data");
  }, [registerActionHandler, unregisterActionHandler]);

  return null;
}
