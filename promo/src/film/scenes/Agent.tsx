import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage, CamState } from "../stage";
import { Dots } from "../objects";
import { BEAT, FONT_DISPLAY, FONT_MONO, K } from "../theme";
import { V3, clamp, easeInExpo, easeInOutCubic, easeOutExpo, keys3, prog, rng } from "../math";
import { Enter, Flash, hexA } from "../fx";
import { Kicker, Odometer, Rise } from "../type";

// AI Agent: gürültüyle nefes alan bir çekirdek + dört yörüngede 45 araç.

const T = { intro: 0, stac: 90, reveal: 198, log: 270, exit: 348 };

const VERBS = ["Veriyi bağlar.", "Üçgeni kurar.", "Aykırıyı eler.", "Genç yılları BF'e taşır.", "Nakit akışını yürütür.", "Raporu üretir."];

const RINGS = [
  { n: 31, r: 2.5, tilt: [0.25, 0, 0.1] as V3, speed: 0.006, label: "Rezerv", color: K.indigoGlow },
  { n: 10, r: 3.35, tilt: [-0.5, 0.3, -0.2] as V3, speed: -0.009, label: "Nakit Akışı", color: "#9aa6ff" },
  { n: 2, r: 4.05, tilt: [0.9, -0.4, 0.3] as V3, speed: 0.012, label: "İskonto", color: K.copperLight },
  { n: 2, r: 4.6, tilt: [-1.1, 0.2, 0.5] as V3, speed: -0.011, label: "Veri & Navigasyon", color: "#ffd2b0" },
];

// ── Çekirdek shader ──────────────────────────────────────────────
const noise = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const coreVert = /* glsl */ `
uniform float uTime; uniform float uAmp;
varying vec3 vN; varying vec3 vView; varying vec3 vP;
${noise}
void main(){
  float d = snoise(normal * 1.2 + vec3(uTime * 0.25)) * 0.05 * uAmp;
  vec3 p = position + normal * d;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

// Yüzeyde akan topografik ışık çizgileri + cam gibi fresnel kenar
const coreFrag = /* glsl */ `
uniform float uTime; uniform float uGlow; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
varying vec3 vN; varying vec3 vView; varying vec3 vP;
${noise}
void main(){
  float fres = pow(1.0 - max(dot(vN, vView), 0.0), 2.6);
  float n = snoise(vP * 1.4 + vec3(0.0, uTime * 0.18, uTime * 0.1));
  float n2 = snoise(vP * 3.1 - vec3(uTime * 0.2));
  float field = n * 0.8 + n2 * 0.2;
  float iso = abs(fract(field * 5.0 + uTime * 0.25) - 0.5);
  float lines = 1.0 - smoothstep(0.0, 0.045, iso);
  float warm = smoothstep(0.35, 0.75, n2);
  vec3 lineCol = mix(uC, uB, warm);
  float facing = max(dot(vN, vView), 0.0);
  vec3 col = uA * (0.35 + 0.65 * facing) + lineCol * lines * (0.55 + 0.9 * facing) + uC * fres * 1.1;
  col *= uGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

const Core: React.FC<{ f: number; scale: number; glow: number }> = ({ f, scale, glow }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coreVert,
        fragmentShader: coreFrag,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 1 },
          uGlow: { value: 1 },
          uA: { value: new THREE.Color("#0a0c3a") },
          uB: { value: new THREE.Color(K.copperLight) },
          uC: { value: new THREE.Color("#9fb0ff") },
        },
      }),
    [],
  );
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 64), []);
  mat.uniforms.uTime.value = f / 30;
  mat.uniforms.uGlow.value = glow;
  mat.uniforms.uAmp.value = 1;
  return (
    <group scale={scale}>
      <mesh geometry={geo} material={mat} />
      {/* iç ışık */}
      <mesh scale={0.55}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={new THREE.Color("#ffd9c0").multiplyScalar(glow)} toneMapped={false} transparent opacity={0.08} />
      </mesh>
    </group>
  );
};

type Node = { ring: number; k: number; pos: V3 };
const nodePositions = (f: number): Node[] => {
  const out: Node[] = [];
  RINGS.forEach((R, ri) => {
    const e = new THREE.Euler(...R.tilt);
    for (let k = 0; k < R.n; k++) {
      const a = (k / R.n) * Math.PI * 2 + f * R.speed + ri * 0.7;
      const v = new THREE.Vector3(Math.cos(a) * R.r, 0, Math.sin(a) * R.r).applyEuler(e);
      out.push({ ring: ri, k, pos: [v.x, v.y, v.z] });
    }
  });
  return out;
};

