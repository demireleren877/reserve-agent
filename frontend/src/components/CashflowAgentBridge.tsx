"use client";

/**
 * Cashflow modülünün agent snapshot'ını ve action handler'ını register eder.
 * Reserve bridge ile aynı mimari: tüm branşların LDF/CDF hesapları pure
 * fonksiyonla snapshot'a alınır, session_state sarmalıyla backend'e iletilir.
 * Root layout'ta yaşar — cashflow sayfası açık olmasa da agent erişir.
 */

import { useEffect, useMemo } from "react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useProject } from "@/lib/project-store";
import { computeCashflowBranchSummary } from "@/lib/cashflow-pipeline";
import type { AgentAction } from "@/types/triangle";
import type { Branch, Period } from "@/types/project";

export function CashflowAgentBridge() {
  const { project, activeBranch, actions } = useProject();
  const { registerSnapshot, registerActionHandler, unregisterActionHandler } =
    useAgentRegistry();

  const modulePayload = useMemo(
    () => buildCashflowModulePayload(project.periods, activeBranch),
    [project.periods, activeBranch],
  );

  useEffect(() => {
    registerSnapshot("cashflow", modulePayload);
  }, [registerSnapshot, modulePayload]);

  useEffect(() => {
    const handler = (received: AgentAction[]) => {
      for (const a of received) {
        const branchId =
          (a.payload?.branch_id as string | undefined) ?? activeBranch?.id;
        if (!branchId) continue;

        if (a.type === "set_cashflow_window") {
          const raw = a.payload?.window as string | undefined;
          if (!raw) continue;
          const w = raw === "all" ? "all" : Number(raw);
          actions.updateBranch(
            branchId,
            () => ({ cashflowLdfWindow: w }),
            "cashflow_window_set",
            { window: w },
            "agent",
          );
        } else if (a.type === "exclude_cashflow_cells") {
          const cells =
            (a.payload?.cells as { origin: string; step: number }[]) ?? [];
          if (!cells.length) continue;
          actions.updateBranch(
            branchId,
            (b) => {
              const existing = new Set(b.cashflowLdfExcludedCells ?? []);
              for (const c of cells) existing.add(`${c.origin}|${c.step}`);
              return { cashflowLdfExcludedCells: Array.from(existing) };
            },
            "cashflow_cells_excluded",
            { count: cells.length },
            "agent",
          );
        } else if (a.type === "clear_cashflow_exclusions") {
          actions.updateBranch(
            branchId,
            () => ({ cashflowLdfExcludedCells: [] }),
            "cashflow_exclusions_cleared",
            undefined,
            "agent",
          );
        } else if (a.type === "set_cashflow_cdf_model") {
          const dev = a.payload?.dev_period as string | undefined;
          const model = Number(a.payload?.model) as 1 | 2 | 3 | 4 | 5 | 6;
          if (!dev || ![1, 2, 3, 4, 5, 6].includes(model)) continue;
          actions.updateBranch(
            branchId,
            (b) => ({
              cashflowCdfModelPerPeriod: {
                ...(b.cashflowCdfModelPerPeriod ?? {}),
                [dev]: model,
              },
            }),
            "cashflow_cdf_model_set",
            { dev_period: dev, model },
            "agent",
          );
        } else if (a.type === "set_cashflow_cdf_model_bulk") {
          const items =
            (a.payload?.items as { dev_period: string; model: number }[]) ?? [];
          actions.updateBranch(
            branchId,
            (b) => {
              const next = { ...(b.cashflowCdfModelPerPeriod ?? {}) };
              for (const it of items) {
                if ([1, 2, 3, 4, 5, 6].includes(it.model))
                  next[it.dev_period] = it.model as 1 | 2 | 3 | 4 | 5 | 6;
              }
              return { cashflowCdfModelPerPeriod: next };
            },
            "cashflow_cdf_model_bulk",
            { count: items.length },
            "agent",
          );
        } else if (a.type === "set_cashflow_cdf_user_value") {
          const dev = a.payload?.dev_period as string | undefined;
          const v = Number(a.payload?.value);
          if (!dev || !Number.isFinite(v)) continue;
          actions.updateBranch(
            branchId,
            (b) => ({
              cashflowCdfInitial: {
                ...(b.cashflowCdfInitial ?? {}),
                [dev]: v,
              },
              cashflowCdfModelPerPeriod: {
                ...(b.cashflowCdfModelPerPeriod ?? {}),
                [dev]: 6,
              },
            }),
            "cashflow_cdf_user_value_set",
            { dev_period: dev, value: v },
            "agent",
          );
        } else if (a.type === "reset_cashflow_curve") {
          actions.updateBranch(
            branchId,
            () => ({
              cashflowCdfModelPerPeriod: {},
              cashflowCurveIncludePerPeriod: {},
              cashflowCdfInitial: {},
            }),
            "cashflow_curve_reset",
            undefined,
            "agent",
          );
        }
      }
    };
    registerActionHandler("cashflow", handler);
    return () => unregisterActionHandler("cashflow");
  }, [registerActionHandler, unregisterActionHandler, actions, activeBranch]);

  return null;
}

