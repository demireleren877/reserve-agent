import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT_MONO, FONT_SANS, FONT_SERIF } from "./theme";
import { Backdrop, CountUp, TriangleMark, useSceneFade } from "./util";

const center: React.CSSProperties = {
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
};

/** Aşağıdan yay ile beliren blok. */
const Rise: React.FC<{ delay?: number; children: React.ReactNode; y?: number }> = ({
  delay = 0,
  y = 40,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div style={{ opacity: p, transform: `translateY(${interpolate(p, [0, 1], [y, 0])}px)` }}>
      {children}
    </div>
  );
};

const eyebrow: React.CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 22,
  letterSpacing: 6,
  textTransform: "uppercase",
  color: C.accent,
  fontWeight: 700,
};

// ─────────────────────────── 1 · INTRO ───────────────────────────
export const Intro: React.FC = () => {
  const opacity = useSceneFade();
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ ...center, opacity, flexDirection: "column", gap: 30 }}>
        <TriangleMark size={150} delay={4} />
        <Rise delay={30}>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 104, fontWeight: 600, color: C.ink, letterSpacing: -2, lineHeight: 1 }}>
            Actuarius <span style={{ color: C.accent }}>Enterprise</span>
          </div>
        </Rise>
        <Rise delay={44}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 34, color: C.inkSoft, letterSpacing: 1 }}>
            Aktüeryal Rezerv &amp; IBNR Analizi
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────── 2 · DEĞER ───────────────────────────
export const Value: React.FC = () => {
  const opacity = useSceneFade();
  const lines = ["Hasar verisinden", "ultimate rezerve —", "tek platformda."];
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ ...center, opacity, flexDirection: "column", alignItems: "flex-start", paddingLeft: 220, paddingRight: 220 }}>
        {lines.map((l, i) => (
          <Rise key={i} delay={8 + i * 10} y={54}>
            <div
              style={{
                fontFamily: FONT_SERIF,
                fontSize: 88,
                fontWeight: 600,
                lineHeight: 1.12,
                letterSpacing: -1.5,
                color: i === 1 ? C.accent : C.ink,
              }}
            >
              {l}
            </div>
          </Rise>
        ))}
        <Rise delay={48}>
          <div style={{ marginTop: 26, fontFamily: FONT_SANS, fontSize: 30, color: C.muted, maxWidth: 900 }}>
            Chain-Ladder, Bornhuetter-Ferguson, curve fit ve nakit akışı — hepsi yerelde, offline.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────── 3 · ÜÇGEN → LDF → IBNR ───────────────────
const TRI: (number | null)[][] = [
  [100, 150, 165, 170],
  [120, 180, 198, null],
  [130, 192, null, null],
  [140, null, null, null],
];
const ORIGINS = ["2021", "2022", "2023", "2024"];