// Her fiilde çekirdekten bir araca ışın
const verbTarget = (i: number) => [3, 12, 20, 27, 34, 41][i];

const Rings: React.FC<{ f: number; a: number; hot: number; beam: number }> = ({ f, a, hot, beam }) => {
  const nodes = nodePositions(f);
  const cube = useMemo(() => new THREE.BoxGeometry(0.11, 0.11, 0.11), []);
  return (
    <group>
      {RINGS.map((R, ri) => (
        <mesh key={ri} rotation={R.tilt}>
          <torusGeometry args={[R.r, 0.004, 6, 256]} />
          <meshBasicMaterial color={new THREE.Color(R.color).multiplyScalar(0.8)} transparent opacity={0.35 * a} toneMapped={false} />
        </mesh>
      ))}
      {nodes.map((n, idx) => {
        const R = RINGS[n.ring];
        const appear = easeOutExpo(prog(f, 12 + idx * 1.2, 30 + idx * 1.2)) * a;
        const isHot = idx === hot;
        const g = (isHot ? 2.5 * beam : 0) + 1.1;
        return (
          <mesh key={idx} geometry={cube} position={n.pos} scale={appear * (isHot ? 1 + beam * 0.7 : 1)} rotation={[f * 0.03 + idx, f * 0.02, 0]}>
            <meshBasicMaterial color={new THREE.Color(R.color).multiplyScalar(g)} toneMapped={false} />
          </mesh>
        );
      })}
      {hot >= 0 && beam > 0.01 ? <Beam to={nodes[hot].pos} p={beam} /> : null}
    </group>
  );
};

const Beam: React.FC<{ to: V3; p: number }> = ({ to, p }) => {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), []);
  const v = new THREE.Vector3(...to);
  const len = v.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
  return (
    <mesh geometry={geo} quaternion={q} scale={[0.018 * p, 0.018 * p, len]}>
      <meshBasicMaterial color={new THREE.Color("#c9d0ff").multiplyScalar(4)} toneMapped={false} transparent opacity={p} />
    </mesh>
  );
};

const Dust: React.FC<{ f: number }> = ({ f }) => {
  const D = 1400;
  const seed = useMemo(() => {
    const r = rng(77);
    const p = new Float32Array(D * 3);
    const s = new Float32Array(D);
    const c = new Float32Array(D * 3);
    const col = new THREE.Color("#aab4ff");
    for (let i = 0; i < D; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rad = 5 + r() * 14;
      p.set([Math.sqrt(1 - u * u) * Math.cos(th) * rad, u * rad * 0.6, Math.sqrt(1 - u * u) * Math.sin(th) * rad], i * 3);
      s[i] = 0.3 + Math.pow(r(), 3) * 1.6;
      c.set([col.r, col.g, col.b], i * 3);
    }
    return { p, s, c };
  }, []);
  const pos = new Float32Array(D * 3);
  const al = new Float32Array(D);
  const rot = f * 0.002;
  for (let i = 0; i < D; i++) {
    const x = seed.p[i * 3];
    const z = seed.p[i * 3 + 2];
    pos[i * 3] = x * Math.cos(rot) - z * Math.sin(rot);
    pos[i * 3 + 1] = seed.p[i * 3 + 1];
    pos[i * 3 + 2] = x * Math.sin(rot) + z * Math.cos(rot);
    al[i] = 0.35 * (0.6 + 0.4 * Math.sin(f * 0.1 + i));
  }
  return <Dots positions={pos} sizes={seed.s} colors={seed.c} alphas={al} scale={150} />;
};

// Staccato bölümünde her vuruşta sert açı değişimi
const SHOTS: { pos: V3; target: V3; fov: number; roll: number }[] = [
  { pos: [1.2, 0.6, 6.2], target: [-1.6, 0, 0], fov: 40, roll: 0.08 },
  { pos: [-6.0, -2.2, 4.4], target: [1.8, 0.3, 0], fov: 34, roll: -0.12 },
  { pos: [0.4, 9.0, 2.0], target: [-1.8, 0, 0], fov: 44, roll: 0.3 },
  { pos: [5.4, 0.3, -3.6], target: [1.2, 0, 1.4], fov: 32, roll: 0.05 },
  { pos: [-2.6, 1.6, 8.0], target: [-1.4, -0.2, 0], fov: 36, roll: -0.05 },
  { pos: [0, 0, 5.2], target: [1.9, 0, 0], fov: 50, roll: 0 },
];

