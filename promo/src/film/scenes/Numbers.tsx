import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage, CamState } from "../stage";
import { GridFloor } from "../objects";
import { BEAT, FONT_DISPLAY, FONT_MONO, K } from "../theme";
import { CDF, TOTAL_IBNR, TOTAL_ULT, ULR } from "../data";
import { clamp, easeInExpo, easeOutExpo, prog } from "../math";
import { Enter, Flash, hexA } from "../fx";
import { Kicker, Odometer } from "../type";
import { Bars } from "./Origin";

// Tek bir sayı, tüm hikâye: toplam IBNR. Arkada üçgen tepeden, yavaşça döner.

const T = { num: 6, stats: 40, words: 108, exit: 170 };
const WORDS = ["Hesaplandı.", "Açıklandı.", "Kilitlendi."];

const numbersCam = (f: number): CamState => {
  const a = 0.6 + f * 0.0035;
  const r = 6 - f * 0.01;
  const q = easeInExpo(prog(f, T.exit, 180));
  return { pos: [Math.sin(a) * r, 15 - f * 0.02 - q * 8, Math.cos(a) * r], target: [0, 0, 0], fov: 40 + q * 20, roll: a };
};

export const Numbers: React.FC = () => {
  const f = useCurrentFrame();
  const cam = numbersCam(f);
  const statsOut = easeInExpo(prog(f, T.words - 8, T.words));
  const wIdx = f >= T.words && f < T.words + 3 * BEAT ? Math.floor((f - T.words) / BEAT) : f >= T.words + 3 * BEAT ? 2 : -1;
  const lf = wIdx >= 0 ? f - T.words - wIdx * BEAT : 0;
  const out = easeInExpo(prog(f, T.exit - 4, T.exit + 8));
  const numShift = easeOutExpo(prog(f, T.words - 10, T.words + 10));
  const stats = [
    { k: "Nihai hasar", v: TOTAL_ULT, d: 0, pre: "", suf: "" },
    { k: "Hasar oranı", v: ULR, d: 1, pre: "%", suf: "" },
    { k: "CDF → Ult", v: Number(CDF.replace(",", ".")), d: 4, pre: "", suf: "" },
  ];
  return (
    <Enter>
      <AbsoluteFill style={{ background: K.bg }}>
        <Stage cam={cam} fog={[8, 22]} bloom={{ strength: 0.6, radius: 0.6, threshold: 0.7 }}>
          <ambientLight intensity={0.1} />
          <directionalLight position={[-6, 10, 4]} intensity={1.6} color="#ffd9bd" />
          <group position={[0, -0.5, 0]}>
            <Bars f={1000} />
            <GridFloor opacity={0.35} fade={16} />
          </group>
        </Stage>
        {/* Sayıyı okunur kılan karartma */}
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(3,3,6,0.82), rgba(3,3,6,0.55) 60%, rgba(3,3,6,0.3))" }} />

        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", opacity: 1 - out, transform: `translateY(${-numShift * 70}px) scale(${1 - numShift * 0.12})` }}>
          <Kicker text="Toplam IBNR · Motor · 2025Q4" at={T.num} />
          <div style={{ marginTop: 18, filter: `drop-shadow(0 0 60px ${hexA(K.indigo, 0.55)})` }}>
            <Odometer value={TOTAL_IBNR} at={T.num} dur={46} size={290} color="#ffffff" />
          </div>
          <div style={{ display: "flex", gap: 90, marginTop: 36, opacity: 1 - statsOut, filter: `blur(${statsOut * 10}px)` }}>
            {stats.map((s, i) => {
              const a = easeOutExpo(prog(f, T.stats + i * 6, T.stats + 24 + i * 6));
              return (
                <div key={i} style={{ textAlign: "center", opacity: a, transform: `translateY(${(1 - a) * 24}px)` }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 17, letterSpacing: "0.26em", color: K.inkSoft, textTransform: "uppercase", marginBottom: 10 }}>{s.k}</div>
                  <Odometer value={s.v} decimals={s.d} at={T.stats + i * 6} dur={34} size={54} prefix={s.pre} color={i === 1 ? K.copperLight : K.ink} style={{ justifyContent: "center" }} />
                </div>
              );
            })}
          </div>
        </AbsoluteFill>

        {wIdx >= 0 ? (
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 200, opacity: 1 - out }}>
            <div style={{ display: "flex", gap: 34 }}>
              {WORDS.map((w, i) => {
                const on = i <= wIdx;
                const p = i === wIdx ? easeOutExpo(clamp(lf / 10)) : on ? 1 : 0;
                return (
                  <div
                    key={w}
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: 74,
                      fontWeight: 650,
                      letterSpacing: "-0.035em",
                      color: i === 2 ? "transparent" : K.ink,
                      backgroundImage: i === 2 ? `linear-gradient(90deg, #fff, ${K.indigoGlow})` : undefined,
                      WebkitBackgroundClip: i === 2 ? "text" : undefined,
                      opacity: p,
                      transform: `translateY(${(1 - p) * 40}px)`,
                      filter: `blur(${(1 - p) * 10}px)`,
                    }}
                  >
                    {w}
                  </div>
                );
              })}
            </div>
          </AbsoluteFill>
        ) : null}
        <Flash at={0} len={16} color="#ffffff" power={0.9} />
      </AbsoluteFill>
    </Enter>
  );
};
