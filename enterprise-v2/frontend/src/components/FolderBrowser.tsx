"use client";

import { useState } from "react";
import Link from "next/link";
import { useProject } from "@/lib/project-store";
import type { CopyAssumptionsOptions } from "@/lib/project-store";
import type { Branch, Frequency, Period } from "@/types/project";
import { CopyAssumptionsModal } from "@/components/CopyAssumptionsModal";


// ——————————————————————— Copy / Move Modal ———————————————————————

function CopyMoveModal({
  branch,
  mode,
  periods,
  currentPeriodId,
  onConfirm,
  onCancel,
}: {
  branch: Branch;
  mode: "copy" | "move";
  periods: Period[];
  currentPeriodId: string;
  onConfirm: (targetPeriodId: string, newName: string, targetFrequency: Frequency) => void;
  onCancel: () => void;
}) {
  const [targetId, setTargetId] = useState(currentPeriodId);
  const [targetFreq, setTargetFreq] = useState<Frequency>(branch.frequency);
  const [name, setName] = useState(
    mode === "copy" ? `${branch.name} (kopya)` : branch.name,
  );

  const isSameLocation =
    mode === "move" && targetId === currentPeriodId && targetFreq === branch.frequency;
  const canConfirm = name.trim() && targetId && !isSameLocation;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="card p-6 w-full max-w-sm mx-4 shadow-2xl space-y-5">
        <div>
          <div className="text-sm font-semibold">
            {mode === "copy" ? "Copy Branch" : "Move Branch"}
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            {branch.name} · {branch.frequency === "yearly" ? "Yearly" : "Quarterly"}
          </div>
        </div>

        {mode === "copy" && (
          <div className="space-y-1.5">
            <div className="label">Yeni isim</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) onConfirm(targetId, name.trim(), targetFreq);
                else if (e.key === "Escape") onCancel();
              }}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="label">Model type</div>
          <div className="grid grid-cols-2 gap-2">
            {(["yearly", "quarterly"] as Frequency[]).map((f) => (
              <button
                key={f}
                onClick={() => setTargetFreq(f)}
                className={
                  "py-2 rounded-md border text-xs font-medium transition " +
                  (targetFreq === f
                    ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                    : "border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]")
                }
              >
                {f === "yearly" ? "Yearly" : "Quarterly"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="label">Target period</div>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {periods.map((p) => (
              <label
                key={p.id}
                className={
                  "flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer text-sm transition " +
                  (p.id === targetId
                    ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)]"
                    : "border-transparent hover:bg-[color:var(--surface-alt)]")
                }
              >
                <input
                  type="radio"
                  name="target-period"
                  value={p.id}
                  checked={p.id === targetId}
                  onChange={() => setTargetId(p.id)}
                  className="accent-[color:var(--primary)]"
                />
                {p.label}
                {p.id === currentPeriodId && (
                  <span className="text-[10px] text-[color:var(--muted)] ml-auto">mevcut</span>
                )}
              </label>
            ))}
          </div>
        </div>

        {isSameLocation && (
          <div className="text-xs text-[color:var(--warning)] bg-[color:var(--accent-cell)] border border-[color:var(--border)] rounded-md px-3 py-2">
            Source and target are the same — pick a different period or model type.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { if (canConfirm) onConfirm(targetId, name.trim(), targetFreq); }}
            disabled={!canConfirm}
            className="btn btn-primary flex-1"
          >
            {mode === "copy" ? "Copy" : "Move"}
          </button>
          <button onClick={onCancel} className="btn flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function FolderBrowser() {
  const { navLevel, canUndo, actions } = useProject();
  return (
    <div>
      {canUndo && (
        <div className="flex justify-end mb-3">
          <button
            onClick={actions.undo}
            className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-2.5 py-1 transition hover:bg-[color:var(--surface-alt)]"
            title="Geri al (Cmd+Z)"
          >
            ↩ Geri al
          </button>
        </div>
      )}
      {navLevel === "root" && <RootView />}
      {navLevel === "period" && <PeriodView />}
      {navLevel === "frequency" && <FrequencyView />}
    </div>
  );
}

function RootView() {
  const { project, actions } = useProject();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const atLimit = false;

  return (
    <div className="max-w-6xl mx-auto">
      <HeaderRow
        title="Periods"
        subtitle="Reporting periods. Each period contains yearly and quarterly models."
        count={project.periods.length}
      />
      <Grid>
        {project.periods.map((p) => (
          <PeriodTile
            key={p.id}
            period={p}
            onOpen={() => actions.goToPeriod(p.id)}
            onDelete={() => {
              if (confirm(`Delete period "${p.label}"?`))
                actions.deletePeriod(p.id);
            }}
          />
        ))}
        {adding ? (
          <InlineAdd
            placeholder="2025Q1"
            validate={(v) => /^\d{4}Q[1-4]$/.test(v) ? null : "Format: 2025Q1 (year + Q + quarter)"}
            onCancel={() => {
              setAdding(false);
              setLabel("");
            }}
            onCommit={() => {
              const v = label.trim();
              if (v && /^\d{4}Q[1-4]$/.test(v)) {
                actions.createPeriod(v);
                setLabel("");
                setAdding(false);
              }
            }}
            value={label}
            onChange={setLabel}
          />
        ) : atLimit ? (
          <UpgradeTile message="On the Free plan you can create 1 period." />
        ) : (
          <AddTile label="+ New Period" onClick={() => setAdding(true)} />
        )}
      </Grid>
    </div>
  );
}

function PeriodView() {
  const { project, activePeriod, actions } = useProject();
  if (!activePeriod) return null;

  const yearlyCount = activePeriod.branches.filter(
    (b) => b.frequency === "yearly",
  ).length;
  const quarterlyCount = activePeriod.branches.filter(
    (b) => b.frequency === "quarterly",
  ).length;

  return (
    <div className="max-w-4xl mx-auto">
      <HeaderRow
        title={activePeriod.label}
        subtitle="Select a model category."
      />
      <Grid cols={2}>
        <FreqTile
          title="Yearly Models"
          count={yearlyCount}
          onClick={() => actions.goToFrequency("yearly")}
          accent="primary"
        />
        <FreqTile
          title="Quarterly Models"
          count={quarterlyCount}
          onClick={() => actions.goToFrequency("quarterly")}
          accent="success"
        />
      </Grid>

      <div className="mt-6 flex items-center gap-3 text-xs text-[color:var(--muted)]">
        <span>{activePeriod.branches.length} branches total</span>
        <span>·</span>
        <span>
          Created:{" "}
          {new Date(activePeriod.createdAt).toLocaleDateString("tr-TR")}
        </span>
        <button
          onClick={() => {
            if (confirm(`Delete period "${activePeriod.label}"?`))
              actions.deletePeriod(activePeriod.id);
          }}
          className="ml-auto hover:text-[color:var(--danger)]"
        >
          Delete period
        </button>
      </div>
      <div className="text-[10px] text-[color:var(--muted)] mt-2">
        {project.periods.length === 1
          ? ""
          : "For a different period, go back to Periods from the breadcrumb."}
      </div>
    </div>
  );
}

function FrequencyView() {
  const { activePeriod, project, branchesForActiveFrequency, actions } =
    useProject();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const atBranchLimit = false;
  const [modal, setModal] = useState<{
    branch: Branch;
    mode: "copy" | "move";
  } | null>(null);
  const [copyAssumptionsSource, setCopyAssumptionsSource] = useState<Branch | null>(null);

  if (!activePeriod || !project.activeFrequency) return null;
  const freqLabel =
    project.activeFrequency === "yearly" ? "Yearly" : "Quarterly";

  return (
    <div className="max-w-6xl mx-auto">
      <HeaderRow
        title={`${freqLabel} — ${activePeriod.label}`}
        subtitle="Select a branch or create a new one."
        count={branchesForActiveFrequency.length}
      />
      <Grid>
        {branchesForActiveFrequency.map((b) => (
          <BranchTile
            key={b.id}
            branch={b}
            onOpen={() => actions.goToBranch(b.id)}
            onDelete={() => {
              if (confirm(`Delete branch "${b.name}"?`))
                actions.deleteBranch(b.id);
            }}
            onCopy={() => setModal({ branch: b, mode: "copy" })}
            onMove={() => setModal({ branch: b, mode: "move" })}
            onCopyAssumptions={() => setCopyAssumptionsSource(b)}
          />
        ))}
        {adding ? (
          <InlineAdd
            placeholder="e.g. Motor"
            value={name}
            onChange={setName}
            onCancel={() => {
              setAdding(false);
              setName("");
            }}
            onCommit={() => {
              if (name.trim() && activePeriod && project.activeFrequency) {
                actions.createBranch(
                  activePeriod.id,
                  project.activeFrequency,
                  name.trim(),
                );
                setName("");
                setAdding(false);
              }
            }}
          />
        ) : atBranchLimit ? (
          <UpgradeTile message="On the Free plan you can create 1 model." />
        ) : (
          <AddTile label="+ New Branch" onClick={() => setAdding(true)} />
        )}
      </Grid>

      {modal && (
        <CopyMoveModal
          branch={modal.branch}
          mode={modal.mode}
          periods={project.periods}
          currentPeriodId={activePeriod.id}
          onCancel={() => setModal(null)}
          onConfirm={(targetPeriodId, newName, targetFrequency) => {
            if (modal.mode === "copy") {
              actions.copyBranch(modal.branch.id, targetPeriodId, newName, targetFrequency);
            } else {
              actions.moveBranch(modal.branch.id, targetPeriodId, targetFrequency);
            }
            setModal(null);
          }}
        />
      )}

      {copyAssumptionsSource && (
        <CopyAssumptionsModal
          sourceBranch={copyAssumptionsSource}
          allPeriods={project.periods}
          onCancel={() => setCopyAssumptionsSource(null)}
          onConfirm={(targetBranchId: string, opts: CopyAssumptionsOptions) => {
            actions.copyAssumptions(copyAssumptionsSource.id, targetBranchId, opts);
            setCopyAssumptionsSource(null);
          }}
        />
      )}
    </div>
  );
}

// ——————————————————————— Tiles ———————————————————————

function HeaderRow({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle?: string;
  count?: number;
}) {
  return (
    <div className="flex items-baseline justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-[color:var(--muted)] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {count !== undefined && (
        <span className="text-xs text-[color:var(--muted)] tabular">
          {count} adet
        </span>
      )}
    </div>
  );
}

