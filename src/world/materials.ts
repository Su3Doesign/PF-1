import {
  Color, MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, Texture, UniformsLib, UniformsUtils,
  AdditiveBlending, Vector4, MeshLambertMaterial, IUniform, DoubleSide, Vector3, Material
} from 'three';

export const shared = {
  time: { value: 0 } as IUniform<number>,
  wind: { value: 1 } as IUniform<number>,
  /** direction toward the moon (world space) and its light colour; the zones retune these */
  moonDir: { value: new Vector3(-0.28, 0.34, -1).normalize() } as IUniform<Vector3>,
  moonColor: { value: new Color(0.62, 0.72, 1.0) } as IUniform<Color>,
  /** camera z, for flora that unfurls as the visitor approaches */
  camZ: { value: 1e6 } as IUniform<number>
};

/** Instanced things ahead of the visitor stay folded into the ground and rise
 *  as the camera comes within ~15 m. Works on any built-in material. */
export function withGrowth<T extends Material>(m: T, key: string): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev.call(m, s, r);
    s.uniforms.uCamZ = shared.camZ;
    s.uniforms.uTimeG = shared.time;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCamZ, uTimeG;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 gip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float gAhead = gip.z - uCamZ;
          float gk = smoothstep(-16.0 - fract(gip.x * 7.13) * 5.0, -4.0, gAhead);
          gk = gk * gk * (3.0 - 2.0 * gk);
          transformed *= mix(0.03, 1.0, gk);
          transformed.x += sin(uTimeG * 1.3 + gip.x * 3.0) * 0.02 * position.y;
        #endif
      `);
  };
  m.customProgramCacheKey = () => 'grow-' + key;
  return m;
}

// ── moss-grown surfaces ─────────────────────────────────────────────────────
export interface MossOpts {
  base: Texture;
  baseN: Texture;
  moss: Texture;
  mossN: Texture;
  noise: Texture;
  ao?: Texture;
  baseScale?: number;
  mossScale?: number;
  mossAmount?: number;
  mossLow?: number;
  tint?: Color;
  roughness?: number;
  metalness?: number;
  wet?: number;
  aoStrength?: number;
  paving?: number; // slab size in metres: lays out flagstones with moss in the joints
}

const TRIPLANAR = /* glsl */ `
uniform sampler2D tBase, tBaseN, tMoss, tMossN, tNoise;
uniform float uBaseScale, uMossScale, uMossAmount, uMossLow, uWet, uAoDirect, uPave;
float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
uniform vec3 uTint;
varying vec3 vMWPos;
varying vec3 vMWNormal;
float mossMask;
vec3 triW(vec3 n){ vec3 b = pow(abs(n), vec3(4.0)); return b / (b.x + b.y + b.z); }
vec4 triS(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
vec3 triN(sampler2D t, vec3 p, vec3 n, vec3 w){
  vec3 tx = texture2D(t, p.zy).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(t, p.xz).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(t, p.xy).xyz * 2.0 - 1.0;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
`;

const WORLD_VARYINGS_VERT = /* glsl */ `
vec4 mwp = vec4(transformed, 1.0);
vec3 mwn = objectNormal;
#ifdef USE_INSTANCING
  mwp = instanceMatrix * mwp;
  mwn = mat3(instanceMatrix) * mwn;
#endif
mwp = modelMatrix * mwp;
vMWPos = mwp.xyz;
vMWNormal = normalize(mat3(modelMatrix) * mwn);
`;

export function mossMaterial(o: MossOpts): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    roughness: o.roughness ?? 0.82,
    metalness: o.metalness ?? 0,
    aoMap: o.ao ?? null,
    aoMapIntensity: 1,
    envMapIntensity: 0.35
  });
  const u = {
    tBase: { value: o.base }, tBaseN: { value: o.baseN }, tMoss: { value: o.moss }, tMossN: { value: o.mossN }, tNoise: { value: o.noise },
    uBaseScale: { value: o.baseScale ?? 0.35 }, uMossScale: { value: o.mossScale ?? 0.9 }, uMossAmount: { value: o.mossAmount ?? 1 },
    uMossLow: { value: o.mossLow ?? 0.6 }, uWet: { value: o.wet ?? 1 }, uTint: { value: o.tint ?? new Color(1, 1, 1) },
    uAoDirect: { value: o.aoStrength ?? 0.65 }, uPave: { value: o.paving ?? 1 }
  };
  m.userData.uniforms = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMWPos;\nvarying vec3 vMWNormal;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + WORLD_VARYINGS_VERT);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TRIPLANAR)
      .replace('#include <map_fragment>', /* glsl */ `
        vec3 wN = normalize(vMWNormal);
        vec3 tw = triW(wN);
        vec3 bp = vMWPos * uBaseScale;
        vec3 mp = vMWPos * uMossScale;
        vec3 baseCol = triS(tBase, bp, tw).rgb * uTint;
        vec3 mossCol = triS(tMoss, mp, tw).rgb;
        float nz = texture2D(tNoise, vMWPos.xz * 0.06 + vMWPos.y * 0.045).r;
        float nz2 = texture2D(tNoise, vMWPos.xz * 0.29 + vMWPos.y * 0.23).g;
        mossMask = smoothstep(0.2, 0.78, wN.y + (nz - 0.5) * 1.0 + (nz2 - 0.5) * 0.4) * uMossAmount;
        float creep = smoothstep(uMossLow + 0.6, uMossLow - 0.4, vMWPos.y + (nz - 0.5) * 1.6 + (nz2 - 0.5) * 0.5);
        mossMask = clamp(max(mossMask, creep * 0.95 * step(0.001, uMossAmount)), 0.0, 1.0);
        #ifdef PAVING
          vec2 pv = vMWPos.xz / vec2(uPave * 1.4, uPave);
          pv.x += step(1.0, mod(floor(pv.y), 2.0)) * 0.5;
          vec2 pf = abs(fract(pv) - 0.5);
          float joint = max(smoothstep(0.482, 0.495, pf.x), smoothstep(0.47, 0.49, pf.y)) * smoothstep(0.7, 0.9, wN.y);
          baseCol *= mix(0.82 + 0.3 * pHash(floor(pv)), 0.3, joint);
          mossMask = max(mossMask, joint * smoothstep(0.35, 0.65, nz2 + nz * 0.3));
        #endif
        float wetBand = smoothstep(0.55, 0.0, vMWPos.y) * uWet;
        baseCol *= mix(1.0, 0.55, wetBand);
        mossCol *= mix(1.0, 0.7, wetBand);
        diffuseColor.rgb *= mix(baseCol, mossCol, mossMask);
        #ifdef USE_AOMAP
          diffuseColor.rgb *= mix(1.0, texture2D(aoMap, vAoMapUv).r, uAoDirect);
        #endif
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.96, mossMask);
        roughnessFactor = mix(roughnessFactor, 0.22, smoothstep(0.5, 0.0, vMWPos.y) * uWet * (1.0 - mossMask * 0.7));
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */ `
        vec3 nb = triN(tBaseN, bp, wN, tw);
        vec3 nm = triN(tMossN, mp, wN, tw);
        vec3 nW = normalize(mix(nb, nm, mossMask));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      `);
  };
  if (o.paving) m.defines = { PAVING: '' };
  m.customProgramCacheKey = () => (o.paving ? 'moss-pave' : 'moss');
  return m;
}

