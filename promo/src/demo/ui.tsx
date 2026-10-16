// Agent demo — uygulamanın sohbet paneliyle aynı görsel dil (enterprise-v2 ChatPanel).
import React from "react";
import { Easing, interpolate } from "remotion";
import {
  AYS,
  DEV_PRIOR,
  HISTORY,
  INC,
  INC_CLEAN,
  LARGE,
  LARGE_FILE,
  LR_BASIS,
  MAX_CELL,
  MAX_DEV,
  NEW_EXPOSURE,
  OUT_AY,
  OUT_DEV,
  OVERSTATEMENT,
  PRIOR_LR,
  Q2_IBNR,
  Q3_IBNR,
  SUMMARY,
  TAIL,
  TAIL_FIT,
  TAIL_POINTS,
  ata,
  fmt,
  vwa,
} from "./data";

export const C = {
  bg: "#f6f7f9",
  surface: "#ffffff",
  alt: "#f1f3f6",
  border: "#e2e5ea",
  borderStrong: "#cbd1d9",
  fg: "#0f172a",
  muted: "#64748b",
  mutedStrong: "#475569",
  primary: "#1d4ed8",
  primarySoft: "#eaf0ff",
  primaryBorder: "#bfd3ff",
  success: "#15803d",
  successSoft: "#dcfce7",
  warning: "#b45309",
  warningSoft: "#fef3c7",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
};
export const SANS = "Geist, Inter, system-ui, sans-serif";
export const MONO = "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = (t: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(t, [a, b], [from, to], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
const lin = (t: number, a: number, b: number, from = 0, to = 1) => interpolate(t, [a, b], [from, to], clamp);

