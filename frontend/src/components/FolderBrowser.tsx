"use client";

import { useState } from "react";
import Link from "next/link";
import { useProject } from "@/lib/project-store";
import type { CopyAssumptionsOptions } from "@/lib/project-store";
import type { Branch, Frequency, Period } from "@/types/project";
import { CopyAssumptionsModal } from "@/components/CopyAssumptionsModal";
import { useUserPlan } from "@/lib/auth/user-plan-context";

const FREE_PERIOD_LIMIT = 1;
const FREE_BRANCH_LIMIT = 1;

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
            {mode === "copy" ? "Branşı Kopyala" : "Branşı Taşı"}
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            {branch.name} · {branch.frequency === "yearly" ? "Yıllık" : "Çeyreklik"}
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
          <div className="label">Model türü</div>
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
                {f === "yearly" ? "Yıllık" : "Çeyreklik"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="label">Hedef dönem</div>
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
            Kaynak ve hedef aynı — farklı bir dönem veya model türü seçin.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { if (canConfirm) onConfirm(targetId, name.trim(), targetFreq); }}
            disabled={!canConfirm}
            className="btn btn-primary flex-1"
          >
            {mode === "copy" ? "Kopyala" : "Taşı"}
          </button>
          <button onClick={onCancel} className="btn flex-1">İptal</button>
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
  const plan = useUserPlan();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const atLimit = plan === "free" && project.periods.length >= FREE_PERIOD_LIMIT;

  return (
    <div className="max-w-6xl mx-auto">
      <HeaderRow
        title="Dönemler"
        subtitle="Rapor dönemleri. Her dönem altında yıllık ve çeyreklik modeller yer alır."
        count={project.periods.length}
      />
      <Grid>
        {project.periods.map((p) => (
          <PeriodTile
            key={p.id}
            period={p}
            onOpen={() => actions.goToPeriod(p.id)}
            onDelete={() => {
              if (confirm(`"${p.label}" dönemi silinsin mi?`))
                actions.deletePeriod(p.id);
            }}
          />
        ))}
        {adding ? (
          <InlineAdd
            placeholder="örn. 2026 Q1"
            onCancel={() => {
              setAdding(false);
              setLabel("");
            }}
            onCommit={() => {
              if (label.trim()) {
                actions.createPeriod(label.trim());
                setLabel("");
                setAdding(false);
              }
            }}
            value={label}
            onChange={setLabel}
          />
        ) : atLimit ? (
          <UpgradeTile message="Free planda 1 dönem oluşturabilirsin." />
        ) : (
          <AddTile label="+ Yeni Dönem" onClick={() => setAdding(true)} />
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
        subtitle="Model kategorisini seçin."
      />
      <Grid cols={2}>
        <FreqTile
          title="Yıllık Modeller"
          count={yearlyCount}
          onClick={() => actions.goToFrequency("yearly")}
          accent="primary"
        />
        <FreqTile
          title="Çeyreklik Modeller"
          count={quarterlyCount}
          onClick={() => actions.goToFrequency("quarterly")}
          accent="success"
        />
      </Grid>

      <div className="mt-6 flex items-center gap-3 text-xs text-[color:var(--muted)]">
        <span>{activePeriod.branches.length} toplam branş</span>
        <span>·</span>
        <span>
          Oluşturma:{" "}
          {new Date(activePeriod.createdAt).toLocaleDateString("tr-TR")}
        </span>
        <button
          onClick={() => {
            if (confirm(`"${activePeriod.label}" dönemi silinsin mi?`))
              actions.deletePeriod(activePeriod.id);
          }}
          className="ml-auto hover:text-[color:var(--danger)]"
        >
          Dönemi sil
        </button>
      </div>
      <div className="text-[10px] text-[color:var(--muted)] mt-2">
        {project.periods.length === 1
          ? ""
          : "Farklı dönem için: breadcrumb'tan Dönemler'e dön."}
      </div>
    </div>
  );
}

function FrequencyView() {
  const { activePeriod, project, branchesForActiveFrequency, actions } =
    useProject();
  const plan = useUserPlan();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const totalBranches = project.periods.reduce(
    (sum, p) => sum + p.branches.length,
    0,
  );
  const atBranchLimit = plan === "free" && totalBranches >= FREE_BRANCH_LIMIT;
  const [modal, setModal] = useState<{
    branch: Branch;
    mode: "copy" | "move";
  } | null>(null);
  const [copyAssumptionsSource, setCopyAssumptionsSource] = useState<Branch | null>(null);

  if (!activePeriod || !project.activeFrequency) return null;
  const freqLabel =
    project.activeFrequency === "yearly" ? "Yıllık" : "Çeyreklik";

  return (
    <div className="max-w-6xl mx-auto">
      <HeaderRow
        title={`${freqLabel} — ${activePeriod.label}`}
        subtitle="Branş seçin veya yeni oluşturun."
        count={branchesForActiveFrequency.length}
      />
      <Grid>
        {branchesForActiveFrequency.map((b) => (
          <BranchTile
            key={b.id}
            branch={b}
            onOpen={() => actions.goToBranch(b.id)}
            onDelete={() => {
              if (confirm(`"${b.name}" branşı silinsin mi?`))
                actions.deleteBranch(b.id);
            }}
            onCopy={() => setModal({ branch: b, mode: "copy" })}
            onMove={() => setModal({ branch: b, mode: "move" })}
            onCopyAssumptions={() => setCopyAssumptionsSource(b)}
          />
        ))}
        {adding ? (
          <InlineAdd
            placeholder="örn. Kasko"
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
          <UpgradeTile message="Free planda 1 model oluşturabilirsin." />
        ) : (
          <AddTile label="+ Yeni Branş" onClick={() => setAdding(true)} />
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
          {total} branş · {yearly} yıllık · {quarterly} çeyreklik
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--muted)] tabular">
        Oluşturma: {new Date(period.createdAt).toLocaleDateString("tr-TR")}
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
          {count} branş
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
              title="Taşı"
            >
              Taşı
            </button>
          )}
          {onCopyAssumptions && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopyAssumptions(); }}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--primary)] transition"
              title="Varsayım aktar"
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
        {branch.history.length} kayıt · {timeAgo(branch.updatedAt)}
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
        ✦ Pro&apos;ya geç
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
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="card p-5 flex flex-col gap-3 border-dashed border-[color:var(--primary)] bg-[color:var(--primary-soft)]/30">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          else if (e.key === "Escape") onCancel();
        }}
        className="input-base"
      />
      <div className="flex gap-2">
        <button onClick={onCommit} className="btn btn-primary text-xs flex-1">
          Oluştur
        </button>
        <button onClick={onCancel} className="btn text-xs">
          İptal
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
    if (m < 1) return "az önce";
    if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} sa önce`;
    const days = Math.floor(h / 24);
    return `${days} gün önce`;
  } catch {
    return "";
  }
}
