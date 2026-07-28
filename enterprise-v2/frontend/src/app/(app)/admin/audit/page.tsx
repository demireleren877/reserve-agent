"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAuditEvents, type AuditEvent } from "@/lib/sync/worker-client";

type Detail = Record<string, unknown>;

const ACTION_LABELS: Record<string, string> = {
  triangle_loaded: "Triangle loaded", cell_toggled: "LDF cell changed",
  cell_excluded: "LDF cell excluded", cell_included: "LDF cell included",
  exclusions_replaced: "Exclusions updated", exclusions_cleared: "Exclusions cleared",
  set_window: "LDF window changed", set_method: "LDF method changed",
  premiums_updated: "Exposure updated", selected_lr_set: "Selected LR changed",
  basis_set: "Ultimate basis changed", correction_set: "Correction factor changed",
  curve_cdf_set: "Curve value changed", curve_choice_set: "Curve choice changed",
  version_created: "Model version created", version_renamed: "Model version renamed",
  version_deleted: "Model version deleted", branch_copied: "Model copied",
  assumptions_copied: "Assumptions copied",
  "api.put": "Application record updated", "api.post": "Application action executed",
  "api.patch": "Application record changed", "api.delete": "Application record deleted",
  "data.period_saved": "Valuation period saved", "data.period_deleted": "Valuation period deleted",
  "data.dataset_saved": "Dataset saved", "data.dataset_deleted": "Dataset deleted",
};

