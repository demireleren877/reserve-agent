import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Environment, Lightformer } from "@react-three/drei";
import { Cam, CamState } from "./stage";
import { N, cellHeight, isKnown } from "./data";

// Landing (açık tema) hero'su: sitenin SVG gelişim üçgeninin gerçek 3D hali.
// Beyaz kağıt zemin, kobalt seramik gözlenen hücreler, soluk kesik çizgili
// projeksiyon. Sayfada mix-blend-mode: multiply ile beyaz zemin kaybolur.

const PAPER = "#ffffff";
const SHADES = ["#175cd3", "#2c6bd7", "#4d84df", "#6c9ae7", "#89aeed", "#a4c0f1", "#c2d5f5"];
const SP = 1.0;
const cx = (j: number) => (j - (N - 1) / 2) * SP;
const cz = (i: number) => (i - (N - 1) / 2) * SP;

const loopCam = (f: number, dur: number): CamState => {
  const a = 0.75 + (f / dur) * Math.PI * 2;
  const r = 24;
  return { pos: [Math.sin(a) * r, 16.5, Math.cos(a) * r], target: [0, 0.4, 0], fov: 30 };
};

const Triangle: React.FC = () => {
  const cells = useMemo(() => {
    const out: { i: number; j: number; h: number; known: boolean }[] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) out.push({ i, j, h: cellHeight(i, j), known: isKnown(i, j) });
    return out;
  }, []);
  const geos = useMemo(() => {
    const m = new Map<string, THREE.BufferGeometry>();
    for (const c of cells) {
      const h = c.known ? c.h : 0.08;
      m.set(`${c.i}-${c.j}`, new RoundedBoxGeometry(0.84, h, 0.84, 4, c.known ? 0.06 : 0.03).translate(0, h / 2, 0));
    }
    return m;
  }, [cells]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.84, 1, 0.84).translate(0, 0.5, 0)), []);
  const mats = useMemo(
    () =>
      SHADES.map(
        (c) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c), roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      ),
    [],
  );
  const ghost = useMemo(() => new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#eef4fd"), roughness: 0.4, transparent: true, opacity: 0.9 }), []);
  const ghostEdge = useMemo(() => new THREE.LineDashedMaterial({ color: new THREE.Color("#9fb8dc"), dashSize: 0.07, gapSize: 0.06, transparent: true, opacity: 0.9 }), []);
  return (
    <group>
      {cells.map((c) => {
        const d = c.i + c.j;
        const pos: [number, number, number] = [cx(c.j), 0, cz(c.i)];
        if (c.known) {
          const ridge = d === N - 1;
          const mat = mats[ridge ? 0 : Math.min(SHADES.length - 1, 1 + Math.floor((N - 1 - d) / 1.5))];
          return <mesh key={`${c.i}-${c.j}`} position={pos} geometry={geos.get(`${c.i}-${c.j}`)} material={mat} castShadow receiveShadow />;
        }
        // Projeksiyon: yere çizilmiş hayalet kutu — yüksekliği gelecekteki gelişimi ima eder
        const h = c.h;
        return (
          <group key={`${c.i}-${c.j}`} position={pos}>
            <mesh geometry={geos.get(`${c.i}-${c.j}`)} material={ghost} receiveShadow />
            <lineSegments geometry={edges} material={ghostEdge} scale={[1, h, 1]} onUpdate={(s) => s.computeLineDistances()} />
          </group>
        );
      })}
    </group>
  );
};

export const HeroLoopLight: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const cam = loopCam(f, durationInFrames);
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <ThreeCanvas
        width={width}
        height={height}
        shadows
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.05 }}
        camera={{ fov: cam.fov, position: cam.pos }}
      >
        <color attach="background" args={[PAPER]} />
        <Cam {...cam} />
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.4} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
          <Lightformer intensity={1.2} position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
          <Lightformer intensity={0.8} color="#dbe7fb" position={[8, 2, -4]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
        </Environment>
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[-6, 14, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
          shadow-radius={6}
          shadow-bias={-0.0004}
        />
        <Triangle />
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <shadowMaterial opacity={0.12} />
        </mesh>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
