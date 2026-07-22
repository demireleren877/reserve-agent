"use client";

/**
 * Cashflow modülünün agent snapshot'ını ve action handler'ını register eder.
 * Root layout'ta yaşar — cashflow sayfası açık olmasa da agent her branşın
 * cashflow durumuna erişebilir.
 */

import { useEffect, useMemo } from "react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useProject } from "@/lib/project-store";
import type { AgentAction } from "@/types/triangle";
import type { Branch, Period } from "@/types/project";

export function CashflowAgentBridge() {
  const { project, activeBranch, actions } = useProject();
  const { registerSnapshot, registerActionHandler, unregisterActionHandler } =
    useAgentRegistry();

  const snapshot = useMemo(() => buildCashflowSnapshot(project.periods, activeBranch), [
    project.periods,
    activeBranch,
  ]);

  useEffect(() => {
    registerSnapshot("cashflow", snapshot);
  }, [registerSnapshot, snapshot]);

  useEffect(() => {
    const handler = (received: AgentAction[]) => {
      for (const a of received) {
        const branchId = (a.payload?.branch_id as string | undefined) ?? activeBranch?.id;
        if (!branchId) continue;

        if (a.type === "set_cashflow_window") {
          const raw = a.payload?.window as string | undefined;
          if (!raw) continue;
          const w = raw === "all" ? "all" : Number(raw);
          actions.updateBranch(
            branchId,
            () => ({ cashflowLdfWindow: w }),
            "cashflow_window_set", { window: w }, "agent",
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
            "cashflow_cdf_model_set", { dev_period: dev, model }, "agent",
          );
        } else if (a.type === "set_cashflow_cdf_model_bulk") {
          const items = (a.payload?.items as { dev_period: string; model: number }[]) ?? [];
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
            "cashflow_cdf_model_bulk", { count: items.length }, "agent",
          );
        } else if (a.type === "reset_cashflow_curve") {
          actions.updateBranch(
            branchId,
            () => ({
              cashflowCdfModelPerPeriod: {},
              cashflowCurveIncludePerPeriod: {},
              cashflowCdfInitial: {},
            }),
            "cashflow_curve_reset", undefined, "agent",
          );
        }
      }
    };
    registerActionHandler("cashflow", handler);
    return () => unregisterActionHandler("cashflow");
  }, [registerActionHandler, unregisterActionHandler, actions, activeBranch]);

  return null;
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

function buildCashflowSnapshot(periods: Period[], activeBranch: Branch | null) {
  const branches = periods.flatMap((p) =>
    p.branches
      .filter((b) => b.paidTriangle != null)
      .map((b) => ({
        branch_id: b.id,
        branch_name: b.name,
        period_id: p.id,
        period_label: p.label,
        frequency: b.frequency,
        is_active: activeBranch?.id === b.id,
        has_pattern: Object.keys(b.cashflowMonthlyPattern ?? {}).length > 0,
        pattern_origin_count: Object.keys(b.cashflowMonthlyPattern ?? {}).length,
        cashflow_ldf_window: b.cashflowLdfWindow ?? "all",
        cashflow_cdf_model_overrides: Object.entries(
          b.cashflowCdfModelPerPeriod ?? {},
        ).map(([dev, model]) => ({ dev_period: dev, model })),
        cashflow_curve_include_overrides: Object.entries(
          b.cashflowCurveIncludePerPeriod ?? {},
        ).map(([dev, include]) => ({ dev_period: dev, include })),
        cashflow_cdf_user_values: Object.entries(b.cashflowCdfInitial ?? {}).map(
          ([dev, v]) => ({ dev_period: dev, value: v }),
        ),
      })),
  );

  return {
    branches,
    active_branch_id: activeBranch?.id ?? null,
    note: "Cashflow module: cashflow settings and monthly distribution pattern status per branch.",
  };
}
