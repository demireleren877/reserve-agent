import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage, CamState } from "../stage";
import { Dots, GridFloor, MirrorVeil } from "../objects";
import { K } from "../theme";
import { N, cellHeight, isKnown } from "../data";
import {
  V3,
  clamp,
  easeInExpo,
  easeInOutCubic,
  easeInOutQuint,
  easeOutBack,
  easeOutExpo,
  keys3,
  prog,
  rng,
} from "../math";
import { Focus, Kicker, Rise } from "../type";
import { Anamorphic, Flash } from "../fx";

// Sahne-içi zaman noktaları (18 frame = 1 vuruş)
const T = {
  converge: 126, // parçacıklar üçgene akmaya başlar
  land: 180, // çubuklar belirir
  project: 288, // IBNR projeksiyonu yükselir
  exit: 414,
};

const P = 3600; // parçacık sayısı
const SP = 1.0; // hücre aralığı
const cx = (j: number) => (j - (N - 1) / 2) * SP; // gelişim → x
const cz = (i: number) => (i - (N - 1) / 2) * SP; // kaza yılı → z

const orbit = (ang: number, r: number, h: number, t: V3 = [0, 1, 0]): V3 => [
  t[0] + Math.sin(ang) * r,
  h,
  t[2] + Math.cos(ang) * r,
];

export const originCam = (f: number): CamState => {
  if (f < T.converge + 20) {
    // Karanlıkta yavaş itme
    const p = easeInOutCubic(prog(f, 0, T.converge + 20));
    return { pos: keys3(p, [[0, [0, 0.8, 26]], [1, [2.5, 3.2, 17]]], (x) => x), target: [0, 1.2, 0], fov: 38, roll: -0.04 * (1 - p) };
  }
  if (f < T.land + 12) {
    // Yakınsama: kamera üçgenin üstüne kavis çizer
    const p = easeInOutQuint(prog(f, T.converge + 20, T.land + 12));
    const a = -0.45 + p * 1.25;
    return { pos: orbit(a + 0.15 * (1 - p), 17 - p * 3.5, 3.2 + p * 5.5), target: [0, 1.1 - p * 0.1, 0], fov: 38 };
  }
  if (f < T.project) {
    // Kahraman plan: yavaş orbit
    const p = prog(f, T.land + 12, T.project);
    const a = 0.8 + p * 0.42;
    return { pos: orbit(a, 13.5 - p * 1.2, 8.7 - p * 2.3), target: [0.3, 1, 0], fov: 38 };
  }
  if (f < T.exit) {
    // Projeksiyon: yukarıdan, gelecek hücrelere odak
    const p = easeInOutCubic(prog(f, T.project, T.exit - 30));
    const a = 1.22 + p * 0.5;
    return { pos: orbit(a, 12.3 - p * 0.8, 6.4 + p * 7.5, [0.4 * p, 1, 0.4 * p]), target: [-2.2 * p, 0.6, 1.2 * p], fov: 38 };
  }
  // Çıkış: köşegen boyunca hızlanarak dal
  const p = easeInExpo(prog(f, T.exit, 432));
  const from = orbit(1.72, 11.5, 13.9, [0.4, 1, 0.4]);
  return { pos: keys3(p, [[0, from], [1, [3.2, 3.4, 2.4]]], (x) => x), target: [-2.2 + p * 0.5, 0.6, 1.2 - p * 2], fov: 38 + p * 26 };
};

type Cell = { i: number; j: number; h: number; known: boolean };