// ── neon tubes ──────────────────────────────────────────────────────────────
export function neonMaterial(hex: number, intensity: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(intensity) });
  m.userData.base = new Color(hex);
  m.userData.intensity = intensity;
  return m;
}

// ── CRT / monolith screens ──────────────────────────────────────────────────
const SCREEN_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
#ifdef INSTANCED_SCREEN
attribute float aIndex;
varying float vIndex;
#endif
void main(){
  vUv = uv;
  #ifdef INSTANCED_SCREEN
  vIndex = aIndex;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #else
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  #endif
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SCREEN_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
uniform vec4 uvRect;
uniform vec2 grid;
uniform float time, hover, power, gain, curve, lines, seed, hoverIndex, noiseAmt, scanAmt;
uniform vec3 tint;
varying vec2 vUv;
#ifdef INSTANCED_SCREEN
varying float vIndex;
#endif
float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 cc = vUv - 0.5;
  vec2 uv = 0.5 + cc * (1.0 + dot(cc, cc) * curve);
  vec4 rect = uvRect;
  float hv = hover;
  #ifdef INSTANCED_SCREEN
    float col = mod(vIndex, grid.x);
    float row = floor(vIndex / grid.x);
    rect = vec4(col / grid.x, 1.0 - (row + 1.0) / grid.y, 1.0 / grid.x, 1.0 / grid.y);
    hv = 1.0 - step(0.5, abs(vIndex - hoverIndex));
  #endif
  float glitch = step(0.985, h1(vec2(floor(time * 9.0 + seed), 1.0))) * (h1(vec2(floor(uv.y * 24.0), floor(time * 30.0))) - 0.5) * 0.04;
  vec2 auv = rect.xy + clamp(uv + vec2(glitch, 0.0), 0.0, 1.0) * rect.zw;
  vec3 c = texture2D(map, auv).rgb;
  float scan = 1.0 - scanAmt + scanAmt * sin(uv.y * lines * 6.2831 - time * 3.0);
  c *= scan;
  float vig = smoothstep(0.78, 0.18, length(cc * vec2(1.0, 1.15)));
  c *= mix(0.45, 1.0, vig);
  float n = h1(floor(vUv * vec2(320.0, 220.0)) + floor(time * 20.0));
  c += (n - 0.5) * noiseAmt;
  float flick = 0.94 + 0.06 * sin(time * 50.0 + seed * 10.0);
  float on = smoothstep(0.0, 1.0, power);
  c *= (gain + hv * 0.55) * on * flick;
  float edge = max(smoothstep(0.46, 0.5, abs(cc.x)), smoothstep(0.455, 0.5, abs(cc.y)));
  c += tint * edge * (0.5 + hv * 2.2) * on;
  c = mix(c, tint * 0.05, (1.0 - on));
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

export interface ScreenOpts {
  map: Texture;
  rect?: Vector4;
  tint?: Color;
  gain?: number;
  curve?: number;
  lines?: number;
  grid?: [number, number];
  instanced?: boolean;
  noise?: number;
  scan?: number;
}

export function screenMaterial(o: ScreenOpts): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      map: { value: null }, uvRect: { value: new Vector4(0, 0, 1, 1) }, grid: { value: [1, 1] },
      time: { value: 0 }, hover: { value: 0 }, power: { value: 1 }, gain: { value: 1.35 }, curve: { value: 0.12 },
      lines: { value: 180 }, seed: { value: Math.random() * 10 }, hoverIndex: { value: -1 }, tint: { value: new Color(0x3dffd0) },
      noiseAmt: { value: 0.045 }, scanAmt: { value: 0.18 }
    }]),
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    fog: true
  });
  m.uniforms.map.value = o.map;
  if (o.rect) m.uniforms.uvRect.value = o.rect;
  if (o.tint) m.uniforms.tint.value = o.tint;
  if (o.gain !== undefined) m.uniforms.gain.value = o.gain;
  if (o.curve !== undefined) m.uniforms.curve.value = o.curve;
  if (o.lines !== undefined) m.uniforms.lines.value = o.lines;
  if (o.grid) m.uniforms.grid.value = o.grid;
  if (o.instanced) m.defines = { INSTANCED_SCREEN: '' };
  if (o.noise !== undefined) m.uniforms.noiseAmt.value = o.noise;
  if (o.scan !== undefined) m.uniforms.scanAmt.value = o.scan;
  m.uniforms.time = shared.time;
  return m;
}

