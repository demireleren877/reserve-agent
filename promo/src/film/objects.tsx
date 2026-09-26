import React, { useMemo } from "react";
import * as THREE from "three";
import { K } from "./theme";

// ─── Yumuşak, parlayan nokta bulutu ────────────────────────────────
const pointsVert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;
const pointsFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float a = pow(core, 1.8) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * (0.6 + core * 1.6), a);
  }
`;

/**
 * CPU tarafında her karede yeniden hesaplanan nokta bulutu.
 * positions/sizes/colors/alphas dizileri çağıran taraftan gelir.
 */
export const Dots: React.FC<{
  positions: Float32Array;
  sizes: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  scale?: number;
}> = ({ positions, sizes, colors, alphas, scale = 300 }) => {
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointsVert,
        fragmentShader: pointsFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: scale } },
      }),
    [scale],
  );
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geo.computeBoundingSphere();
  return <points geometry={geo} material={mat} frustumCulled={false} />;
};

// ─── Uzaklaştıkça sönen ince ızgara zemini ─────────────────────────
const gridFrag = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uCell;
  uniform float uFade;
  float line(float x, float w) {
    float fx = abs(fract(x - 0.5) - 0.5) / fwidth(x);
    return 1.0 - min(fx / w, 1.0);
  }
  void main() {
    vec2 p = vWorld.xz / uCell;
    float g = max(line(p.x, 1.0), line(p.y, 1.0));
    vec2 q = vWorld.xz / (uCell * 5.0);
    float g2 = max(line(q.x, 1.4), line(q.y, 1.4));
    float d = length(vWorld.xz);
    float fade = 1.0 - smoothstep(uFade * 0.25, uFade, d);
    float a = (g * 0.35 + g2 * 0.65) * fade * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;
const gridVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const GridFloor: React.FC<{ y?: number; opacity?: number; cell?: number; fade?: number; color?: string }> = ({
  y = 0,
  opacity = 0.5,
  cell = 1,
  fade = 30,
  color = "#3a3f66",
}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: gridVert,
        fragmentShader: gridFrag,
        transparent: true,
        depthWrite: false,
        extensions: { derivatives: true } as never,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uCell: { value: cell },
          uFade: { value: fade },
        },
      }),
    [color, cell, fade, opacity],
  );
  mat.uniforms.uOpacity.value = opacity;
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y} material={mat}>
      <planeGeometry args={[200, 200]} />
    </mesh>
  );
};

/** Yansıma zemini — altta aynalanan sahneyi karartan yarı saydam cam. */
export const MirrorVeil: React.FC<{ y?: number; opacity?: number; color?: string }> = ({ y = 0, opacity = 0.82, color = K.bg }) => (
  <mesh rotation-x={-Math.PI / 2} position-y={y - 0.001}>
    <planeGeometry args={[200, 200]} />
    <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
  </mesh>
);

/** Yuvarlatılmış dikdörtgen, UV'leri 0..1'e normalize — ekran dokuları için. */
export const roundedRect = (w: number, h: number, r: number, seg = 10) => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, seg);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - x) / w, (pos.getY(i) - y) / h);
  }
  return g;
};

/** Kenarları parlayan kutu (hologram). */
export const GlowEdges: React.FC<{ w: number; h: number; d: number; color: string; opacity: number }> = ({ w, h, d, color, opacity }) => {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
};
