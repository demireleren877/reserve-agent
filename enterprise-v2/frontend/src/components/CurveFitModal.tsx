"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TailFit } from "@/lib/tail-fit";

interface Props {
  selectedLDFs: number[];
  includeFlags: boolean[];
  devPeriods: (string | number)[];
  fits: { exp: TailFit; invPower: TailFit; power: TailFit; weibull: TailFit };
  onClose: () => void;
}

const CURVES: { key: keyof Props["fits"]; label: string; color: string }[] = [
  { key: "exp",      label: "Exp. Decay",  color: "#f87171" },
  { key: "invPower", label: "Inv. Power",  color: "#4ade80" },
  { key: "power",    label: "Power",       color: "#c084fc" },
  { key: "weibull",  label: "Weibull",     color: "#60a5fa" },
];

function makeLdfFn(fit: TailFit): (t: number) => number {
  return (t: number) => {
    const i = t - 1;
    const lo = Math.floor(i);
    const hi = lo + 1;
    const cdfAt = (idx: number) => (idx < 0 || idx >= fit.cdfs.length) ? 1 : fit.cdfs[idx];
    const ldfLo = cdfAt(lo) / (cdfAt(lo + 1) || 1);
    const ldfHi = cdfAt(hi) / (cdfAt(hi + 1) || 1);
    return ldfLo + (ldfHi - ldfLo) * (i - lo);
  };
}

function niceTicks(lo: number, hi: number, maxN = 7): number[] {
  const range = hi - lo;
  if (range <= 0) return [lo];
  const rough = range / (maxN - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(s => range / s <= maxN + 1) ?? rough;
  const first = Math.ceil((lo - 1e-10) / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= hi + step * 0.01; v = parseFloat((v + step).toFixed(12)))
    ticks.push(parseFloat(v.toFixed(10)));
  return ticks;
}

function niceXTicks(lo: number, hi: number, maxN = 14): number[] {
  const range = hi - lo;
  const step = Math.max(1, Math.ceil(range / maxN));
  const first = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= hi + 0.01; v += step) ticks.push(v);
  return ticks;
}

