import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage, CamState, project } from "../stage";
import { FONT_DISPLAY, FONT_MONO, K } from "../theme";
import { V3, clamp, easeInExpo, easeInOutCubic, easeOutExpo, keys3, prog } from "../math";
import { Enter, hexA } from "../fx";
import { Kicker, Rise, Odometer } from "../type";

// Kuyruk uydurma: gözlenen gelişim faktörleri + dört parametrik aday.
// Görsel ölçek: y = (LDF - 1)^0.6 · 8 — kuyruk ezilmeden görünsün diye.

const X = (j: number) => (j - 1) * 1.15 - 5.2;
const selected = (j: number) => 3.3 * Math.exp(-0.62 * (j - 1)) + 0.36 * Math.exp(-0.16 * (j - 1));
const JIT = [0, 0.04, -0.035, 0.05, -0.03, 0.045, -0.04, 0.03];
const PTS: V3[] = JIT.map((e, i) => [X(i + 1), selected(i + 1) * (1 + e), 0]);
const OFF: V3 = [1.3, -0.7, 0];
const at = (p: V3): V3 => [p[0] + OFF[0], p[1] + OFF[1], p[2] + OFF[2]];

const FITS = [
  { name: "Exponential", fn: (j: number) => 3.7 * Math.exp(-0.58 * (j - 1)), col: "#8a8fa8" },
  { name: "Power", fn: (j: number) => 3.66 * Math.pow(j, -1.25), col: "#8a8fa8" },
  { name: "Weibull", fn: (j: number) => 5.2 * Math.exp(-Math.pow((j - 0.6) / 1.6, 0.7)), col: "#8a8fa8" },
  { name: "Inverse Power", fn: selected, col: K.indigoGlow, pick: true },
];

const T = { pts: 18, fits: 54, pick: 108, exit: 168 };

export const curveCam = (f: number): CamState => {
  const p = easeInOutCubic(prog(f, 0, T.exit));
  const pos = keys3(p, [[0, [10, 1.0, 5.5]], [0.55, [6, 2.6, 11]], [1, [3.2, 2.2, 15.5]]], (x) => x);
  const tgt = keys3(p, [[0, [-1.2, 0.8, 0]], [1, [2.3, 1.7, 0]]], (x) => x);
  const q = easeInExpo(prog(f, T.exit, 180));
  return { pos: [pos[0] - q * 3, pos[1] + q * 0.2, pos[2] - q * 7], target: [tgt[0] - q * 2, tgt[1], tgt[2]], fov: 38 + q * 28, roll: 0.05 * (1 - p) };
};

const tubeFor = (fn: (j: number) => number, j0: number, j1: number, r: number) => {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 120; k++) {
    const j = j0 + ((j1 - j0) * k) / 120;
    pts.push(new THREE.Vector3(X(j), Math.max(0.02, fn(j)), 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, r, 12, false);
};

const Tube: React.FC<{ geo: THREE.TubeGeometry; p: number; color: string; glow: number; opacity: number }> = ({ geo, p, color, glow, opacity }) => {
  const count = geo.index!.count;
  geo.setDrawRange(0, Math.floor((count * clamp(p)) / 6) * 6);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(glow)} transparent opacity={opacity} toneMapped={false} />
    </mesh>
  );
};

const Panel: React.FC<{ a: number }> = ({ a }) => {
  const lines = useMemo(() => {
    const v: number[] = [];
    for (let j = 1; j <= 14; j++) v.push(X(j), 0, -0.02, X(j), 4.4, -0.02);
    for (let y = 0; y <= 4.4; y += 0.55) v.push(X(0.6), y, -0.02, X(14), y, -0.02);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return g;
  }, []);
  return (
    <group>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#2c3160" transparent opacity={0.55 * a} />
      </lineSegments>
      <mesh position={[X(7.3), 2.2, -0.05]}>
        <planeGeometry args={[16.5, 5.2]} />
        <meshBasicMaterial color="#0b0c1c" transparent opacity={0.55 * a} />
      </mesh>
      {/* x ekseni */}
      <mesh position={[X(7.3), 0, 0]}>
        <boxGeometry args={[16.5, 0.012, 0.012]} />
        <meshBasicMaterial color="#5d6390" transparent opacity={a} />
      </mesh>
    </group>
  );
};

