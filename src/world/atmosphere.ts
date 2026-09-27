import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Group, Mesh, PlaneGeometry, Points, ShaderMaterial,
  SphereGeometry, Texture, Vector3, UniformsLib, UniformsUtils, NormalBlending
} from 'three';
import { heightAt, pathCurve, POND, CLEARINGS } from './layout';
import { shared } from './materials';
import { LAYER_NO_REFLECT } from './water';

export const MOON_DIR = new Vector3(-0.28, 0.34, -1).normalize();
export const FOG_COLOR = new Color(0x08130f);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function buildSky(): Mesh {
  const mat = new ShaderMaterial({
    uniforms: { moonDir: { value: MOON_DIR }, fog: { value: FOG_COLOR }, time: shared.time },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform vec3 moonDir, fog; uniform float time; varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -0.2, 1.0);
        vec3 top = vec3(0.006, 0.012, 0.028);
        vec3 col = mix(fog * 1.15, top, smoothstep(-0.02, 0.55, up));
        float m = max(dot(d, moonDir), 0.0);
        col += vec3(0.55, 0.68, 0.9) * pow(m, 18.0) * 0.35 + vec3(0.35, 0.5, 0.7) * pow(m, 4.0) * 0.08;
        col += vec3(1.6, 1.7, 1.8) * smoothstep(0.99955, 0.99975, m);
        vec3 sp = floor(d * 380.0);
        float st = step(0.9975, h(sp)) * smoothstep(0.05, 0.4, up);
        col += st * (0.5 + 0.5 * sin(time * 2.0 + h(sp + 3.0) * 30.0)) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: BackSide,
    depthWrite: false,
    fog: false
  });
  const m = new Mesh(new SphereGeometry(500, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.name = 'sky';
  return m;
}

export function buildFireflies(count: number): Points {
  const r = rng(51);
  const pos = new Float32Array(count * 3);
  const ph = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const spots: { x: number; z: number; rx: number; rz: number; w: number }[] = [
    { x: POND.cx, z: POND.cz, rx: POND.rx * 1.1, rz: POND.rz * 1.1, w: 3 },
    ...CLEARINGS.map((c) => ({ x: c.x, z: c.z, rx: c.r, rz: c.r, w: 1.2 }))
  ];
  const wsum = spots.reduce((s, x) => s + x.w, 0);
  for (let i = 0; i < count; i += 1) {
    let x: number, z: number;
    if (r() < 0.62) {
      let pick = r() * wsum, k = 0;
      while (pick > spots[k].w) { pick -= spots[k].w; k += 1; }
      const s = spots[k];
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      x = s.x + Math.cos(a) * s.rx * d; z = s.z + Math.sin(a) * s.rz * d;
    } else {
      const p = pathCurve.getPointAt(r());
      x = p.x + (r() - 0.5) * 16; z = p.z + (r() - 0.5) * 6;
    }
    const base = Math.max(0, heightAt(x, z));
    pos[i * 3] = x; pos[i * 3 + 1] = base + 0.3 + r() * 2.6; pos[i * 3 + 2] = z;
    ph[i * 2] = r() * 100; ph[i * 2 + 1] = 0.5 + r();
    const warm = r() < 0.18;
    col[i * 3] = warm ? 1.0 : 0.75; col[i * 3 + 1] = warm ? 0.62 : 1.0; col[i * 3 + 2] = warm ? 0.22 : 0.35;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new BufferAttribute(ph, 2));
  g.setAttribute('aColor', new BufferAttribute(col, 3));
  const mat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, pr: { value: 1 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time, pr;
      attribute vec2 aPhase; attribute vec3 aColor;
      varying vec3 vCol; varying float vBlink;
      void main(){
        vec3 p = position;
        float t = time * 0.35 * aPhase.y + aPhase.x;
        p += vec3(sin(t) * 0.6 + sin(t * 2.3) * 0.2, sin(t * 1.3) * 0.35, cos(t * 0.9) * 0.6);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float blink = pow(0.5 + 0.5 * sin(time * (1.2 + aPhase.y) + aPhase.x * 3.0), 3.0);
        vBlink = 0.15 + blink;
        vCol = aColor;
        gl_PointSize = pr * (26.0 + 18.0 * blink) / max(1.0, -mvPosition.z);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vCol; varying float vBlink;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.4);
        float core = smoothstep(0.35, 0.0, d);
        gl_FragColor = vec4(vCol * (a * 1.4 + core * 3.0) * vBlink, 1.0);
        #include <fog_fragment>
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: true
  });
  mat.uniforms.time = shared.time;
  const p = new Points(g, mat);
  p.frustumCulled = false;
  p.name = 'fireflies';
  return p;
}

