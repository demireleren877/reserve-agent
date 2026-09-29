import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import "./fonts";
import { K, TIMELINE, SceneId } from "./theme";
import { Grain, Vignette } from "./fx";
import { Origin } from "./scenes/Origin";
import { Chain } from "./scenes/Chain";
import { Curve } from "./scenes/Curve";
import { Agent } from "./scenes/Agent";
import { Product } from "./scenes/Product";
import { Numbers } from "./scenes/Numbers";
import { Audit } from "./scenes/Audit";
import { Finale } from "./scenes/Finale";

const SCENES: Partial<Record<SceneId, React.FC>> = {
  origin: Origin,
  chain: Chain,
  curve: Curve,
  agent: Agent,
  product: Product,
  numbers: Numbers,
  audit: Audit,
  finale: Finale,
};

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: K.bg }}>
    {TIMELINE.map((s) => {
      const C = SCENES[s.id];
      if (!C) return null;
      return (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id} premountFor={20}>
          <C />
        </Sequence>
      );
    })}
    <Audio src={staticFile("score.wav")} />
    <Vignette />
    <Grain />
  </AbsoluteFill>
);