// ── foliage with wind ───────────────────────────────────────────────────────
export function windLambert(opts: { map?: Texture; alphaTest?: number; vertexColors?: boolean; bend: number; stiff?: number; translucency?: number }): MeshLambertMaterial {
  const m = new MeshLambertMaterial({
    map: opts.map ?? null,
    alphaTest: opts.alphaTest ?? 0,
    vertexColors: !!opts.vertexColors,
    side: DoubleSide
  });
  const u = { uTime: shared.time, uWind: shared.wind, uBend: { value: opts.bend }, uTrans: { value: opts.translucency ?? 0.25 } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uBend;\nvarying float vH;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        float hh = clamp(position.y, 0.0, 1.5);
        vH = hh;
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float ph = ip.x * 0.31 + ip.z * 0.23;
        float gust = sin(uTime * 0.7 + ip.x * 0.05 + ip.z * 0.04) * 0.5 + 0.5;
        float w = (sin(uTime * 1.9 + ph) * 0.6 + sin(uTime * 3.3 + ph * 2.1) * 0.25) * (0.5 + gust);
        float k = hh * hh * uBend * uWind;
        transformed.x += w * k;
        transformed.z += w * k * 0.55;
        transformed.y -= abs(w) * k * 0.25;
      `);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;\nuniform float uTrans;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uTrans * vH * 0.35;');
  };
  m.customProgramCacheKey = () => 'wind' + (opts.map ? 'M' : '') + (opts.vertexColors ? 'V' : '');
  return m;
}

// ── soft additive glow sprite material (lantern halos, neon bleed) ─────────
export function glowMaterial(color: Color, intensity = 1): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: color.clone().multiplyScalar(intensity) }, time: shared.time, seed: { value: Math.random() * 6 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform float time, seed; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2);
      float f = 0.9 + 0.1 * sin(time * 7.0 + seed * 9.0) * sin(time * 13.0 + seed);
      gl_FragColor = vec4(color * a * f, 1.0); }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false
  });
}