// ─── Module payload builder ───────────────────────────────────────────────────

function buildCashflowModulePayload(
  periods: Period[],
  activeBranch: Branch | null,
) {
  let withTriangle = 0;
  let withPattern = 0;

  const periodSnaps = periods.map((p) => {
    const branchSnaps = p.branches.map((b) => {
      const summary = computeCashflowBranchSummary(b);
      const isActive = activeBranch?.id === b.id;
      if (summary.has_paid_triangle) withTriangle += 1;
      const patternCount = Object.keys(b.cashflowMonthlyPattern ?? {}).length;
      if (patternCount > 0) withPattern += 1;

      return {
        id: b.id,
        name: b.name,
        frequency: b.frequency,
        is_active: isActive,
        has_paid_triangle: summary.has_paid_triangle,
        n_origins: summary.n_origins,
        n_developments: summary.n_developments,
        ldf_window: summary.ldf_window,
        excluded_cells_count: summary.excluded_cells_count,
        // excluded_cells detayı sadece aktif branş için — diğerleri için gereksiz
        excluded_cells: isActive ? summary.excluded_cells : [],
        cdf_model_overrides: Object.entries(b.cashflowCdfModelPerPeriod ?? {})
          .filter(([, m]) => m !== 1)
          .map(([dev, model]) => ({ dev_period: dev, model })),
        cdf_user_values: Object.entries(b.cashflowCdfInitial ?? {}).map(
          ([dev, v]) => ({ dev_period: dev, value: v }),
        ),
        has_pattern: patternCount > 0,
        pattern_origin_count: patternCount,
        pattern_origins: Object.keys(b.cashflowMonthlyPattern ?? {}),
        // Pattern detayı sadece aktif branş için
        quarterly_pattern: isActive ? (b.cashflowQuarterlyPattern ?? {}) : undefined,
        monthly_pattern: isActive
          ? Object.fromEntries(
              Object.entries(b.cashflowMonthlyPattern ?? {}).map(([origin, weights]) => [
                origin,
                weights.filter((w) => w.weight > 0),
              ]),
            )
          : undefined,
        // LDF/CDF tam detay — tüm branşlar (reserve'deki per_origin gibi)
        selected_ldfs: summary.selected_ldfs,
        effective_cdfs: summary.effective_cdfs,
        per_dev: summary.per_dev,
      };
    });
    return { id: p.id, label: p.label, branches: branchSnaps };
  });

  const sessionState = {
    active_branch_id: activeBranch?.id ?? null,
    periods: periodSnaps,
    totals: {
      branch_count: periods.reduce((s, p) => s + p.branches.length, 0),
      branches_with_triangle: withTriangle,
      branches_with_pattern: withPattern,
    },
  };

  // session_state sarmalı: backend payload.get("session_state") ile okur
  return { session_state: sessionState };
}
