// Agent demo — uygulamanın sohbet paneliyle aynı görsel dil (enterprise-v2 ChatPanel).
import React from "react";
import { Easing, interpolate } from "remotion";
import {
  AYS,
  DEV_PRIOR,
  INC,
  INC_CLEAN,
  LARGE,
  LARGE_FILE,
  MAX_CELL,
  MAX_DEV,
  NEW_EXPOSURE,
  OVERSTATEMENT,
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

// ─── 1. Üçgen (roll-forward) ──────────────────────────────────────────────────
const blue = (m: number) => {
  // olgunluk → açık maviden koyu laciverte
  const a = [234, 240, 255];
  const b = [29, 78, 216];
  const k = Math.pow(m, 1.6);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
};
export const TriangleCard: React.FC<{ t: number }> = ({ t }) => {
  const cell = 13.4;
  const gap = 1.2;
  const labelW = 44;
  return (
    <Card t={t} icon={I.grid} title="Incurred triangle · Fire Home" meta="10 accident years × 39 dev quarters">
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {AYS.map((ay, ri) => {
          const n = INC[ay].length;
          return (
            <div key={ay} style={{ display: "flex", alignItems: "center", gap }}>
              <div style={{ width: labelW, fontFamily: MONO, fontSize: 10, color: C.muted }}>AY{ay}</div>
              {Array.from({ length: MAX_DEV }, (_, d) => {
                const dev = d + 1;
                if (dev > n) return <div key={d} style={{ width: cell, height: cell }} />;
                const isNew = dev === n; // 2026Q3 diyagonali
                const cal = ri * 4 + dev; // takvim çeyreği sırası
                const appear = isNew ? 2.0 + ri * 0.11 : 0.15 + cal * 0.035;
                const o = ease(t, appear, appear + 0.25);
                const glow = isNew ? lin(t, appear, appear + 0.15) * (1 - ease(t, appear + 0.4, appear + 1.6)) : 0;
                const isLarge = ay === 2023 && isNew;
                return (
                  <div
                    key={d}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 2.5,
                      background: glow > 0.02 ? "#3b82f6" : blue(Math.sqrt(INC_CLEAN[ay][d] / MAX_CELL)),
                      opacity: o,
                      boxShadow: glow > 0.02 ? `0 0 ${10 * glow}px ${2 * glow}px rgba(59,130,246,${0.7 * glow})` : undefined,
                      outline: isNew && t > appear + 1.6 ? `1.5px solid ${isLarge ? C.primary : "rgba(29,78,216,.55)"}` : undefined,
                      outlineOffset: -1.5,
                      transform: `scale(${0.6 + 0.4 * o + 0.18 * glow})`,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11.5, color: C.mutedStrong, opacity: ease(t, 3.4, 3.9) }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, outline: `1.5px solid ${C.primary}`, background: blue(0.8) }} />
          New diagonal · 2026Q3 (10 cells)
        </span>
        <span>210 cells · 18,412 claim files</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 40, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${blue(0.1)}, ${blue(1)})` }} /> incurred amount
        </span>
      </div>
    </Card>
  );
};

// ─── 2. LDF tablosu ───────────────────────────────────────────────────────────
const LDF_COLS = [11, 12, 13, 14];
const LDF_ROWS = [2019, 2020, 2021, 2022, 2023];
export const LdfCard: React.FC<{ t: number }> = ({ t }) => {
  const pulse = t > 1.2 ? 0.5 + 0.5 * Math.sin((t - 1.2) * 5) : 0;
  const hl = ease(t, 1.0, 1.5);
  const th: React.CSSProperties = { fontSize: 11, color: C.muted, fontWeight: 500, textAlign: "right", padding: "6px 10px", fontFamily: MONO };
  const td: React.CSSProperties = { fontSize: 12.5, textAlign: "right", padding: "6px 10px", fontFamily: MONO, color: C.fg };
  return (
    <Card t={t} icon={I.chart} title="Age-to-age factors · incurred" meta="volume-weighted · last 8 AYs">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ ...th, textAlign: "left" }}>AY</th>
            {LDF_COLS.map((d) => (
              <th key={d} style={th}>{`${d}→${d + 1}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LDF_ROWS.map((ay, ri) => (
            <tr key={ay} style={{ borderBottom: `1px solid ${C.alt}`, opacity: ease(t, 0.2 + ri * 0.08, 0.5 + ri * 0.08) }}>
              <td style={{ ...td, textAlign: "left", color: C.mutedStrong }}>{ay}</td>
              {LDF_COLS.map((d) => {
                const v = ata(INC, ay, d);
                const isOut = ay === 2023 && d === 14;
                return (
                  <td
                    key={d}
                    style={{
                      ...td,
                      color: isOut ? C.danger : v === null ? C.borderStrong : C.fg,
                      fontWeight: isOut ? 700 : 400,
                      background: isOut ? `rgba(254,226,226,${hl * (0.55 + 0.45 * pulse)})` : undefined,
                      boxShadow: isOut ? `inset 0 0 0 ${1.5 * hl}px rgba(185,28,28,${0.5 + 0.3 * pulse})` : undefined,
                      borderRadius: 4,
                    }}
                  >
                    {v === null ? "—" : v.toFixed(3)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr style={{ opacity: ease(t, 0.7, 1.0) }}>
            <td style={{ ...td, textAlign: "left", color: C.muted, fontSize: 11 }}>VWA</td>
            {LDF_COLS.map((d) => (
              <td key={d} style={{ ...td, fontWeight: 600 }}>{vwa(INC_CLEAN, d).toFixed(3)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 10px", borderRadius: 8, background: C.dangerSoft, color: C.danger, fontSize: 12, opacity: ease(t, 1.6, 2.0) }}>
        <Icon d={I.alert} size={13} />
        <span>
          <b>AY2023 · 14→15</b> is {ata(INC, 2023, 14)!.toFixed(3)} vs a column average of {vwa(INC_CLEAN, 14).toFixed(3)} (latest diagonal)
        </span>
      </div>
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

// ─── 7. Faktör güncellemesi (büyük hasar çıkarılınca) ─────────────────────────
const Roll: React.FC<{ from: number; to: number; p: number; dp?: number }> = ({ from, to, p, dp = 3 }) => (
  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{(from + (to - from) * p).toFixed(dp)}</span>
);
export const LdfUpdateCard: React.FC<{ t: number }> = ({ t }) => {
  const p = ease(t, 0.6, 1.8);
  const before = ata(INC, 2023, 14)!;
  const after = ata(INC_CLEAN, 2023, 14)!;
  const colB = vwa(INC, 14);
  const colA = vwa(INC_CLEAN, 14);
  const Box: React.FC<{ label: string; children: React.ReactNode; tone?: string }> = ({ label, children, tone }) => (
    <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: C.alt, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: tone ?? C.fg }}>{children}</div>
    </div>
  );
  return (
    <Card t={t} icon={I.layers} title="Factors updated" meta={`${LARGE_FILE} held outside the triangle`}>
      <div style={{ display: "flex", gap: 10 }}>
        <Box label="AY2023 · 14→15" tone={p < 0.5 ? C.danger : C.fg}>
          <Roll from={before} to={after} p={p} />
        </Box>
        <Box label="Column 14→15 (VWA)">
          <Roll from={colB} to={colA} p={p} />
        </Box>
        <Box label="Large claim, reserved separately">
          <span style={{ fontFamily: MONO }}>{LARGE.toFixed(1)}m</span>
        </Box>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 8,
          background: C.successSoft,
          color: C.success,
          fontSize: 12.5,
          opacity: ease(t, 1.9, 2.3),
          transform: `translateY(${ease(t, 1.9, 2.4, 6, 0)}px)`,
        }}
      >
        <Icon d={I.check} size={13} sw={3} />
        <span>
          Avoids overstating IBNR by <b>{OVERSTATEMENT.toFixed(1)}m</b> (the jump would have flowed into AY2024's projection)
        </span>
      </div>
    </Card>
  );
};

// ─── 8. BF ────────────────────────────────────────────────────────────────────
export const BfCard: React.FC<{ t: number }> = ({ t }) => {
  const rows = SUMMARY.filter((r) => r.ay >= 2025);
  return (
    <Card t={t} icon={I.chart} title="Bornhuetter–Ferguson · AY2025–2026" meta="prior LR 62% (3-year average)">
      {rows.map((r, i) => {
        const rep = 1 / r.cdf;
        const p = ease(t, 0.3 + i * 0.25, 1.4 + i * 0.25);
        return (
          <div key={r.ay} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: i ? 10 : 0 }}>
            <span style={{ width: 56, fontFamily: MONO, fontSize: 12, color: C.mutedStrong }}>AY{r.ay}</span>
            <div style={{ flex: 1, height: 18, borderRadius: 5, background: C.alt, overflow: "hidden", position: "relative" }}>
              <div style={{ width: `${rep * 100 * p}%`, height: "100%", background: C.primary, borderRadius: 5 }} />
              <div style={{ position: "absolute", left: `${rep * 100 * p}%`, top: 0, height: "100%", width: `${(1 - rep) * 100 * p}%`, background: `repeating-linear-gradient(135deg, ${C.primarySoft}, ${C.primarySoft} 4px, #d6e2ff 4px, #d6e2ff 8px)` }} />
            </div>
            <span style={{ width: 120, fontSize: 12, color: C.mutedStrong, textAlign: "right" }}>
              <b style={{ color: C.fg, fontFamily: MONO }}>{(rep * 100 * p).toFixed(1)}%</b> reported
            </span>
            <span style={{ width: 96, fontSize: 12, textAlign: "right", fontFamily: MONO }}>IBNR {fmt(r.ibnr * p)}m</span>
          </div>
        );
      })}
    </Card>
  );
};

// ─── 9. Sonuç ─────────────────────────────────────────────────────────────────
export const ResultCard: React.FC<{ t: number }> = ({ t }) => {
  const count = ease(t, 0.3, 2.2);
  const chg = Q3_IBNR - Q2_IBNR;
  // Köprü grafiği
  const W = 600;
  const H = 150;
  const top = 500;
  const sy = (v: number) => H - 22 - (v / top) * (H - 34);
  const steps = [
    { label: "Q2 IBNR", from: 0, to: Q2_IBNR, kind: "total" },
    { label: "Prior-period run-off", from: Q2_IBNR, to: Q2_IBNR + DEV_PRIOR, kind: "down" },
    { label: "New exposure", from: Q2_IBNR + DEV_PRIOR, to: Q2_IBNR + DEV_PRIOR + NEW_EXPOSURE, kind: "up" },
    { label: "Q3 IBNR", from: 0, to: Q3_IBNR, kind: "final" },
  ] as const;
  const bw = 96;
  const gapX = (W - steps.length * bw) / (steps.length + 1);
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
          <br />+ large claim held separately <b style={{ color: C.fg, fontFamily: MONO }}>{LARGE.toFixed(1)}m</b>
        </div>
      </div>
      <svg width={W} height={H} style={{ display: "block", marginTop: 10 }}>
        <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke={C.border} />
        {steps.map((s, i) => {
          const a = 2.4 + i * 0.45;
          const p = ease(t, a, a + 0.6);
          const x0 = gapX + i * (bw + gapX);
          const lo = Math.min(s.from, s.to);
          const hi = Math.max(s.from, s.to);
          const color = s.kind === "down" ? "#94a3b8" : s.kind === "up" ? "#60a5fa" : s.kind === "final" ? C.primary : "#334155";
          const y1 = sy(hi);
          const y0 = sy(lo);
          const hh = (y0 - y1) * p;
          const yTop = s.kind === "down" ? y1 : y0 - hh;
          const delta = s.to - s.from;
          return (
            <g key={i} opacity={lin(t, a, a + 0.2)}>
              <rect x={x0} y={yTop} width={bw} height={hh} rx={4} fill={color} />
              {i < steps.length - 1 && (
                <line x1={x0 + bw} x2={x0 + bw + gapX} y1={sy(s.to)} y2={sy(s.to)} stroke={C.borderStrong} strokeDasharray="3 3" opacity={ease(t, a + 0.5, a + 0.8)} />
              )}
              <text x={x0 + bw / 2} y={y1 - 6} fontSize={12} textAnchor="middle" fill={C.fg} fontWeight={600} fontFamily={MONO} opacity={ease(t, a + 0.4, a + 0.7)}>
                {s.kind === "total" || s.kind === "final" ? fmt(s.to) : `${delta > 0 ? "+" : ""}${fmt(delta)}`}
              </text>
              <text x={x0 + bw / 2} y={H - 6} fontSize={10} textAnchor="middle" fill={C.muted} fontFamily={SANS}>
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4, opacity: ease(t, 4.4, 4.9) }}>
        {SUMMARY.map((r, i) => (
          <div key={r.ay} style={{ textAlign: "center", padding: "5px 0", borderRadius: 6, background: C.alt, opacity: ease(t, 4.4 + i * 0.05, 4.8 + i * 0.05) }}>
            <div style={{ fontSize: 9.5, color: C.muted, fontFamily: MONO }}>AY{String(r.ay).slice(2)}</div>
            <div style={{ fontSize: 11.5, color: C.fg, fontFamily: MONO, fontWeight: 500 }}>{fmt(r.ibnr)}</div>
          </div>
        ))}
      </div>
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
