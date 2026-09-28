// The shore: the hall's door opens onto a stone terrace over a quiet cove.
// Beaches curve away under black-pine cliffs, sea stacks stand in the water,
// a vermilion gate waits offshore, and the moon sets into a rose-coloured dawn.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh,
  LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, ShaderMaterial, Texture, Vector2, Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALL, SHORE, fbm } from './layout';
import { mossMaterial, shared } from './materials';
import { blackPine, bushGeometry, leafMaterial, rng, tuftGeometry } from './treegen';
import { barkMaterial } from './trees';
import { rockGeometry } from './cave';
import { Reflector, LAYER_NO_REFLECT } from './water';
import type { Emitter } from './props';

export interface ShoreTex {
  stone: Texture; stoneN: Texture; moss: Texture; mossN: Texture; noise: Texture; sand: Texture; sandN: Texture;
  conifer: Texture; bushLeaves: Texture; blossom: Texture; tuft: Texture; bark: Texture; barkN: Texture; waterN: Texture;
}

const CX = HALL.x;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Half-width of open water in the cove at depth z; it opens out toward the horizon. */
export function coveWidth(z: number): number {
  const d = Math.max(0, -z - 252);
  return 12.5 + d * 0.5 + Math.max(0, d - 45) * 0.85 + (fbm(z * 0.03, 4) - 0.5) * 8;
}

/** Ground height of the cove: sea floor, beach, cliff, plateau. */
export function coastHeight(x: number, z: number): number {
  const e = Math.abs(x - CX) - coveWidth(z);
  const n = fbm(x * 0.04, z * 0.04);
  const cliffH = 16 + n * 26;
  let h: number;
  if (e < 0) h = -0.7 + Math.max(-9, e * 0.28);
  else if (e < 6) h = -0.7 + e * 0.27;
  else h = 0.92 + smooth(6, 13, e) * cliffH + Math.max(0, e - 13) * 0.25 + (fbm(x * 0.15, z * 0.15) - 0.5) * 2.5 * smooth(6, 9, e);
  // rock walls flank the terrace, which is carved out of the cliff
  if (z > -257 && Math.abs(x - CX) > 8.8) h = Math.max(h, 1 + smooth(8.8, 11, Math.abs(x - CX)) * (18 + n * 10));
  if (z > -257 && Math.abs(x - CX) <= 8.8) h = Math.min(h, -2.5);
  return h;
}