export const agentCam = (f: number): CamState => {
  if (f < T.stac) {
    const p = easeInOutCubic(prog(f, 0, T.stac));
    const ang = -0.6 + p * 0.5;
    const r = 9 - p * 2.5;
    return { pos: [Math.sin(ang) * r, 0.6 + p * 0.4, Math.cos(ang) * r], target: [0, 0, 0], fov: 36, roll: -0.05 };
  }
  if (f < T.reveal) {
    const i = Math.min(5, Math.floor((f - T.stac) / BEAT));
    const lf = (f - T.stac) % BEAT;
    const s = SHOTS[i];
    const drift = lf / BEAT;
    const pos: V3 = [s.pos[0] * (1 - drift * 0.06), s.pos[1] * (1 - drift * 0.06), s.pos[2] * (1 - drift * 0.06)];
    // Çekirdeği metnin karşı tarafına it: metin soldaysa küre sağda kalır.
    const fwd = new THREE.Vector3(-pos[0], -pos[1], -pos[2]);
    const dist = fwd.length();
    const right = fwd.normalize().clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const side = i % 2 ? 1 : -1;
    const tg = right.multiplyScalar(side * dist * 0.3);
    return { pos, target: [tg.x, tg.y, tg.z], fov: s.fov, roll: s.roll + drift * 0.03 };
  }
  // Geniş plan: yörüngelerin tamamı
  const p = easeOutExpo(prog(f, T.reveal, T.reveal + 60));
  const q = prog(f, T.reveal, T.exit);
  const ang = 0.4 + q * 0.5;
  const r = 4 + p * 9;
  const base: V3 = [Math.sin(ang) * r, 2.4 * p + 0.5, Math.cos(ang) * r];
  const x = easeInExpo(prog(f, T.exit, 360));
  const pos = keys3(x, [[0, base], [1, [0.1, 0.2, 1.4]]], (t) => t);
  return { pos, target: [-2.2 * p * (1 - x), 0, 0], fov: 36 + x * 30, roll: 0 };
};

const LOG = [
  { t: "09:14:02", m: "Veri bağlandı", d: "Motor · 2025Q4 · 1.595.000 ödeme" },
  { t: "09:14:05", m: "Üçgen kuruldu", d: "10 × 10 · kümülatif · paid" },
  { t: "09:14:07", m: "Hücre elendi", d: "2019 · 36→48 · aykırı gelişim" },
  { t: "09:14:09", m: "BF'e taşındı", d: "2024–2025 · a priori %82,0" },
  { t: "09:14:12", m: "Kuyruk seçildi", d: "Inverse power · R² 0,998" },
  { t: "09:14:15", m: "Rapor üretildi", d: "Excel · segment kırılımı · model kilitlendi" },
];

