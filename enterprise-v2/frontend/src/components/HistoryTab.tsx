"use client";

import { useProject } from "@/lib/project-store";

const ACTION_LABELS: Record<string, string> = {
  branch_created: "Branş oluşturuldu",
  triangle_loaded: "Üçgen yüklendi",
  set_method: "Metod değişti",
  set_window: "Window değişti",
  cell_toggled: "Hücre eleme/dahil",
  cell_excluded: "Hücre elendi",
  cell_included: "Hücre dahil edildi",
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
  curve_seeded: "Curve seed",
  curve_reset: "Curve sıfırlandı",
};

export function HistoryTab() {
  const { activeBranch, activePeriod } = useProject();

  if (!activeBranch || !activePeriod) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Önce bir dönem ve branş seçin.
      </div>
    );
  }

  const entries = [...activeBranch.history].reverse();

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              {activePeriod.label} / {activeBranch.name}
            </h2>
            <p className="text-xs text-[color:var(--muted)] mt-0.5">
              {activeBranch.frequency === "yearly" ? "Yıllık" : "Çeyreklik"} ·{" "}
              {entries.length} kayıt
            </p>
          </div>
          <div className="text-[11px] text-[color:var(--muted)] tabular">
            Oluşturma: {fmt(activeBranch.createdAt)}
            <br />
            Son değişim: {fmt(activeBranch.updatedAt)}
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h3 className="text-sm font-semibold">Değişiklik Kaydı</h3>
        </div>
        {entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-[color:var(--muted)]">
            Henüz kayıt yok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular">
              <thead>
                <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--background)]">
                  <th className="text-left px-3 py-2 font-semibold w-[160px]">
                    Zaman
                  </th>
                  <th className="text-left px-3 py-2 font-semibold w-[80px]">
                    Operatör
                  </th>
                  <th className="text-left px-3 py-2 font-semibold w-[200px]">
                    İşlem
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">Detay</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t hover:bg-[color:var(--surface-alt)]/40"
                  >
                    <td className="px-3 py-1.5 text-[color:var(--muted-strong)] text-xs tabular">
                      {fmt(e.timestamp)}
                    </td>
                    <td className="px-3 py-1.5">
                      <SourceBadge source={e.source} />
                    </td>
                    <td className="px-3 py-1.5 font-medium">
                      {ACTION_LABELS[e.action] ?? e.action}
                    </td>
                    <td className="px-3 py-1.5 text-[color:var(--muted-strong)] text-xs font-mono truncate max-w-[500px]">
                      {formatDetails(e.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source?: "user" | "agent" }) {
  if (source === "agent") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--primary-soft)] text-[color:var(--primary)] border border-[color:var(--primary-border)]">
        Agent
      </span>
    );
  }
  if (source === "user") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]">
        Sen
      </span>
    );
  }
  return <span className="text-[color:var(--muted)] text-[10px]">—</span>;
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

function formatDetails(details?: Record<string, unknown>): string {
  if (!details) return "—";
  const keys = Object.keys(details);
  if (keys.length === 0) return "—";
  return keys.map((k) => `${k}=${JSON.stringify(details[k])}`).join(" · ");
}
