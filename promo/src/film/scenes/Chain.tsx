import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage, CamState, project } from "../stage";
import { Dots } from "../objects";
import { FONT_DISPLAY, FONT_MONO, K } from "../theme";
import { CDF, LDFS } from "../data";
import { V3, clamp, easeInExpo, easeInOutCubic, easeOutExpo, keys3, prog, rng } from "../math";
import { Enter, Anamorphic } from "../fx";
import { Kicker, Rise } from "../type";

// "Zincir merdiven" — yöntem adını kelimesi kelimesine alan metal zincir.
// Bir enerji darbesi halkadan halkaya geçer; her halka bir gelişim faktörüdür.

const LINKS = 11;
const PITCH = 1.62;
const linkX = (k: number) => (k - 1) * PITCH;
const sag = (x: number) => -0.012 * (x - 6) * (x - 6) + 0.4; // hafif sarkma

const T = { pulse0: 18, pulseEnd: 118, pull: 114, exit: 166 };
const pulseX = (f: number) => linkX(0) + easeInOutCubic(prog(f, T.pulse0, T.pulseEnd)) * (linkX(5) - linkX(0) + 0.6);

class Stadium extends THREE.Curve<THREE.Vector3> {
  constructor(private L: number, private R: number) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const { L, R } = this;
    const straight = L - 2 * R;
    const per = 2 * straight + 2 * Math.PI * R;
    let d = t * per;
    if (d < straight) return target.set(-straight / 2 + d, -R, 0);
    d -= straight;
    if (d < Math.PI * R) {
      const a = -Math.PI / 2 + d / R;
      return target.set(straight / 2 + Math.cos(a) * R, Math.sin(a) * R, 0);
    }
    d -= Math.PI * R;
    if (d < straight) return target.set(straight / 2 - d, R, 0);
    d -= straight;
    const a = Math.PI / 2 + d / R;
    return target.set(-straight / 2 + Math.cos(a) * R, Math.sin(a) * R, 0);
  }
}

export const chainCam = (f: number): CamState => {
  if (f < T.pull) {
    const p = easeInOutCubic(prog(f, 0, T.pull));
    const x = -1.4 + p * 6.4;
    return { pos: [x - 2.6, 1.7 - p * 0.4, 5.4 + p * 0.4], target: [x + 1.3, 1.05, 0], fov: 40, roll: 0.05 - p * 0.08 };
  }
  if (f < T.exit) {
    const p = easeInOutCubic(prog(f, T.pull, T.exit));
    return { pos: keys3(p, [[0, [2.4, 1.3, 5.8]], [1, [6.4, 3.2, 10.5]]], (x) => x), target: [keys3(p, [[0, [6.3, 1.05, 0]], [1, [5.6, 0.4, 0]]], (x) => x)[0], 1.05 - p * 0.65, 0], fov: 40 - p * 4, roll: -0.04 * (1 - p) };
  }
  const p = easeInExpo(prog(f, T.exit, 180));
  return { pos: [6.4 + p * 9, 3.2 + p * 1.5, 10.5 - p * 2], target: [5.6 + p * 14, 0.4, 0], fov: 36 + p * 20 };
};

const Links: React.FC<{ f: number }> = ({ f }) => {
  const geo = useMemo(() => new THREE.TubeGeometry(new Stadium(2.25, 0.5), 160, 0.13, 28, true), []);
  const steel = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#a7abb8"),
        metalness: 1,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.15,
      }),
    [],
  );
  const px = pulseX(f);
  return (
    <group>
      {Array.from({ length: LINKS }, (_, k) => {
        const x = linkX(k);
        const lit = clamp(1 - Math.abs(px - x) / 1.2);
        const charged = px > x ? 1 : 0;
        const appear = easeOutExpo(prog(f, k * 2.5 - 4, k * 2.5 + 14));
        const mat = steel.clone();
        mat.emissive = new THREE.Color(K.copperLight);
        mat.emissiveIntensity = lit * 0.9 + charged * 0.08 * (k <= 5 ? 1 : 0);
        return (
          <mesh
            key={k}
            geometry={geo}
            material={mat}
            position={[x, sag(x) + (1 - appear) * -1.5, 0]}
            rotation={[k % 2 ? Math.PI / 2 : 0.12, 0, Math.sin(x * 0.4) * 0.05]}
            scale={appear}
          />
        );
      })}
    </group>
  );
};

