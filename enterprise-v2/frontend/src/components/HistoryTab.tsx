"use client";

import { useProject } from "@/lib/project-store";

const ACTION_LABELS: Record<string, string> = {
  branch_created: "Branch created",
  triangle_loaded: "Triangle loaded",
  set_method: "Method changed",
  set_window: "Window changed",
  cell_toggled: "Cell exclude/include",
  cell_excluded: "Cell excluded",
  cell_included: "Cell included",
  exclusions_replaced: "Exclusions updated",
  exclusions_cleared: "Exclusions cleared",
  premiums_updated: "Exposure updated",
  premiums_bulk: "Exposure (bulk)",
  selected_lr_set: "Selected LR changed",
  selected_lr_bulk: "Selected LR (bulk)",
  basis_set: "Basis changed",
  basis_bulk: "Basis (bulk)",
  correction_set: "Correction changed",
  correction_bulk: "Correction (bulk)",
  curve_cdf_set: "Curve User Value",
  curve_choice_set: "Curve selection",
  curve_choice_bulk: "Curve selection (bulk)",
  curve_seeded: "Curve seed",
  curve_reset: "Curve reset",
};

export function HistoryTab() {
  const { activeBranch, activePeriod } = useProject();

  if (!activeBranch || !activePeriod) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Select a period and branch first.
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
              {activeBranch.frequency === "yearly" ? "Yearly" : "Quarterly"} ·{" "}
              {entries.length} records
            </p>
          </div>
          <div className="text-[11px] text-[color:var(--muted)] tabular">
            Created: {fmt(activeBranch.createdAt)}
            <br />
            Last change: {fmt(activeBranch.updatedAt)}
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h3 className="text-sm font-semibold">Change Log</h3>
        </div>
        {entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-[color:var(--muted)]">
            No records yet.
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
                    Operator
                  </th>
                  <th className="text-left px-3 py-2 font-semibold w-[200px]">
                    Action
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
