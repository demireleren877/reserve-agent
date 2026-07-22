"use client";

/**
 * İskonto modülünün agent snapshot'ını register eder.
 * Her branş için rezerv pipeline sonuçları + cashflow pattern + iskonto
 * hesaplamalarını agent'a sunar. Agent `compute_discount` action'ı ile
 * belirli bir branş için iskonto hesaplaması yaptırabilir.
 */

import { useEffect, useMemo } from "react";
import { useAgentRegistry } from "@/lib/agent-registry";
import { useProject } from "@/lib/project-store";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import {
  buildFlatRateFn,
  buildCurveFn,
  discountBranch,
  type CurveNode,
} from "@/lib/discount-engine";
import type { AgentAction } from "@/types/triangle";
import type { Period, Branch } from "@/types/project";

export function DiscountAgentBridge() {
  const { project, activeBranch } = useProject();
  const { registerSnapshot, registerActionHandler, unregisterActionHandler } =
    useAgentRegistry();

  const snapshot = useMemo(
    () => buildDiscountSnapshot(project.periods, activeBranch),
    [project.periods, activeBranch],
  );

  useEffect(() => {
    registerSnapshot("discount", snapshot);
  }, [registerSnapshot, snapshot]);

  // Discount modülü için write action yok — hesaplamalar pure/client-side.
  // Ancak agent `compute_discount` ile sonuç okuyabilir (backend side-effect free).
  useEffect(() => {
    const handler = (_received: AgentAction[]) => {
      // compute_discount: backend pure hesaplama, action yok — sonuç tool response'ta
    };
    registerActionHandler("discount", handler);
    return () => unregisterActionHandler("discount");
  }, [registerActionHandler, unregisterActionHandler]);

  return null;
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

function buildDiscountSnapshot(periods: Period[], activeBranch: Branch | null) {
  const branches = periods.flatMap((p) =>
    p.branches
      .filter((b) => b.paidTriangle != null || b.triangle != null)
      .map((b) => {
        const summary = computeBranchSummary(b);
        const pattern = (b.cashflowMonthlyPattern ?? {}) as Record<
          string,
          { month: number; weight: number }[]
        >;
        const hasPattern = Object.keys(pattern).length > 0;

        // Baz iskonto (SEDDK %30) ile hızlı özet
        let quickDiscount: null | {
          unpaid_liability: number;
          discounted_unpaid: number;
          discount_amount: number;
          discount_pct: number;
          duration_months: number;
        } = null;

        if (hasPattern && summary.rows.length > 0) {
          const rows = summary.rows.map((r) => ({
            origin: r.origin,
            unpaid: r.latest + r.ibnr,
          }));
          const getRateFn = buildFlatRateFn(0.3);
          try {
            const res = discountBranch(rows, pattern, getRateFn);
            quickDiscount = {
              unpaid_liability: Math.round(res.totals.unpaid),
              discounted_unpaid: Math.round(res.totals.bel),
              discount_amount: Math.round(res.totals.unpaid - res.totals.bel),
              discount_pct: Math.round(res.totals.discountPct * 10000) / 100,
              duration_months: Math.round(res.totals.duration * 10) / 10,
            };
          } catch {
            // pattern uyumsuzluğu — sessizce geç
          }
        }

        return {
          branch_id: b.id,
          branch_name: b.name,
          period_id: p.id,
          period_label: p.label,
          frequency: b.frequency,
          is_active: activeBranch?.id === b.id,
          has_cashflow_pattern: hasPattern,
          origin_count: summary.rows.length,
          total_unpaid_liability: Math.round(summary.totals.latest + summary.totals.ibnr),
          quick_discount_at_30pct: quickDiscount,
          note: hasPattern
            ? "You can use a custom interest rate or curve with compute_discount."
            : "Cashflow pattern missing — compute it in the Cashflow module.",
        };
      }),
  );

  return {
    branches,
    active_branch_id: activeBranch?.id ?? null,
    note: "Discount module: Unpaid Liability and discount summary per branch. Use compute_discount for a detailed calculation.",
  };
}

// ─── Discount compute helper (backend tool'lar için export) ───────────────────

export function computeDiscountForBranch(
  branch: Branch,
  rateMode: "flat" | "curve",
  flatRate: number,
  curveNodes: CurveNode[],
): Record<string, unknown> | { error: string } {
  const summary = computeBranchSummary(branch);
  const pattern = (branch.cashflowMonthlyPattern ?? {}) as Record<
    string,
    { month: number; weight: number }[]
  >;

  if (Object.keys(pattern).length === 0) {
    return {
      error:
        "No cashflow pattern computed for this branch. Run the calculation in the Cashflow module first.",
    };
  }

  const rows = summary.rows.map((r) => ({
    origin: r.origin,
    unpaid: r.latest + r.ibnr,
  }));

  const getRateFn =
    rateMode === "flat"
      ? buildFlatRateFn(flatRate)
      : buildCurveFn(curveNodes);

  const res = discountBranch(rows, pattern, getRateFn);

  return {
    rate_mode: rateMode,
    flat_rate_pct: rateMode === "flat" ? flatRate * 100 : null,
    curve_nodes: rateMode === "curve" ? curveNodes : null,
    totals: {
      unpaid_liability: Math.round(res.totals.unpaid),
      discounted_unpaid: Math.round(res.totals.bel),
      discount_amount: Math.round(res.totals.unpaid - res.totals.bel),
      discount_pct: Math.round(res.totals.discountPct * 10000) / 100,
      duration_months: Math.round(res.totals.duration * 10) / 10,
    },
    by_origin: res.origins.map((o) => ({
      origin: o.origin,
      unpaid_liability: Math.round(o.unpaid),
      discounted_unpaid: Math.round(o.bel),
      discount_amount: Math.round(o.unpaid - o.bel),
      discount_pct: Math.round(o.discountPct * 10000) / 100,
      duration_months: Math.round(o.duration * 10) / 10,
    })),
  };
}