export const Curve: React.FC = () => {
  const f = useCurrentFrame();
  const cam = curveCam(f);
  const geos = useMemo(() => FITS.map((c) => tubeFor(c.fn, 1, 11.5, c.pick ? 0.045 : 0.014)), []);
  const panelA = easeOutExpo(prog(f, 0, 30));
  const pick = easeOutExpo(prog(f, T.pick, T.pick + 20));
  const out = easeInExpo(prog(f, T.exit - 6, T.exit + 6));
  return (
    <Enter>
      <AbsoluteFill style={{ background: K.bg }}>
        <Stage cam={cam} fog={[8, 30]} bloom={{ strength: 0.9, radius: 0.5, threshold: 0.75 }} studio={{ warm: 1.2, cool: 0.6 }}>
          <ambientLight intensity={0.2} />
          <group position={OFF}>
          <Panel a={panelA} />
          {FITS.map((c, i) => {
            const p = easeInOutCubic(prog(f, T.fits + i * 7, T.fits + i * 7 + 40));
            const dim = c.pick ? 1 : 1 - pick * 0.75;
            return <Tube key={c.name} geo={geos[i]} p={p} color={c.col} glow={c.pick ? 1.6 + pick * 1.6 : 0.9} opacity={dim} />;
          })}
          {PTS.map((pt, i) => {
            const a = easeOutExpo(prog(f, T.pts + i * 3, T.pts + i * 3 + 16));
            const ring = prog(f, T.pts + i * 3, T.pts + i * 3 + 24);
            return (
              <group key={i} position={pt}>
                <mesh scale={a}>
                  <sphereGeometry args={[0.1, 32, 32]} />
                  <meshStandardMaterial color={K.copperLight} emissive={K.copper} emissiveIntensity={1.4} metalness={0.4} roughness={0.25} />
                </mesh>
                <mesh scale={0.1 + ring * 0.6}>
                  <ringGeometry args={[0.9, 1, 48]} />
                  <meshBasicMaterial color={K.copperLight} transparent opacity={(1 - ring) * 0.8} toneMapped={false} />
                </mesh>
              </group>
            );
          })}
          </group>
        </Stage>

        {/* Eğri adları — uç noktalarına yapışık */}
        <AbsoluteFill style={{ opacity: 1 - out }}>
          {FITS.map((c, i) => {
            const jEnd = 11.5;
            const p = project(cam, at([X(jEnd) + 0.2, Math.max(0.02, c.fn(jEnd)), 0]));
            const a = easeOutExpo(prog(f, T.fits + i * 7 + 34, T.fits + i * 7 + 54)) * (c.pick ? 1 : 1 - pick * 0.6);
            return (
              <div
                key={c.name}
                style={{
                  position: "absolute",
                  left: p.x + 14,
                  top: p.y - 12 - (c.pick ? 0 : i * 26 - 20),
                  fontFamily: FONT_MONO,
                  fontSize: c.pick ? 20 : 16,
                  letterSpacing: "0.12em",
                  color: c.pick ? "#c9d0ff" : "#8a8fa8",
                  opacity: a,
                  whiteSpace: "nowrap",
                  textShadow: c.pick ? `0 0 18px ${hexA(K.indigoGlow, 0.8)}` : undefined,
                }}
              >
                {c.pick ? "● " : ""}
                {c.name}
              </div>
            );
          })}
        </AbsoluteFill>

        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: "110px 150px 0 0", flexDirection: "column", gap: 18 }}>
          <Kicker text="Kuyruk uydurma" at={8} out={T.exit - 8} />
          <Rise text="Eğri, veriye uyar." at={14} out={T.exit - 8} size={78} style={{ justifyContent: "flex-end" }} />
          <Rise text="Tersi değil." at={30} out={T.exit - 6} size={78} style={{ justifyContent: "flex-end" }} gradient="linear-gradient(180deg,#b9c1ff,#6b7bff)" />
        </AbsoluteFill>

        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: "380px 150px 0 0", opacity: pick * (1 - out) }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 18, letterSpacing: "0.3em", color: K.inkSoft, marginBottom: 8 }}>R² · UYUM</div>
            <Odometer value={0.998} decimals={3} at={T.pick + 4} dur={36} size={96} style={{ justifyContent: "flex-end" }} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: K.muted, marginTop: 10 }}>Adım bazında seçim · elle CDF girişi</div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Enter>
  );
};
