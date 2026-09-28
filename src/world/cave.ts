// The cave: the forest ends at a moss-hung cliff; a flooded passage runs
// through it under a ceiling of glowworms, with moonlight falling through
// holes in the roof and bioluminescent flora unfurling along the ledges as the
// visitor floats past.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PlaneGeometry, Points, Quaternion, ShaderMaterial, SphereGeometry, Texture, Vector3, UniformsLib, UniformsUtils
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAVE_MOUTH, CLIFF_Z, HALL, caveCurve, fbm, heightAt } from './layout';
import { mossMaterial, shared, withGrowth } from './materials';
import { leafMaterial, rng } from './treegen';
import { fernClumpGeometry } from './foliage';
import { LAYER_NO_REFLECT } from './water';
import type { Emitter } from './props';

export interface CaveTex { stone: Texture; stoneN: Texture; moss: Texture; mossN: Texture; noise: Texture; fern: Texture; hangingMoss: Texture }

const Z0 = CLIFF_Z - 0.4; // tube mouth sits just behind the cliff face
const Z1 = HALL.z0 + 0.4; // and ends inside the hall's back wall

// centre line of the passage, sampled by z (the path only ever heads toward -z)
const SAMPLES = caveCurve.getSpacedPoints(400);
export function caveCenter(z: number): Vector3 {
  const S = SAMPLES;
  if (z >= S[0].z) return S[0].clone().setZ(z);
  for (let i = 1; i < S.length; i += 1) {
    if (S[i].z <= z) {
      const a = S[i - 1], b = S[i];
      const t = (z - a.z) / (b.z - a.z);
      return new Vector3(a.x + (b.x - a.x) * t, 0, z);
    }
  }
  return S[S.length - 1].clone().setZ(z);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Width and height multipliers: a low mouth, a tall cathedral chamber, a narrower throat into the hall. */
export function caveScale(z: number): { w: number; h: number } {
  const chamber = smooth(-176, -184, z) * (1 - smooth(-197, -205, z));
  const w = 1 + 0.55 * chamber + 0.05 * Math.sin(z * 0.7);
  const h = 1 + 0.6 * chamber + 0.04 * Math.sin(z * 0.9 + 1);
  return { w, h };
}

// right half of the cross-section (lateral s, height y); mirrored for the left
const HALF: [number, number][] = [
  [0, -1.0], [0.9, -0.95], [1.6, -0.6], [2.05, -0.1], [2.3, 0.3], [2.9, 0.42], [3.6, 0.5], [4.2, 0.62],
  [4.7, 1.2], [5.0, 2.2], [5.0, 3.4], [4.7, 4.5], [4.0, 5.5], [3.0, 6.25], [1.6, 6.75], [0, 6.9]
];

function profile(n: number): { s: number; y: number; ledge: number; ceil: number }[] {
  const loop: [number, number][] = [...HALF, ...HALF.slice(1, -1).reverse().map(([s, y]) => [-s, y] as [number, number])];
  // resample by arc length
  const lens = [0];
  for (let i = 1; i <= loop.length; i += 1) {
    const a = loop[i - 1], b = loop[i % loop.length];
    lens.push(lens[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lens[lens.length - 1];
  const out: { s: number; y: number; ledge: number; ceil: number }[] = [];
  for (let k = 0; k < n; k += 1) {
    const L = (k / n) * total;
    let i = 1;
    while (lens[i] < L) i += 1;
    const a = loop[i - 1], b = loop[i % loop.length];
    const t = (L - lens[i - 1]) / (lens[i] - lens[i - 1]);
    const s = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    out.push({ s, y, ledge: y > 0.25 && y < 0.9 && Math.abs(s) > 2.2 ? 1 : 0, ceil: y > 4.2 ? 1 : 0 });
  }
  return out;
}

function noise3(x: number, y: number, z: number): number {
  return fbm(x * 0.33 + y * 0.21, z * 0.33 - y * 0.17) * 0.6 + fbm(y * 0.45 + 11, z * 0.27 + x * 0.19) * 0.4;
}

export interface CaveSurface { pos: Vector3; nrm: Vector3; ledge: boolean; ceil: boolean; z: number; s: number }

function caveMesh(radial: number, step: number): { geo: BufferGeometry; surf: CaveSurface[] } {
  const prof = profile(radial);
  const rows = Math.ceil((Z0 - Z1) / step);
  const pos = new Float32Array((rows + 1) * radial * 3);
  const surf: CaveSurface[] = [];
  const ringCenter = new Vector3();
  for (let j = 0; j <= rows; j += 1) {
    const z = Z0 - (j / rows) * (Z0 - Z1);
    const c = caveCenter(z);
    const { w, h } = caveScale(z);
    ringCenter.set(c.x, 2.6 * h, z);
    for (let k = 0; k < radial; k += 1) {
      const p = prof[k];
      const sw = p.s * (1 + (w - 1) * smooth(1.6, 4.2, Math.abs(p.s)));
      const yy = p.y < 0.7 ? p.y : 0.7 + (p.y - 0.7) * h;
      let x = c.x + sw, y = yy;
      // push the rock outward from the passage axis by layered noise
      const dx = x - ringCenter.x, dy = y - ringCenter.y;
      const dl = Math.hypot(dx, dy) || 1;
      const amp = p.y < 0.15 ? 0.05 : p.ledge ? 0.14 : 0.35 + 0.55 * smooth(0.9, 3.0, p.y);
      const nz = noise3(x, y, z) - 0.5;
      const big = fbm(z * 0.08 + (p.s > 0 ? 3 : 7), y * 0.12) - 0.5;
      const d = nz * amp * 2.2 + big * amp * 2.4;
      x += (dx / dl) * d; y += (dy / dl) * d * (p.y > 0.9 ? 1 : 0.3);
      const o = (j * radial + k) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z + nz * 0.25;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let k = 0; k < radial; k += 1) {
      const a = j * radial + k, b = j * radial + ((k + 1) % radial), c2 = a + radial, d = b + radial;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face into the passage
  const nrm = g.getAttribute('normal') as BufferAttribute;
  const mid = Math.floor(rows / 2) * radial + Math.floor(radial * 0.5);
  const cz = pos[mid * 3 + 2];
  const cc = caveCenter(cz);
  const toAxis = new Vector3(cc.x - pos[mid * 3], 2.6 - pos[mid * 3 + 1], 0);
  if (toAxis.dot(new Vector3(nrm.getX(mid), nrm.getY(mid), 0)) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  const n2 = g.getAttribute('normal') as BufferAttribute;
  for (let j = 0; j <= rows; j += 1) {
    for (let k = 0; k < radial; k += 1) {
      const i = j * radial + k;
      const p = prof[k];
      surf.push({
        pos: new Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]),
        nrm: new Vector3(n2.getX(i), n2.getY(i), n2.getZ(i)),
        ledge: !!p.ledge, ceil: !!p.ceil, z: pos[i * 3 + 2], s: p.s
      });
    }
  }
  g.computeBoundingSphere();
  return { geo: g, surf };
}

/** Lumpy boulder, unit size. */
export function rockGeometry(seed: number, detail = 2): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position') as BufferAttribute;
  const r = rng(seed);
  const o = new Vector3(r() * 50, r() * 50, r() * 50);
  for (let i = 0; i < p.count; i += 1) {
    const v = new Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = fbm(v.x * 1.3 + o.x, v.z * 1.3 + v.y * 0.7 + o.y) * 0.7 + fbm(v.y * 2.7 + o.z, v.x * 2.4) * 0.3;
    const flat = v.y < -0.2 ? 0.6 : 1; // flatter underside so they sit
    v.multiplyScalar(0.7 + 0.6 * n);
    v.y *= flat * 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** The cliff the forest runs into: a leaning, layered rock face with the cave mouth cut out. */
function cliffGeometry(): BufferGeometry {
  const nx = 130, ny = 44;
  const x0 = -140, x1 = 140, y0 = -4, y1 = 50;
  const pos: number[] = [];
  const keep: boolean[] = [];
  const mx = CAVE_MOUTH.x, mw = CAVE_MOUTH.w * 0.5, mh = CAVE_MOUTH.h;
  for (let j = 0; j <= ny; j += 1) {
    const v = j / ny;
    const y = y0 + (y1 - y0) * v;
    for (let i = 0; i <= nx; i += 1) {
      const u = i / nx;
      // denser columns around the mouth
      const uu = u * 2 - 1;
      let x = mx + Math.sign(uu) * Math.pow(Math.abs(uu), 1.7) * (x1 - x0) * 0.5;
      const strata = Math.sin(y * 1.4 + fbm(x * 0.05, y * 0.1) * 5) * 0.35;
      const lean = Math.max(0, y) * 0.22 + Math.max(0, Math.abs(x - mx) - 20) * 0.35;
      let z = CLIFF_Z - lean + (fbm(x * 0.06, y * 0.06) - 0.5) * 5 + (fbm(x * 0.2 + 5, y * 0.2) - 0.5) * 1.6 + strata;
      // an arch-shaped hole for the mouth: pull the ring of vertices around it onto the arch
      const ax = (x - mx) / mw, ay = y > mh - mw ? (y - (mh - mw)) / mw : 0;
      const inArch = Math.abs(ax) < 1 && y < mh && (y < mh - mw || ax * ax + ay * ay < 1);
      if (Math.abs(x - mx) < mw + 3 && y < mh + 3) z = Math.max(z, CLIFF_Z - 0.2) + 0.3; // keep the rim proud of the tube
      if (y < 0.6) x += 0;
      keep.push(!inArch);
      pos.push(x, y, z);
    }
  }
  const idx: number[] = [];
  const row = nx + 1;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (keep[a] && keep[b] && keep[c]) idx.push(a, b, c);
      if (keep[b] && keep[d] && keep[c]) idx.push(b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export interface CaveResult {
  group: Group;
  emitters: Emitter[];
  surf: CaveSurface[];
  update(t: number): void;
}

export function buildCave(tex: CaveTex, tier: 'high' | 'medium' | 'low', shadows: boolean): CaveResult {
  const group = new Group();
  group.name = 'cave';
  const r = rng(4242);
  const emitters: Emitter[] = [];
  const hi = tier === 'high';
  const lo = tier === 'low';

  // ── rock ──
  const rock = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.32, mossScale: 0.8, mossAmount: 0.75, mossLow: 0.7, wet: 1, roughness: 0.55, tint: new Color(0.62, 0.66, 0.72)
  });
  const { geo, surf } = caveMesh(lo ? 72 : 104, lo ? 0.7 : 0.45);
  const tube = new Mesh(geo, rock);
  tube.name = 'cave-rock';
  tube.receiveShadow = true;
  group.add(tube);

  const cliffMat = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.12, mossScale: 0.35, mossAmount: 1.25, mossLow: 1.4, wet: 0.6, roughness: 0.85, tint: new Color(0.55, 0.58, 0.6)
  });
  const cliff = new Mesh(cliffGeometry(), cliffMat);
  cliff.name = 'cliff';
  cliff.receiveShadow = true;
  group.add(cliff);

  // boulders collaring the mouth and piled at the cliff foot
  const rockGeos = [rockGeometry(1), rockGeometry(2), rockGeometry(3)];
  const q = new Quaternion(), sv = new Vector3(), pv = new Vector3();
  rockGeos.forEach((rg, gi) => {
    const mats: Matrix4[] = [];
    for (let k = 0; k < 16; k += 1) {
      if (k % 3 !== gi) continue;
      const a = (k / 16) * Math.PI;
      const side = Math.cos(a);
      const x = CAVE_MOUTH.x + side * (CAVE_MOUTH.w * 0.5 + 0.6 + r() * 1.2);
      const y = Math.sin(a) * (CAVE_MOUTH.h + 0.4) * 0.95;
      const s = 0.9 + r() * 1.3;
      q.setFromAxisAngle(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), r() * 3);
      mats.push(new Matrix4().compose(pv.set(x, y, CLIFF_Z + 0.4 + r() * 0.8), q.clone(), sv.set(s * 1.3, s, s).clone()));
    }
    for (let k = 0; k < 26; k += 1) {
      if (k % 3 !== gi) continue;
      const x = CAVE_MOUTH.x + (r() < 0.5 ? -1 : 1) * (5 + r() * 28);
      const z = CLIFF_Z + 1 + r() * 4;
      const s = 0.8 + r() * 2.4;
      q.setFromAxisAngle(new Vector3(0, 1, 0), r() * 6);
      mats.push(new Matrix4().compose(pv.set(x, heightAt(x, z) + s * 0.1, z), q.clone(), sv.set(s * 1.4, s, s * 1.2).clone()));
    }
    const im = new InstancedMesh(rg, cliffMat, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    im.castShadow = shadows;
    im.receiveShadow = true;
    group.add(im);
  });

  // hanging moss curtains over the mouth and from the roof
  const hangGeo = new PlaneGeometry(0.7, 2.4);
  hangGeo.translate(0, -1.2, 0);
  const hangMat = new MeshLambertMaterial({ map: tex.hangingMoss, alphaTest: 0.35, side: DoubleSide, color: new Color(0.5, 0.62, 0.48) });
  const hangs: Matrix4[] = [];
  for (let k = 0; k < 30; k += 1) {
    const x = CAVE_MOUTH.x + (r() * 2 - 1) * (CAVE_MOUTH.w * 0.5 + 2.5);
    const top = CAVE_MOUTH.h + 0.2 - Math.max(0, Math.abs(x - CAVE_MOUTH.x) - CAVE_MOUTH.w * 0.35) * 0.6;
    const s = 0.7 + r() * 1.1;
    hangs.push(new Matrix4().compose(new Vector3(x, top + r() * 0.8, CLIFF_Z + 0.6 + r() * 0.6), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (r() - 0.5) * 0.8), new Vector3(s, s * (0.8 + r() * 0.8), s)));
  }
  const ceil = surf.filter((p) => p.ceil);
  for (let k = 0; k < (lo ? 50 : 90); k += 1) {
    const p = ceil[Math.floor(r() * ceil.length)];
    const s = 0.6 + r() * 1.2;
    hangs.push(new Matrix4().compose(p.pos.clone().add(new Vector3(0, -0.1, 0)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6), new Vector3(s, s * (0.6 + r()), s)));
  }
  const hm = new InstancedMesh(hangGeo, hangMat, hangs.length);
  hangs.forEach((mm, i) => hm.setMatrixAt(i, mm));
  hm.computeBoundingSphere();
  group.add(hm);

  // ── stalactites ──
  const coneGeo = new ConeGeometry(1, 1, 7, 3, false);
  coneGeo.rotateX(Math.PI); // point down
  coneGeo.translate(0, -0.5, 0);
  const cp = coneGeo.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < cp.count; i += 1) {
    const y = cp.getY(i);
    const wob = 1 + 0.25 * Math.sin(cp.getX(i) * 9 + y * 5);
    cp.setX(i, cp.getX(i) * wob); cp.setZ(i, cp.getZ(i) * wob);
  }
  coneGeo.computeVertexNormals();
  const stal: Matrix4[] = [];
  for (let k = 0; k < (lo ? 90 : 170); k += 1) {
    const p = ceil[Math.floor(r() * ceil.length)];
    const h = 0.4 + Math.pow(r(), 2) * 2.4;
    const w = 0.08 + h * 0.09 + r() * 0.06;
    stal.push(new Matrix4().compose(p.pos.clone().add(new Vector3(0, 0.15, 0)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6), new Vector3(w, h, w)));
  }
  const stalMesh = new InstancedMesh(coneGeo, rock, stal.length);
  stal.forEach((mm, i) => stalMesh.setMatrixAt(i, mm));
  stalMesh.computeBoundingSphere();
  group.add(stalMesh);

  // ── glowworms: a starfield on the ceiling, doubled by the water ──
  const nGlow = lo ? 2600 : hi ? 7000 : 4500;
  const gp = new Float32Array(nGlow * 3), gph = new Float32Array(nGlow);
  for (let k = 0; k < nGlow; k += 1) {
    const p = ceil[Math.floor(r() * ceil.length)];
    const jitter = new Vector3((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6);
    const hang = r() < 0.3 ? r() * 0.5 : 0; // some hang on silk threads
    const v = p.pos.clone().add(jitter).addScaledVector(p.nrm, 0.06);
    v.y -= hang;
    gp.set([v.x, v.y, v.z], k * 3);
    gph[k] = r();
  }
  const gg = new BufferGeometry();
  gg.setAttribute('position', new BufferAttribute(gp, 3));
  gg.setAttribute('aPhase', new BufferAttribute(gph, 1));
  const glowMat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, pr: { value: 1 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time, pr; attribute float aPhase; varying float vB; varying float vHue;
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vB = 0.55 + 0.45 * sin(time * (0.4 + aPhase) + aPhase * 40.0);
        vHue = aPhase;
        gl_PointSize = pr * (5.0 + 5.0 * aPhase) * (0.6 + 0.4 * vB) / max(1.0, -mvPosition.z * 0.35);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying float vB; varying float vHue;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.0);
        vec3 c = mix(vec3(0.25, 0.85, 1.0), vec3(0.45, 1.0, 0.8), vHue);
        gl_FragColor = vec4(c * a * vB * 2.2, 1.0);
        #include <fog_fragment>
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, fog: true
  });
  glowMat.uniforms.time = shared.time;
  const glow = new Points(gg, glowMat);
  glow.name = 'glowworms';
  glow.frustumCulled = false;
  group.add(glow);

  // ── crystals: faceted, self-lit, feeding the light pool ──
  const crystalGeo = (() => {
    const parts: BufferGeometry[] = [];
    const cr = rng(77);
    for (let k = 0; k < 7; k += 1) {
      const h = 0.4 + cr() * 0.9, w = 0.06 + cr() * 0.08;
      const prism = new CylinderGeometry(w, w * 1.1, h, 6, 1, true);
      prism.translate(0, h / 2, 0);
      const tip = new ConeGeometry(w, w * 2.2, 6, 1, true);
      tip.translate(0, h + w * 1.1, 0);
      const g = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()])!;
      const a = cr() * Math.PI * 2, tilt = 0.2 + cr() * 0.6;
      g.rotateZ(tilt); g.rotateY(a);
      g.translate(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
      parts.push(g);
    }
    const g = mergeGeometries(parts)!;
    const pp = g.getAttribute('position') as BufferAttribute;
    const col = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i += 3) {
      const f = 0.45 + cr() * 0.55;
      for (let j = 0; j < 3; j += 1) {
        const y = pp.getY(i + j);
        const k = f * (0.35 + 0.65 * Math.min(1, y / 1.1));
        col.set([k, k, k], (i + j) * 3);
      }
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();
  const ledges = surf.filter((p) => p.ledge);
  const CRYSTAL = [new Color(0.75, 0.35, 1.6), new Color(0.2, 1.3, 1.5), new Color(1.5, 0.3, 0.85), new Color(0.4, 0.6, 1.8)];
  const cryst: { m: Matrix4; c: Color }[] = [];
  const nClusters = lo ? 10 : 16;
  for (let k = 0; k < nClusters; k += 1) {
    const p = ledges[Math.floor(r() * ledges.length)];
    const c = CRYSTAL[k % CRYSTAL.length];
    const n = 2 + Math.floor(r() * 3);
    for (let j = 0; j < n; j += 1) {
      const s = 0.7 + r() * 1.3;
      const off = new Vector3((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9);
      cryst.push({ m: new Matrix4().compose(p.pos.clone().add(off).add(new Vector3(0, -0.05, 0)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6), new Vector3(s, s * (0.8 + r() * 0.6), s)), c });
    }
    emitters.push({ pos: p.pos.clone().add(new Vector3(-Math.sign(p.s) * 0.8, 0.8, 0)), color: c.clone().multiplyScalar(0.6), intensity: 3.2, range: 7, level: () => 1 });
  }
  const crystalMat = withGrowth(new MeshBasicMaterial({ vertexColors: true }), 'crystal');
  const crystals = new InstancedMesh(crystalGeo, crystalMat, cryst.length);
  cryst.forEach((c, i) => { crystals.setMatrixAt(i, c.m); crystals.setColorAt(i, c.c); });
  crystals.computeBoundingSphere();
  crystals.name = 'crystals';
  group.add(crystals);

  // ── glowing flora along both ledges, unfolding as the visitor passes ──
  const spike = (() => {
    const stem = new CylinderGeometry(0.008, 0.014, 1, 4, 1, true);
    stem.translate(0, 0.5, 0);
    const parts: BufferGeometry[] = [stem.toNonIndexed()];
    for (let k = 0; k < 9; k += 1) {
      const t = 0.42 + k * 0.065;
      const b = new SphereGeometry(0.035 + 0.025 * (1 - k / 9), 6, 4).toNonIndexed();
      const a = k * 2.4;
      b.translate(Math.cos(a) * 0.03, t, Math.sin(a) * 0.03);
      parts.push(b);
    }
    const g = mergeGeometries(parts)!;
    const pp = g.getAttribute('position') as BufferAttribute;
    const col = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i += 1) {
      const y = pp.getY(i);
      const k = i < 24 ? 0.12 : 0.6 + 0.9 * y; // dark stem, bright bells
      col.set([k, k, k], i * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    return g;
  })();
  const cap = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(1, 0.5, 1);
  const stem = new CylinderGeometry(0.25, 0.32, 1, 6, 1, true);
  stem.translate(0, -0.5, 0);
  const shroom = mergeGeometries([cap, stem])!;
  shroom.translate(0, 1, 0);
  const FLORA = [new Color(1.3, 0.35, 1.2), new Color(0.35, 1.3, 1.4), new Color(0.75, 0.45, 1.6), new Color(1.5, 0.75, 0.3), new Color(0.4, 1.4, 0.7)];
  const spikes: { m: Matrix4; c: Color }[] = [], shrooms: { m: Matrix4; c: Color }[] = [], ferns: Matrix4[] = [];
  const nFlora = lo ? 260 : hi ? 620 : 420;
  for (let k = 0; k < nFlora; k += 1) {
    const p = ledges[Math.floor(r() * ledges.length)];
    const base = p.pos.clone().add(new Vector3((r() - 0.5) * 0.5, -0.04, (r() - 0.5) * 0.5));
    const c = FLORA[Math.floor(r() * FLORA.length)].clone().multiplyScalar(0.7 + r() * 0.5);
    const kind = r();
    q.setFromAxisAngle(new Vector3(r() - 0.5, 5, r() - 0.5).normalize(), r() * 6);
    if (kind < 0.42) {
      const s = 0.5 + r() * 1.1;
      spikes.push({ m: new Matrix4().compose(base, q.clone(), new Vector3(s, s, s)), c });
    } else if (kind < 0.8) {
      const s = 0.05 + r() * 0.12;
      shrooms.push({ m: new Matrix4().compose(base, q.clone(), new Vector3(s, s * (0.8 + r() * 0.8), s)), c });
    } else {
      const s = 0.6 + r() * 0.7;
      ferns.push(new Matrix4().compose(base, q.clone(), new Vector3(s, s, s)));
    }
  }
  const spikeMat = withGrowth(new MeshBasicMaterial({ vertexColors: true }), 'spike');
  const shroomMat = withGrowth(new MeshBasicMaterial({ color: 0xffffff }), 'shroom');
  const sm = new InstancedMesh(spike, spikeMat, spikes.length);
  spikes.forEach((o, i) => { sm.setMatrixAt(i, o.m); sm.setColorAt(i, o.c); });
  const mm2 = new InstancedMesh(shroom, shroomMat, shrooms.length);
  shrooms.forEach((o, i) => { mm2.setMatrixAt(i, o.m); mm2.setColorAt(i, o.c); });
  const fernMat = leafMaterial({ map: tex.fern, alphaTest: 0.45, sway: 0.05, height: 1, trans: 0.6, emissive: new Color(0.02, 0.16, 0.13), grow: shared.camZ });
  const fm = new InstancedMesh(fernClumpGeometry(7), fernMat, ferns.length);
  ferns.forEach((o, i) => fm.setMatrixAt(i, o));
  for (const im of [sm, mm2, fm]) { im.computeBoundingSphere(); group.add(im); }
  sm.name = 'glow-spikes'; mm2.name = 'glow-shrooms'; fm.name = 'glow-ferns';
  // a few soft patches of colour on the rock behind the flora
  for (let k = 0; k < 6; k += 1) {
    const p = ledges[Math.floor((k + 0.5) / 6 * ledges.length)];
    emitters.push({ pos: p.pos.clone().add(new Vector3(0, 1.2, 0)), color: FLORA[k % FLORA.length].clone().multiplyScalar(0.5), intensity: 2.2, range: 6, level: () => 1 });
  }

  // ── moonlight through the roof ──
  const shaftMat = new ShaderMaterial({
    uniforms: { tNoise: { value: tex.noise }, time: shared.time },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tNoise; uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float rim = pow(abs(dot(vN, vV)), 3.0);
        float n = texture2D(tNoise, vec2(vUv.x * 2.0 + time * 0.01, vUv.y * 0.5 - time * 0.03)).r;
        float fall = smoothstep(0.0, 0.3, vUv.y) * smoothstep(0.92, 0.5, vUv.y);
        float streak = texture2D(tNoise, vec2(vUv.x * 5.0, 0.2)).g;
        float a = rim * fall * (0.4 + 0.6 * n) * (0.4 + streak);
        gl_FragColor = vec4(vec3(0.55, 0.7, 1.0) * a * 0.085, 1.0);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide
  });
  const holeMat = new MeshBasicMaterial({ color: new Color(1.3, 1.5, 2.0) });
  const poolMat = new ShaderMaterial({
    uniforms: { time: shared.time },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float time; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.0) * (0.85 + 0.15 * sin(time * 1.3)); gl_FragColor = vec4(vec3(0.5, 0.65, 1.0) * a * 0.55, 1.0); }',
    transparent: true, blending: AdditiveBlending, depthWrite: false
  });
  for (const z of [-185, -199.5]) {
    const c = caveCenter(z);
    const { h } = caveScale(z);
    const top = 6.9 * h - 0.3;
    const x = c.x + (z < -190 ? 1.2 : -0.8);
    // ragged opening
    const hole = new CircleGeometry(1.1, 18);
    const hp = hole.getAttribute('position') as BufferAttribute;
    for (let i = 1; i < hp.count; i += 1) { const k = 0.75 + 0.5 * fbm(i * 0.7, z); hp.setXYZ(i, hp.getX(i) * k, hp.getY(i) * k, 0); }
    const hm2 = new Mesh(hole, holeMat);
    hm2.rotation.x = Math.PI / 2;
    hm2.position.set(x, top + 0.2, z);
    group.add(hm2);
    const shaft = new Mesh(new CylinderGeometry(1.0, 1.9, top + 2, 20, 1, true), shaftMat);
    shaft.geometry.translate(0, (top + 2) / 2, 0);
    shaft.position.set(x + 0.35, 0, z + 0.4);
    shaft.rotation.z = -0.06;
    shaft.layers.set(LAYER_NO_REFLECT);
    group.add(shaft);
    const pool = new Mesh(new PlaneGeometry(4.2, 4.2), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + 0.4, 0.015, z + 0.5);
    pool.layers.set(LAYER_NO_REFLECT);
    group.add(pool);
    emitters.push({ pos: new Vector3(x, 2.2, z), color: new Color(0.55, 0.7, 1.0), intensity: 4, range: 9, level: () => 1 });
  }

  // spores drifting upward through the passage
  const nSp = lo ? 300 : 700;
  const sp = new Float32Array(nSp * 3), sph = new Float32Array(nSp);
  for (let k = 0; k < nSp; k += 1) {
    const z = Z0 - r() * (Z0 - Z1);
    const c = caveCenter(z);
    const { w, h } = caveScale(z);
    sp.set([c.x + (r() - 0.5) * 7 * w, r() * 5.5 * h, z], k * 3);
    sph[k] = r();
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new BufferAttribute(sp, 3));
  sg.setAttribute('aPhase', new BufferAttribute(sph, 1));
  const spMat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, pr: { value: 1 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time, pr; attribute float aPhase; varying float vA; varying float vH;
      void main(){
        vec3 p = position;
        float t = time * (0.05 + aPhase * 0.08) + aPhase * 10.0;
        p.y = mod(p.y + t * 3.0, 9.0);
        p.x += sin(t * 3.0 + aPhase * 20.0) * 0.4;
        p.z += cos(t * 2.0 + aPhase * 13.0) * 0.4;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vA = smoothstep(0.0, 1.0, p.y) * smoothstep(9.0, 6.0, p.y);
        vH = aPhase;
        gl_PointSize = pr * 9.0 / max(1.0, -mvPosition.z * 0.4);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying float vA; varying float vH;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.5) * vA;
        vec3 c = mix(vec3(0.6, 1.0, 0.8), vec3(1.0, 0.6, 1.0), step(0.7, vH));
        gl_FragColor = vec4(c * a * 1.2, 1.0);
        #include <fog_fragment>
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, fog: true
  });
  spMat.uniforms.time = shared.time;
  const spores = new Points(sg, spMat);
  spores.frustumCulled = false;
  spores.layers.set(LAYER_NO_REFLECT);
  group.add(spores);

  return {
    group, emitters, surf,
    update() { /* animation lives in the shaders */ }
  };
}

export const CAVE_Z = { z0: Z0, z1: Z1 };
export function glowPointMaterials(g: Group): ShaderMaterial[] {
  const out: ShaderMaterial[] = [];
  g.traverse((o) => { if ((o as Points).isPoints) out.push((o as Points).material as ShaderMaterial); });
  return out;
}
