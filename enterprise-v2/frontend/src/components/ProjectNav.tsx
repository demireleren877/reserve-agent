"use client";

import { useEffect, useRef, useState } from "react";
import { useProject } from "@/lib/project-store";
import type { Frequency } from "@/types/project";

interface BreadcrumbProps {
  onUploaded?: () => void;
}

export function Breadcrumb({ onUploaded: _onUploaded }: BreadcrumbProps) {
  const { project, navLevel, activePeriod, activeBranch, actions } =
    useProject();

  const freqLabel =
    project.activeFrequency === "yearly"
      ? "Yıllık"
      : project.activeFrequency === "quarterly"
      ? "Çeyreklik"
      : null;

  return (
    <div className="bg-[color:var(--surface)] border-b px-6 h-10 flex items-center gap-1 text-sm sticky top-14 z-30">
      <button
        onClick={actions.goRoot}
        className={
          "px-2 py-1 rounded-md transition flex items-center gap-1 " +
          (navLevel === "root"
            ? "font-semibold text-[color:var(--foreground)]"
            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]")
        }
      >
        <FolderIcon />
        Dönemler
      </button>
      {activePeriod && (
        <>
          <Sep />
          <button
            onClick={() => actions.goToPeriod(activePeriod.id)}
            className={
              "px-2 py-1 rounded-md transition " +
              (navLevel === "period"
                ? "font-semibold text-[color:var(--foreground)]"
                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]")
            }
          >
            {activePeriod.label}
          </button>
        </>
      )}
      {freqLabel && project.activeFrequency && (
        <>
          <Sep />
          <button
            onClick={() => actions.goToFrequency(project.activeFrequency as Frequency)}
            className={
              "px-2 py-1 rounded-md transition " +
              (navLevel === "frequency"
                ? "font-semibold text-[color:var(--foreground)]"
                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]")
            }
          >
            {freqLabel}
          </button>
        </>
      )}
      {activeBranch && (
        <>
          <Sep />
          <span className="px-2 py-1 font-semibold text-[color:var(--foreground)]">
            {activeBranch.name}
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {navLevel === "branch" && activeBranch && (
          <BranchLogsButton />
        )}
        {navLevel !== "root" && (
          <button
            onClick={actions.goUp}
            className="text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            title="Yukarı"
          >
            ↑ Yukarı
          </button>
        )}
      </div>
    </div>
  );
}

// —————————————————————— Logs button ——————————————————————

const ACTION_LABELS: Record<string, string> = {
  branch_created: "Branş oluşturuldu",
  triangle_loaded: "Üçgen yüklendi",
  set_method: "Metod değişti",
  set_window: "Window değişti",
  cell_toggled: "Hücre eleme/dahil",
  exclusions_replaced: "Elemeler güncellendi",
  exclusions_cleared: "Elemeler temizlendi",
  premiums_updated: "Exposure güncellendi",
  premiums_bulk: "Exposure (toplu)",
  selected_lr_set: "Selected LR değişti",
  selected_lr_bulk: "Selected LR (toplu)",
  basis_set: "Temel değişti",
  basis_bulk: "Temel (toplu)",
  correction_set: "Correction değişti",
  correction_bulk: "Correction (toplu)",
  curve_cdf_set: "Curve User Value",
  curve_choice_set: "Curve seçimi",
  curve_choice_bulk: "Curve seçimi (toplu)",
  curve_reset: "Curve sıfırlandı",
};

function BranchLogsButton() {
  const { activeBranch, activePeriod } = useProject();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Loglar"
        className={
          "p-1 rounded transition text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)] " +
          (open ? "text-[color:var(--primary)]" : "")
        }
      >
        <GearIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 card shadow-xl border z-[40] w-[520px] flex flex-col max-h-[420px]">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-[color:var(--surface-alt)]">
            <span className="text-xs font-semibold flex-1">Loglar</span>
            {activeBranch && (
              <span className="text-[10px] text-[color:var(--muted)]">
                {activePeriod?.label} / {activeBranch.name}
              </span>
            )}
          </div>
          {!activeBranch ? (
            <div className="p-6 text-center text-sm text-[color:var(--muted)]">Aktif branş yok.</div>
          ) : (() => {
            const entries = [...activeBranch.history].reverse();
            return entries.length === 0 ? (
              <div className="p-6 text-center text-sm text-[color:var(--muted)]">Henüz kayıt yok.</div>
            ) : (
              <div className="overflow-y-auto overflow-x-auto flex-1">
                <table className="text-[11px] w-full tabular">
                  <thead className="sticky top-0 bg-[color:var(--surface-alt)] z-10">
                    <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)]">
                      <th className="text-left px-3 py-1.5 font-semibold">Zaman</th>
                      <th className="text-left px-3 py-1.5 font-semibold">Op.</th>
                      <th className="text-left px-3 py-1.5 font-semibold">İşlem</th>
                      <th className="text-left px-3 py-1.5 font-semibold">Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                        <td className="px-3 py-1 text-[color:var(--muted-strong)] whitespace-nowrap">
                          {new Date(e.timestamp).toLocaleString("tr-TR")}
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap">
                          {e.source === "agent"
                            ? <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-[color:var(--primary-soft)] text-[color:var(--primary)]">Agent</span>
                            : <span className="text-[color:var(--muted)] text-[10px]">Sen</span>}
                        </td>
                        <td className="px-3 py-1 font-medium whitespace-nowrap">{ACTION_LABELS[e.action] ?? e.action}</td>
                        <td className="px-3 py-1 text-[color:var(--muted-strong)] font-mono truncate max-w-[160px]">
                          {e.details ? Object.entries(e.details).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" · ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <span className="text-[color:var(--muted)] px-0.5">/</span>;
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