function coastGeometry(): BufferGeometry {
  const nx = 131, nz = 111;
  const x0 = -230, x1 = 230, z0 = -249, z1 = -760;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j += 1) {
    const v = j / (nz - 1);
    const z = z0 + (z1 - z0) * Math.pow(v, 1.5);
    for (let i = 0; i < nx; i += 1) {
      const u = (i / (nx - 1)) * 2 - 1;
      const x = CX + Math.sign(u) * Math.pow(Math.abs(u), 1.6) * (x1 - x0) * 0.5;
      const y = coastHeight(x, z);
      const k = j * nx + i;
      pos.set([x, y, z], k * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // surface weights in the vertex colour: r sand, g rock, b grass
  const n = g.getAttribute('normal') as BufferAttribute;
  for (let k = 0; k < nx * nz; k += 1) {
    const y = pos[k * 3 + 1], ny = n.getY(k);
    const sand = smooth(2.2, 1.1, y);
    const flat = smooth(0.55, 0.8, ny);
    const grass = (1 - sand) * flat;
    const rock = Math.max(0, 1 - sand - grass);
    col.set([sand, rock, grass], k * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

function coastMaterial(t: ShoreTex): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: t.sand, normalMap: t.sandN, roughness: 0.9, vertexColors: true, envMapIntensity: 0.5 });
  const u = { tRock: { value: t.stone }, tRockN: { value: t.stoneN }, tGrass: { value: t.moss } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW; varying vec3 vCN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz; vCN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRock, tRockN, tGrass; varying vec3 vCW; varying vec3 vCN; float cWet; float cRock;')
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', /* glsl */ `
        vec3 w = vColor.rgb;
        vec3 bw = pow(abs(normalize(vCN)), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec3 rp = vCW * 0.12;
        vec3 rock = (texture2D(tRock, rp.zy) * bw.x + texture2D(tRock, rp.xz) * bw.y + texture2D(tRock, rp.xy) * bw.z).rgb * vec3(0.72, 0.68, 0.66);
        vec3 sand = texture2D(map, vCW.xz * 0.25).rgb;
        cWet = smoothstep(0.55, 0.05, vCW.y);
        sand *= mix(1.0, 0.5, cWet);
        vec3 grass = texture2D(tGrass, vCW.xz * 0.2).rgb * 0.9;
        cRock = w.g;
        diffuseColor.rgb *= sand * w.r + rock * w.g + grass * w.b;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, cWet * (1.0 - cRock));');
  };
  m.customProgramCacheKey = () => 'coast';
  return m;
}

/** A sea stack: a layered column, undercut at the waterline, with a rounded, planted top. Unit height. */
function stackGeometry(seed: number): BufferGeometry {
  const radial = 20, rows = 26;
  const r = rng(seed);
  const o = r() * 40;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    const y = -0.25 + t * 1.25;
    const taper = 0.5 * (1 - 0.3 * t) * (t > 0.86 ? Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2)) : 1);
    const undercut = 1 - 0.18 * Math.exp(-((y - 0.02) ** 2) / 0.004);
    const strata = 1 + 0.05 * Math.sin(y * 46 + o) + 0.03 * Math.sin(y * 97 + o * 2);
    for (let k = 0; k < radial; k += 1) {
      const th = (k / radial) * Math.PI * 2;
      const n = fbm(Math.cos(th) * 1.4 + o, y * 3 + Math.sin(th) * 1.4) - 0.5;
      const n2 = fbm(Math.cos(th) * 4 + o * 2, y * 9 + Math.sin(th) * 4) - 0.5;
      const ledge = Math.floor(y * 7 + n * 2) % 2 === 0 ? 1.08 : 0.95;
      const cleft = 1 - 0.3 * Math.pow(Math.abs(Math.sin(th * 1.5 + o + y * 0.8)), 10) - 0.2 * Math.pow(Math.abs(Math.sin(th * 2.5 + o * 3)), 14);
      const rad = Math.max(0.01, taper * undercut * strata * ledge * cleft * (1 + n * 1.3 + n2 * 0.6) * (1 + 0.45 * Math.exp(-y * 5)));
      pos.push(Math.cos(th) * rad, y, Math.sin(th) * rad);
    }
  }
  pos.push(0, 1.0, 0);
  const top = (rows + 1) * radial;
  for (let j = 0; j < rows; j += 1) {
    for (let k = 0; k < radial; k += 1) {
      const a = j * radial + k, b = j * radial + ((k + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let k = 0; k < radial; k += 1) idx.push(rows * radial + k, top, rows * radial + ((k + 1) % radial));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface ShoreResult { group: Group; emitters: Emitter[]; sea: Mesh }

export function buildShore(tex: ShoreTex, reflector: Reflector, tier: 'high' | 'medium' | 'low', shadows: boolean): ShoreResult {
  const group = new Group();
  group.name = 'shore';
  const r = rng(3131);
  const emitters: Emitter[] = [];
  const lo = tier === 'low';
  const up = new Vector3(0, 1, 0);

  // ── the sea ──
  const seaMat = reflector.material({ waterN: tex.waterN, noise: tex.noise }, {
    deep: new Color(0x0c1426), scale: 0.5, distortion: 2.4, refl: 1, murk: 0.35, specPow: 140, specAmt: 1.8, flow: new Vector2(0, -0.4)
  });
  const sea = new Mesh(new PlaneGeometry(5000, 2600), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CX, 0, SHORE.z0 - 1300);
  sea.name = 'sea';
  group.add(sea);
  reflector.add(sea);

  // ── the cove ──
  const coast = new Mesh(coastGeometry(), coastMaterial(tex));
  coast.name = 'coast';
  coast.receiveShadow = true;
  group.add(coast);

  // surf: a band of foam that breathes along each beach
  const foamMat = new ShaderMaterial({
    uniforms: { time: shared.time, tNoise: { value: tex.noise } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform float time; uniform sampler2D tNoise; varying vec2 vUv; varying vec3 vW;
      void main(){
        float n = texture2D(tNoise, vW.xz * 0.08 + vec2(time * 0.01, 0.0)).r;
        float wave = fract(vUv.y * 1.6 - time * 0.16 + n * 0.4 + vUv.x * 3.0);
        float band = smoothstep(0.0, 0.08, wave) * smoothstep(0.35, 0.1, wave);
        float edge = smoothstep(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.2, vUv.y);
        float lace = smoothstep(0.45, 0.75, texture2D(tNoise, vW.xz * 0.35 + time * 0.02).g);
        float a = band * edge * (0.35 + 0.65 * lace);
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.88) * a * 0.55, 1.0);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false
  });
  for (const side of [-1, 1]) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const steps = 90;
    for (let i = 0; i <= steps; i += 1) {
      const z = -258 - Math.pow(i / steps, 1.4) * 360;
      const w = coveWidth(z);
      const x = CX + side * w;
      // across the band: from 2.5 m out at sea to the waterline
      pos.push(x - side * 2.5, 0.02, z, x + side * 0.9, 0.02, z);
      uv.push(i / steps, 0, i / steps, 1); // v runs across the band: 0 at sea, 1 on the sand
      if (i < steps) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const foam = new Mesh(g, foamMat);
    foam.layers.set(LAYER_NO_REFLECT);
    foam.renderOrder = 3;
    group.add(foam);
  }

  // ── the terrace ──
  const stone = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.4, mossScale: 0.9, mossAmount: 0.45, mossLow: 0.5, wet: 1, roughness: 0.5, tint: new Color(1.25, 1.15, 1.05), paving: 1.1
  });
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(b); };
  const TX0 = CX - 8.2, TX1 = CX + 8.2, TZ0 = SHORE.z0 + 0.2, TZ1 = SHORE.z1;
  box(TX1 - TX0, 3, TZ0 - TZ1, CX, SHORE.y - 1.5, (TZ0 + TZ1) / 2);
  // steps down into the sea
  for (let k = 0; k < 4; k += 1) box(7.6, 0.6, 0.55, CX, SHORE.y - 0.3 - (k + 1) * 0.24, TZ1 - 0.27 - k * 0.55);
  // balustrade: plinth, rail, pedestals
  const railY = SHORE.y + 1.0;
  for (const x of [TX0 + 0.25, TX1 - 0.25]) {
    box(0.5, 0.2, TZ0 - TZ1, x, SHORE.y + 0.1, (TZ0 + TZ1) / 2);
    box(0.55, 0.14, TZ0 - TZ1, x, railY, (TZ0 + TZ1) / 2);
    for (let z = TZ0 - 0.4; z > TZ1; z -= 3.2) box(0.62, 1.2, 0.62, x, SHORE.y + 0.6, z);
  }
  for (const [xa, xb] of [[TX0, CX - 3.9], [CX + 3.9, TX1]]) {
    box(xb - xa, 0.2, 0.5, (xa + xb) / 2, SHORE.y + 0.1, TZ1 + 0.25);
    box(xb - xa, 0.14, 0.55, (xa + xb) / 2, railY, TZ1 + 0.25);
    box(0.62, 1.2, 0.62, xb - 0.31, SHORE.y + 0.6, TZ1 + 0.25);
  }
  const terrace = new Mesh(mergeGeometries(parts)!, stone);
  terrace.receiveShadow = true;
  terrace.castShadow = shadows;
  terrace.name = 'terrace';
  group.add(terrace);
  // turned balusters
  const prof: Vector2[] = [[0.1, 0], [0.12, 0.05], [0.07, 0.12], [0.08, 0.3], [0.13, 0.45], [0.06, 0.62], [0.05, 0.72], [0.09, 0.78], [0.1, 0.82]].map(([a, b]) => new Vector2(a, b));
  const baluster = new LatheGeometry(prof, 8);
  const bal: Matrix4[] = [];
  const q = new Quaternion();
  for (const x of [TX0 + 0.25, TX1 - 0.25]) for (let z = TZ0 - 0.8; z > TZ1 + 0.5; z -= 0.38) bal.push(new Matrix4().makeTranslation(x, SHORE.y + 0.2, z));
  for (const [xa, xb] of [[TX0 + 0.5, CX - 4.3], [CX + 4.3, TX1 - 0.5]]) for (let x = xa; x < xb; x += 0.38) bal.push(new Matrix4().makeTranslation(x, SHORE.y + 0.2, TZ1 + 0.25));
  const balMesh = new InstancedMesh(baluster, stone, bal.length);
  bal.forEach((m, i) => balMesh.setMatrixAt(i, m));
  balMesh.computeBoundingSphere();
  group.add(balMesh);

  // ── rocks and sea stacks ──
  const rockMat = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.14, mossScale: 0.5, mossAmount: 1.1, mossLow: -2, wet: 1.2, roughness: 0.6, tint: new Color(0.62, 0.6, 0.62)
  });
  // sea stacks frame the gate and the setting moon
  const stacks: [number, number, number, number][] = [
    [-24, -296, 7, 22], [-12, -286, 3.2, 10], [30, -300, 6, 18], [44, -318, 4, 11], [-66, -372, 12, 34], [80, -410, 12, 30],
    [-8, -470, 9, 24], [-130, -520, 16, 44], [150, -560, 18, 40], [-45, -640, 14, 30], [60, -700, 20, 36]
  ];
  const stackGeos = [stackGeometry(11), stackGeometry(23), stackGeometry(37)];
  const tops: Vector3[] = [];
  const m4 = new Matrix4(), sv = new Vector3(), pv = new Vector3();
  stackGeos.forEach((sg, gi) => {
    const list = stacks.filter((_, i) => i % 3 === gi);
    const im = new InstancedMesh(sg, rockMat, list.length);
    list.forEach(([x, z, w, h], i) => {
      q.setFromAxisAngle(up, r() * 6);
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0.4).normalize(), (r() - 0.5) * 0.12));
      m4.compose(pv.set(x, 0, z), q, sv.set(w * 1.25, h, w));
      im.setMatrixAt(i, m4);
      tops.push(new Vector3(x, h * 0.97, z));
    });
    im.computeBoundingSphere();
    im.castShadow = shadows;
    group.add(im);
  });
  const sm = new InstancedMesh(rockGeometry(7, 3), rockMat, 30);
  // boulders along the beaches
  for (let k = 0; k < 30; k += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const z = -258 - r() * 120;
    const x = CX + side * (coveWidth(z) + (r() - 0.3) * 5);
    const s = 0.5 + r() * 2.2;
    q.setFromAxisAngle(new Vector3(r() - 0.5, 1, r() - 0.5).normalize(), r() * 6);
    m4.compose(pv.set(x, coastHeight(x, z) + s * 0.1, z), q, sv.set(s * 1.3, s, s));
    sm.setMatrixAt(k, m4);
  }
  sm.computeBoundingSphere();
  sm.castShadow = shadows;
  group.add(sm);

  // ── black pines on the stacks and the cliff edges ──
  const pines = [blackPine(5, 7, lo ? 0 : 1), blackPine(9, 9, lo ? 0 : 1)];
  const bark = barkMaterial({ bark: tex.bark, barkN: tex.barkN, moss: tex.moss, noise: tex.noise }, 0.8);
  const needles = leafMaterial({ map: tex.conifer, sway: 0.35, height: 9, trans: 0.3 });
  const spots: Vector3[] = [...tops];
  for (let k = 0; k < (lo ? 18 : 34); k += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const z = -256 - Math.pow(r(), 1.3) * 200;
    const x = CX + side * (coveWidth(z) + 12 + r() * 16);
    spots.push(new Vector3(x, coastHeight(x, z) - 0.4, z));
  }
  pines.forEach((pg, pi) => {
    const list = spots.filter((_, i) => i % 2 === pi);
    const t = new InstancedMesh(pg.trunk, bark, list.length);
    const c = new InstancedMesh(pg.crown, needles, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, r() * 6);
      const s = 0.8 + r() * 0.6;
      m4.compose(p, q, sv.set(s, s, s));
      t.setMatrixAt(i, m4);
      c.setMatrixAt(i, m4);
      c.setColorAt(i, new Color(0.75 + r() * 0.2, 0.85 + r() * 0.2, 0.8));
    });
    for (const im of [t, c]) { im.computeBoundingSphere(); im.castShadow = shadows; group.add(im); }
  });

  // ── the terrace's own garden: azaleas in the corners, grass in the joints ──
  const bushGeo = bushGeometry(71, 24);
  const leaves = leafMaterial({ map: tex.bushLeaves, alphaTest: 0.5, sway: 0.1, height: 1.3, trans: 0.3 });
  const bloom = leafMaterial({ map: tex.blossom, alphaTest: 0.5, sway: 0.1, height: 1.3, trans: 0.6 });
  const bushSpots = [[TX0 + 1.1, TZ0 - 1.2, 1.2], [TX1 - 1.1, TZ0 - 1.2, 1.2], [TX0 + 1.0, TZ1 + 1.3, 0.9], [TX1 - 1.0, TZ1 + 1.3, 0.9], [TX0 + 0.9, (TZ0 + TZ1) / 2, 0.8], [TX1 - 0.9, (TZ0 + TZ1) / 2 - 1, 0.8]];
  const bl = new InstancedMesh(bushGeo, leaves, bushSpots.length);
  const bb = new InstancedMesh(bushGeo, bloom, bushSpots.length);
  const BL = [new Color(1.0, 0.35, 0.62), new Color(1, 1, 1), new Color(1.0, 0.6, 0.75)];
  bushSpots.forEach(([x, z, s], i) => {
    q.setFromAxisAngle(up, r() * 6);
    m4.compose(pv.set(x, SHORE.y - 0.1, z), q, sv.set(s, s * 0.8, s));
    bl.setMatrixAt(i, m4);
    bl.setColorAt(i, new Color(0.3, 0.45, 0.2));
    bb.setMatrixAt(i, m4.clone().multiply(new Matrix4().makeScale(1.04, 1.04, 1.04)));
    bb.setColorAt(i, BL[i % BL.length]);
  });
  const tufts: Matrix4[] = [];
  for (let k = 0; k < 60; k += 1) {
    const x = TX0 + 0.6 + r() * (TX1 - TX0 - 1.2), z = TZ0 - 0.5 - r() * (TZ0 - TZ1 - 1);
    if (Math.abs(x - CX) < 1.6 && r() < 0.8) continue;
    const s = 0.25 + r() * 0.35;
    q.setFromAxisAngle(up, r() * 6);
    tufts.push(new Matrix4().compose(new Vector3(x, SHORE.y - 0.03, z), q.clone(), new Vector3(s, s * 0.8, s)));
  }
  const tm = new InstancedMesh(tuftGeometry(), leafMaterial({ map: tex.tuft, alphaTest: 0.42, sway: 0.2, height: 1, trans: 0.35 }), tufts.length);
  tufts.forEach((m, i) => tm.setMatrixAt(i, m));
  for (const im of [bl, bb, tm]) { im.computeBoundingSphere(); group.add(im); }

  emitters.push({ pos: new Vector3(CX, 2.5, SHORE.z0 - 0.8), color: new Color(1.0, 0.75, 0.55), intensity: 4, range: 12, level: () => 1 });
  return { group, emitters, sea };
}
