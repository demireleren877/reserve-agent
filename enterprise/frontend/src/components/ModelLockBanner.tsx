"use client";

import type { LockState } from "@/lib/use-model-lock";

export function ModelLockBanner({ state }: { state: LockState }) {
  if (state.status !== "locked_by_other") return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium"
      style={{
        background: "#fffbeb",
        borderBottom: "1px solid #f59e0b44",
        color: "#92400e",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>
        <strong>{state.lockedByName ?? "Başka bir kullanıcı"}</strong> bu modeli düzenliyor — şu an salt okunur moddesiniz.
      </span>
    </div>
  );
}
