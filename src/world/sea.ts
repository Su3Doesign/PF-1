// The sea at the end of the walk. A sum of Gerstner waves displaces a dense
// radial mesh around the terrace: a long, slow swell from the open water with
// shorter chop riding on it. Waves feel the bottom through a depth map baked
// from the cove, shoaling and breaking into foam on the beaches, and the foam
// and wave faces glow with bioluminescent plankton in the blue hour.
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, FloatType, LinearFilter, Mesh, RedFormat, ShaderMaterial, Sphere, Texture,
  UniformsLib, UniformsUtils, Vector2, Vector3, Vector4
} from 'three';
import { shared } from './materials';
import { Reflector } from './water';

// wavelength (m), amplitude (m), steepness, direction (degrees from +z, i.e. shoreward)
// A calm night sea: a low swell and short wind waves, nothing that churns.
const WAVES: [number, number, number, number][] = [
  [34, 0.17, 0.7, -6],
  [21, 0.1, 0.7, 17],
  [13, 0.06, 0.65, -27],
  [8, 0.034, 0.6, 35],
  [5, 0.017, 0.55, -44],
  [3.2, 0.009, 0.5, 58]
];
const TIME_SCALE = 0.85;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float time;
uniform mat4 textureMatrix;
uniform sampler2D tDepth;
uniform vec4 depthRect; // x0, z0, 1/w, 1/h
uniform vec4 waves[${WAVES.length}];  // k, amplitude, steepness, speed
uniform vec2 dirs[${WAVES.length}];
varying vec3 vW;
varying vec3 vN;
varying vec4 vRef;
varying float vFoam;
varying float vDepth;
varying float vCrest;
void main(){
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 duv = (p.xz - depthRect.xy) * depthRect.zw;
  float depth = texture2D(tDepth, duv).r;
  vDepth = depth;
  float dist = length(p.xz - cameraPosition.xz);
  // waves grow in the open water, shorten and steepen in the shallows, die on the sand
  float open = smoothstep(0.05, 3.5, depth);
  vec3 P = p;
  vec3 dx = vec3(1.0, 0.0, 0.0), dz = vec3(0.0, 0.0, 1.0);
  float jac = 1.0;
  for (int i = 0; i < ${WAVES.length}; i++) {
    float k = waves[i].x, A = waves[i].y, Q = waves[i].z, c = waves[i].w;
    // fine chop fades with distance so the far sea never aliases
    float fade = i > 2 ? 1.0 - smoothstep(80.0, 320.0, dist) : 1.0;
    A *= fade * mix(0.25, 1.0, open) * (1.0 + (1.0 - open) * 0.6 * step(float(i), 1.0));
    vec2 D = dirs[i];
    float f = k * dot(D, p.xz) - c * k * time * ${TIME_SCALE.toFixed(2)};
    float s = sin(f), co = cos(f);
    float QA = Q * A;
    P.x += QA * D.x * co;
    P.z += QA * D.y * co;
    P.y += A * s;
    dx += vec3(-QA * D.x * D.x * k * s, A * D.x * k * co, -QA * D.x * D.y * k * s);
    dz += vec3(-QA * D.x * D.y * k * s, A * D.y * k * co, -QA * D.y * D.y * k * s);
    jac -= Q * A * k * s;
  }
  vN = normalize(cross(dz, dx));
  // the steepest faces fold over: foam there, more of it as the water shoals
  vCrest = smoothstep(0.975 - (1.0 - open) * 0.05, 0.9 - (1.0 - open) * 0.05, jac);
  vFoam = vCrest;
  vW = P;
  vRef = textureMatrix * vec4(P.x, 0.0, P.z, 1.0);
  vec4 mvPosition = viewMatrix * vec4(P, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tReflect, tNormal, tNoise;
uniform float time, clipZ, glow;
uniform vec3 moonDir, moonColor, deep, shallow, skyLow;
varying vec3 vW;
varying vec3 vN;
varying vec4 vRef;
varying float vFoam;
varying float vDepth;
varying float vCrest;
void main(){
  if (vW.z > clipZ) discard;
  float dist = length(cameraPosition - vW);
  // two slow layers of capillary detail on top of the swell
  vec2 p = vW.xz;
  vec3 n1 = texture2D(tNormal, p * 0.06 + vec2(0.011, 0.017) * time).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNormal, p * 0.17 - vec2(0.013, -0.009) * time).xyz * 2.0 - 1.0;
  float detail = 0.22 * (1.0 - smoothstep(30.0, 260.0, dist));
  vec3 N = normalize(vN + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * detail);
  vec3 V = normalize(cameraPosition - vW);
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  // mirror of the sky and the cliffs, nudged by the waves (gently: no shimmer)
  vec2 ruv = vRef.xy / vRef.w + N.xz * 0.035 * (1.0 - smoothstep(20.0, 400.0, dist));
  vec3 refl = texture2D(tReflect, ruv).rgb;
  refl = mix(refl, skyLow, 0.15);
  // the body of the water: deep indigo offshore, clearer over the sand
  float shal = 1.0 - smoothstep(0.2, 5.0, vDepth);
  vec3 body = mix(deep, shallow, shal);
  // light through the thin crests
  vec3 L = normalize(moonDir);
  float sss = pow(max(dot(V, -L), 0.0), 3.0) * smoothstep(-0.1, 0.3, vW.y) * 0.5;
  body += vec3(0.03, 0.14, 0.16) * sss;
  vec3 col = mix(body, refl, clamp(fres * 1.1, 0.0, 1.0));
  // the moon's glitter path: sharp specular on the fine normals
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 420.0) * 3.0 + pow(max(dot(N, H), 0.0), 60.0) * 0.08;
  col += moonColor * spec;
  // foam: breaking crests, and the wash where the waves run up the beach
  float nz = texture2D(tNoise, p * 0.09 + vec2(time * 0.02, 0.0)).r;
  float lace = texture2D(tNoise, p * 0.45 - vec2(0.0, time * 0.05)).g;
  float surfBand = fract(vDepth * 1.3 + time * 0.13 + nz * 0.6);
  float surf = (1.0 - smoothstep(0.0, 0.9, vDepth)) * smoothstep(0.0, 0.1, surfBand) * smoothstep(0.55, 0.15, surfBand);
  surf += (1.0 - smoothstep(0.0, 0.25, vDepth)) * 0.6;
  float foam = clamp(vCrest * (0.6 + 0.8 * nz) + surf, 0.0, 1.0) * smoothstep(0.35, 0.7, lace + nz * 0.4);
  col = mix(col, vec3(0.72, 0.78, 0.84), foam * 0.55);
  // bioluminescence: the foam and the turbulent water glow blue where the waves break
  float near = 1.0 - smoothstep(12.0, 70.0, dist);
  float shallows = 1.0 - smoothstep(0.0, 3.5, vDepth);
  float spark = step(0.962, texture2D(tNoise, p * 1.7 + vec2(time * 0.05, -time * 0.03)).a) * max(shallows, near * 0.7);
  float pulse = 0.65 + 0.35 * sin(time * 1.3 + nz * 9.0);
  // plankton lights up where the water is stirred: breaking faces, crests, the wash on the stones
  float stir = smoothstep(0.05, 0.16, vW.y) * smoothstep(0.35, 0.75, nz + lace * 0.5) * near;
  vec3 bio = vec3(0.1, 0.62, 1.0) * (foam * 2.4 * pulse + spark * 2.6 + vCrest * 0.6 * max(shallows, near) + stir * 0.55 * pulse);
  col += bio * glow * (1.0 - smoothstep(60.0, 220.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

export interface SeaOpts {
  center: Vector3;
  radius: number;
  clipZ: number;
  depthAt: (x: number, z: number) => number; // metres of water, 0 on land
  depthRect: [number, number, number, number]; // x0, z0, x1, z1
}

function radialGrid(rings: number, segs: number, R: number): BufferGeometry {
  const pos = new Float32Array((rings * segs + 1) * 3);
  const idx: number[] = [];
  pos.set([0, 0, 0], 0);
  for (let i = 1; i <= rings; i += 1) {
    const r = R * Math.pow(i / rings, 2.3);
    for (let s = 0; s < segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], (1 + (i - 1) * segs + s) * 3);
    }
  }
  for (let s = 0; s < segs; s += 1) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < rings; i += 1) {
    const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs;
    for (let s = 0; s < segs; s += 1) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function buildSea(reflector: Reflector, tex: { waterN: Texture; noise: Texture }, o: SeaOpts, tier: 'high' | 'medium' | 'low'): Mesh {
  // depth of the water over the cove, baked once into a small float texture
  const N = 256;
  const [x0, z0, x1, z1] = o.depthRect;
  const data = new Float32Array(N * N);
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const x = x0 + ((i + 0.5) / N) * (x1 - x0), z = z0 + ((j + 0.5) / N) * (z1 - z0);
      data[j * N + i] = o.depthAt(x, z);
    }
  }
  const depthTex = new DataTexture(data, N, N, RedFormat, FloatType);
  depthTex.magFilter = LinearFilter;
  depthTex.minFilter = LinearFilter;
  depthTex.needsUpdate = true;
  const waves = WAVES.map(([L, A, Q]) => {
    const k = (Math.PI * 2) / L;
    const c = Math.sqrt(9.81 / k);
    return new Vector3(k, A, Q).toArray().concat([c]);
  });
  const mat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      time: { value: 0 }, textureMatrix: { value: null }, tReflect: { value: null }, tNormal: { value: tex.waterN }, tNoise: { value: tex.noise },
      tDepth: { value: depthTex }, depthRect: { value: [x0, z0, 1 / (x1 - x0), 1 / (z1 - z0)] },
      waves: { value: waves.map((w) => new Vector4(w[0], w[1], w[2], w[3])) },
      dirs: { value: WAVES.map(([, , , deg]) => new Vector2(Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180))) },
      clipZ: { value: o.clipZ }, glow: { value: 1 },
      moonDir: { value: null }, moonColor: { value: null },
      deep: { value: new Color(0.008, 0.022, 0.05) }, shallow: { value: new Color(0.015, 0.075, 0.08) }, skyLow: { value: new Color(0.12, 0.09, 0.16) }
    }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true
  });
  mat.uniforms.time = shared.time;
  mat.uniforms.tReflect = reflector.uniforms.tReflect;
  mat.uniforms.textureMatrix = reflector.uniforms.textureMatrix;
  mat.uniforms.moonDir = shared.moonDir;
  mat.uniforms.moonColor = shared.moonColor;
  const lo = tier === 'low';
  const sea = new Mesh(radialGrid(lo ? 90 : 130, lo ? 160 : 220, o.radius), mat);
  sea.position.copy(o.center);
  sea.frustumCulled = false;
  sea.name = 'sea';
  // the mirror only needs to run when the near sea is on screen: give it a modest bound
  sea.geometry.boundingSphere = new Sphere(new Vector3(0, 0, -70), 110);
  return sea;
}
