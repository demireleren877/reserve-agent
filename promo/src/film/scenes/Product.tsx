import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { useTexture } from "@react-three/drei";
import { Stage, CamState } from "../stage";
import { roundedRect } from "../objects";
import { BEAT, FONT_DISPLAY, K } from "../theme";
import { V3, clamp, easeInOutCubic, easeInOutQuint, easeOutExpo, lerp, mix3, prog } from "../math";
import { Enter, Flash, hexA } from "../fx";
import { Kicker, Rise } from "../type";

// Gerçek arayüz ekranları: tünel → kavisli duvar → IBNR kartına dalış.

const SHOTS = ["data-map", "ldf", "curve", "ilr", "bf", "files", "cashflow", "discount", "data-tab", "ultimate"];
const HERO = SHOTS.indexOf("ultimate");
const PW = 4.8;
const PH = 3.0;

const T = { words: 18, wall: 108, settle: 150, hero: 198, dive: 234, end: 288 };
const WORDS = ["Veri.", "Rezerv.", "Nakit akışı.", "İskonto."];

// "TOTAL IBNR" kartının ekran görüntüsündeki yeri (uv)
const CARD_UV = { u: 0.4725, v: 0.755 };
const HERO_POS: V3 = [0, 0, -34];
const CARD: V3 = [HERO_POS[0] + (CARD_UV.u - 0.5) * PW, HERO_POS[1] + (CARD_UV.v - 0.5) * PH, HERO_POS[2]];

type Pose = { pos: V3; ry: number; rx: number; opacity: number };

const tunnelPose = (k: number): Pose => {
  const side = k % 2 ? 1 : -1;
  return { pos: [side * 2.7, Math.sin(k * 1.7) * 0.5, -k * 2.9 - 1], ry: -side * 0.95, rx: 0, opacity: 1 };
};

const wallPose = (k: number): Pose => {
  // Kahraman ekran ortada kalsın diye sıralamayı kaydır
  const others = SHOTS.map((_, i) => i).filter((i) => i !== HERO);
  const slot = k === HERO ? 7 : [0, 1, 2, 3, 4, 5, 6, 8, 9][others.indexOf(k)]; // kahraman: alt orta
  const col = slot % 5;
  const row = Math.floor(slot / 5);
  const R = 15;
  const th = (col - 2) * 0.36;
  const C: V3 = [0, 0, -46];
  return { pos: [C[0] + Math.sin(th) * R, (row ? -1 : 1) * 1.72, C[2] + R - Math.cos(th) * R], ry: -th, rx: 0, opacity: 1 };
};

const heroPose = (k: number, wp: Pose): Pose => {
  if (k === HERO) return { pos: HERO_POS, ry: 0, rx: 0, opacity: 1 };
  return { pos: [wp.pos[0] * 1.3, wp.pos[1] * 1.3, wp.pos[2] - 9], ry: wp.ry * 1.4, rx: 0, opacity: 0.0 };
};

const poseAt = (k: number, f: number): Pose => {
  const tp = tunnelPose(k);
  const wp = wallPose(k);
  const a = easeInOutQuint(prog(f, T.wall + k * 3, T.settle + k * 2));
  let p: Pose = {
    pos: mix3(tp.pos, wp.pos, a),
    ry: lerp(tp.ry, wp.ry, a),
    rx: Math.sin(a * Math.PI) * 0.25 * (k % 2 ? 1 : -1),
    opacity: 1,
  };
  const b = easeInOutCubic(prog(f, T.hero + (k === HERO ? 0 : 4), T.dive + 6));
  if (b > 0) {
    const hp = heroPose(k, wp);
    p = { pos: mix3(p.pos, hp.pos, b), ry: lerp(p.ry, hp.ry, b), rx: p.rx * (1 - b), opacity: lerp(1, hp.opacity, b) };
  }
  return p;
};

