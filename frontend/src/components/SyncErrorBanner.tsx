"use client";

import { useProject } from "@/lib/project-store";

/**
 * Proje sunucuya kaydedilemiyorsa kalıcı uyarı. Senkron hataları eskiden
 * yalnız konsola yazılıyordu; kullanıcı kaydedildiğini sanıp sekmeyi
 * kapatabiliyordu. Kayıt başarılı olunca kendiliğinden kaybolur.
 */
export function SyncErrorBanner() {
  const { syncError } = useProject();
  if (!syncError) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b px-5 py-2.5 text-[12.5px]"
      style={{ background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" }}
    >
      <span aria-hidden="true" className="font-bold">!</span>
      <span>{syncError}</span>
    </div>
  );
}
