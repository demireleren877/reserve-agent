"use client";

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";

/**
 * Tarayıcı sekmesi gibi açık modelleri (branşları) header'da gösterir.
 * Açık sekmeler localStorage'da tutulur; aktif branşa gidildikçe otomatik eklenir.
 * Tıklama → o branşı dönemiyle birlikte açar; × → sekmeyi kapatır (aktifse komşuya geçer).
 */

const LS_KEY = "reserve.openTabs.v1";
const keyOf = (periodId: string, branchId: string) => `${periodId}:${branchId}`;

function loadKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function ModelTabs() {
  const { project, activePeriod, activeBranch, actions } = useProject();
  // Statik export'ta sunucu render'ı boş; localStorage'ı mount sonrası oku (hydration uyumu).
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setOpenKeys(loadKeys());
    setHydrated(true);
  }, []);

  const activeKey =
    activePeriod && activeBranch ? keyOf(activePeriod.id, activeBranch.id) : null;

  const resolve = useCallback(
    (k: string) => {
      const [pid, bid] = k.split(":");
      const period = project.periods.find((p) => p.id === pid);
      const branch = period?.branches.find((b) => b.id === bid);
      if (!period || !branch) return null;
      return { key: k, periodId: pid, branchId: bid, periodLabel: period.label, name: branch.name };
    },
    [project.periods],
  );

  // Bayat anahtarları ele + aktif branşı sekmelere ekle (sonuna).
  useEffect(() => {
    setOpenKeys((prev) => {
      let next = prev.filter((k) => resolve(k));
      if (activeKey && !next.includes(activeKey)) next = [...next, activeKey];
      return next.length === prev.length && next.every((k, i) => k === prev[i]) ? prev : next;
    });
  }, [resolve, activeKey]);

  // Kalıcılık (hydration'dan önce yazma → localStorage'ı boşla ezmeyelim)
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(openKeys));
    } catch {
      /* yok say */
    }
  }, [openKeys, hydrated]);

  const tabs = openKeys.map(resolve).filter((t): t is NonNullable<ReturnType<typeof resolve>> => !!t);

  function closeTab(e: React.MouseEvent, key: string) {
    e.stopPropagation();
    const idx = openKeys.indexOf(key);
    const next = openKeys.filter((k) => k !== key);
    setOpenKeys(next);
    if (key === activeKey) {
      const neighborKey = next[idx] ?? next[idx - 1] ?? null;
      if (neighborKey) {
        const [pid, bid] = neighborKey.split(":");
        actions.openBranch(pid, bid);
      } else {
        actions.goRoot();
      }
    }
  }

  if (tabs.length === 0) return null;

  return (
    <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar px-1">
      {tabs.map((t) => {
        const on = t.key === activeKey;
        return (
          <div
            key={t.key}
            onClick={() => actions.openBranch(t.periodId, t.branchId)}
            title={`${t.periodLabel} / ${t.name}`}
            className={
              "group shrink-0 flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-md cursor-pointer border transition select-none " +
              (on
                ? "bg-[color:var(--surface)] border-[color:var(--border)] shadow-sm"
                : "bg-[color:var(--surface-alt)] border-transparent hover:bg-[color:var(--surface)] hover:border-[color:var(--border)]")
            }
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full shrink-0 " +
                (on ? "bg-[color:var(--primary)]" : "bg-[color:var(--muted)]/40")
              }
            />
            <span className="flex flex-col leading-none min-w-0">
              <span
                className={
                  "text-[11px] font-medium truncate max-w-[9rem] " +
                  (on ? "text-[color:var(--foreground)]" : "text-[color:var(--muted-strong)]")
                }
              >
                {t.name}
              </span>
              <span className="text-[9px] text-[color:var(--muted)] truncate max-w-[9rem]">
                {t.periodLabel}
              </span>
            </span>
            <button
              onClick={(e) => closeTab(e, t.key)}
              className="ml-0.5 h-4 w-4 shrink-0 grid place-items-center rounded text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)] opacity-60 group-hover:opacity-100 transition"
              title="Close tab"
              aria-label="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        onClick={() => actions.goRoot()}
        className="shrink-0 h-8 w-8 grid place-items-center rounded-md text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)] transition"
        title="Go to periods / open new model"
        aria-label="New model"
      >
        +
      </button>
    </div>
  );
}
