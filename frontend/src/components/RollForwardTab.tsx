"use client";

import { useMemo, useState } from "react";
import { useProject } from "@/lib/project-store";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import { formatNumber } from "@/lib/api";
import type { Branch, Period } from "@/types/project";

function periodOrder(label: string): number {
  const m = label.match(/^(\d{4})(?:[Qq](\d))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0);
}

function devSign(v: number, favorable = "neg") {
  if (v === 0) return "text-[color:var(--muted)]";
  if (favorable === "neg") return v < 0 ? "text-green-600 font-semibold" : "text-[color:var(--danger)] font-semibold";
  return v > 0 ? "text-green-600 font-semibold" : "text-[color:var(--danger)] font-semibold";
}

function sign(v: number): string {
  return v > 0 ? "+" : "";
}

export function RollForwardTab() {
  const { project, activePeriod, activeBranch } = useProject();

  // All periods before active, sorted descending (most recent first)
  const priorBranchOptions = useMemo((): { period: Period; branch: Branch }[] => {
    if (!activePeriod || !activeBranch) return [];
    const sorted = [...project.periods].sort((a, b) => periodOrder(a.label) - periodOrder(b.label));
    const activeIdx = sorted.findIndex(p => p.id === activePeriod.id);
    if (activeIdx <= 0) return [];
    const result: { period: Period; branch: Branch }[] = [];
    for (let i = activeIdx - 1; i >= 0; i--) {
      for (const b of sorted[i].branches) {
        if (b.frequency === activeBranch.frequency && b.triangle) {
          result.push({ period: sorted[i], branch: b });
        }
      }
    }
    return result;
  }, [project.periods, activePeriod, activeBranch]);

  const defaultId = useMemo(() => {
    const same = priorBranchOptions.find(x => x.branch.name === activeBranch?.name);
    return (same ?? priorBranchOptions[0])?.branch.id ?? "";
  }, [priorBranchOptions, activeBranch?.name]);

  const [priorId, setPriorId] = useState(defaultId);
  const effectiveId = priorBranchOptions.some(x => x.branch.id === priorId) ? priorId : defaultId;
  const priorEntry = priorBranchOptions.find(x => x.branch.id === effectiveId);

  const currSummary = useMemo(
    () => (activeBranch ? computeBranchSummary(activeBranch) : null),
    [activeBranch],
  );

  const priorSummary = useMemo(
    () => (priorEntry?.branch ? computeBranchSummary(priorEntry.branch) : null),
    [priorEntry],
  );

  if (!activeBranch?.triangle) {
    return (
      <div className="card p-8 text-center text-sm text-[color:var(--muted)]">
        Önce veri yükleyin.
      </div>
    );
  }

  if (!priorBranchOptions.length) {
    return (
      <div className="card p-8 text-center text-sm text-[color:var(--muted)]">
        <p className="mb-1">Önceki dönemde bu frekansa ait üçgen bulunamadı.</p>
        <p className="text-xs">Birden fazla rapor dönemi oluşturup her birine üçgen yükledikten sonra roll-forward aktif olur.</p>
      </div>
    );
  }

  if (!currSummary || !priorSummary) {
    return <div className="card p-8 text-center text-sm text-[color:var(--muted)]">Hesaplanıyor…</div>;
  }

  // Build per-origin rows: include only origins with data in current period
  const currByOrigin = new Map(currSummary.rows.map(r => [r.origin, r]));
  const priorByOrigin = new Map(priorSummary.rows.map(r => [r.origin, r]));

  const rows = currSummary.rows
    .map(curr => {
      const prior = priorByOrigin.get(curr.origin);
      const priorLatest = prior?.latest ?? null;
      const priorUlt = prior?.selected_ultimate ?? null;
      const priorIbnr = priorUlt != null && priorLatest != null ? priorUlt - priorLatest : null;
      const currLatest = curr.latest;
      const currUlt = curr.selected_ultimate;
      const currIbnr = currUlt - currLatest;
      const payment = priorLatest != null ? currLatest - priorLatest : null;
      const expectedIbnr = priorUlt != null ? priorUlt - currLatest : null;
      // Gelişim = gerçek - beklenen (pozitif = adverse, negatif = favorable)
      const development = expectedIbnr != null ? currIbnr - expectedIbnr : null;
      return {
        origin: curr.origin,
        priorLatest,
        priorUlt,
        priorIbnr,
        currLatest,
        currUlt,
        currIbnr,
        payment,
        expectedIbnr,
        development,
      };
    });

  // Totals (only for origins with prior data)
  const paired = rows.filter(r => r.priorUlt != null);
  const totalPriorIbnr = paired.reduce((s, r) => s + (r.priorIbnr ?? 0), 0);
  const totalPayment = paired.reduce((s, r) => s + (r.payment ?? 0), 0);
  const totalExpected = paired.reduce((s, r) => s + (r.expectedIbnr ?? 0), 0);
  const totalActual = paired.reduce((s, r) => s + r.currIbnr, 0);
  const totalDev = totalActual - totalExpected;

  const totalCurrIbnr = currSummary.totals.ibnr;
  const totalPriorUlt = paired.reduce((s, r) => s + (r.priorUlt ?? 0), 0);
  const totalCurrUlt = currSummary.totals.selected_ultimate;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[color:var(--muted-strong)] font-medium">Karşılaştırma Dönemi</span>
        <select
          value={effectiveId}
          onChange={e => setPriorId(e.target.value)}
          className="input-base text-xs"
        >
          {priorBranchOptions.map(({ period, branch }) => (
            <option key={branch.id} value={branch.id}>
              {period.label} — {branch.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-[color:var(--muted)] ml-auto">
          {priorEntry?.period.label} → {activePeriod?.label}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label={`${priorEntry?.period.label} IBNR`}
          value={formatNumber(totalPriorIbnr)}
          sub="eşleşen kaza yılları"
        />
        <KpiCard
          label="Dönem İçi Ödeme"
          value={formatNumber(totalPayment)}
          sub="kümülatif artış"
        />
        <KpiCard
          label="Beklenen IBNR"
          value={formatNumber(totalExpected)}
          sub="= önceki ult – mevcut latest"
        />
        <KpiCard
          label="Gelişim (Fav / Adv)"
          value={(totalDev > 0 ? "+" : "") + formatNumber(totalDev)}
          sub={totalDev < 0 ? "favorable" : totalDev > 0 ? "adverse" : "nötr"}
          accent={Math.abs(totalDev) > 0}
          adverse={totalDev > 0}
        />
      </div>

      {/* Explanation */}
      <div className="card p-3 text-[11px] text-[color:var(--muted)] bg-[color:var(--surface-alt)]">
        <span className="font-semibold text-[color:var(--muted-strong)]">Nasıl okunur: </span>
        Önceki dönem ultimatesi, dönem içi ödemeleri karşılayacak kadar büyüktü.
        Beklenen IBNR = Önceki Ult − Mevcut Latest.
        Gerçek IBNR = Mevcut Ult − Mevcut Latest.
        Gelişim = Gerçek − Beklenen — <span className="text-green-600 font-medium">negatif = favorable</span>,{" "}
        <span className="text-[color:var(--danger)] font-medium">pozitif = adverse</span>.
      </div>

      {/* Main table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold">
          Kaza Yılı Bazlı Roll-forward — {priorEntry?.period.label} → {activePeriod?.label}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2 sticky left-0 bg-[color:var(--surface-alt)]">Kaza Yılı</th>
                <th className="text-right px-3 py-2 border-r border-[color:var(--border)]" title={`${priorEntry?.period.label} seçilen ultimate − latest`}>Önceki IBNR</th>
                <th className="text-right px-3 py-2 border-r border-[color:var(--border)]" title="Mevcut latest − önceki latest">Dönem Ödemesi</th>
                <th className="text-right px-3 py-2 border-r border-[color:var(--border)]" title="Önceki ultimate − mevcut latest">Beklenen IBNR</th>
                <th className="text-right px-3 py-2">Gerçek IBNR</th>
                <th className="text-right px-3 py-2" title="Gerçek − Beklenen (neg = favorable)">Gelişim</th>
                <th className="text-right px-3 py-2 border-l border-[color:var(--border)] text-[color:var(--muted)]">Önceki Ult</th>
                <th className="text-right px-3 py-2 text-[color:var(--muted)]">Mevcut Ult</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.origin} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-[color:var(--surface)]">
                    {r.origin}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)] border-r border-[color:var(--border)]">
                    {r.priorIbnr != null ? formatNumber(r.priorIbnr) : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5 border-r border-[color:var(--border)]">
                    {r.payment != null ? formatNumber(r.payment) : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)] border-r border-[color:var(--border)]">
                    {r.expectedIbnr != null ? formatNumber(r.expectedIbnr) : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5">
                    {formatNumber(r.currIbnr)}
                  </td>
                  <td className={`text-right px-3 py-1.5 ${r.development != null ? devSign(r.development) : "text-[color:var(--muted)]"}`}>
                    {r.development != null
                      ? sign(r.development) + formatNumber(r.development)
                      : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)] border-l border-[color:var(--border)] text-[11px]">
                    {r.priorUlt != null ? formatNumber(r.priorUlt) : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)] text-[11px]">
                    {formatNumber(r.currUlt)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[color:var(--border)] bg-[color:var(--surface-alt)] font-semibold">
                <td className="px-3 py-1.5 text-[color:var(--muted-strong)] sticky left-0 bg-[color:var(--surface-alt)]">
                  Toplam
                </td>
                <td className="text-right px-3 py-1.5 border-r border-[color:var(--border)]">
                  {formatNumber(totalPriorIbnr)}
                </td>
                <td className="text-right px-3 py-1.5 border-r border-[color:var(--border)]">
                  {formatNumber(totalPayment)}
                </td>
                <td className="text-right px-3 py-1.5 border-r border-[color:var(--border)]">
                  {formatNumber(totalExpected)}
                </td>
                <td className="text-right px-3 py-1.5">
                  {formatNumber(totalActual)}
                </td>
                <td className={`text-right px-3 py-1.5 ${devSign(totalDev)}`}>
                  {sign(totalDev) + formatNumber(totalDev)}
                </td>
                <td className="text-right px-3 py-1.5 border-l border-[color:var(--border)] font-normal text-[color:var(--muted)] text-[11px]">
                  {formatNumber(totalPriorUlt)}
                </td>
                <td className="text-right px-3 py-1.5 font-normal text-[color:var(--muted)] text-[11px]">
                  {formatNumber(totalCurrUlt)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* New origins note */}
      {rows.some(r => r.priorUlt == null) && (
        <div className="text-[11px] text-[color:var(--muted)] px-1">
          "—" gösterilen kaza yılları önceki dönemde mevcut değildi — gelişim hesaplanamaz.
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, accent, adverse,
}: {
  label: string; value: string; sub?: string; accent?: boolean; adverse?: boolean;
}) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] mb-0.5">{label}</div>
      <div className={`text-lg font-semibold tabular ${accent ? (adverse ? "text-[color:var(--danger)]" : "text-green-600") : ""}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