export function CurveFitModal({ selectedLDFs, includeFlags, devPeriods, fits, onClose }: Props) {
  const W = 880, H = 440;
  // Generous margins so nothing touches the edges
  const ml = 72, mr = 182, mt = 44, mb = 54;
  const pw = W - ml - mr, ph = H - mt - mb;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverPeriod, setHoverPeriod] = useState<number | null>(null);

  const n = selectedLDFs.length;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const fitFns = useMemo(
    () => Object.fromEntries(CURVES.map(c => [c.key, makeLdfFn(fits[c.key])])) as Record<string, (t: number) => number>,
    [fits],
  );

  const { yMin, yMax } = useMemo(() => {
    const vals: number[] = [];
    selectedLDFs.forEach((v, i) => { if (includeFlags[i] && v > 1) vals.push(v); });
    CURVES.forEach(({ key }) => {
      if (!fits[key].ok) return;
      const fn = fitFns[key];
      for (let t = 1; t <= n; t++) { const v = fn(t); if (v > 1) vals.push(v); }
    });
    if (!vals.length) return { yMin: 1, yMax: 1.5 };
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.15, 0.004);
    return { yMin: Math.max(1.0001, lo - pad), yMax: hi + pad };
  }, [selectedLDFs, includeFlags, fits, fitFns, n]);

  const xScale = (t: number) => ml + ((t - 1) / Math.max(n - 1, 1)) * pw;
  const yScale = (v: number) => mt + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

  const yTicks = useMemo(() => niceTicks(yMin, yMax, 7), [yMin, yMax]);
  const xTicks = useMemo(() => niceXTicks(1, n, 14), [n]);

  function smoothPath(key: string): string {
    const fit = fits[key as keyof Props["fits"]];
    if (!fit.ok || fit.cdfs.length < 2) return "";
    const fn = fitFns[key];
    const pts: string[] = [];
    for (let t = 1; t <= n; t += 0.2) {
      const v = fn(t);
      if (v > 1) pts.push(`${xScale(t).toFixed(1)},${yScale(Math.max(yMin, Math.min(yMax, v))).toFixed(1)}`);
    }
    return pts.length >= 2 ? `M ${pts.join(" L ")}` : "";
  }

  function clientToSvg(cx: number, cy: number): [number, number] {
    const el = svgRef.current;
    if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [(cx - r.left) * (W / r.width), (cy - r.top) * (H / r.height)];
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const [sx, sy] = clientToSvg(e.clientX, e.clientY);
    if (sx >= ml && sx <= ml + pw && sy >= mt && sy <= mt + ph) {
      setHoverPeriod(Math.max(1, Math.min(n, Math.round(1 + ((sx - ml) / pw) * (n - 1)))));
    } else {
      setHoverPeriod(null);
    }
  }

  const hoverData = useMemo(() => {
    if (hoverPeriod == null) return null;
    const i = hoverPeriod - 1;
    const obs = i < selectedLDFs.length && includeFlags[i] ? selectedLDFs[i] : null;
    const models = CURVES
      .filter(c => fits[c.key].ok)
      .map(c => ({ ...c, val: fitFns[c.key](hoverPeriod) }));
    return { period: hoverPeriod, obs, models };
  }, [hoverPeriod, selectedLDFs, includeFlags, fits, fitFns]);

  const anyFit = CURVES.some(c => fits[c.key].ok);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          width: "min(1020px, 97vw)",
          maxHeight: "94vh",
        }}
      >
        {/* Header */}
        <div className="px-6 py-3.5 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-alt)" }}>
          <span className="text-[14px] font-semibold">Fitted Curve Ratios</span>
          <button onClick={onClose}
            className="w-7 h-7 rounded-md text-[18px] flex items-center justify-center hover:bg-[color:var(--surface)] transition"
            style={{ color: "var(--muted)" }}>×</button>
        </div>

        <div className="overflow-y-auto">
          <div className="px-6 pt-5 pb-2">
            <div className="rounded-xl overflow-hidden" style={{ background: "#080c16", border: "1px solid rgba(255,255,255,0.08)" }}>
              <svg
                ref={svgRef}
                width="100%"
                viewBox={`0 0 ${W} ${H}`}
                style={{ display: "block", cursor: "crosshair", userSelect: "none" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverPeriod(null)}
              >
                <defs>
                  <clipPath id="cfc-clip">
                    <rect x={ml} y={mt} width={pw} height={ph} />
                  </clipPath>
                </defs>

                {/* Chart area bg */}
                <rect x={ml} y={mt} width={pw} height={ph} fill="rgba(255,255,255,0.015)" rx="2" />

                {/* Y grid + labels */}
                {yTicks.map((v, i) => {
                  const sy = yScale(v);
                  return (
                    <g key={i}>
                      <line x1={ml} y1={sy.toFixed(1)} x2={ml + pw} y2={sy.toFixed(1)}
                        stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                      <text x={ml - 10} y={sy + 3.5} textAnchor="end" fontSize="9.5"
                        fill="rgba(148,163,184,0.75)" fontFamily="ui-monospace,monospace">
                        {v.toFixed(4)}
                      </text>
                    </g>
                  );
                })}

                {/* X grid + labels */}
                {xTicks.map((t, i) => {
                  const sx = xScale(t);
                  return (
                    <g key={i}>
                      <line x1={sx.toFixed(1)} y1={mt} x2={sx.toFixed(1)} y2={mt + ph}
                        stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
                      <text x={sx} y={mt + ph + 17} textAnchor="middle" fontSize="9.5"
                        fill="rgba(148,163,184,0.65)">{t}</text>
                    </g>
                  );
                })}

                {/* Axis borders */}
                <line x1={ml} y1={mt} x2={ml} y2={mt + ph} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                <line x1={ml} y1={mt + ph} x2={ml + pw} y2={mt + ph} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

                {/* Axis label */}
                <text x={ml + pw / 2} y={H - 8} textAnchor="middle" fontSize="10.5"
                  fill="rgba(100,116,139,0.7)">Development Period</text>

                {/* Hover crosshair */}
                {hoverPeriod != null && (() => {
                  const sx = xScale(hoverPeriod);
                  return (
                    <line x1={sx.toFixed(1)} y1={mt} x2={sx.toFixed(1)} y2={mt + ph}
                      stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3" />
                  );
                })()}

                {/* Clipped data */}
                <g clipPath="url(#cfc-clip)">
                  {/* Fit curves */}
                  {CURVES.map(({ key, color }) => {
                    if (!fits[key].ok) return null;
                    const d = smoothPath(key);
                    if (!d) return null;
                    return (
                      <path key={key} d={d} fill="none" stroke={color}
                        strokeWidth="2.2" strokeOpacity="0.92" strokeLinejoin="round" strokeLinecap="round" />
                    );
                  })}

                  {/* Observed line */}
                  {(() => {
                    const pts = selectedLDFs
                      .map((ldf, i) => (!includeFlags[i] || ldf <= 1) ? null :
                        `${xScale(i + 1).toFixed(1)},${yScale(Math.max(yMin, Math.min(yMax, ldf))).toFixed(1)}`)
                      .filter((p): p is string => p !== null);
                    if (pts.length < 2) return null;
                    return (
                      <path d={`M ${pts.join(" L ")}`} fill="none"
                        stroke="rgba(226,232,240,0.7)" strokeWidth="1.75" strokeLinejoin="round" />
                    );
                  })()}

                  {/* Observed dots */}
                  {selectedLDFs.map((ldf, i) => {
                    if (!includeFlags[i] || ldf <= 1) return null;
                    const isHover = hoverPeriod === i + 1;
                    const sy = yScale(Math.max(yMin, Math.min(yMax, ldf)));
                    return (
                      <circle key={i}
                        cx={xScale(i + 1).toFixed(1)} cy={sy.toFixed(1)}
                        r={isHover ? "5" : "3"}
                        fill={isHover ? "#ffffff" : "rgba(226,232,240,0.88)"}
                        stroke={isHover ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"}
                        strokeWidth={isHover ? "1.5" : "0.75"}
                      />
                    );
                  })}

                  {/* Model dots at hover */}
                  {hoverPeriod != null && CURVES.map(({ key, color }) => {
                    if (!fits[key].ok) return null;
                    const v = fitFns[key](hoverPeriod);
                    if (v < yMin || v > yMax) return null;
                    return (
                      <circle key={key}
                        cx={xScale(hoverPeriod).toFixed(1)} cy={yScale(v).toFixed(1)}
                        r="4" fill={color} fillOpacity="0.95"
                        stroke="rgba(0,0,0,0.5)" strokeWidth="0.75" />
                    );
                  })}
                </g>

                {/* Legend */}
                {(() => {
                  const lx = ml + pw + 20;
                  const items = [
                    { label: "Observed", color: "rgba(226,232,240,0.8)" },
                    ...CURVES.filter(c => fits[c.key].ok).map(c => ({ label: c.label, color: c.color })),
                  ];
                  return items.map(({ label, color }, idx) => {
                    const ly = mt + 16 + idx * 26;
                    return (
                      <g key={label}>
                        <line x1={lx} y1={ly + 5} x2={lx + 20} y2={ly + 5}
                          stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                        <text x={lx + 28} y={ly + 9} fontSize="11" fill="rgba(148,163,184,0.9)">{label}</text>
                      </g>
                    );
                  });
                })()}

                {/* Tooltip */}
                {hoverData && (() => {
                  const sx = xScale(hoverData.period);
                  const rows: { label: string; val: string; color: string }[] = [];
                  if (hoverData.obs != null)
                    rows.push({ label: "Observed", val: hoverData.obs.toFixed(5), color: "rgba(226,232,240,0.9)" });
                  hoverData.models.forEach(m => rows.push({ label: m.label, val: m.val.toFixed(5), color: m.color }));

                  const bw = 172, lh = 17, bh = rows.length * lh + 30;
                  const tx = sx + 16 + bw > ml + pw ? sx - bw - 12 : sx + 16;
                  const ty = Math.max(mt + 4, Math.min(mt + ph - bh - 4, mt + ph / 2 - bh / 2));

                  return (
                    <g style={{ pointerEvents: "none" }}>
                      <text x={sx} y={mt - 10} textAnchor="middle" fontSize="10" fontWeight="600"
                        fill="rgba(226,232,240,0.55)" fontFamily="ui-monospace,monospace">
                        {hoverData.period}
                      </text>
                      <rect x={tx} y={ty} width={bw} height={bh} rx="7"
                        fill="rgba(5,8,18,0.97)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.75" />
                      <text x={tx + 13} y={ty + 17} fontSize="9.5" fontWeight="600" letterSpacing="0.8"
                        fill="rgba(148,163,184,0.5)" fontFamily="ui-monospace,monospace">
                        PERIOD {hoverData.period}
                      </text>
                      {rows.map(({ label, val, color }, ri) => (
                        <g key={ri}>
                          <rect x={tx + 13} y={ty + 24 + ri * lh + 3} width="10" height="3" rx="1.5" fill={color} />
                          <text x={tx + 29} y={ty + 24 + ri * lh + 12} fontSize="10"
                            fill="rgba(148,163,184,0.8)" fontFamily="ui-monospace,monospace">{label}</text>
                          <text x={tx + bw - 11} y={ty + 24 + ri * lh + 12} textAnchor="end" fontSize="10.5"
                            fontWeight="600" fill={color} fontFamily="ui-monospace,monospace">{val}</text>
                        </g>
                      ))}
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>

          {/* Stats table */}
          {anyFit && (
            <div className="px-6 pb-5 pt-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--muted)" }}>Fit Statistics</div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide"
                      style={{ background: "var(--surface-alt)", color: "var(--muted)" }}>
                      <th className="text-left px-4 py-2 font-semibold">Model</th>
                      <th className="text-right px-3 py-2 font-semibold">R²</th>
                      <th className="text-right px-3 py-2 font-semibold">χ²</th>
                      <th className="text-right px-3 py-2 font-semibold">df</th>
                      <th className="text-right px-3 py-2 font-semibold">p</th>
                      <th className="text-right px-4 py-2 font-semibold">Parametreler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CURVES.map(({ key, label, color }) => {
                      const fit = fits[key];
                      if (!fit.ok) return null;
                      const p = fit.params;
                      const paramStr = key === "invPower"
                        ? `a=${p.a?.toFixed(4)}, b=${p.b?.toFixed(4)}, c=${p.c?.toFixed(1)}`
                        : `a=${p.a?.toFixed(4)}, b=${p.b?.toFixed(4)}`;
                      const pVal = fit.chiSqP;
                      const pFmt = pVal == null || isNaN(pVal) ? "—" : pVal < 0.001 ? "<0.001" : pVal.toFixed(3);
                      const pColor = pVal == null || isNaN(pVal) ? "var(--muted)" : pVal < 0.05 ? "#f87171" : "#4ade80";
                      const r2 = fit.r2;
                      const r2Color = r2 == null ? "var(--muted)" : r2 > 0.98 ? "#4ade80" : r2 > 0.9 ? "#facc15" : "#f87171";
                      return (
                        <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                              <span className="font-semibold" style={{ color }}>{label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular font-semibold" style={{ color: r2Color }}>
                            {r2 != null ? r2.toFixed(4) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--muted-strong)" }}>
                            {fit.chiSq != null && isFinite(fit.chiSq) ? fit.chiSq.toFixed(3) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--muted)" }}>
                            {fit.chiSqDf ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular font-semibold" style={{ color: pColor }}>
                            {pFmt}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[11px] tabular" style={{ color: "var(--muted)" }}>
                            {paramStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
                R² &gt; 0.98 good · p &lt; 0.05 indicates poor fit · χ² = Σ(observed − fitted)² / fitted
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
