"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";
import type { Branch, Period } from "@/types/project";

/** Sidebar'ın modüle özgü seçim + açma davranışı (reserve store-active, cashflow lokal-nav). */
export interface SidebarNav {
  selectedPeriodId: string | null;
  selectedBranchId: string | null;
  selectedVersionId: string | null;
  /** Bir model (versiyon) açık mı — aktif versiyon vurgusu için. */
  branchActive: boolean;
  /** Versiyona tıklanınca: dönem+branş+versiyonu aç (modüle özgü). */
  onOpen: (periodId: string, branchId: string, versionId: string) => void;
  /** Yalnız belirli branşları göster (ör. cashflow: paid üçgeni olanlar). */
  branchFilter?: (b: Branch) => boolean;
  /** Yeni branş oluşturunca frekans (varsayılan yearly). */
  defaultFrequency?: "yearly" | "quarterly";
}

/**
 * Kalıcı sol navigasyon ağacı: Dönem ▸ Branş ▸ Versiyon.
 * Reserve ve Cashflow modüllerinde ortak. Branş = VERİ kabı; bir branşta birden çok
 * senaryo (versiyon) yaşayabilir, hepsi aynı veriyi paylaşır.
 */
export function ProjectSidebar({ nav }: { nav: SidebarNav }) {
  const { project, actions } = useProject();
  const [collapsed, setCollapsed] = useState(false);
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(new Set());
  const [openBranches, setOpenBranches] = useState<Set<string>>(new Set());

  // Aktif yolu otomatik aç
  useEffect(() => {
    if (nav.selectedPeriodId) setOpenPeriods((s) => (s.has(nav.selectedPeriodId!) ? s : new Set(s).add(nav.selectedPeriodId!)));
    if (nav.selectedBranchId) setOpenBranches((s) => (s.has(nav.selectedBranchId!) ? s : new Set(s).add(nav.selectedBranchId!)));
  }, [nav.selectedPeriodId, nav.selectedBranchId]);

  if (collapsed) {
    return (
      <aside className="w-9 shrink-0 border-r bg-[color:var(--surface)] flex flex-col items-center py-2">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand navigation"
          className="p-1.5 rounded text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]"
        >
          <Chevron dir="right" />
        </button>
      </aside>
    );
  }

  const filter = nav.branchFilter ?? (() => true);

  return (
    <aside className="w-64 shrink-0 border-r bg-[color:var(--surface)] flex flex-col h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="h-9 px-3 flex items-center gap-2 border-b shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-strong)] flex-1">
          Models
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse"
          className="p-1 rounded text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]"
        >
          <Chevron dir="left" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {project.periods.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-[color:var(--muted)]">No periods yet.</div>
        )}
        {project.periods.map((period) => {
          const branches = period.branches.filter(filter);
          return (
            <PeriodNode
              key={period.id}
              period={period}
              branches={branches}
              nav={nav}
              open={openPeriods.has(period.id)}
              onToggle={() => toggle(setOpenPeriods, period.id)}
              openBranches={openBranches}
              toggleBranch={(id) => toggle(setOpenBranches, id)}
            />
          );
        })}
        <AddPeriodRow onAdd={(label) => actions.createPeriod(label)} />
      </div>
    </aside>
  );
}

