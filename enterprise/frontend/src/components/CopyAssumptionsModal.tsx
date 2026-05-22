"use client";

import { useState } from "react";
import type { Branch, Period } from "@/types/project";
import type { CopyAssumptionsOptions } from "@/lib/project-store";

interface Props {
  sourceBranch: Branch;
  allPeriods: Period[];
  onConfirm: (targetBranchId: string, opts: CopyAssumptionsOptions) => void;
  onCancel: () => void;
}

const OPTION_LABELS: { key: keyof CopyAssumptionsOptions; label: string }[] = [
  { key: "excludedCells", label: "Hücre Elemeleri" },
  { key: "window", label: "Volume (window)" },
  { key: "curve", label: "Curve Ayarları" },
  { key: "premiums", label: "Primler (Exposure)" },
  { key: "lrFormulas", label: "Loss Ratio Formülleri" },
  { key: "corrections", label: "Düzeltme Katsayıları (k)" },
  { key: "basis", label: "Basis Seçimleri (CL/BF)" },
];

const ALL_ON: CopyAssumptionsOptions = {
  excludedCells: true,
  window: true,
  curve: true,
  premiums: true,
  lrFormulas: true,
  corrections: true,
  basis: true,
};

export function CopyAssumptionsModal({ sourceBranch, allPeriods, onConfirm, onCancel }: Props) {
  const otherBranches = allPeriods.flatMap((p) =>
    p.branches
      .filter((b) => b.id !== sourceBranch.id)
      .map((b) => ({ branch: b, periodLabel: p.label })),
  );

  const [targetBranchId, setTargetBranchId] = useState(otherBranches[0]?.branch.id ?? "");
  const [opts, setOpts] = useState<CopyAssumptionsOptions>({ ...ALL_ON });

  const toggle = (key: keyof CopyAssumptionsOptions) =>
    setOpts((prev) => ({ ...prev, [key]: !prev[key] }));

  const canConfirm = !!targetBranchId && Object.values(opts).some(Boolean);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="card p-6 w-full max-w-sm mx-4 shadow-2xl space-y-5">
        <div>
          <div className="text-sm font-semibold">
            {sourceBranch.name} → Varsayımları Aktar
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            Hedef branşı ve aktarılacak varsayımları seçin.
          </div>
        </div>

        {otherBranches.length === 0 ? (
          <div className="text-xs text-[color:var(--muted)] py-2">
            Aktarılacak başka branş bulunamadı.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="label">Hedef Branş</div>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                className="input-base w-full"
              >
                {allPeriods.map((p) => {
                  const branches = p.branches.filter((b) => b.id !== sourceBranch.id);
                  if (!branches.length) return null;
                  return (
                    <optgroup key={p.id} label={p.label}>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.frequency === "yearly" ? "Yıllık" : "Çeyreklik"})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <div className="label">Aktarılacak Varsayımlar</div>
              <div className="space-y-1.5">
                {OPTION_LABELS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={!!opts[key]}
                      onChange={() => toggle(key)}
                      className="accent-[color:var(--primary)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-[color:var(--muted)] border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface-alt)]">
              Eşleşmeyen origin&apos;ler ve adımlar atlanır.
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { if (canConfirm) onConfirm(targetBranchId, opts); }}
                disabled={!canConfirm}
                className="btn btn-primary flex-1"
              >
                Aktar
              </button>
              <button onClick={onCancel} className="btn flex-1">İptal</button>
            </div>
          </>
        )}
        {otherBranches.length === 0 && (
          <button onClick={onCancel} className="btn w-full">Kapat</button>
        )}
      </div>
    </div>
  );
}