// ─── İkonlar ──────────────────────────────────────────────────────────────────
export const Spark: React.FC<{ size: number; stroke?: number }> = ({ size, stroke = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
    <path d="M19 15l1 2L22 18l-2 .6L19 21l-1-2.4L16 18l2-.6z" />
  </svg>
);
const Icon: React.FC<{ d: string; size?: number; sw?: number }> = ({ d, size = 13, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
export const I = {
  history: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
  plus: "M12 5v14M5 12h14",
  close: "M18 6L6 18M6 6l12 12",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  check: "M20 6L9 17l-5-5",
  mail: "M4 4h16v16H4zM4 6l8 7 8-7",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  layers: "M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
};

// ─── Satır içi biçim: **kalın** ───────────────────────────────────────────────
type Seg = { text: string; bold: boolean };
function segments(s: string): Seg[] {
  const out: Seg[] = [];
  s.split(/(\*\*[^*]+\*\*)/).forEach((p) => {
    if (!p) return;
    if (p.startsWith("**")) out.push({ text: p.slice(2, -2), bold: true });
    else out.push({ text: p, bold: false });
  });
  return out;
}

/** Akış hissi: kelimeler sırayla belirir; yerleşim baştan sabittir (yükseklik değişmez). */
export const Stream: React.FC<{ text: string; t: number; wps?: number }> = ({ text, t, wps = 16 }) => {
  let idx = 0;
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const bullet = line.startsWith("• ");
        const body = bullet ? line.slice(2) : line;
        const words = segments(body).flatMap((sg) =>
          sg.text.split(/(\s+)/).filter(Boolean).map((w) => ({ w, bold: sg.bold })),
        );
        const lineStart = idx;
        return (
          <div key={li} style={{ display: "flex", gap: 6, minHeight: line ? undefined : 6, marginTop: bullet && li > 0 ? 2 : 0 }}>
            {bullet && <span style={{ color: C.muted, opacity: lin(t, lineStart / wps, lineStart / wps + 0.18) }}>•</span>}
            <div>
              {words.map((wd, wi) => {
                const isSpace = /^\s+$/.test(wd.w);
                const k = isSpace ? idx : idx++;
                const o = lin(t, k / wps, k / wps + 0.18);
                return (
                  <span key={wi} style={{ opacity: o, fontWeight: wd.bold ? 600 : 400, whiteSpace: "pre-wrap" }}>
                    {wd.w}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
};

// ─── Mesajlar ─────────────────────────────────────────────────────────────────
export const Avatar: React.FC = () => (
  <div style={{ width: 24, height: 24, borderRadius: 12, background: C.primary, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>
    <Spark size={11} stroke={2.5} />
  </div>
);

export const AgentRow: React.FC<{ avatar?: boolean; children: React.ReactNode }> = ({ avatar, children }) => (
  <div style={{ display: "flex", gap: 8 }}>
    <div style={{ width: 24, flexShrink: 0 }}>{avatar && <Avatar />}</div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

export const UserBubble: React.FC<{ text: string; t: number }> = ({ text, t }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <div
      style={{
        maxWidth: "82%",
        background: C.primary,
        color: "#fff",
        borderRadius: 16,
        borderTopRightRadius: 4,
        padding: "9px 14px",
        fontSize: 14,
        lineHeight: 1.55,
        opacity: ease(t, 0, 0.3),
        transform: `translateY(${ease(t, 0, 0.4, 8, 0)}px)`,
      }}
    >
      {text}
    </div>
  </div>
);

export const AgentText: React.FC<{ text: string; t: number; avatar?: boolean; wps?: number }> = ({ text, t, avatar, wps }) => (
  <AgentRow avatar={avatar}>
    <div
      style={{
        display: "inline-block",
        maxWidth: "100%",
        background: C.alt,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        borderTopLeftRadius: avatar ? 4 : 16,
        padding: "9px 14px",
        fontSize: 14,
        lineHeight: 1.55,
        color: C.fg,
        opacity: ease(t, 0, 0.25),
      }}
    >
      <Stream text={text} t={t - 0.1} wps={wps} />
    </div>
  </AgentRow>
);

export const Typing: React.FC<{ t: number }> = ({ t }) => (
  <AgentRow avatar>
    <div style={{ display: "inline-flex", gap: 4, padding: "12px 14px", background: C.alt, border: `1px solid ${C.border}`, borderRadius: 16, borderTopLeftRadius: 4 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: C.muted, transform: `translateY(${-3 * Math.max(0, Math.sin((t * 6 - i * 0.7) % (Math.PI * 2)))}px)` }} />
      ))}
    </div>
  </AgentRow>
);

/** Araç çağrısı satırı: dönen halka → yeşil onay. */
export const ToolStep: React.FC<{ name: string; args?: string; t: number; dur: number; first?: boolean }> = ({ name, args, t, dur, first }) => {
  const done = t >= dur;
  const ok = ease(t, dur, dur + 0.25);
  return (
    <AgentRow avatar={first}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 26,
          fontFamily: MONO,
          fontSize: 12,
          color: C.mutedStrong,
          opacity: ease(t, 0, 0.2),
          transform: `translateX(${ease(t, 0, 0.3, -6, 0)}px)`,
        }}
      >
        <div style={{ width: 16, height: 16, position: "relative", flexShrink: 0 }}>
          {!done && (
            <svg width={16} height={16} viewBox="0 0 16 16" style={{ transform: `rotate(${t * 420}deg)` }}>
              <circle cx={8} cy={8} r={6} fill="none" stroke={C.border} strokeWidth={2} />
              <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke={C.primary} strokeWidth={2} strokeLinecap="round" />
            </svg>
          )}
          {done && (
            <div style={{ width: 16, height: 16, borderRadius: 8, background: C.successSoft, color: C.success, display: "grid", placeItems: "center", transform: `scale(${0.6 + 0.4 * ok})` }}>
              <Icon d={I.check} size={10} sw={3} />
            </div>
          )}
        </div>
        <span style={{ color: C.fg, fontWeight: 500 }}>{name}</span>
        {args && <span style={{ color: C.muted }}>({args})</span>}
        <span style={{ marginLeft: "auto", color: C.muted, opacity: ok, fontSize: 11 }}>{dur.toFixed(1)}s</span>
      </div>
    </AgentRow>
  );
};

// ─── Kart iskeleti ────────────────────────────────────────────────────────────
export const Card: React.FC<{
  t: number;
  icon: string;
  title: string;
  meta?: React.ReactNode;
  tone?: "default" | "primary" | "warning";
  children: React.ReactNode;
}> = ({ t, icon, title, meta, tone = "default", children }) => {
  const iconBg = tone === "warning" ? C.warningSoft : C.primarySoft;
  const iconFg = tone === "warning" ? C.warning : C.primary;
  return (
    <AgentRow>
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.12)",
          overflow: "hidden",
          opacity: ease(t, 0, 0.35),
          transform: `translateY(${ease(t, 0, 0.5, 12, 0)}px) scale(${ease(t, 0, 0.5, 0.985, 1)})`,
          transformOrigin: "top left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: iconBg, color: iconFg, display: "grid", placeItems: "center" }}>
            <Icon d={icon} size={12} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>{title}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{meta}</span>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </AgentRow>
  );
};

// ─── 1. Incurred üçgeni (roll-forward) — sayılar, yatay kaydırma ──────────────
const tint = (k: number) => `rgba(29,78,216,${(0.03 + 0.2 * k).toFixed(3)})`;

/** Kaydırma eğrisi (sn → px) ve bir x konumunun görünür alana girdiği an. */
function panAt(t: number, a: number, b: number, max: number) {
  return ease(t, a, b, 0, max);
}
function enterTime(x: number, viewW: number, a: number, b: number, max: number) {
  if (x < viewW) return null;
  for (let s = a; s <= b; s += 0.02) if (x - panAt(s, a, b, max) < viewW) return s;
  return b;
}

const GridScroll: React.FC<{ off: number; total: number; view: number; o: number }> = ({ off, total, view, o }) => (
  <div style={{ height: 5, borderRadius: 3, background: C.alt, marginTop: 8, position: "relative", opacity: o }}>
    <div style={{ position: "absolute", top: 0, height: 5, borderRadius: 3, background: C.borderStrong, width: `${(view / total) * 100}%`, left: `${(off / total) * 100}%` }} />
  </div>
);

export const TriangleCard: React.FC<{ t: number }> = ({ t }) => {
  const labelW = 54;
  const colW = 57;
  const rowH = 20;
  const viewW = 626 - labelW;
  const total = MAX_DEV * colW;
  const maxOff = total - viewW;
  const P0 = 2.0;
  const P1 = 5.2;
  // Eski yılların ucundan başla (sağ), genç kaza yıllarının dolu kısmında bitir (sol).
  const off = maxOff - panAt(t, P0, P1, maxOff);
  const mono: React.CSSProperties = { fontFamily: MONO, fontSize: 10.5, fontVariantNumeric: "tabular-nums" };
  return (
    <Card t={t} icon={I.grid} title="Incurred triangle · Fire Home" meta="cumulative · TRY m · 10 AY × 39 dev quarters">
      <div style={{ display: "flex" }}>
        <div style={{ width: labelW, flexShrink: 0 }}>
          <div style={{ height: rowH, ...mono, fontSize: 9.5, color: C.muted, display: "flex", alignItems: "center" }}>AY · dev</div>
          {AYS.map((ay) => (
            <div key={ay} style={{ height: rowH, ...mono, color: C.mutedStrong, display: "flex", alignItems: "center" }}>{ay}</div>
          ))}
        </div>
        <div style={{ width: viewW, overflow: "hidden", position: "relative" }}>
          <div style={{ width: total, transform: `translateX(${-off}px)` }}>
            <div style={{ display: "flex", height: rowH }}>
              {Array.from({ length: MAX_DEV }, (_, d) => (
                <div key={d} style={{ width: colW, ...mono, fontSize: 9.5, color: C.muted, textAlign: "right", paddingRight: 6, lineHeight: `${rowH}px`, borderBottom: `1px solid ${C.border}` }}>
                  {d + 1}
                </div>
              ))}
            </div>
            {AYS.map((ay, ri) => {
              const row = INC[ay];
              return (
                <div key={ay} style={{ display: "flex", height: rowH }}>
                  {Array.from({ length: MAX_DEV }, (_, d) => {
                    if (d >= row.length) return <div key={d} style={{ width: colW }} />;
                    const isNew = d === row.length - 1;
                    const x = d * colW;
                    const appear = Math.min(1.6, 0.2 + ri * 0.05 + Math.min(MAX_DEV - 1 - d, 11) * 0.03);
                    const o = ease(t, appear, appear + 0.3);
                    let g = 0;
                    let shown = 1;
                    if (isNew) {
                      const enter = enterTime(maxOff - x + colW * 0.6, viewW, P0, P1, maxOff) ?? 0.9 + ri * 0.08;
                      shown = ease(t, enter, enter + 0.2);
                      g = lin(t, enter, enter + 0.12) * (1 - ease(t, enter + 0.3, enter + 1.4));
                    }
                    const k = Math.sqrt(row[d] / MAX_CELL);
                    return (
                      <div
                        key={d}
                        style={{
                          width: colW,
                          height: rowH - 2,
                          marginTop: 1,
                          ...mono,
                          textAlign: "right",
                          paddingRight: 6,
                          lineHeight: `${rowH - 2}px`,
                          borderRadius: 3,
                          color: isNew ? C.primary : C.fg,
                          fontWeight: isNew ? 600 : 400,
                          background: isNew ? `rgba(219,231,255,${shown})` : tint(k),
                          boxShadow: isNew
                            ? `inset 0 0 0 ${1.2 * shown}px rgba(29,78,216,.55), 0 0 ${12 * g}px ${3 * g}px rgba(59,130,246,${0.55 * g})`
                            : undefined,
                          opacity: isNew ? shown : o,
                        }}
                      >
                        {fmt(row[d])}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <GridScroll off={off} total={total} view={viewW} o={ease(t, 1.0, 1.4)} />
      <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 11.5, color: C.mutedStrong, opacity: ease(t, 5.0, 5.5) }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#dbe7ff", boxShadow: `inset 0 0 0 1.2px rgba(29,78,216,.55)` }} />
          New diagonal · 2026Q3 (10 cells)
        </span>
        <span>210 cells · 18,412 claim files</span>
      </div>
    </Card>
  );
};

// ─── 2. LDF üçgeni (inceleme / hücre hariç) ───────────────────────────────────
export const LdfTriangleCard: React.FC<{ t: number; mode: "review" | "excluded" }> = ({ t, mode }) => {
  const labelW = 54;
  const colW = 56;
  const rowH = 21;
  const viewW = 626 - labelW;
  const cols = 38;
  const total = cols * colW;
  const target = (OUT_DEV - 7) * colW; // 8→9 … 17→18 görünür
  const review = mode === "review";
  const off = review ? ease(t, 0.5, 2.0, 0, target) : target;
  const hl = review ? ease(t, 2.1, 2.5) : 1;
  const pulse = review && t > 2.1 ? 0.5 + 0.5 * Math.sin((t - 2.1) * 5) : 0;
  const ex = review ? 0 : ease(t, 0.5, 0.9); // hücreyi hariç tutma
  const roll = review ? 0 : ease(t, 0.8, 1.9);
  const rows = AYS;
  const mono: React.CSSProperties = { fontFamily: MONO, fontSize: 10.5, fontVariantNumeric: "tabular-nums" };
  const vBefore = vwa(INC, OUT_DEV);
  const vAfter = vwa(INC_CLEAN, OUT_DEV);
  return (
    <Card
      t={t}
      icon={I.chart}
      title={review ? "Age-to-age factors · incurred" : "Factors updated"}
      meta={review ? "volume-weighted · last 8 AYs" : `AY${OUT_AY} · ${OUT_DEV}→${OUT_DEV + 1} excluded`}
    >
      <div style={{ display: "flex" }}>
        <div style={{ width: labelW, flexShrink: 0 }}>
          <div style={{ height: rowH, ...mono, fontSize: 9.5, color: C.muted, display: "flex", alignItems: "center" }}>AY</div>
          {rows.map((ay) => (
            <div key={ay} style={{ height: rowH, ...mono, color: C.mutedStrong, display: "flex", alignItems: "center" }}>{ay}</div>
          ))}
          <div style={{ height: rowH + 4, ...mono, color: C.fg, fontWeight: 600, display: "flex", alignItems: "center", borderTop: `1px solid ${C.border}` }}>VWA</div>
        </div>
        <div style={{ width: viewW, overflow: "hidden" }}>
          <div style={{ width: total, transform: `translateX(${-off}px)` }}>
            <div style={{ display: "flex", height: rowH }}>
              {Array.from({ length: cols }, (_, i) => (
                <div key={i} style={{ width: colW, ...mono, fontSize: 9.5, color: C.muted, textAlign: "right", paddingRight: 7, lineHeight: `${rowH}px`, borderBottom: `1px solid ${C.border}` }}>
                  {`${i + 1}→${i + 2}`}
                </div>
              ))}
            </div>
            {rows.map((ay, ri) => (
              <div key={ay} style={{ display: "flex", height: rowH, opacity: review ? ease(t, 0.1 + ri * 0.04, 0.4 + ri * 0.04) : 1 }}>
                {Array.from({ length: cols }, (_, i) => {
                  const d = i + 1;
                  const v = ata(INC, ay, d);
                  if (v === null) return <div key={i} style={{ width: colW }} />;
                  const isOut = ay === OUT_AY && d === OUT_DEV;
                  return (
                    <div
                      key={i}
                      style={{
                        width: colW,
                        height: rowH - 3,
                        marginTop: 1.5,
                        ...mono,
                        textAlign: "right",
                        paddingRight: 7,
                        lineHeight: `${rowH - 3}px`,
                        borderRadius: 3,
                        position: "relative",
                        color: isOut ? (ex > 0.5 ? C.muted : C.danger) : C.fg,
                        fontWeight: isOut ? 700 : 400,
                        textDecoration: isOut && ex > 0.5 ? "line-through" : undefined,
                        background: isOut
                          ? ex > 0
                            ? `repeating-linear-gradient(135deg, ${C.alt}, ${C.alt} 3px, #e5e9ef 3px, #e5e9ef 6px)`
                            : `rgba(254,226,226,${hl * (0.55 + 0.45 * pulse)})`
                          : undefined,
                        boxShadow: isOut && ex === 0 ? `inset 0 0 0 ${1.5 * hl}px rgba(185,28,28,${0.5 + 0.3 * pulse})` : undefined,
                      }}
                    >
                      {v.toFixed(3)}
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ display: "flex", height: rowH + 4, borderTop: `1px solid ${C.border}` }}>
              {Array.from({ length: cols }, (_, i) => {
                const d = i + 1;
                const isCol = d === OUT_DEV;
                const v = isCol ? vBefore + (vAfter - vBefore) * roll : vwa(INC_CLEAN, d);
                return (
                  <div
                    key={i}
                    style={{
                      width: colW,
                      ...mono,
                      fontWeight: 600,
                      textAlign: "right",
                      paddingRight: 7,
                      lineHeight: `${rowH + 4}px`,
                      color: isCol ? (review ? C.danger : roll > 0.98 ? C.success : C.fg) : C.fg,
                      background: isCol && !review ? `rgba(220,252,231,${ease(t, 1.8, 2.1) * (1 - ease(t, 3.4, 4.4))})` : undefined,
                      borderRadius: 3,
                      opacity: review ? ease(t, 0.6, 0.9) : 1,
                    }}
                  >
                    {v.toFixed(3)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {review ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 10px", borderRadius: 8, background: C.dangerSoft, color: C.danger, fontSize: 12, opacity: ease(t, 2.5, 2.9) }}>
          <Icon d={I.alert} size={13} />
          <span>
            <b>
              AY{OUT_AY} · {OUT_DEV}→{OUT_DEV + 1}
            </b>{" "}
            is {ata(INC, OUT_AY, OUT_DEV)!.toFixed(3)} against 1.000–1.001 for other years and lifts the column VWA to {vBefore.toFixed(3)}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 12px", borderRadius: 8, background: C.successSoft, color: C.success, fontSize: 12.5, opacity: ease(t, 2.0, 2.4), transform: `translateY(${ease(t, 2.0, 2.5, 6, 0)}px)` }}>
          <Icon d={I.check} size={13} sw={3} />
          <span>
            VWA {OUT_DEV}→{OUT_DEV + 1}: {vBefore.toFixed(3)} → <b>{vAfter.toFixed(3)}</b> · avoids overstating IBNR by <b>{OVERSTATEMENT.toFixed(1)}m</b>
          </span>
        </div>
      )}
    </Card>
  );
};

// ─── 3. Soru + butonlar ───────────────────────────────────────────────────────
export const AskCard: React.FC<{ t: number; clickAt: number }> = ({ t, clickAt }) => {
  const pressed = t >= clickAt;
  const press = lin(t, clickAt, clickAt + 0.12) * (1 - lin(t, clickAt + 0.12, clickAt + 0.3));
  return (
    <AgentRow>
      <div style={{ display: "flex", gap: 8, opacity: ease(t, 0, 0.3), transform: `translateY(${ease(t, 0, 0.4, 6, 0)}px)` }}>
        <div
          data-anchor="yes"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: pressed ? C.primary : C.primarySoft,
            color: pressed ? "#fff" : C.primary,
            border: `1px solid ${pressed ? C.primary : C.primaryBorder}`,
            transform: `scale(${1 - 0.05 * press})`,
          }}
        >
          Yes, ask them
        </div>
        <div style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: C.surface, color: C.mutedStrong, border: `1px solid ${C.border}`, opacity: pressed ? 0.45 : 1 }}>
          No, keep it as is
        </div>
      </div>
    </AgentRow>
  );
};

// ─── 4. Hasar ekibine mesaj ───────────────────────────────────────────────────
export const ClaimsMessageCard: React.FC<{ t: number; repliedAt: number }> = ({ t, repliedAt }) => {
  const replied = t >= repliedAt;
  const dot = 0.5 + 0.5 * Math.sin(t * 4);
  return (
    <Card t={t} icon={I.mail} title="Message to Claims team" meta="Fire & Property · via Actuarius">
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
        Re: <span style={{ fontFamily: MONO, color: C.fg }}>{LARGE_FILE}</span> · AY2023 · Fire Home
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: C.fg, padding: "10px 12px", background: C.alt, borderRadius: 8, borderLeft: `3px solid ${C.primaryBorder}` }}>
        File <b>{LARGE_FILE}</b> shows an increase of <b>{LARGE.toFixed(1)}m</b> booked in 2026Q3. Can you confirm the nature of
        the loss and whether further development is expected?
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: replied ? C.success : C.warning }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: replied ? C.success : C.warning, opacity: replied ? 1 : 0.4 + 0.6 * dot }} />
        {replied ? "Replied" : "Sent · awaiting reply"}
      </div>
    </Card>
  );
};

// ─── 5. Hasar ekibinin yanıtı ─────────────────────────────────────────────────
export const ClaimsReply: React.FC<{ t: number }> = ({ t }) => (
  <AgentRow>
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        background: "#fffdf5",
        border: `1px solid #fde68a`,
        borderRadius: 12,
        opacity: ease(t, 0, 0.35),
        transform: `translateY(${ease(t, 0, 0.5, 14, 0)}px)`,
        boxShadow: `0 0 0 ${4 * (1 - ease(t, 0.2, 1.6))}px rgba(251,191,36,.25)`,
      }}
    >
      <div style={{ width: 30, height: 30, borderRadius: 15, background: "#f59e0b", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>CT</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: C.fg }}>Claims team · Fire & Property</span>
          <span style={{ color: C.muted }}>replied to {LARGE_FILE}</span>
          <span style={{ marginLeft: "auto", color: C.muted }}>just now</span>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.fg, marginTop: 4 }}>
          <Stream text="Villa fire, total loss. Final settlement agreed this quarter; no further development expected." t={t - 0.4} wps={14} />
        </div>
      </div>
    </div>
  </AgentRow>
);

// ─── 6. Kuyruk uyumu ──────────────────────────────────────────────────────────
export const TailCard: React.FC<{ t: number }> = ({ t }) => {
  const W = 600;
  const H = 168;
  const pad = { l: 46, r: 12, t: 10, b: 22 };
  const xMax = 52;
  const x = (d: number) => pad.l + ((d - 1) / (xMax - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => {
    const lo = Math.log10(1e-5);
    const hi = Math.log10(1);
    const k = (Math.log10(Math.max(v, 1e-5)) - lo) / (hi - lo);
    return pad.t + (1 - k) * (H - pad.t - pad.b);
  };
  const curve = Array.from({ length: 100 }, (_, i) => 4 + (i / 99) * (xMax - 4));
  const path = curve.map((d, i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(TAIL_FIT(d)).toFixed(1)}`).join(" ");
  const draw = ease(t, 1.3, 3.0);
  return (
    <Card t={t} icon={I.chart} title="Tail fit · inverse power" meta="selected factors − 1 (log scale)">
      <svg width={W} height={H} style={{ display: "block" }}>
        {[1e-4, 1e-3, 1e-2, 1e-1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={C.alt} />
            <text x={pad.l - 6} y={y(v) + 3} fontSize={9} textAnchor="end" fill={C.muted} fontFamily={MONO}>
              {v >= 0.01 ? v : v >= 0.001 ? "0.001" : "0.0001"}
            </text>
          </g>
        ))}
        <rect x={x(39)} y={pad.t} width={x(xMax) - x(39)} height={H - pad.t - pad.b} fill={C.primarySoft} opacity={ease(t, 2.6, 3.2) * 0.8} />
        <text x={x(45.5)} y={pad.t + 14} fontSize={10} textAnchor="middle" fill={C.primary} opacity={ease(t, 2.8, 3.3)} fontFamily={SANS}>
          tail beyond dev 39
        </text>
        {[1, 8, 16, 24, 32, 39].map((d) => (
          <text key={d} x={x(d)} y={H - 6} fontSize={9} textAnchor="middle" fill={C.muted} fontFamily={MONO}>
            {d}
          </text>
        ))}
        <path d={path} fill="none" stroke={C.primary} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        {TAIL_POINTS.map((p, i) => {
          const a = 0.1 + i * 0.028;
          return <circle key={p.d} cx={x(p.d)} cy={y(p.y)} r={2.6} fill={C.fg} opacity={ease(t, a, a + 0.2) * 0.75} />;
        })}
      </svg>
      <div style={{ display: "flex", gap: 8, marginTop: 8, opacity: ease(t, 3.0, 3.5) }}>
        {[
          ["R²", "0.991"],
          ["Tail factor", TAIL.toFixed(3)],
          ["Window", "8 AYs"],
        ].map(([k, v]) => (
          <span key={k} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: C.alt, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}>{k} </span>
            <b style={{ fontFamily: MONO }}>{v}</b>
          </span>
        ))}
      </div>
    </Card>
  );
};

// ─── 7. BF tablosu (uygulamadaki BF sekmesiyle aynı sütunlar) ──────────────────
export const BfTableCard: React.FC<{ t: number }> = ({ t }) => {
  const basisOn = ease(t, 1.0, 1.5);
  const formula = ease(t, 2.0, 2.4);
  const evalOn = ease(t, 2.6, 3.0);
  const ultP = ease(t, 3.0, 4.0);
  const th: React.CSSProperties = { fontSize: 9, color: C.mutedStrong, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", padding: "6px 5px", lineHeight: 1.25, verticalAlign: "bottom" };
  const td: React.CSSProperties = { fontFamily: MONO, fontSize: 10.5, textAlign: "right", padding: "0 5px", height: 21, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden" };
  const latestTot = SUMMARY.reduce((s, r) => s + r.latest, 0);
  const epTot = SUMMARY.reduce((s, r) => s + r.ep, 0);
  const basisFrom = LR_BASIS[0];
  const basisTo = LR_BASIS[LR_BASIS.length - 1];
  return (
    <Card t={t} icon={I.chart} title="BF — Selected Loss Ratio Method" meta={`BF on AY2026 · prior vw(${basisFrom}:${basisTo})`}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          {[64, 66, 60, 38, 70, 66, 150, 112].map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: C.alt }}>
            <th style={{ ...th, textAlign: "left" }}>Accident Year</th>
            <th style={th}>Latest</th>
            <th style={th}>Exposure</th>
            <th style={th}>Corr.</th>
            <th style={th}>% Developed</th>
            <th style={th}>Pattern Ratio</th>
            <th style={th}>Selected LR</th>
            <th style={th}>New Ultimate</th>
          </tr>
        </thead>
        <tbody>
          {SUMMARY.map((r, i) => {
            const inBasis = LR_BASIS.includes(r.ay);
            const isBf = r.bf;
            const o = ease(t, 0.15 + i * 0.05, 0.45 + i * 0.05);
            return (
              <tr key={r.ay} style={{ borderTop: `1px solid ${C.border}`, opacity: o, background: isBf ? `rgba(234,240,255,${ease(t, 1.9, 2.3)})` : undefined }}>
                <td style={{ ...td, fontFamily: SANS, fontWeight: 500, textAlign: "left", fontSize: 11.5 }}>{r.ay}</td>
                <td style={td}>{fmt(r.latest)}</td>
                <td style={td}>{fmt(r.ep, 0)}</td>
                <td style={{ ...td, color: C.muted }}>×1</td>
                <td style={{ ...td, color: C.mutedStrong }}>{(100 / r.cdf).toFixed(1)}%</td>
                <td style={{ ...td, color: inBasis ? C.primary : C.mutedStrong, fontWeight: inBasis ? 600 : 400, position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      inset: "1px 0",
                      borderRadius: 4,
                      background: inBasis ? `rgba(29,78,216,${0.1 * basisOn})` : undefined,
                      boxShadow: inBasis ? `inset 2px 0 0 rgba(29,78,216,${basisOn})` : undefined,
                    }}
                  />
                  <span style={{ position: "relative" }}>{(r.pattern * 100).toFixed(1)}%</span>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  {isBf ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: formula }}>
                      <span style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.primaryBorder}`, background: C.surface, color: C.primary, fontSize: 10 }}>
                        vw({basisFrom}:{basisTo})
                      </span>
                      <b style={{ opacity: evalOn }}>{(PRIOR_LR * 100).toFixed(1)}%</b>
                    </span>
                  ) : (
                    <span style={{ color: C.borderStrong }}>—</span>
                  )}
                </td>
                <td style={{ ...td, fontWeight: 600, color: isBf ? C.success : C.borderStrong }}>{isBf ? fmt(r.ult * ultP) : "—"}</td>
              </tr>
            );
          })}
          <tr style={{ borderTop: `2px solid ${C.borderStrong}`, background: C.alt, opacity: ease(t, 0.7, 1.0) }}>
            <td style={{ ...td, fontFamily: SANS, fontWeight: 600, textAlign: "left", fontSize: 11.5 }}>Total</td>
            <td style={{ ...td, fontWeight: 600 }}>{fmt(latestTot)}</td>
            <td style={{ ...td, fontWeight: 600 }}>{fmt(epTot, 0)}</td>
            <td />
            <td />
            <td />
            <td />
            <td />
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: C.mutedStrong, opacity: ease(t, 1.4, 1.8) }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(29,78,216,.12)", boxShadow: "inset 2px 0 0 #1d4ed8" }} />
        Prior loss ratio basis: AY{basisFrom}–{basisTo}, premium-weighted
        <span style={{ marginLeft: "auto", color: C.muted }}>AY2017–2025 stay on chain-ladder</span>
      </div>
    </Card>
  );
};

// ─── 9b. Rapor tarihi bazında gelişim (EP · Incurred · IBNR) ───────────────────
export type HistoryMode = "table" | "chart";

const HistoryTable: React.FC<{ t: number }> = ({ t }) => {
  const th: React.CSSProperties = { fontSize: 9, color: C.mutedStrong, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", padding: "6px 6px" };
  const td: React.CSSProperties = { fontFamily: MONO, fontSize: 11, textAlign: "right", padding: "0 6px", height: 24, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <colgroup>
        {[78, 92, 92, 82, 92, 70, 80].map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ background: C.alt }}>
          <th style={{ ...th, textAlign: "left" }}>Report date</th>
          <th style={th}>Earned premium</th>
          <th style={th}>Incurred</th>
          <th style={th}>IBNR</th>
          <th style={th}>Ultimate</th>
          <th style={th}>Ult. LR</th>
          <th style={th}>IBNR q/q</th>
        </tr>
      </thead>
      <tbody>
        {HISTORY.map((h, i) => {
          const cur = i === HISTORY.length - 1;
          const prev = i ? HISTORY[i - 1] : null;
          const d = prev ? h.ibnr - prev.ibnr : null;
          return (
            <tr key={h.label} style={{ borderTop: `1px solid ${C.border}`, opacity: ease(t, i * 0.15, 0.35 + i * 0.15), background: cur ? C.primarySoft : undefined }}>
              <td style={{ ...td, fontFamily: SANS, fontWeight: cur ? 600 : 500, textAlign: "left", fontSize: 11.5, color: cur ? C.primary : C.fg }}>{h.label}</td>
              <td style={td}>{fmt(h.ep, 0)}</td>
              <td style={td}>{fmt(h.inc)}</td>
              <td style={{ ...td, fontWeight: 600 }}>{fmt(h.ibnr)}</td>
              <td style={td}>{fmt(h.ult)}</td>
              <td style={{ ...td, color: C.mutedStrong }}>{((h.ult / h.ep) * 100).toFixed(1)}%</td>
              <td style={{ ...td, color: C.mutedStrong }}>{d === null ? "—" : `${d > 0 ? "+" : ""}${fmt(d)}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/** Küçük çoklu grafik: her ölçü kendi ekseninde (EP ile IBNR'ın ölçekleri çok farklı). */
const MiniBars: React.FC<{ t: number; title: string; values: number[]; dp?: number; delay: number; accent?: boolean }> = ({ t, title, values, dp = 1, delay, accent }) => {
  const W = 198;
  const H = 150;
  const pad = { t: 22, b: 20 };
  const max = Math.max(...values) * 1.12;
  const bw = 30;
  const band = W / values.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <div style={{ width: W }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.fg, marginBottom: 4 }}>{title}</div>
      <svg width={W} height={H} style={{ display: "block" }}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={C.borderStrong} />
        {values.map((v, i) => {
          const cur = i === values.length - 1;
          const p = ease(t, delay + i * 0.12, delay + 0.6 + i * 0.12);
          const cx = band * (i + 0.5);
          const top = y(v * p);
          const h = y(0) - top;
          const fill = cur ? C.primary : accent ? "#9db8f4" : "#c7d6f7";
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(0, h)} rx={4} fill={fill} />
              {h > 4 && <rect x={cx - bw / 2} y={top + 4} width={bw} height={Math.max(0, h - 4)} fill={fill} />}
              <text x={cx} y={top - 6} fontSize={9.5} textAnchor="middle" fill={C.fg} fontWeight={cur ? 700 : 500} fontFamily={MONO} opacity={ease(t, delay + 0.4 + i * 0.12, delay + 0.7 + i * 0.12)}>
                {fmt(v, dp)}
              </text>
              <text x={cx} y={H - 5} fontSize={9} textAnchor="middle" fill={cur ? C.primary : C.muted} fontWeight={cur ? 600 : 400} fontFamily={MONO}>
                {HISTORY[i].label.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const HistoryChart: React.FC<{ t: number }> = ({ t }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <MiniBars t={t} title="Earned premium" values={HISTORY.map((h) => h.ep)} dp={0} delay={0} />
      <MiniBars t={t} title="Incurred" values={HISTORY.map((h) => h.inc)} delay={0.3} />
      <MiniBars t={t} title="IBNR" values={HISTORY.map((h) => h.ibnr)} delay={0.6} accent />
    </div>
    <div style={{ fontSize: 11, color: C.muted, marginTop: 6, opacity: ease(t, 1.2, 1.6) }}>
      Cumulative across AY2017–2026 · TRY m · each panel on its own scale · current report date highlighted
    </div>
  </div>
);

const HistoryPanel: React.FC<{ t: number; mode: HistoryMode }> = ({ t, mode }) => (
  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
    <div style={{ fontSize: 11, color: C.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8, opacity: ease(t, 0, 0.3) }}>
      Development by report date · {HISTORY[0].label} → {HISTORY[HISTORY.length - 1].label}
    </div>
    {mode === "table" ? <HistoryTable t={t} /> : <HistoryChart t={t} />}
  </div>
);

// ─── 9. Sonuç ─────────────────────────────────────────────────────────────────
export const ResultCard: React.FC<{ t: number; history?: HistoryMode }> = ({ t, history = "chart" }) => {
  const count = ease(t, 0.3, 2.2);
  const chg = Q3_IBNR - Q2_IBNR;
  return (
    <Card t={t} icon={I.chart} title="Q3 2026 reserve summary · Fire Home" meta="chain-ladder + BF · TRY">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 0.4, textTransform: "uppercase" }}>IBNR</div>
          <div style={{ fontSize: 40, fontWeight: 650, letterSpacing: -1, color: C.fg, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {fmt(Q3_IBNR * count)}m
          </div>
        </div>
        <div style={{ marginBottom: 6, padding: "4px 10px", borderRadius: 999, background: C.alt, border: `1px solid ${C.border}`, fontSize: 12.5, opacity: ease(t, 2.0, 2.4) }}>
          vs Q2 <b style={{ fontFamily: MONO }}>{fmt(chg)}m</b> <span style={{ color: C.muted }}>({fmt((100 * chg) / Q2_IBNR)}%)</span>
        </div>
        <div style={{ marginLeft: "auto", marginBottom: 6, fontSize: 12, color: C.muted, textAlign: "right", opacity: ease(t, 2.2, 2.6) }}>
          Ultimate <b style={{ color: C.fg, fontFamily: MONO }}>{fmt(SUMMARY.reduce((s, r) => s + r.ult, 0))}m</b>
          <br />
          chain-ladder AY2017–25 · BF AY2026
        </div>
      </div>
      <HistoryPanel t={t - 2.4} mode={history} />
    </Card>
  );
};

// ─── 10. Kayıt + öneriler ─────────────────────────────────────────────────────
export const SavedLine: React.FC<{ t: number; steps: number }> = ({ t, steps }) => (
  <AgentRow>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mutedStrong, opacity: ease(t, 0, 0.3) }}>
      <div style={{ width: 18, height: 18, borderRadius: 9, background: C.successSoft, color: C.success, display: "grid", placeItems: "center" }}>
        <Icon d={I.save} size={10} />
      </div>
      Saved as version <b style={{ color: C.fg }}>Q3 close · v1</b>
      <span style={{ color: C.borderStrong }}>·</span>
      {steps} steps logged to the audit trail
    </div>
  </AgentRow>
);

export const Suggestions: React.FC<{ t: number }> = ({ t }) => (
  <AgentRow>
    <div style={{ display: "flex", gap: 8 }}>
      {["Run cashflow", "Discount (IFRS 17)", "Export report"].map((s, i) => (
        <div
          key={s}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 12.5,
            border: `1px solid ${C.primaryBorder}`,
            color: C.primary,
            background: C.surface,
            opacity: ease(t, i * 0.12, 0.3 + i * 0.12),
            transform: `translateY(${ease(t, i * 0.12, 0.4 + i * 0.12, 6, 0)}px)`,
          }}
        >
          {s} →
        </div>
      ))}
    </div>
  </AgentRow>
);

export { Icon };
