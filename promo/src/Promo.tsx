import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { C } from "./theme";
import { Features, Intro, LargeScene, TriangleScene, Value, Outro } from "./scenes";

// Sahne süreleri (30 fps). Toplam = 840 frame ≈ 28 sn.
export const SCENES = [
  { c: Intro, d: 120 },
  { c: Value, d: 90 },
  { c: TriangleScene, d: 180 },
  { c: LargeScene, d: 180 },
  { c: Features, d: 150 },
  { c: Outro, d: 120 },
] as const;

export const PROMO_DURATION = SCENES.reduce((s, x) => s + x.d, 0);

export const Promo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg0 }}>
      <Series>
        {SCENES.map((s, i) => {
          const Comp = s.c;
          return (
            <Series.Sequence key={i} durationInFrames={s.d} premountFor={30}>
              <Comp />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
