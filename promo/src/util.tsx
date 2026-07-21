import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, MARK_CELLS } from "./theme";

/** Sahne giriş/çıkış fade — Series.Sequence içinde lokal frame ile. */
export const useSceneFade = (fadeIn = 12, fadeOut = 12): number => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const a = interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" });
  const b = interpolate(
    frame,
    [durationInFrames - fadeOut, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" },
  );
  return Math.min(a, b);
};

/** Spring tabanlı sayaç. */
export const CountUp: React.FC<{
  to: number;
  from?: number;
  delay?: number;
  dur?: number;
  decimals?: number;
}> = ({ to, from = 0, delay = 0, dur = 34, decimals = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({
    frame: frame - delay,
    fps,
    durationInFrames: dur,
    config: { damping: 200 },
  });
  const v = from + (to - from) * p;
  return <>{v.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
};

/** Koyu, hafif hareketli marka arka planı. */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  return (
    <AbsoluteFill style={{ background: C.bg0 }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 700px at ${50 + drift / 20}% -8%, ${C.bg2} 0%, ${C.bg1} 45%, ${C.bg0} 80%)`,
        }}
      />
      {/* ince ızgara dokusu */}
      <AbsoluteFill
        style={{
          opacity: 0.5,
          backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(1100px 700px at 50% 40%, #000 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(1100px 700px at 50% 40%, #000 20%, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Gelişim üçgeni marka işareti — kareler sırayla belirir. */
export const TriangleMark: React.FC<{ size?: number; animated?: boolean; delay?: number }> = ({
  size = 120,
  animated = true,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const unit = size / 30;
  const cell = unit * 8;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {MARK_CELLS.map((c, i) => {
        const p = animated
          ? spring({ frame: frame - delay - i * 4, fps, config: { damping: 12, stiffness: 140 } })
          : 1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: c.x * unit,
              top: c.y * unit,
              width: cell,
              height: cell,
              borderRadius: unit * 0.9,
              background: C.accent,
              opacity: p,
              transform: `scale(${p})`,
              boxShadow: `0 0 ${cell * 0.5}px ${C.accentSoft}`,
            }}
          />
        );
      })}
    </div>
  );
};