export const Bars: React.FC<{ f: number; mirror?: boolean }> = ({ f, mirror }) => {
  const cells = useMemo(() => {
    const out: Cell[] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) out.push({ i, j, h: cellHeight(i, j), known: isKnown(i, j) });
    return out;
  }, []);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const rounded = useMemo(() => {
    const m = new Map<string, THREE.BufferGeometry>();
    for (const c of cells) if (c.known) m.set(`${c.i}-${c.j}`, new RoundedBoxGeometry(0.84, c.h, 0.84, 4, 0.05).translate(0, c.h / 2, 0));
    return m;
  }, [cells]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), []);
  const copper = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#d27c45"),
        metalness: 0.85,
        roughness: 0.26,
        clearcoat: 1,
        clearcoatRoughness: 0.18,
        envMapIntensity: 2.4,
      }),
    [],
  );
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#1c22b8"),
        emissive: new THREE.Color(K.indigo),
        emissiveIntensity: 0.28,
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    [],
  );
  const edgeMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color("#8d9bff"), transparent: true, toneMapped: false }), []);

  // Projeksiyon tarama cephesi: köşegen boyunca ilerleyen ışık
  const scan = (f - T.project) / 60; // köşegen indeksi (i+j - N+1) cinsinden
  edgeMat.opacity = 0.95;

  return (
    <group scale={[1, mirror ? -1 : 1, 1]}>
      {cells.map((c) => {
        const d = c.i + c.j;
        if (c.known) {
          // Dalga halinde yükselen kümülatif çubuklar
          const start = T.land - 8 + d * 2.2;
          const p = clamp(easeOutBack(clamp((f - start) / 26), 1.1), 0, 1.08);
          if (p <= 0.001) return null;
          return (
            <mesh key={`${c.i}-${c.j}`} position={[cx(c.j), 0, cz(c.i)]} scale={[1, p, 1]} geometry={rounded.get(`${c.i}-${c.j}`)} material={copper} />
          );
        }
        // Gelecek hücreler (IBNR): hologram
        const k = d - (N - 1); // 1..N-1
        const local = scan * 3 - k;
        const p = easeOutExpo(clamp(local / 1.4));
        if (p <= 0.001) return null;
        const pulse = 1 + Math.max(0, 1 - Math.abs(local - 0.6) * 1.4) * 1.8;
        return (
          <group key={`${c.i}-${c.j}`} position={[cx(c.j), 0, cz(c.i)]} scale={[0.84, c.h * p, 0.84]}>
            <mesh geometry={box} material={glass} />
            {!mirror ? (
              <lineSegments geometry={edges}>
                <lineBasicMaterial color={new THREE.Color("#8d9bff").multiplyScalar(pulse)} transparent opacity={0.9} toneMapped={false} />
              </lineSegments>
            ) : null}
          </group>
        );
      })}
    </group>
  );
};

const Particles: React.FC<{ f: number }> = ({ f }) => {
  const seed = useMemo(() => {
    const r = rng(42);
    const known: [number, number][] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (isKnown(i, j)) known.push([i, j]);
    const start = new Float32Array(P * 3);
    const target = new Float32Array(P * 3);
    const vel = new Float32Array(P * 3);
    const delay = new Float32Array(P);
    const size = new Float32Array(P);
    const col = new Float32Array(P * 3);
    const warm = new THREE.Color(K.copperLight);
    const cool = new THREE.Color("#c9d0ff");
    for (let n = 0; n < P; n++) {
      // Kabuk şeklinde dağılmış başlangıç
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rad = 4 + Math.pow(r(), 0.7) * 16;
      const s = Math.sqrt(1 - u * u);
      start[n * 3] = s * Math.cos(th) * rad;
      start[n * 3 + 1] = u * rad * 0.55 + 1.5;
      start[n * 3 + 2] = s * Math.sin(th) * rad - 2;
      vel[n * 3] = (r() - 0.5) * 0.012;
      vel[n * 3 + 1] = (r() - 0.5) * 0.008 + 0.003;
      vel[n * 3 + 2] = (r() - 0.5) * 0.012;
      // Hedef: bilinen bir çubuğun hacmi
      const [ci, cj] = known[Math.floor(r() * known.length)];
      const h = cellHeight(ci, cj);
      target[n * 3] = cx(cj) + (r() - 0.5) * 0.8;
      target[n * 3 + 1] = r() * h;
      target[n * 3 + 2] = cz(ci) + (r() - 0.5) * 0.8;
      delay[n] = r() * 30 + (ci + cj) * 1.6;
      size[n] = 0.35 + Math.pow(r(), 4) * 2.6;
      const c = warm.clone().lerp(cool, r() * 0.7);
      col.set([c.r, c.g, c.b], n * 3);
    }
    return { start, target, vel, delay, size, col };
  }, []);
  const out = useMemo(
    () => ({ pos: new Float32Array(P * 3), size: new Float32Array(P), alpha: new Float32Array(P) }),
    [],
  );
  const fadeIn = easeOutExpo(prog(f, 0, 50));
  for (let n = 0; n < P; n++) {
    const t = easeInOutCubic(prog(f, T.converge + seed.delay[n] * 0.5, T.land - 6 + seed.delay[n] * 0.35));
    // Girdap: yakınsarken y ekseni etrafında dönüş
    const sx = seed.start[n * 3] + seed.vel[n * 3] * f;
    const sy = seed.start[n * 3 + 1] + seed.vel[n * 3 + 1] * f;
    const sz = seed.start[n * 3 + 2] + seed.vel[n * 3 + 2] * f;
    const swirl = t * (1 - t) * 3.2;
    const ca = Math.cos(swirl);
    const sa = Math.sin(swirl);
    const x = sx + (seed.target[n * 3] - sx) * t;
    const y = sy + (seed.target[n * 3 + 1] - sy) * t;
    const z = sz + (seed.target[n * 3 + 2] - sz) * t;
    out.pos[n * 3] = x * ca - z * sa;
    out.pos[n * 3 + 1] = y + Math.sin(f * 0.03 + n) * 0.05 * (1 - t);
    out.pos[n * 3 + 2] = x * sa + z * ca;
    const twinkle = 0.65 + 0.35 * Math.sin(f * 0.13 + n * 1.7);
    out.size[n] = seed.size[n] * (1 + t * 0.5);
    // Çubuklar belirince parçacıklar içlerinde erir
    const dissolve = 1 - easeOutExpo(prog(f, T.land + (seed.delay[n] % 12), T.land + 40));
    out.alpha[n] = fadeIn * twinkle * dissolve * (0.35 + 0.4 * t);
  }
  if (f > T.land + 55) return null;
  return <Dots positions={out.pos} sizes={out.size} colors={seed.col} alphas={out.alpha} scale={190} />;
};

