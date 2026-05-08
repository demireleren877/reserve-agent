"use client";

/**
 * Root layout'ta yaşar. Tüm proje tree'sini (her dönem, her branş, hesap
 * sonuçları dahil) hesaplar ve agent registry'ye snapshot olarak yazar.
 * Aktif branş ne olursa olsun (anasayfada bile) agent her şeye erişir.
 *
 * Ayrıca agent'tan gelen action'ları:
 *   - Aktif branşı varsa: ProjectStore'un mevcut setter'ları ile uygula
 *   - Belirli bir branş hedeflenmişse (action.payload.branch_id): geçici
 *     olarak o branşa geç ve uygula
 *   - select_branch action'ı: navigasyon (goToBranch)
 */

import { useEffect, useMemo } from "react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useBranchSetters, useProject } from "@/lib/project-store";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import type { AgentAction } from "@/types/triangle";
import type { Branch, Period } from "@/types/project";

export function ReserveAgentBridge() {
  const { project, activePeriod, activeBranch, actions } = useProject();
  const agentReg = useAgentRegistry();
  const agentSetters = useBranchSetters("agent");

  // Tüm branşların full snapshot'ı
  const snapshot = useMemo(() => {
    return buildProjectSnapshot(project.periods, activePeriod, activeBranch);
  }, [project.periods, activePeriod, activeBranch]);

  // Modül payload'u: triangle (aktif) + session_state (full snapshot + legacy
  // aktif branş alanları)
  const modulePayload = useMemo(() => {
    const activeBranchSnap = snapshot.active
      ? snapshot.periods
          .find((p) => p.id === snapshot.active!.period_id)
          ?.branches.find((b) => b.id === snapshot.active!.branch_id) ?? null
      : null;

    // Legacy aktif branş alanları (eski tool'lar için)
    const legacyFields: Record<string, unknown> = {};
    if (activeBranchSnap && activeBranch) {
      legacyFields.method = activeBranchSnap.method;
      legacyFields.window = activeBranchSnap.window;
      legacyFields.excluded_cells = (activeBranch.excludedCells ?? []).map(
        (k) => {
          const [origin, step] = k.split("|");
          return { origin, step: Number(step) };
        },
      );
      legacyFields.selected_ldfs = activeBranchSnap.selected_ldfs ?? [];
      legacyFields.cdfs = activeBranchSnap.effective_cdfs ?? [];
      legacyFields.per_origin = activeBranchSnap.per_origin ?? [];
      legacyFields.formula_context = activeBranchSnap.formula_context ?? null;
      legacyFields.total_latest = activeBranchSnap.totals.latest;
      legacyFields.total_exposure = activeBranchSnap.totals.exposure_annual;
      legacyFields.total_ultimate = activeBranchSnap.totals.cl_ultimate;
      legacyFields.total_bf_ultimate = activeBranchSnap.totals.bf_ultimate;
      legacyFields.total_selected_ultimate =
        activeBranchSnap.totals.selected_ultimate;
      legacyFields.total_selected_ibnr = activeBranchSnap.totals.ibnr;
      legacyFields.total_ibnr = activeBranchSnap.totals.ibnr;
      legacyFields.project_context = {
        period: snapshot.active!.period_label,
        branch: snapshot.active!.branch_name,
        frequency: snapshot.active!.frequency,
      };
    }

    return {
      triangle:
        (activeBranch?.triangle as unknown as Record<string, unknown>) ?? null,
      session_state: {
        // Full project tree (yeni tool'lar için)
        active: snapshot.active,
        periods: snapshot.periods,
        totals_all_branches: snapshot.totals_all_branches,
        // Aktif branş flat alanları (eski tool'lar için)
        ...legacyFields,
      },
    };
  }, [snapshot, activeBranch]);

  const { registerSnapshot, registerActionHandler, unregisterActionHandler } =
    agentReg;

  useEffect(() => {
    registerSnapshot("reserve", modulePayload as unknown as Record<string, unknown>);
  }, [registerSnapshot, modulePayload]);

  // Action handler — tüm rezerv action'larını uygula. Hedef branş action'da
  // belirtilmişse oraya geç, yoksa aktif branş üzerinde çalış.
  useEffect(() => {
    const handler = (received: AgentAction[]) => {
      for (const a of received) {
        // Cross-branch read tools veya navigasyon için özel işlem
        if (a.type === "select_branch") {
          const periodId = a.payload?.period_id as string | undefined;
          const branchId = a.payload?.branch_id as string | undefined;
          if (branchId) {
            if (periodId) actions.goToPeriod(periodId);
            actions.goToBranch(branchId);
          }
          continue;
        }
        // Standart write action'lar — varsa hedef branşa geç
        const targetBranchId = a.payload?.branch_id as string | undefined;
        const targetPeriodId = a.payload?.period_id as string | undefined;
        if (targetBranchId) {
          if (targetPeriodId) actions.goToPeriod(targetPeriodId);
          actions.goToBranch(targetBranchId);
          // Not: setter'ları hemen çağırmak React batch nedeniyle eski branşı
          // hedefleyebilir. Pragmatik: kullanıcıya görünür şekilde geçilsin,
          // sonraki tool turunda agent yine yazsın.
        }
        applyReserveAction(a, agentSetters);
      }
    };
    registerActionHandler("reserve", handler);
    return () => unregisterActionHandler("reserve");
  }, [
    registerActionHandler,
    unregisterActionHandler,
    agentSetters,
    actions,
  ]);

  return null;
}