const Sparks: React.FC<{ f: number }> = ({ f }) => {
  const S = 900;
  const seed = useMemo(() => {
    const r = rng(9);
    return Array.from({ length: S }, () => ({ t0: r() * 110, v: [(r() - 0.5) * 0.06, r() * 0.05 + 0.01, (r() - 0.5) * 0.06] as V3, s: 0.4 + r() * 1.2 }));
  }, []);
  const pos = new Float32Array(S * 3);
  const size = new Float32Array(S);
  const col = new Float32Array(S * 3);
  const alpha = new Float32Array(S);
  const c = new THREE.Color(K.copperLight);
  seed.forEach((p, n) => {
    const born = T.pulse0 + p.t0;
    const age = f - born;
    const x0 = pulseX(born);
    if (age < 0 || age > 40) {
      alpha[n] = 0;
      return;
    }
    pos[n * 3] = x0 + p.v[0] * age;
    pos[n * 3 + 1] = sag(x0) + p.v[1] * age - 0.0012 * age * age;
    pos[n * 3 + 2] = p.v[2] * age;
    size[n] = p.s;
    col.set([c.r, c.g, c.b], n * 3);
    alpha[n] = (1 - age / 40) * 0.9;
  });
  return <Dots positions={pos} sizes={size} colors={col} alphas={alpha} scale={120} />;
};

export const Chain: React.FC = () => {
  const f = useCurrentFrame();
  const cam = chainCam(f);
  const px = pulseX(f);
  const orb = project(cam, [px, sag(px), 0]);
  const pulseOn = f > T.pulse0 - 4 && f < T.pulseEnd + 8 ? 1 : 0;
  const cdfIn = easeOutExpo(prog(f, T.pull + 12, T.pull + 40));
  const out = easeInExpo(prog(f, T.exit - 6, T.exit + 6));
  return (
    <Enter>
      <AbsoluteFill style={{ background: K.bg }}>
        <Stage cam={cam} fog={[4, 22]} bloom={{ strength: 0.55, radius: 0.45, threshold: 0.92 }}>
          <ambientLight intensity={0.1} />
          <spotLight position={[4, 7, 5]} angle={0.7} penumbra={1} intensity={45} color="#ffffff" distance={30} />
          <pointLight position={[px, sag(px) + 0.2, 0.4]} intensity={pulseOn * 4} color={K.copperLight} distance={4} />
          <Links f={f} />
          <Sparks f={f} />
          <mesh position={[px, sag(px), 0]} visible={pulseOn > 0}>
            <sphereGeometry args={[0.07, 24, 24]} />
            <meshBasicMaterial color={new THREE.Color("#ffd2b0").multiplyScalar(4)} toneMapped={false} />
          </mesh>
        </Stage>

        <Anamorphic x={orb.x} y={orb.y} power={pulseOn * 0.75} color={K.copperLight} width={900} />

        {/* Halkaların üzerindeki faktörler */}
        <AbsoluteFill>
          {LDFS.map((v, k) => {
            const x = linkX(k + 1);
            const p = project(cam, [x, sag(x) + 0.95, 0]);
            const a = easeOutExpo(prog(px, x - 0.4, x + 0.6)) * (1 - out) * (1 - easeInExpo(prog(f, T.pull + 4, T.pull + 20)) * 0.65);
            if (a <= 0.01) return null;
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  transform: `translate(-50%, -100%) translateY(${(1 - a) * 18}px)`,
                  opacity: a,
                  filter: `blur(${(1 - a) * 6}px)`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: FONT_MONO, fontSize: 15, letterSpacing: "0.2em", color: K.copperLight, marginBottom: 6 }}>
                  {`${(k + 1) * 12}→${(k + 2) * 12}`}
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 46, fontWeight: 600, letterSpacing: "-0.03em", color: K.ink }}>×{v}</div>
              </div>
            );
          })}
        </AbsoluteFill>

        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: "110px 0 0 140px", flexDirection: "column", gap: 20 }}>
          <Kicker text="Chain-Ladder" at={10} out={T.pull} color={K.copperLight} />
          <Rise text="Her halka, bir sonrakini taşır." at={16} out={T.pull - 2} size={70} style={{ justifyContent: "flex-start" }} />
        </AbsoluteFill>

        {/* CDF sonucu */}
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 150, opacity: cdfIn * (1 - out) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28, transform: `translateY(${(1 - cdfIn) * 40}px)`, filter: `blur(${(1 - cdfIn) * 10}px)` }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 22, letterSpacing: "0.3em", color: K.inkSoft }}>CDF → ULT</div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 150,
                fontWeight: 700,
                letterSpacing: "-0.05em",
                backgroundImage: `linear-gradient(180deg, #ffffff 20%, ${K.copperLight})`,
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              {CDF}
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Enter>
  );
};
