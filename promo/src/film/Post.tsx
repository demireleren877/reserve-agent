import React, { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Kendi bloom zincirimiz — renderer.render yerine composer.render çağrılır. */
export const Post: React.FC<{ strength?: number; radius?: number; threshold?: number }> = ({
  strength = 0.9,
  radius = 0.6,
  threshold = 0.7,
}) => {
  const { gl, scene, camera, size } = useThree();
  const [composer, bloom] = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const c = new EffectComposer(gl, rt);
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, radius, threshold);
    c.addPass(b);
    c.addPass(new OutputPass());
    return [c, b];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => composer.setSize(size.width, size.height), [composer, size]);
  bloom.strength = strength;
  bloom.radius = radius;
  bloom.threshold = threshold;
  useFrame(() => composer.render(), 1);
  return null;
};