function detailsOf(event: AuditEvent): Detail { return event.details ?? {}; }
function moduleOf(event: AuditEvent): string { return String(detailsOf(event).module ?? "reserve"); }
function branchOf(event: AuditEvent): string { return String(detailsOf(event).branch_name ?? event.branch_name ?? "General action"); }
function humanModule(value: string): string {
  return ({ reserve: "Reserve", cashflow: "Cashflow", data: "Data", locks: "Model lock", users: "Users", agent: "Agent", state: "Project", system: "System" } as Record<string, string>)[value] ?? value;
}
function detailSummary(event: AuditEvent): string {
  const detail = detailsOf(event);
  const entries = Object.entries(detail).filter(([key]) => !["module", "branch_name", "path", "status"].includes(key));
  if (!entries.length) return "—";
  return entries.slice(0, 2).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(" · ");
}
function isUserInteraction(event: AuditEvent): boolean {
  // Eski generic API middleware kayıtları kullanıcı eylemiyle otomatik çağrıyı
  // ayırt edemiyordu. Yeni akış yalnızca anlamlı, isimlendirilmiş olaylar yazar.
  return !event.action.startsWith("api.");
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("all");
  const [source, setSource] = useState("all");

  useEffect(() => {
    fetchAuditEvents(500).then(setEvents).catch(() => setError("Audit records could not be loaded.")).finally(() => setLoading(false));
  }, []);

  const visibleEvents = useMemo(() => events.filter(isUserInteraction), [events]);
  const modules = useMemo(() => [...new Set(visibleEvents.map(moduleOf))].sort(), [visibleEvents]);
  const filtered = useMemo(() => visibleEvents.filter((event) => {
    const haystack = [event.actor, event.action, moduleOf(event), branchOf(event), detailSummary(event)].join(" ").toLocaleLowerCase("tr-TR");
    return (module === "all" || moduleOf(event) === module) && (source === "all" || event.source === source) && haystack.includes(query.toLocaleLowerCase("tr-TR"));
  }), [visibleEvents, module, source, query]);
  const summary = useMemo(() => ({
    users: new Set(visibleEvents.map((event) => event.actor)).size,
    agents: visibleEvents.filter((event) => event.source === "agent").length,
    changes: visibleEvents.filter((event) => !event.action.startsWith("api.")).length,
  }), [visibleEvents]);

  return <main className="mx-auto max-w-[1500px] px-6 py-7 lg:px-9">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--border)] pb-5">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[color:var(--primary)]"><span className="h-2 w-2 rounded-full bg-[color:var(--primary)]" />Audit workspace</div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Audit Log</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-strong)]">A chronological record of decisions, data changes, and authorized actions.</p>
      </div>
      <div className="text-right text-xs text-[color:var(--muted)]"><div>Last refreshed</div><div className="mt-0.5 font-medium text-[color:var(--muted-strong)]">{new Date().toLocaleString("en-GB")}</div></div>
    </header>

    <section className="mb-6 grid gap-0 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] sm:grid-cols-3">
      <Metric label="Reviewable events" value={visibleEvents.length} note="Last 500 records" />
      <Metric label="Active users" value={summary.users} note="Distinct session owners" />
      <Metric label="Model/agent actions" value={summary.changes + summary.agents} note="Detailed audit records" />
    </section>

    <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user, branch, action, or detail" className="input-base min-w-[240px] flex-1" aria-label="Search audit records" />
        <select value={module} onChange={(e) => setModule(e.target.value)} className="input-base w-auto" aria-label="Module filter"><option value="all">All modules</option>{modules.map((value) => <option key={value} value={value}>{humanModule(value)}</option>)}</select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="input-base w-auto" aria-label="Source filter"><option value="all">All sources</option><option value="user">User</option><option value="agent">Agent</option></select>
      </div>
      {error ? <div className="p-5 text-sm text-[color:var(--danger)]">{error}</div> : loading ? <div className="p-8 text-sm text-[color:var(--muted)]">Preparing records…</div> : filtered.length === 0 ? <div className="p-8 text-sm text-[color:var(--muted)]">No audit records match these filters.</div> :
        <div className="min-h-[520px] overflow-x-auto"><table className="w-full min-w-[1050px] table-fixed text-xs"><colgroup><col className="w-[170px]" /><col className="w-[140px]" /><col className="w-[130px]" /><col className="w-[180px]" /><col className="w-[240px]" /><col /></colgroup><thead className="bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]"><tr><Head>Time</Head><Head>Actor</Head><Head>Module</Head><Head>Branch / target</Head><Head>Action</Head><Head>Change summary</Head></tr></thead><tbody>{filtered.map((event) => <tr key={event.id} className="border-t border-[color:var(--border)] align-top hover:bg-[color:var(--surface-alt)]/60"><td className="whitespace-nowrap px-4 py-3 text-[color:var(--muted-strong)]">{event.timestamp ? new Date(event.timestamp).toLocaleString("en-GB") : "—"}</td><td className="px-4 py-3 font-medium">{event.actor}<div className="mt-1 text-[10px] text-[color:var(--muted)]">{event.source === "agent" ? "Via agent" : "Direct"}</div></td><td className="px-4 py-3"><ModuleBadge module={moduleOf(event)} /></td><td className="px-4 py-3 font-medium text-[color:var(--muted-strong)] break-words">{branchOf(event)}</td><td className="px-4 py-3 font-medium break-words">{ACTION_LABELS[event.action] ?? event.action}</td><td className="px-4 py-3 leading-relaxed text-[color:var(--muted-strong)] break-words">{detailSummary(event)}</td></tr>)}</tbody></table></div>}
      <div className="border-t border-[color:var(--border)] px-4 py-2 text-[11px] text-[color:var(--muted)]">Showing {filtered.length} records · Records are stored append-only on the server.</div>
    </section>
  </main>;
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) { return <div className="border-b border-[color:var(--border)] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="text-[11px] font-medium text-[color:var(--muted-strong)]">{label}</div><div className="mt-1 text-2xl font-semibold tabular">{value.toLocaleString("tr-TR")}</div><div className="mt-1 text-[11px] text-[color:var(--muted)]">{note}</div></div>; }
function Head({ children }: { children: ReactNode }) { return <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">{children}</th>; }
function ModuleBadge({ module }: { module: string }) { return <span className="inline-flex rounded-md bg-[color:var(--primary-soft)] px-2 py-1 text-[10px] font-semibold text-[color:var(--primary)]">{humanModule(module)}</span>; }