function Grid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const cls =
    cols === 2
      ? "grid-cols-1 md:grid-cols-2"
      : cols === 4
      ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid ${cls} gap-4`}>{children}</div>;
}

function PeriodTile({
  period,
  onOpen,
  onDelete,
}: {
  period: Period;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const total = period.branches.length;
  const yearly = period.branches.filter((b) => b.frequency === "yearly").length;
  const quarterly = period.branches.filter((b) => b.frequency === "quarterly").length;

  return (
    <div
      onClick={onOpen}
      className="group card p-5 cursor-pointer transition hover:border-[color:var(--primary)] hover:shadow-md flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-lg bg-[color:var(--primary-soft)] text-[color:var(--primary)] grid place-items-center">
          <FolderLg />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-xs text-[color:var(--muted)] hover:text-[color:var(--danger)] transition"
        >
          Sil
        </button>
      </div>
      <div>
        <div className="text-base font-semibold">{period.label}</div>
        <div className="text-xs text-[color:var(--muted)] mt-1 tabular">
          {total} branches · {yearly} yearly · {quarterly} quarterly
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--muted)] tabular">
        Created: {new Date(period.createdAt).toLocaleDateString("en-GB")}
      </div>
    </div>
  );
}

function FreqTile({
  title,
  count,
  onClick,
  accent,
}: {
  title: string;
  count: number;
  onClick: () => void;
  accent: "primary" | "success";
}) {
  const accentCls =
    accent === "primary"
      ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
      : "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  return (
    <div
      onClick={onClick}
      className="group card p-6 cursor-pointer transition hover:border-[color:var(--primary)] hover:shadow-md flex items-center gap-4"
    >
      <div
        className={"h-14 w-14 rounded-xl grid place-items-center " + accentCls}
      >
        <FolderLg />
      </div>
      <div className="flex-1">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-xs text-[color:var(--muted)] mt-0.5">
          {count} branches
        </div>
      </div>
      <div className="text-[color:var(--muted)] group-hover:text-[color:var(--primary)] transition">
        →
      </div>
    </div>
  );
}

function BranchTile({
  branch,
  onOpen,
  onDelete,
  onCopy,
  onMove,
  onCopyAssumptions,
}: {
  branch: Branch;
  onOpen: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onMove?: () => void;
  onCopyAssumptions?: () => void;
}) {
  const hasData = !!branch.triangle;
  const nOrigins = branch.triangle?.origin_periods.length ?? 0;

  return (
    <div
      onClick={onOpen}
      className="group card p-5 cursor-pointer transition hover:border-[color:var(--primary)] hover:shadow-md flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div
          className={
            "h-10 w-10 rounded-lg grid place-items-center " +
            (hasData
              ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
              : "bg-[color:var(--surface-alt)] text-[color:var(--muted)]")
          }
        >
          <FolderLg />
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition">
          {onCopy && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopy(); }}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--primary)] transition"
              title="Kopyala"
            >
              Kopyala
            </button>
          )}
          {onMove && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove(); }}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--primary)] transition"
              title="Move"
            >
              Move
            </button>
          )}
          {onCopyAssumptions && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopyAssumptions(); }}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--primary)] transition"
              title="Copy assumptions"
            >
              Aktar
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-[color:var(--muted)] hover:text-[color:var(--danger)] transition"
          >
            Sil
          </button>
        </div>
      </div>
      <div>
        <div className="text-base font-semibold">{branch.name}</div>
        <div className="text-xs text-[color:var(--muted)] mt-1 flex items-center gap-2">
          {hasData ? (
            <>
              <Pill ok>veri var</Pill>
              <span className="tabular">{nOrigins} origin</span>
            </>
          ) : (
            <Pill>veri yok</Pill>
          )}
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--muted)] tabular">
        {branch.history.length} records · {timeAgo(branch.updatedAt)}
      </div>
    </div>
  );
}

function UpgradeTile({ message }: { message: string }) {
  return (
    <div className="card p-5 border-dashed flex flex-col items-center justify-center min-h-[140px] gap-3 text-center">
      <div className="text-[12px] text-[color:var(--muted)] leading-relaxed max-w-[180px]">
        {message}
      </div>
      <Link
        href="/onboarding/plan"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold"
        style={{
          background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
          color: "#fff",
        }}
      >
        ✦ Go Pro
      </Link>
    </div>
  );
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group card p-5 border-dashed cursor-pointer transition hover:border-[color:var(--primary)] hover:bg-[color:var(--primary-soft)]/30 flex items-center justify-center min-h-[140px] text-sm text-[color:var(--muted)] hover:text-[color:var(--primary)]"
    >
      {label}
    </div>
  );
}

function InlineAdd({
  placeholder,
  value,
  onChange,
  onCommit,
  onCancel,
  validate,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  validate?: (v: string) => string | null;
}) {
  const [touched, setTouched] = useState(false);
  const error = validate && touched && value.trim() ? validate(value.trim()) : null;
  const isInvalid = validate ? validate(value.trim()) !== null : false;

  return (
    <div className="card p-5 flex flex-col gap-3 border-dashed border-[color:var(--primary)] bg-[color:var(--primary-soft)]/30">
      <div className="space-y-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => { onChange(e.target.value); setTouched(true); }}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isInvalid) onCommit();
            else if (e.key === "Escape") onCancel();
          }}
          className="input-base w-full"
          style={error ? { borderColor: "var(--danger)" } : undefined}
        />
        {error && (
          <div className="text-[10.5px]" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onCommit} disabled={isInvalid} className="btn btn-primary text-xs flex-1 disabled:opacity-40">
          Create
        </button>
        <button onClick={onCancel} className="btn text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Pill({
  children,
  ok,
}: {
  children: React.ReactNode;
  ok?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium " +
        (ok
          ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
          : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
      }
    >
      {children}
    </span>
  );
}

function FolderLg() {
  return (
    <svg
      width="22"
      height="22"
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

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const days = Math.floor(h / 24);
    return `${days} days ago`;
  } catch {
    return "";
  }
}
