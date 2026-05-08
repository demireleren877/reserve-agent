"use client";

import type { Triangle } from "@/types/triangle";
import { formatNumber } from "@/lib/api";

interface Props {
  triangle: Triangle | null;
  premiums: Record<string, number>;
  correctionPerOrigin: Record<string, number>;
}

export function ILRTab({ triangle, premiums, correctionPerOrigin }: Props) {
  if (!triangle) {
    return (
      <div className="card p-16 text-center text-sm text-[color:var(--muted)]">
        Önce veri yükleyin.
      </div>
    );
  }

  const hasPremiums = triangle.origin_periods.some(o => (premiums[o] ?? 0) > 0);

  if (!hasPremiums) {
    return (
      <div className="card p-8 text-center text-sm text-[color:var(--muted)]">
        ILR hesabı için BF sekmesinden kaza yıllarına prim girilmesi gerekiyor.
      </div>
    );
  }

  const devs = triangle.development_periods;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)]">
        <h2 className="text-sm font-semibold">Incurred Loss Ratio Üçgeni</h2>
        <span className="text-xs text-[color:var(--muted)] tabular">
          Hasar / (Prim × Düzeltme) · {triangle.origin_periods.length}×{devs.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular border-collapse">
          <thead>
            <tr className="bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)] text-[10px] uppercase tracking-wide border-b border-[color:var(--border)]">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-[color:var(--surface-alt)] z-10">
                Kaza
              </th>
              <th className="text-right px-3 py-2 font-semibold min-w-[100px] border-r border-[color:var(--border)]">
                Prim (düz.)
              </th>
              {devs.map((_, idx) => (
                <th key={idx} className="text-right px-2 py-2 font-semibold min-w-[68px]">
                  {idx + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {triangle.origin_periods.map((origin, i) => {
              const rawPrem = premiums[origin] ?? 0;
              const k = correctionPerOrigin[origin] > 0 ? correctionPerOrigin[origin] : 1;
              const adjPrem = rawPrem * k;

              return (
                <tr key={origin} className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]/40">
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-[color:var(--surface)] z-10">
                    {origin}
                  </td>
                  <td className="text-right px-3 py-1.5 border-r border-[color:var(--border)] text-[color:var(--muted)]">
                    {adjPrem > 0 ? formatNumber(adjPrem) : "—"}
                    {k !== 1 && rawPrem > 0 && (
                      <span className="ml-1 text-[9px] text-[color:var(--muted)]">×{k.toFixed(2)}</span>
                    )}
                  </td>
                  {devs.map((_, j) => {
                    const v = triangle.values[i][j];
                    const ilr = v != null && adjPrem > 0 ? (v / adjPrem) * 100 : null;
                    const textColor =
                      ilr == null
                        ? undefined
                        : ilr > 100
                        ? "var(--danger)"
                        : ilr > 80
                        ? "#f59e0b"
                        : undefined;
                    return (
                      <td
                        key={j}
                        className="text-right px-2 py-1.5"
                        style={{
                          color: v == null ? "var(--muted)" : textColor,
                          fontWeight: ilr != null && ilr > 100 ? 600 : undefined,
                        }}
                      >
                        {ilr != null
                          ? `${ilr.toFixed(1)}%`
                          : v != null
                          ? "—"
                          : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