export const productCam = (f: number): CamState => {
  if (f < T.wall) {
    const p = easeInOutCubic(prog(f, 0, T.wall + 30));
    const z = 4 - p * 30;
    return { pos: [Math.sin(f * 0.03) * 0.25, 0.2, z], target: [0, 0, z - 10], fov: 52, roll: Math.sin(f * 0.02) * 0.05 };
  }
  if (f < T.dive) {
    const p = easeOutExpo(prog(f, T.wall, T.settle + 20));
    const z = lerp(4 - easeInOutCubic(prog(T.wall, 0, T.wall + 30)) * 30, -22, p);
    const h = easeInOutCubic(prog(f, T.hero, T.dive));
    const pos = mix3([0, 0.2, z], [0, 0, -26], h);
    return { pos, target: mix3([0, 0, -46], HERO_POS, h), fov: lerp(52, 42, p) };
  }
  // IBNR kartına dalış
  const d = easeInOutCubic(prog(f, T.dive, T.end - 4));
  const pos = mix3([0, 0, -26], [CARD[0], CARD[1], CARD[2] + 0.62], d);
  return { pos, target: mix3(HERO_POS, CARD, easeOutExpo(prog(f, T.dive, T.dive + 30))), fov: 42 - d * 8 };
};

const Screen: React.FC<{ tex: THREE.Texture; pose: Pose; glow: number }> = ({ tex, pose, glow }) => {
  const geo = useMemo(() => roundedRect(PW, PH, 0.14), []);
  const halo = useMemo(() => roundedRect(PW + 0.06, PH + 0.06, 0.17), []);
  if (pose.opacity <= 0.01) return null;
  return (
    <group position={pose.pos} rotation={[pose.rx, pose.ry, 0]}>
      <mesh geometry={halo} position-z={-0.01}>
        <meshBasicMaterial color={new THREE.Color(K.indigoGlow).multiplyScalar(0.6 + glow)} transparent opacity={0.55 * pose.opacity} toneMapped={false} />
      </mesh>
      <mesh geometry={geo}>
        <meshBasicMaterial map={tex} transparent opacity={pose.opacity} toneMapped={false} />
      </mesh>
    </group>
  );
};

const Screens: React.FC<{ f: number }> = ({ f }) => {
  const texs = useTexture(SHOTS.map((s) => staticFile(`shots/${s}.webp`)));
  texs.forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  });
  return (
    <group>
      {SHOTS.map((s, k) => (
        <Screen key={s} tex={texs[k]} pose={poseAt(k, f)} glow={k === HERO ? easeOutExpo(prog(f, T.hero, T.hero + 20)) * 0.6 : 0} />
      ))}
    </group>
  );
};

export const Product: React.FC = () => {
  const f = useCurrentFrame();
  const cam = productCam(f);
  const wIdx = f >= T.words && f < T.words + WORDS.length * BEAT ? Math.floor((f - T.words) / BEAT) : -1;
  const lf = wIdx >= 0 ? (f - T.words) % BEAT : 0;
  return (
    <Enter exit={0}>
      <AbsoluteFill style={{ background: K.bg }}>
        <Stage cam={cam} fog={[18, 60]} bloom={{ strength: 0.2, radius: 0.3, threshold: 1.6 }} studio={false}>
          <Screens f={f} />
        </Stage>

        {/* Tünelde vuruş başına bir kelime */}
        {wIdx >= 0 ? (
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 150,
                fontWeight: 700,
                letterSpacing: "-0.045em",
                color: K.ink,
                transform: `scale(${1.1 - easeOutExpo(clamp(lf / 12)) * 0.1})`,
                filter: `blur(${Math.max(0, 8 - lf * 2.5)}px)`,
                opacity: 1 - clamp((lf - 15) / 3),
                textShadow: `0 10px 60px rgba(0,0,0,0.9), 0 0 50px ${hexA(K.indigo, 0.5)}`,
              }}
            >
              {WORDS[wIdx]}
            </div>
          </AbsoluteFill>
        ) : null}

        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90, flexDirection: "column", gap: 16 }}>
          <Kicker text="Dört modül" at={T.settle - 36} out={T.hero} />
          <Rise text="Tek veri katmanı." at={T.settle - 30} out={T.hero + 2} size={84} />
        </AbsoluteFill>

        <Flash at={T.words} len={10} power={0.3} />
      </AbsoluteFill>
    </Enter>
  );
};
