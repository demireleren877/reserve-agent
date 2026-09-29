import React from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage, CamState } from "./stage";
import { GridFloor, MirrorVeil } from "./objects";
import { K } from "./theme";
import { Bars } from "./scenes/Origin";

// Landing hero arka planı: tamamlanmış üçgenin etrafında kesintisiz 360° dönüş.
// Metin yok; nesne kadrajın sağında durur ki başlık solda nefes alsın.

const loopCam = (f: number, dur: number): CamState => {
  const a = 0.7 + (f / dur) * Math.PI * 2;
  const r = 21;
  const pos = new THREE.Vector3(Math.sin(a) * r, 9.5, Math.cos(a) * r);
  const center = new THREE.Vector3(0, 0.9, 0);
  const fwd = center.clone().sub(pos).normalize();
  const right = fwd.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const target = center.clone().sub(right.multiplyScalar(3.4));
  return { pos: [pos.x, pos.y, pos.z], target: [target.x, target.y, target.z], fov: 34 };
};

export const HeroLoop: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Stage cam={loopCam(f, durationInFrames)} fog={[16, 40]} bloom={{ strength: 0.8, radius: 0.55, threshold: 0.62 }}>
        <ambientLight intensity={0.15} />
        <directionalLight position={[-6, 10, 4]} intensity={2.4} color="#ffd9bd" />
        <directionalLight position={[10, 4, 12]} intensity={0.9} color="#c9d0ff" />
        <Bars f={1000} />
        <Bars f={1000} mirror />
        <MirrorVeil opacity={0.86} />
        <GridFloor opacity={0.5} fade={26} />
      </Stage>
    </AbsoluteFill>
  );
};