export const TriangleScene: React.FC = () => {
  const opacity = useSceneFade();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cell = 118;
  const gap = 10;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ ...center, opacity, flexDirection: "column", gap: 40 }}>
        <Rise delay={4}>
          <div style={eyebrow}>Gelişim Üçgeni</div>
        </Rise>

        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {TRI.map((row, i) => (
            <div key={i} style={{ display: "flex", gap, alignItems: "center" }}>
              <div style={{ width: 88, textAlign: "right", fontFamily: FONT_MONO, fontSize: 26, color: C.muted, paddingRight: 8 }}>
                {ORIGINS[i]}
              </div>
              {row.map((v, j) => {
                if (v == null) return <div key={j} style={{ width: cell, height: cell }} />;
                const p = spring({ frame: frame - 14 - (i + j) * 6, fps, config: { damping: 14, stiffness: 130 } });
                const isDiag = j === TRI[i].filter((x) => x != null).length - 1;
                return (
                  <div
                    key={j}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: FONT_MONO,
                      fontSize: 34,
                      fontWeight: 600,
                      color: isDiag ? C.bg0 : C.ink,
                      background: isDiag ? C.accent : C.chip,
                      border: `1px solid ${isDiag ? C.accent : C.line}`,
                      opacity: p,
                      transform: `scale(${interpolate(p, [0, 1], [0.6, 1])})`,
                    }}
                  >
                    {v}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <Rise delay={70}>
          <div style={{ display: "flex", alignItems: "center", gap: 26, fontFamily: FONT_SANS, fontSize: 34, color: C.inkSoft }}>
            <span>Chain-Ladder</span>
            <span style={{ color: C.accent }}>→</span>
            <span>CDF projeksiyonu</span>
            <span style={{ color: C.accent }}>→</span>
            <span style={{ fontWeight: 800, color: C.ink, background: C.accentSoft, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "6px 20px" }}>
              IBNR
            </span>
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────── 4 · LARGE-LOSS AYRIMI ───────────────────
const Box: React.FC<{ label: string; to: number; delay: number; accent?: boolean }> = ({ label, to, delay, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
        width: 300,
        padding: "34px 30px",
        borderRadius: 22,
        background: accent ? C.accentSoft : C.chip,
        border: `1px solid ${accent ? C.accent : C.line}`,
      }}
    >
      <div style={{ fontFamily: FONT_SANS, fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: accent ? C.accent : C.muted, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 66, fontWeight: 600, color: accent ? C.ink : C.inkSoft, marginTop: 8, letterSpacing: -1 }}>
        <CountUp to={to} delay={delay + 4} />
      </div>
    </div>
  );
};

const Op: React.FC<{ children: React.ReactNode; delay: number }> = ({ children, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ fontFamily: FONT_SERIF, fontSize: 56, color: C.muted, opacity: p }}>{children}</div>;
};

export const LargeScene: React.FC = () => {
  const opacity = useSceneFade();
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ ...center, opacity, flexDirection: "column", gap: 46 }}>
        <Rise delay={4}>
          <div style={{ ...eyebrow }}>Large-Loss Ayrımı</div>
        </Rise>
        <Rise delay={12}>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 60, fontWeight: 600, color: C.ink, letterSpacing: -1 }}>
            Büyük hasarı ayır, modeli stabilize et.
          </div>
        </Rise>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Box label="Gross" to={637} delay={26} />
          <Op delay={40}>−</Op>
          <Box label="Large" to={175} delay={44} />
          <Op delay={58}>=</Op>
          <Box label="Attritional" to={462} delay={62} accent />
        </div>
        <Rise delay={84}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 30, color: C.muted }}>
            Ana model Attritional üzerinde; Large ayrı modellenir · <span style={{ color: C.inkSoft }}>Toplam = Attritional + Large</span>
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────── 5 · ÖZELLİKLER ───────────────────────────
const FEATURES = [
  "Roll-forward · seçimler korunur",
  "Curve / tail fit (Exp · Power · Weibull)",
  "Frekans-Şiddet modeli",
  "Formüllü & renkli Excel",
  "Çok-kullanıcı kilidi + otomatik merge",
  "Offline · Oracle LAN",
];

export const Features: React.FC = () => {
  const opacity = useSceneFade();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ ...center, opacity, flexDirection: "column", gap: 44 }}>
        <Rise delay={4}>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 64, fontWeight: 600, color: C.ink, letterSpacing: -1 }}>
            Bir modelde her şey.
          </div>
        </Rise>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, width: 1300 }}>
          {FEATURES.map((f, i) => {
            const p = spring({ frame: frame - 16 - i * 7, fps, config: { damping: 200 } });
            return (
              <div
                key={i}
                style={{
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [26, 0])}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "26px 30px",
                  borderRadius: 18,
                  background: C.chip,
                  border: `1px solid ${C.line}`,
                }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 4, background: C.accent, boxShadow: `0 0 16px ${C.accentSoft}`, flex: "0 0 auto" }} />
                <div style={{ fontFamily: FONT_SANS, fontSize: 33, color: C.ink }}>{f}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────── 6 · OUTRO ───────────────────────────
export const Outro: React.FC = () => {
  const opacity = useSceneFade();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const glow = interpolate(spring({ frame: frame - 10, fps, config: { damping: 200 } }), [0, 1], [0, 1]);
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ ...center, opacity, flexDirection: "column", gap: 34 }}>
        <TriangleMark size={110} delay={2} />
        <Rise delay={26}>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 92, fontWeight: 600, color: C.ink, letterSpacing: -2 }}>
            Actuarius <span style={{ color: C.accent }}>Enterprise</span>
          </div>
        </Rise>
        <Rise delay={40}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 32,
              color: C.inkSoft,
              letterSpacing: 2,
              padding: "12px 30px",
              borderRadius: 999,
              border: `1px solid ${C.accent}`,
              background: `rgba(91,139,255,${0.10 * glow})`,
            }}
          >
            Aktüeryal analiz, uçtan uca.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