/** Moonlight shafts through the canopy and mist lying on the water. */
export function buildVolumes(noise: Texture, godRays: boolean): Group {
  const group = new Group();
  group.name = 'volumes';
  const r = rng(61);
  if (godRays) {
    const shaftMat = new ShaderMaterial({
      uniforms: { tNoise: { value: noise }, time: shared.time, color: { value: new Color(0.42, 0.55, 0.75) } },
      vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tNoise; uniform float time; uniform vec3 color; varying vec2 vUv; varying float vD;
        void main(){
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float len = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float n = texture2D(tNoise, vec2(vUv.x * 0.6 + time * 0.004, vUv.y * 0.15 - time * 0.01)).r;
          float streak = texture2D(tNoise, vec2(vUv.x * 2.0, 0.3)).g;
          float a = edge * len * (0.35 + 0.65 * n) * (0.5 + streak) * smoothstep(1.5, 8.0, vD);
          gl_FragColor = vec4(color * a * 0.022, 1.0);
        }`,
      transparent: true, blending: AdditiveBlending, depthWrite: false, side: 2
    });
    const spots = [
      { x: -6, z: -8 }, { x: 4, z: -14 },
      ...CLEARINGS.map((c) => ({ x: c.x + (r() - 0.5) * 4, z: c.z + (r() - 0.5) * 4 }))
    ];
    for (const s of spots) {
      for (let k = 0; k < 2; k += 1) {
        const w = 2.4 + r() * 3, h = 26;
        const m = new Mesh(new PlaneGeometry(w, h), shaftMat);
        const base = new Vector3(s.x + (r() - 0.5) * 3, Math.max(0, heightAt(s.x, s.z)), s.z + (r() - 0.5) * 3);
        m.position.copy(base).addScaledVector(MOON_DIR, h * 0.5 - 1.5);
        m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), MOON_DIR);
        m.rotateY(k * 1.3 + r());
        m.layers.set(LAYER_NO_REFLECT);
        group.add(m);
      }
    }
  }
  const mistMat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { tNoise: { value: noise }, time: { value: 0 }, color: { value: new Color(0.13, 0.19, 0.2) } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tNoise; uniform float time; uniform vec3 color; varying vec2 vUv; varying vec3 vW;
      void main(){
        float n = texture2D(tNoise, vW.xz * 0.018 + vec2(time * 0.006, time * 0.002)).r;
        float n2 = texture2D(tNoise, vW.xz * 0.05 - vec2(time * 0.01, 0.0)).g;
        float e = smoothstep(0.5, 0.2, length(vUv - 0.5));
        float a = smoothstep(0.4, 0.9, n * 0.7 + n2 * 0.5) * e * 0.16;
        gl_FragColor = vec4(color, a);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, blending: NormalBlending, fog: true
  });
  mistMat.uniforms.time = shared.time;
  const layers = [
    { x: 0, z: -6, w: 56, d: 40, y: 0.3 }, { x: 0, z: -8, w: 50, d: 30, y: 0.75 },
    { x: 0, z: -40, w: 40, d: 40, y: 0.45 }, { x: 0, z: -80, w: 40, d: 44, y: 0.45 },
    { x: 2, z: -122, w: 40, d: 44, y: 0.5 }, { x: -2, z: -165, w: 40, d: 44, y: 0.45 }
  ];
  for (const l of layers) {
    const m = new Mesh(new PlaneGeometry(l.w, l.d), mistMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(l.x, l.y, l.z);
    m.renderOrder = 3;
    group.add(m);
  }
  return group;
}
