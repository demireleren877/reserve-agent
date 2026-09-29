import React from "react";
import { Composition } from "remotion";
import { Promo, PROMO_DURATION } from "./Promo";
import { Film } from "./film/Film";
import { HeroLoop } from "./film/HeroLoop";
import { FILM_DURATION, FPS, H, W } from "./film/theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="HeroLoop" component={HeroLoop} durationInFrames={360} fps={30} width={1920} height={1080} />
      <Composition id="ActuariusFilm" component={Film} durationInFrames={FILM_DURATION} fps={FPS} width={W} height={H} />
      <Composition
        id="ActuariusPromo"
        component={Promo}
        durationInFrames={PROMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
