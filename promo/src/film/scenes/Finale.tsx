import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage, CamState, project } from "../stage";
import { Dots } from "../objects";
import { LOGO_POLYS } from "../logoShape";
import { FONT_DISPLAY, FONT_MONO, K } from "../theme";
import { clamp, easeInOutCubic, easeOutBack, easeOutExpo, prog, rng } from "../math";
import { Anamorphic, Enter, Flash } from "../fx";
import { Focus } from "../type";

// Final: favicon'dan izlenen "A" işareti gerçek bir 3D nesneye dönüşür.

const T = { stream: 0, form: 40, solid: 54, glint: 90, lift: 126, word: 144, tag: 180, url: 216, fade: 300, end: 324 };
const S = 3.1; // logo ölçeği (birim yükseklik → dünya)
const PN = 2600;

const insidePoly = (x: number, y: number, poly: [number, number][]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const logoGeometry = () => {
  const shapes = LOGO_POLYS.map((poly) => {
    const s = new THREE.Shape();
    poly.forEach(([x, y], i) => (i ? s.lineTo(x * S, y * S) : s.moveTo(x * S, y * S)));
    s.closePath();
    return s;
  });
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.035,
    bevelSegments: 6,
    curveSegments: 12,
  });
  g.translate(0, 0, -0.17);
  g.computeVertexNormals();
  // Logo gradyanı: sol-alt lacivert → sağ-üst elektrik mavisi
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const a = new THREE.Color("#141266");
  const b = new THREE.Color("#3a44ff");
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getX(i) / S + pos.getY(i) / S) * 0.9 + 0.55);
    const c = a.clone().lerp(b, t);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
};

export const finaleCam = (f: number): CamState => {
  const p = easeInOutCubic(prog(f, 0, T.lift + 40));
  const z = 14 - p * 2.6 - prog(f, T.lift, T.end) * 0.7;
  const lift = easeInOutCubic(prog(f, T.lift, T.lift + 34));
  return { pos: [0, 0.1 - lift * 1.05, z], target: [0, -lift * 1.05, 0], fov: 32 };
};

const Logo: React.FC<{ f: number }> = ({ f }) => {
  const geo = useMemo(logoGeometry, []);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.65,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 2.2,
        transparent: true,
      }),
    [],
  );
  const s = easeOutExpo(prog(f, T.form, T.solid + 20));
  const rot = (1 - easeOutExpo(prog(f, T.form, T.glint + 20))) * -1.35;
  const float = Math.sin(f * 0.03) * 0.04;
  mat.opacity = clamp(prog(f, T.form, T.solid));
  return (
    <group rotation={[0.08 * (1 - s), rot + Math.sin(f * 0.012) * 0.06 * s, 0]} position={[0, float, 0]} scale={0.85 + s * 0.15}>
      <mesh geometry={geo} material={mat} />
    </group>
  );
};

const Stream: React.FC<{ f: number }> = ({ f }) => {
  const seed = useMemo(() => {
    const r = rng(2026);
    const start = new Float32Array(PN * 3);
    const target = new Float32Array(PN * 3);
    const delay = new Float32Array(PN);
    const size = new Float32Array(PN);
    const col = new Float32Array(PN * 3);
    const cA = new THREE.Color("#8ea0ff");
    const cB = new THREE.Color(K.copperLight);
    for (let n = 0; n < PN; n++) {
      // Hedef: logo alanı içinde rastgele nokta
      let x = 0;
      let y = 0;
      let ok = false;
      for (let tries = 0; tries < 200 && !ok; tries++) {
        x = r() - 0.5;
        y = r() - 0.5;
        ok = LOGO_POLYS.some((p) => insidePoly(x, y, p));
      }
      target.set([x * S, y * S, (r() - 0.5) * 0.3], n * 3);
      const th = r() * Math.PI * 2;
      const rad = 8 + r() * 10;
      start.set([Math.cos(th) * rad, Math.sin(th) * rad * 0.6, -6 + r() * 12], n * 3);
      delay[n] = r() * 26;
      size[n] = 0.4 + Math.pow(r(), 3) * 1.8;
      const c = cA.clone().lerp(cB, r() < 0.2 ? 0.8 : 0);
      col.set([c.r, c.g, c.b], n * 3);
    }
    return { start, target, delay, size, col };
  }, []);
  if (f > T.solid + 30) return null;
  const pos = new Float32Array(PN * 3);
  const al = new Float32Array(PN);
  for (let n = 0; n < PN; n++) {
    const t = easeInOutCubic(prog(f, seed.delay[n], T.form + seed.delay[n] * 0.3));
    const sw = (1 - t) * 1.4;
    const sx = seed.start[n * 3];
    const sy = seed.start[n * 3 + 1];
    const x = sx * Math.cos(sw) - sy * Math.sin(sw);
    const y = sx * Math.sin(sw) + sy * Math.cos(sw);
    pos[n * 3] = x + (seed.target[n * 3] - x) * t;
    pos[n * 3 + 1] = y + (seed.target[n * 3 + 1] - y) * t;
    pos[n * 3 + 2] = seed.start[n * 3 + 2] + (seed.target[n * 3 + 2] - seed.start[n * 3 + 2]) * t;
    al[n] = easeOutExpo(prog(f, seed.delay[n] * 0.5, seed.delay[n] * 0.5 + 12)) * (1 - easeOutExpo(prog(f, T.solid - 4, T.solid + 26))) * 0.8;
  }
  return <Dots positions={pos} sizes={seed.size} colors={seed.col} alphas={al} scale={170} />;
};