export const Origin: React.FC = () => {
  const f = useCurrentFrame();
  const cam = originCam(f);
  const gridA = easeOutExpo(prog(f, T.land - 20, T.land + 40));
  const flare = Math.max(0, 1 - Math.abs(f - T.land) / 14);
  const scanFlare = f > T.project ? Math.max(0, 1 - Math.abs(f - (T.project + 8)) / 16) : 0;
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Stage cam={cam} fog={[14, 42]} bloom={{ strength: 0.85, radius: 0.55, threshold: 0.62 }}>
        <ambientLight intensity={0.15} />
        <directionalLight position={[-6, 10, 4]} intensity={2.4} color={"#ffd9bd"} />
        <spotLight position={[8, 9, 8]} angle={0.5} penumbra={1} intensity={120} color={"#ffe6d2"} distance={40} />
        <directionalLight position={[10, 4, 12]} intensity={0.9} color={"#c9d0ff"} />
        <Particles f={f} />
        {f >= T.land - 10 ? (
          <>
            <Bars f={f} />
            <Bars f={f} mirror />
            <MirrorVeil opacity={0.86} />
            <GridFloor opacity={0.55 * gridA} fade={24} />
          </>
        ) : null}
      </Stage>

      <Anamorphic x={960} y={560} power={flare * 0.9} color={K.copperLight} />
      <Anamorphic x={960} y={540} power={scanFlare * 0.7} />

      {/* 1 · Soğuk açılış */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 6 }}>
        <Rise text="Her hasar," at={22} out={100} size={112} />
        <Rise text="bir iz bırakır." at={40} out={104} size={112} style={{ color: K.inkSoft }} gradient="linear-gradient(180deg,#f5f5f7,#8a8a92)" />
      </AbsoluteFill>

      {/* 2 · Üçgen */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "0 0 120px 140px", flexDirection: "column", gap: 22 }}>
        <Kicker text="Gelişim üçgeni" at={T.land + 24} out={T.project - 14} color={K.copperLight} />
        <Rise text="Geçmiş, bir üçgende saklı." at={T.land + 30} out={T.project - 16} size={76} style={{ justifyContent: "flex-start" }} />
      </AbsoluteFill>

      {/* 3 · Projeksiyon */}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: "120px 0 0 140px", flexDirection: "column", gap: 22 }}>
        <Kicker text="IBNR · Projeksiyon" at={T.project + 30} out={T.exit - 6} />
        <Rise text="Henüz görünmeyeni" at={T.project + 36} out={T.exit - 8} size={84} style={{ justifyContent: "flex-start" }} />
        <Rise
          text="hesaplayın."
          at={T.project + 44}
          out={T.exit - 6}
          size={84}
          style={{ justifyContent: "flex-start" }}
          gradient={`linear-gradient(90deg, ${K.indigoGlow}, #b9c1ff)`}
        />
        <Focus text="Incurred But Not Reported — gerçekleşmiş, henüz bildirilmemiş hasar." at={T.project + 60} out={T.exit - 8} size={24} style={{ marginTop: 10 }} />
      </AbsoluteFill>

      <Flash at={T.land} len={16} color={K.copperLight} power={0.55} />
    </AbsoluteFill>
  );
};