// ---------------------- snapshot builder -------------------------------------

interface BranchSnapshot {
  id: string;
  name: string;
  frequency: "yearly" | "quarterly";
  is_active: boolean;
  has_triangle: boolean;
  triangle_file: string | null;
  method: string;
  window: string;
  n_origins: number;
  n_developments: number;
  excluded_count: number;
  curve_overrides_count: number;
  correction_count: number;
  manual_lr_count: number;
  bf_basis_count: number;
  totals: {
    latest: number;
    exposure_raw: number;
    exposure_annual: number;
    cl_ultimate: number;
    bf_ultimate: number;
    selected_ultimate: number;
    ibnr: number;
    ulr: number | null;
  };
  triangle_type: string | null;
  origin_granularity: string | null;
  development_granularity: string | null;
  origin_first: string | null;
  origin_last: string | null;
  filled_cells: number;
  total_cells: number;
  per_origin: ReturnType<typeof computeBranchSummary>["rows"];
  formula_context: ReturnType<typeof computeBranchSummary>["formula_context"];
  selected_ldfs: number[];
  effective_cdfs: number[];
  history_count: number;
  recent_actions?: { ts: string; action: string; source?: string | null }[];
}

interface PeriodSnapshot {
  id: string;
  label: string;
  branches: BranchSnapshot[];
}

interface ProjectSnapshot {
  active: {
    period_id: string;
    period_label: string;
    branch_id: string;
    branch_name: string;
    frequency: "yearly" | "quarterly";
  } | null;
  periods: PeriodSnapshot[];
  totals_all_branches: {
    branch_count: number;
    branch_with_data_count: number;
    grand_total_ibnr: number;
    grand_total_selected_ultimate: number;
  };
}

function buildProjectSnapshot(
  periods: Period[],
  activePeriod: Period | null,
  activeBranch: Branch | null,
): ProjectSnapshot {
  const periodSnaps: PeriodSnapshot[] = [];
  let withData = 0;
  let totalIbnr = 0;
  let totalSelectedUlt = 0;
  let totalBranches = 0;

  for (const p of periods) {
    const branchSnaps: BranchSnapshot[] = [];
    for (const b of p.branches) {
      totalBranches += 1;
      const summary = computeBranchSummary(b);
      if (summary.has_triangle) withData += 1;
      totalIbnr += summary.totals.ibnr;
      totalSelectedUlt += summary.totals.selected_ultimate;

      const isActive = activeBranch?.id === b.id;
      const t = b.triangle;
      let filledCells = 0;
      let totalCells = 0;
      if (t) {
        for (const row of t.values) {
          for (const v of row) {
            totalCells += 1;
            if (v != null) filledCells += 1;
          }
        }
      }
      const snap: BranchSnapshot = {
        id: b.id,
        name: b.name,
        frequency: b.frequency,
        is_active: isActive,
        has_triangle: summary.has_triangle,
        triangle_file: b.triangleFileName ?? null,
        method: b.method,
        window: String(b.window),
        n_origins: summary.n_origins,
        n_developments: summary.n_developments,
        triangle_type: t?.triangle_type ?? null,
        origin_granularity: t?.origin_granularity ?? null,
        development_granularity: t?.development_granularity ?? null,
        origin_first: t?.origin_periods?.[0] ?? null,
        origin_last: t?.origin_periods?.[t?.origin_periods.length - 1] ?? null,
        filled_cells: filledCells,
        total_cells: totalCells,
        excluded_count: (b.excludedCells ?? []).length,
        curve_overrides_count: Object.values(b.cdfChoicePerPeriod ?? {}).filter(
          (c) => c === "user",
        ).length,
        correction_count: Object.values(b.correctionPerOrigin ?? {}).filter(
          (v) => v && v !== 1,
        ).length,
        manual_lr_count: Object.values(b.lrInputPerOrigin ?? {}).filter(
          (v) => v && v.trim().length > 0,
        ).length,
        bf_basis_count: Object.values(b.basisPerOrigin ?? {}).filter(
          (v) => v === "bf",
        ).length,
        totals: summary.totals,
        // Her branş için TAM detay — agent get_branch_state ile bunları okur
        per_origin: summary.rows,
        formula_context: summary.formula_context,
        selected_ldfs: summary.selected_ldfs,
        effective_cdfs: summary.effective_cdfs,
        history_count: (b.history ?? []).length,
        recent_actions: (b.history ?? [])
          .slice(-5)
          .map((h) => ({
            ts: h.timestamp,
            action: h.action,
            source: h.source ?? null,
          })),
      };
      branchSnaps.push(snap);
    }
    periodSnaps.push({ id: p.id, label: p.label, branches: branchSnaps });
  }

  return {
    active:
      activePeriod && activeBranch
        ? {
            period_id: activePeriod.id,
            period_label: activePeriod.label,
            branch_id: activeBranch.id,
            branch_name: activeBranch.name,
            frequency: activeBranch.frequency,
          }
        : null,
    periods: periodSnaps,
    totals_all_branches: {
      branch_count: totalBranches,
      branch_with_data_count: withData,
      grand_total_ibnr: totalIbnr,
      grand_total_selected_ultimate: totalSelectedUlt,
    },
  };
}

