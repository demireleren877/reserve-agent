import React, { useLayoutEffect } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { H, K, W } from "./theme";
import { Post } from "./Post";
import type { V3 } from "./math";

export type CamState = { pos: V3; target: V3; fov: number; roll?: number };

/** Varsayılan kamerayı karenin durumuna kilitler (advance'tan önce çalışır). */
export const Cam: React.FC<CamState> = ({ pos, target, fov, roll = 0 }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(...pos);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(...target);
    camera.fov = fov;
    camera.near = 0.05;
    camera.far = 400;
    camera.updateProjectionMatrix();
  });
  return null;
};

/** 3D noktayı ekran pikseline çevirir — DOM etiketlerini 3D'ye yapıştırmak için. */
const scratch = new THREE.PerspectiveCamera();
export const project = (cam: CamState, p: V3) => {
  scratch.aspect = W / H;
  scratch.fov = cam.fov;
  scratch.near = 0.05;
  scratch.far = 400;
  scratch.position.set(...cam.pos);
  const roll = cam.roll ?? 0;
  scratch.up.set(Math.sin(roll), Math.cos(roll), 0);
  scratch.lookAt(...cam.target);
  scratch.updateMatrixWorld();
  scratch.updateProjectionMatrix();
  const v = new THREE.Vector3(...p).project(scratch);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, visible: v.z < 1 && v.z > -1, depth: v.z };
};

/** Stüdyo ışığı: yumuşak tepe ışığı + bakır kenar + indigo dolgu. */
export const Studio: React.FC<{ warm?: number; cool?: number }> = ({ warm = 1, cool = 1 }) => (
  <Environment resolution={256} frames={1}>
    <Lightformer intensity={2.2} position={[0, 6, -2]} rotation-x={Math.PI / 2} scale={[12, 4, 1]} />
    <Lightformer
      intensity={3 * warm}
      color={K.copperLight}
      position={[-7, 1.5, 2]}
      rotation-y={Math.PI / 2}
      scale={[10, 1.2, 1]}
    />
    <Lightformer
      intensity={3 * cool}
      color={K.indigoGlow}
      position={[7, 1, -1]}
      rotation-y={-Math.PI / 2}
      scale={[10, 1.2, 1]}
    />
    <Lightformer intensity={0.6} position={[0, 0.5, 8]} scale={[14, 1, 1]} />
  </Environment>
);

export const Stage: React.FC<{
  children: React.ReactNode;
  cam: CamState;
  bg?: string;
  fog?: [number, number];
  bloom?: { strength?: number; radius?: number; threshold?: number };
  studio?: boolean | { warm?: number; cool?: number };
}> = ({ children, cam, bg = K.bg, fog, bloom, studio = true }) => (
  <ThreeCanvas
    width={W}
    height={H}
    gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    camera={{ fov: cam.fov, position: cam.pos }}
  >
    <color attach="background" args={[bg]} />
    {fog ? <fog attach="fog" args={[bg, fog[0], fog[1]]} /> : null}
    <Cam {...cam} />
    {studio ? <Studio {...(typeof studio === "object" ? studio : {})} /> : null}
    {children}
    <Post {...bloom} />
  </ThreeCanvas>
);
