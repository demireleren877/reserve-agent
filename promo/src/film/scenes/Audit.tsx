import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BEAT, FONT_DISPLAY, FONT_MONO, K } from "../theme";
import { clamp, easeInExpo, easeInOutCubic, easeOutExpo, prog } from "../math";
import { Enter, hexA } from "../fx";
import { Kicker, Rise } from "../type";

// Denetim izi: kararların içinden geçen bir koridor. Her kart bir yazma işlemi.

const T = { words: 18, close: 108, exit: 170 };
const FIELDS = ["Kim.", "Ne zaman.", "Ne.", "Neden."] as const;

const ENTRIES = [
  { who: "Aktüer · E.D.", when: "14.01.2026 · 14:32", what: "2019 · 36→48 hücresi elendi", why: "Tek büyük hasar kaynaklı aykırı gelişim" },
  { who: "AI Agent", when: "14.01.2026 · 14:33", what: "2024–2025 kohortları BF'e taşındı", why: "Düşük olgunluk · a priori %82,0" },
  { who: "Yönetici · S.K.", when: "14.01.2026 · 15:10", what: "Model kilitlendi", why: "2025Q4 kapanış onayı" },
  { who: "AI Agent", when: "14.01.2026 · 15:12", what: "Rapor üretildi", why: "Segment kırılımı + formüllü Excel" },
  { who: "Denetçi · M.A.", when: "15.01.2026 · 09:05", what: "v3 ↔ v2 karşılaştırıldı", why: "Senaryo farkı +%1,8 IBNR" },
  { who: "Aktüer · E.D.", when: "15.01.2026 · 09:40", what: "Kuyruk faktörü güncellendi", why: "Inverse power · R² 0,998" },
];

const SPACING = 900;

const Card: React.FC<{ e: (typeof ENTRIES)[number]; i: number; hl: number; camZ: number; dim: number }> = ({ e, i, hl, camZ, dim }) => {
  const side = i % 2 ? 1 : -1;
  const z = -i * SPACING;
  const rel = z + camZ; // kameraya göre derinlik (0 = kamera düzlemi)
  const vis = clamp((rel + 5200) / 1400) * (1 - clamp((rel - 300) / 400)) * (1 - dim * 0.85);
  if (vis <= 0.01) return null;
  const rows: [string, string][] = [
    ["KİM", e.who],
    ["NE ZAMAN", e.when],
    ["NE", e.what],
    ["NEDEN", e.why],
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 700,
        marginLeft: -350,
        marginTop: -170,
        padding: "28px 34px",
        borderRadius: 24,
        background: "linear-gradient(160deg, rgba(38,42,86,0.72), rgba(10,10,26,0.8))",
        border: "1px solid rgba(160,170,255,0.25)",
        boxShadow: `0 50px 140px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.14), 0 0 60px ${hexA(K.indigo, 0.18)}`,
        transform: `translate3d(${side * 520}px, ${side * -40}px, ${z}px) rotateY(${-side * 24}deg)`,
        opacity: vis,
      }}
    >
      {rows.map(([k, v], r) => {
        const on = hl === r;
        return (
          <div key={k} style={{ display: "flex", gap: 22, alignItems: "baseline", padding: "8px 0", borderTop: r ? "1px solid rgba(160,170,255,0.1)" : undefined }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 15, letterSpacing: "0.2em", width: 120, color: on ? K.indigoGlow : K.muted }}>{k}</div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 27,
                fontWeight: on ? 650 : 500,
                color: on ? "#ffffff" : "#c9cbe0",
                textShadow: on ? `0 0 24px ${hexA(K.indigoGlow, 0.9)}` : undefined,
              }}
            >
              {v}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Audit: React.FC = () => {
  const f = useCurrentFrame();
  // Kamera koridor boyunca ilerler; her vuruşta hafif hızlanır
  const camZ = easeInOutCubic(prog(f, 0, T.exit + 10)) * SPACING * 4.6 + 600;
  const wIdx = f >= T.words && f < T.words + 4 * BEAT ? Math.floor((f - T.words) / BEAT) : -1;
  const lf = wIdx >= 0 ? f - T.words - wIdx * BEAT : 0;
  const sway = Math.sin(f * 0.02) * 4;
  const out = easeInExpo(prog(f, T.exit - 6, T.exit + 8));
  const chips = ["Roller", "Model kilidi", "Versiyonlar", "Geri alma"];
  return (
    <Enter>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% 45%, #0d0f2a 0%, ${K.bg} 70%)` }}>
        {/* Perspektif zemin ızgarası */}
        <AbsoluteFill style={{ perspective: 900, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: "-50%",
              width: "200%",
              top: "58%",
              height: 2400,
              transformOrigin: "50% 0",
              transform: "rotateX(78deg)",
              backgroundImage:
                "linear-gradient(rgba(107,123,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(107,123,255,0.22) 1px, transparent 1px)",
              backgroundSize: "120px 120px",
              backgroundPosition: `0 ${(camZ * 0.4) % 120}px`,
              WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 30%, transparent 100%)",
              opacity: 0.6,
            }}
          />
        </AbsoluteFill>

        <AbsoluteFill style={{ perspective: 1300, perspectiveOrigin: "50% 45%" }}>
          <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `translateZ(${camZ}px) rotateY(${sway}deg)` }}>
            {ENTRIES.map((e, i) => (
              <Card key={i} e={e} i={i} hl={wIdx} camZ={camZ} dim={easeOutExpo(prog(f, T.close - 12, T.close + 8))} />
            ))}
          </div>
        </AbsoluteFill>

        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 110 }}>
          <Kicker text="Denetim izi" at={8} out={T.close - 6} />
        </AbsoluteFill>

        {wIdx >= 0 ? (
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 170,
                fontWeight: 750,
                letterSpacing: "-0.05em",
                color: "#fff",
                transform: `scale(${1.08 - easeOutExpo(clamp(lf / 12)) * 0.08})`,
                filter: `blur(${Math.max(0, 8 - lf * 2.5)}px)`,
                opacity: 1 - clamp((lf - 15) / 3),
                textShadow: `0 20px 80px rgba(0,0,0,0.9)`,
              }}
            >
              {FIELDS[wIdx]}
            </div>
          </AbsoluteFill>
        ) : null}

        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 34, opacity: 1 - out }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textShadow: "0 20px 80px rgba(0,0,0,0.9)" }}>
            <Rise text="Her karar," at={T.close} size={104} />
            <Rise text="kayıt altında." at={T.close + 8} size={104} gradient={`linear-gradient(90deg, #ffffff, ${K.indigoGlow})`} />
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {chips.map((c, i) => {
              const a = easeOutExpo(prog(f, T.close + 24 + i * 4, T.close + 44 + i * 4));
              return (
                <div
                  key={c}
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 24,
                    color: K.ink,
                    padding: "12px 26px",
                    borderRadius: 999,
                    border: "1px solid rgba(160,170,255,0.3)",
                    background: "rgba(30,34,80,0.5)",
                    opacity: a,
                    transform: `translateY(${(1 - a) * 20}px) scale(${0.9 + a * 0.1})`,
                  }}
                >
                  {c}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Enter>
  );
};