// --------------------- action dispatcher (reserve) --------------------------

function applyReserveAction(
  a: AgentAction,
  s: ReturnType<typeof useBranchSetters>,
) {
  if (a.type === "exclude_cells") {
    const cells =
      (a.payload?.cells as { origin: string; step: number }[]) || [];
    if (cells.length === 0) return;
    s.setExcludedCells(new Set(cells.map((c) => `${c.origin}|${c.step}`)));
  } else if (a.type === "include_cells") {
    // include = aktif branşın setinden çıkar (basit: setter replace)
    // (ReserveBridge aktif branşın listesine erişemez burada — agent toplu
    // dönerse next set'i hesaplaması daha hassas; basit yaklaşım: kullanıcı
    // bunun yerine clear sonrası tekrar exclude eder)
  } else if (a.type === "clear_exclusions") {
    s.clearExclusions();
  } else if (a.type === "set_method") {
    const m = a.payload?.method as string | undefined;
    if (m) s.setMethod(m as Parameters<typeof s.setMethod>[0]);
  } else if (a.type === "set_window") {
    const w = a.payload?.window as string | undefined;
    if (w) s.setWindow(w === "all" ? "all" : Number(w));
  } else if (a.type === "set_selected_loss_ratio") {
    const origin = a.payload?.origin as string | undefined;
    const formula = (a.payload?.formula as string | undefined) ?? "";
    if (origin) s.setLrInput(origin, formula);
  } else if (a.type === "set_selected_loss_ratios") {
    const items =
      (a.payload?.items as { origin: string; formula: string }[]) || [];
    s.setLrInputsBulk(items);
  } else if (a.type === "set_premium") {
    const origin = a.payload?.origin as string | undefined;
    const value = Number(a.payload?.value);
    if (origin && Number.isFinite(value)) {
      s.setPremiums(
        (p) => ({ ...p, [origin]: value }),
        "premiums_updated",
        { origin, value },
      );
    }
  } else if (a.type === "set_premiums") {
    const items =
      (a.payload?.items as { origin: string; value: number }[]) || [];
    s.setPremiums(
      (p) => {
        const next = { ...p };
        for (const it of items) {
          const v = Number(it.value);
          if (it.origin && Number.isFinite(v)) next[it.origin] = v;
        }
        return next;
      },
      "premiums_bulk",
      { count: items.length },
    );
  } else if (a.type === "set_basis") {
    const origin = a.payload?.origin as string | undefined;
    const basis = a.payload?.basis as "cl" | "bf" | undefined;
    if (origin && (basis === "cl" || basis === "bf"))
      s.setBasis(origin, basis);
  } else if (a.type === "set_basis_bulk") {
    const items =
      (a.payload?.items as { origin: string; basis: "cl" | "bf" }[]) || [];
    s.setBasisBulk(items);
  } else if (a.type === "set_correction") {
    const origin = a.payload?.origin as string | undefined;
    const raw = a.payload?.value;
    const value =
      raw == null ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
    if (origin) s.setCorrection(origin, value);
  } else if (a.type === "set_corrections") {
    const items =
      (a.payload?.items as { origin: string; value: number | null }[]) || [];
    s.setCorrectionsBulk(items);
  } else if (a.type === "set_cdf_user_value") {
    const dev = a.payload?.dev_period as string | undefined;
    const v = Number(a.payload?.value);
    if (dev && Number.isFinite(v)) s.setCdfInitial(dev, v);
  } else if (a.type === "set_cdf_choice") {
    const dev = a.payload?.dev_period as string | undefined;
    const choice = a.payload?.choice as "initial" | "user" | undefined;
    if (dev && (choice === "initial" || choice === "user"))
      s.setCdfChoice(dev, choice);
  } else if (a.type === "set_cdf_choices") {
    const items =
      (a.payload?.items as {
        dev_period: string;
        choice: "initial" | "user";
      }[]) || [];
    s.setCdfChoiceBulk(
      items.map((it) => ({ devPeriod: it.dev_period, choice: it.choice })),
    );
  } else if (a.type === "reset_curve") {
    s.resetCdfInitial();
  }
}