const LogPanel: React.FC<{ f: number }> = ({ f }) => {
  const p = easeOutExpo(prog(f, T.log, T.log + 24));
  const out = easeInExpo(prog(f, T.exit - 4, T.exit + 8));
  if (p <= 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-end", paddingRight: 130, perspective: 1600 }}>
      <div
        style={{
          width: 640,
          padding: "30px 34px",
          borderRadius: 26,
          background: "linear-gradient(160deg, rgba(40,44,90,0.55), rgba(12,12,30,0.55))",
          border: "1px solid rgba(160,170,255,0.22)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
          backdropFilter: "blur(18px)",
          transform: `rotateY(${-18 + p * 10}deg) translateX(${(1 - p) * 220}px) translateZ(${-out * 400}px)`,
          opacity: p * (1 - out),
          filter: `blur(${out * 12}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: K.good, boxShadow: `0 0 14px ${K.good}` }} />
          <div style={{ fontFamily: FONT_MONO, fontSize: 16, letterSpacing: "0.22em", color: K.inkSoft }}>AGENT · ÇALIŞIYOR</div>
        </div>
        {LOG.map((l, i) => {
          const a = easeOutExpo(prog(f, T.log + 10 + i * 9, T.log + 22 + i * 9));
          const typed = Math.floor(clamp((f - (T.log + 10 + i * 9)) / 10) * l.d.length);
          return (
            <div key={i} style={{ display: "flex", gap: 18, alignItems: "baseline", padding: "9px 0", borderTop: i ? "1px solid rgba(160,170,255,0.08)" : undefined, opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: K.muted, width: 86 }}>{l.t}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 18, color: K.good }}>✓</div>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 23, fontWeight: 600, color: K.ink }}>{l.m}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: "#9aa3d6", marginTop: 3 }}>{l.d.slice(0, typed)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Agent: React.FC = () => {
  const f = useCurrentFrame();
  const cam = agentCam(f);
  const stacIdx = f >= T.stac && f < T.reveal ? Math.floor((f - T.stac) / BEAT) : -1;
  const lf = stacIdx >= 0 ? (f - T.stac) % BEAT : 0;
  const beam = stacIdx >= 0 ? Math.max(0, 1 - lf / 14) : 0;
  const coreScale = easeOutExpo(prog(f, 0, 40)) * (1 + (stacIdx >= 0 ? Math.max(0, 1 - lf / 8) * 0.08 : 0));
  const ringsA = easeOutExpo(prog(f, 10, 50));
  const reveal = easeOutExpo(prog(f, T.reveal + 10, T.reveal + 40));
  const out = easeInExpo(prog(f, T.log - 10, T.log));

  return (
    <Enter>
      <AbsoluteFill style={{ background: K.bg }}>
        <Stage cam={cam} bloom={{ strength: 0.75, radius: 0.6, threshold: 0.72 }} studio={false}>
          <Dust f={f} />
          <Core f={f} scale={coreScale} glow={1 + beam * 0.6} />
          <Rings f={f} a={ringsA} hot={stacIdx >= 0 ? verbTarget(stacIdx) : -1} beam={beam} />
        </Stage>

        {/* Giriş */}
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 130, flexDirection: "column", gap: 16 }}>
          <Kicker text="Actuarius AI Agent" at={14} out={T.stac - 8} />
          <div style={{ display: "flex", gap: 30 }}>
            <Rise text="Sohbet etmez." at={22} out={T.stac - 6} size={88} style={{ color: K.inkSoft }} gradient="linear-gradient(180deg,#d7d7de,#7c7c86)" />
            <Rise text="İş yapar." at={46} out={T.stac - 4} size={88} gradient={`linear-gradient(90deg, #ffffff, ${K.indigoGlow})`} />
          </div>
        </AbsoluteFill>

        {/* Staccato fiiller — her vuruşta sert kesme */}
        {stacIdx >= 0 ? (
          <AbsoluteFill style={{ justifyContent: "center", alignItems: stacIdx % 2 ? "flex-end" : "flex-start", padding: "0 150px" }}>
            <div
              key={stacIdx}
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 104,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: K.ink,
                transform: `scale(${1.06 - easeOutExpo(clamp(lf / 10)) * 0.06})`,
                filter: `blur(${Math.max(0, 6 - lf * 2)}px)`,
                opacity: 1 - clamp((lf - 15) / 3),
                textShadow: `0 0 40px ${hexA(K.indigoGlow, 0.35)}`,
              }}
            >
              {VERBS[stacIdx]}
            </div>
          </AbsoluteFill>
        ) : null}

        {/* 45 araç sayacı + halka lejantı */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start", paddingLeft: 150, opacity: reveal * (1 - out) }}>
          <Kicker text="4 modül · tek agent" at={T.reveal + 6} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 14 }}>
            <Odometer value={45} at={T.reveal + 8} dur={40} size={230} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 600, color: K.inkSoft, letterSpacing: "-0.03em" }}>araç</div>
          </div>
          <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "auto auto", columnGap: 26, rowGap: 10 }}>
            {RINGS.map((R, i) => {
              const a = easeOutExpo(prog(f, T.reveal + 24 + i * 6, T.reveal + 44 + i * 6));
              return (
                <React.Fragment key={i}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 30, color: R.color, textAlign: "right", opacity: a }}>{R.n}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, color: K.ink, opacity: a, transform: `translateX(${(1 - a) * 20}px)` }}>{R.label}</div>
                </React.Fragment>
              );
            })}
          </div>
        </AbsoluteFill>

        {/* Agent günlüğü */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start", paddingLeft: 150, flexDirection: "column", gap: 16 }}>
          <Rise text="Her adım" at={T.log + 6} out={T.exit - 4} size={80} style={{ justifyContent: "flex-start" }} />
          <Rise text="gerekçesiyle." at={T.log + 12} out={T.exit - 2} size={80} style={{ justifyContent: "flex-start" }} gradient={`linear-gradient(90deg, #ffffff, ${K.indigoGlow})`} />
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: K.inkSoft, opacity: easeOutExpo(prog(f, T.log + 26, T.log + 50)) * (1 - easeInExpo(prog(f, T.exit - 4, T.exit + 6))), maxWidth: 560, lineHeight: 1.4 }}>
            Rol ve model kilidine uyar. Her adım geri alınabilir ve denetime yazılır.
          </div>
        </AbsoluteFill>
        <LogPanel f={f} />

        {Array.from({ length: 6 }, (_, i) => (
          <Flash key={i} at={T.stac + i * BEAT} len={8} power={0.35} />
        ))}
        <Flash at={T.reveal} len={14} power={0.5} />
      </AbsoluteFill>
    </Enter>
  );
};