function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
  setter((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
}

function PeriodNode({
  period, branches, nav, open, onToggle, openBranches, toggleBranch,
}: {
  period: Period;
  branches: Branch[];
  nav: SidebarNav;
  open: boolean;
  onToggle: () => void;
  openBranches: Set<string>;
  toggleBranch: (id: string) => void;
}) {
  const { actions } = useProject();
  const [adding, setAdding] = useState(false);
  const isActive = nav.selectedPeriodId === period.id && !nav.branchActive;

  return (
    <div>
      <Row
        depth={0}
        active={isActive}
        onClick={onToggle}
        caret={<Caret open={open} />}
        label={period.label}
        badge={`${branches.length}`}
        onDelete={() => { if (confirm(`Delete period "${period.label}"?`)) actions.deletePeriod(period.id); }}
      />
      {open && (
        <div>
          {branches.map((b) => (
            <BranchNode
              key={b.id}
              period={period}
              branch={b}
              nav={nav}
              open={openBranches.has(b.id)}
              onToggle={() => toggleBranch(b.id)}
            />
          ))}
          {adding ? (
            <InlineInput
              depth={1}
              placeholder="Branch name"
              onCommit={(v) => { actions.createBranch(period.id, nav.defaultFrequency ?? "yearly", v); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <AddRow depth={1} label="Branch" onClick={() => setAdding(true)} />
          )}
        </div>
      )}
    </div>
  );
}

function BranchNode({
  period, branch, nav, open, onToggle,
}: {
  period: Period;
  branch: Branch;
  nav: SidebarNav;
  open: boolean;
  onToggle: () => void;
}) {
  const { actions } = useProject();
  const [adding, setAdding] = useState(false);
  const isActive = nav.branchActive && nav.selectedBranchId === branch.id;
  const versions = branch.versions ?? [];
  const hasData = !!(branch.triangle || branch.paidTriangle || branch.incurredTriangle);

  return (
    <div>
      <Row
        depth={1}
        onClick={onToggle}
        caret={<Caret open={open} />}
        dot={hasData ? "ok" : "empty"}
        label={branch.name}
        badge={branch.frequency === "yearly" ? "Y" : "Q"}
        emphasize={isActive}
        onDelete={() => { if (confirm(`Delete branch "${branch.name}"?`)) actions.deleteBranch(branch.id); }}
      />
      {open && (
        <div>
          {versions.map((v) => (
            <VersionRow key={v.id} period={period} branch={branch} versionId={v.id} name={v.name} nav={nav} versionCount={versions.length} />
          ))}
          {adding ? (
            <InlineInput
              depth={2}
              placeholder="Version name"
              onCommit={(name) => {
                const vid = actions.createVersion(period.id, branch.id, name);
                nav.onOpen(period.id, branch.id, vid);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <AddRow depth={2} label="Version" onClick={() => setAdding(true)} />
          )}
        </div>
      )}
    </div>
  );
}

function VersionRow({
  period, branch, versionId, name, nav, versionCount,
}: {
  period: Period; branch: Branch; versionId: string; name: string; nav: SidebarNav; versionCount: number;
}) {
  const { actions } = useProject();
  const [editing, setEditing] = useState(false);
  const isActive = nav.branchActive && nav.selectedBranchId === branch.id && nav.selectedVersionId === versionId;

  if (editing) {
    return (
      <InlineInput
        depth={2}
        initial={name}
        placeholder="Version name"
        onCommit={(v) => { actions.renameVersion(period.id, branch.id, versionId, v); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      onClick={() => nav.onOpen(period.id, branch.id, versionId)}
      onDoubleClick={() => setEditing(true)}
      className={
        "group flex items-center gap-1.5 pr-2 h-7 cursor-pointer text-[12px] " +
        (isActive
          ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)] font-medium"
          : "text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)]")
      }
      style={{ paddingLeft: 2 * 14 + 20 }}
    >
      <VersionIcon />
      <span className="flex-1 truncate">{name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="Rename"
        className="opacity-0 group-hover:opacity-100 text-[10px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
      >
        ✎
      </button>
      {versionCount > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete version "${name}"?`)) actions.deleteVersion(period.id, branch.id, versionId); }}
          title="Delete version"
          className="opacity-0 group-hover:opacity-100 text-[11px] text-[color:var(--muted)] hover:text-[color:var(--danger)]"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Satır primitifleri ────────────────────────────────────────────────────────

function Row({
  depth, active, emphasize, onClick, caret, dot, label, badge, onDelete,
}: {
  depth: number;
  active?: boolean;
  emphasize?: boolean;
  onClick: () => void;
  caret?: React.ReactNode;
  dot?: "ok" | "empty";
  label: string;
  badge?: string;
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={
        "group flex items-center gap-1 pr-2 h-7 cursor-pointer text-[12.5px] " +
        (active ? "bg-[color:var(--surface-alt)] " : "hover:bg-[color:var(--surface-alt)] ") +
        (emphasize ? "text-[color:var(--primary)] font-semibold" : "text-[color:var(--foreground)]")
      }
      style={{ paddingLeft: depth * 14 + 4 }}
    >
      <span className="w-4 grid place-items-center text-[color:var(--muted)]">{caret}</span>
      {dot && (
        <span
          className={"h-1.5 w-1.5 rounded-full shrink-0 " + (dot === "ok" ? "bg-[color:var(--success)]" : "bg-[color:var(--border)]")}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="text-[9px] font-semibold px-1 rounded bg-[color:var(--surface-alt)] text-[color:var(--muted)] tabular">
          {badge}
        </span>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-[11px] text-[color:var(--muted)] hover:text-[color:var(--danger)]"
          title="Delete"
        >
          ×
        </button>
      )}
    </div>
  );
}

function AddRow({ depth, label, onClick }: { depth: number; label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-1 h-6 cursor-pointer text-[11px] text-[color:var(--muted)] hover:text-[color:var(--primary)]"
      style={{ paddingLeft: depth * 14 + 24 }}
    >
      ＋ {label}
    </div>
  );
}

function AddPeriodRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <InlineInput
        depth={0}
        placeholder="2026Q1"
        validate={(v) => (/^\d{4}Q[1-4]$/.test(v) ? null : "Format: 2026Q1")}
        onCommit={(v) => { onAdd(v); setAdding(false); }}
        onCancel={() => setAdding(false)}
      />
    );
  }
  return (
    <div
      onClick={() => setAdding(true)}
      className="flex items-center gap-1 h-7 mt-1 cursor-pointer text-[11.5px] text-[color:var(--muted)] hover:text-[color:var(--primary)]"
      style={{ paddingLeft: 8 }}
    >
      ＋ New period
    </div>
  );
}

function InlineInput({
  depth, placeholder, initial, validate, onCommit, onCancel,
}: {
  depth: number;
  placeholder: string;
  initial?: string;
  validate?: (v: string) => string | null;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const err = validate && value.trim() ? validate(value.trim()) : null;
  return (
    <div style={{ paddingLeft: depth * 14 + 20, paddingRight: 8 }} className="py-0.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onBlur={() => { const v = value.trim(); if (v && !err) onCommit(v); else onCancel(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { const v = value.trim(); if (v && !err) onCommit(v); }
          else if (e.key === "Escape") onCancel();
        }}
        className="w-full text-[12px] px-1.5 py-0.5 rounded border bg-[color:var(--surface)] text-[color:var(--foreground)]"
        style={err ? { borderColor: "var(--danger)" } : { borderColor: "var(--primary)" }}
      />
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return <Chevron dir={open ? "down" : "right"} size={10} />;
}

function Chevron({ dir, size = 12 }: { dir: "right" | "down" | "left"; size?: number }) {
  const rot = dir === "down" ? 90 : dir === "left" ? 180 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)`, transition: "transform .12s" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function VersionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}