export const Finale: React.FC = () => {
  const f = useCurrentFrame();
  const cam = finaleCam(f);
  // Yüzeyden geçen ışık: kayan bir spot ışığı bevel kenarlarında parlar
  const sweep = prog(f, T.glint - 10, T.glint + 34);
  const glintX = -6 + sweep * 12;
  const center = project(cam, [0, 0, 0.3]);
  const flare = Math.max(0, 1 - Math.abs(f - T.glint - 6) / 16);
  const fadeOut = easeInOutCubic(prog(f, T.fade, T.end));
  const urlA = easeOutExpo(prog(f, T.url, T.url + 30));
  return (
    <Enter exit={0}>
      <AbsoluteFill style={{ background: K.bg }}>
        <Stage cam={cam} bloom={{ strength: 0.55, radius: 0.5, threshold: 0.88 }} studio={{ warm: 0.6, cool: 1.4 }}>
          <ambientLight intensity={0.35} />
          <pointLight position={[0, 3, -3]} intensity={25} color={K.indigoGlow} distance={10} />
          <spotLight position={[glintX, 2.5, 5]} angle={0.22} penumbra={0.9} intensity={Math.sin(sweep * Math.PI) * 60} color="#ffffff" distance={20} />
          <directionalLight position={[3, 4, 6]} intensity={0.8} color="#dfe3ff" />
          <Stream f={f} />
          <Logo f={f} />
        </Stage>

        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 30% 22% at 50% ${(center.y / 1080) * 100 + 10}%, rgba(43,49,255,${0.22 * easeOutExpo(prog(f, T.solid, T.solid + 40))}), rgba(0,0,0,0) 70%)`,
          }}
        />
        <Anamorphic x={center.x} y={center.y} power={flare * 0.9} width={1700} />

        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 190, flexDirection: "column", gap: 20 }}>
          <Focus text="Actuarius" at={T.word} size={128} weight={700} color="#ffffff" tracking={-0.04} spread={1.4} />
          <Focus text="Aktüeryal işin tamamı, tek platformda." at={T.tag} size={38} weight={500} color={K.inkSoft} tracking={-0.01} />
        </AbsoluteFill>

        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: urlA, transform: `translateY(${(1 - urlA) * 20}px)` }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 26, letterSpacing: "0.12em", color: K.ink }}>actuarius.com.tr</div>
            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.25)" }} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 22,
                fontWeight: 600,
                color: "#fff",
                padding: "11px 24px",
                borderRadius: 999,
                background: `linear-gradient(180deg, #4a54ff, ${K.indigo})`,
                boxShadow: `0 8px 30px rgba(43,49,255,0.45), inset 0 1px 0 rgba(255,255,255,0.3)`,
                transform: `scale(${easeOutBack(clamp(prog(f, T.url + 8, T.url + 30)), 2)})`,
              }}
            >
              Ücretsiz başlayın
            </div>
          </div>
        </AbsoluteFill>

        <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
        <Flash at={T.solid} len={18} power={0.5} />
      </AbsoluteFill>
    </Enter>
  );
};
