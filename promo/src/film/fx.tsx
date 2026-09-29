import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { K } from "./theme";
import { clamp, easeInExpo, easeOutExpo, prog, rng } from "./math";

/** Film greni: önceden üretilmiş gürültü dokusu her karede kaydırılır. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.075 }) => {
  const f = useCurrentFrame();
  const r = rng(f * 7919 + 13);
  const x = Math.floor(r() * 512);
  const y = Math.floor(r() * 512);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile("grain.png")})`,
        backgroundPosition: `${x}px ${y}px`,
        backgroundSize: "512px 512px",
        mixBlendMode: "overlay",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.72 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

/**
 * Sahne girişi: hızlı itme + radyal bulanıklık + kromatik ayrışma.
 * Önceki sahnenin kamerası hızlanarak çıkar; bu sarmalayıcı yenisini
 * aynı hızla "yakalar" — kesme bir whip-pan gibi okunur.
 */
export const Enter: React.FC<{ children: React.ReactNode; len?: number; from?: number; exit?: number }> = ({
  children,
  len = 14,
  from = 1.14,
  exit = 10,
}) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pin = easeOutExpo(prog(f, 0, len));
  const pout = easeInExpo(prog(f, durationInFrames - exit, durationInFrames));
  const scale = from + (1 - from) * pin + pout * 0.1;
  const blur = (1 - pin) * 14 + pout * 16;
  const bright = 1 + (1 - pin) * 1.2 + pout * 1.4;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, filter: `blur(${blur}px) brightness(${bright})` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Kesmede patlayan ışık — beyazdan indigoya sönen radyal parlama. */
export const Flash: React.FC<{ at: number; len?: number; color?: string; power?: number }> = ({
  at,
  len = 12,
  color = K.indigoGlow,
  power = 1,
}) => {
  const f = useCurrentFrame();
  if (f < at - 3 || f > at + len) return null;
  const up = prog(f, at - 3, at);
  const down = 1 - easeOutExpo(prog(f, at, at + len));
  const a = (f < at ? up * up : down) * power;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 55% at 50% 50%, rgba(255,255,255,${a}) 0%, ${hexA(color, a * 0.8)} 35%, rgba(0,0,0,0) 75%)`,
        }}
      />
      <AbsoluteFill style={{ background: `rgba(255,255,255,${a * 0.25})` }} />
    </AbsoluteFill>
  );
};

/** Anamorfik ışık çizgisi — yatay lens parlaması. */
export const Anamorphic: React.FC<{ x: number; y: number; power: number; color?: string; width?: number }> = ({
  x,
  y,
  power,
  color = K.indigoGlow,
  width = 1400,
}) => {
  if (power <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - 3,
        width,
        height: 6,
        borderRadius: 6,
        background: `linear-gradient(90deg, rgba(0,0,0,0), ${hexA(color, 0.9 * power)} 30%, rgba(255,255,255,${power}) 50%, ${hexA(color, 0.9 * power)} 70%, rgba(0,0,0,0))`,
        filter: "blur(3px)",
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
};

export const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
};
