import {
  BufferGeometry, BufferAttribute, Color, Group, InstancedMesh, Matrix4, Object3D, Quaternion, Texture, Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, inClearing, pathDistance, pondFactor, fbm, CLIFF_Z } from './layout';
import { bushGeometry, tuftGeometry, leafMaterial } from './treegen';
import { windLambert } from './materials';
import { LAYER_NO_REFLECT } from './water';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function bladeGeometry(): BufferGeometry {
  const segs = 5;
  const pos: number[] = [], col: number[] = [], nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const w = 0.045 * (1 - t) ** 0.8 + 0.002;
    const bend = t * t * 0.18;
    pos.push(-w, t, bend, w, t, bend);
    const g = 0.18 + 0.82 * t ** 1.3;
    col.push(g, g, g, g, g, g);
    nor.push(0, 1, 0.25, 0, 1, 0.25);
  }
  for (let i = 0; i < segs; i += 1) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  return g;
}

export function fernClumpGeometry(fronds = 7): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const r = rng(99);
  for (let f = 0; f < fronds; f += 1) {
    const segs = 7;
    const L = 0.85 + r() * 0.45, W = 0.42;
    const a = (f / fronds) * Math.PI * 2 + r() * 0.5;
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    const idx: number[] = [];
    const lift = 0.55 + r() * 0.3;
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const out = t * L * 0.9;
      const up = Math.sin(t * Math.PI * 0.85) * L * lift - t * t * L * 0.25;
      for (const side of [-1, 1]) {
        const lx = side * W * 0.5 * (1 - t * 0.15);
        const x = Math.cos(a) * out - Math.sin(a) * lx;
        const z = Math.sin(a) * out + Math.cos(a) * lx;
        pos.push(x, up + 0.02, z);
        uv.push(side < 0 ? 0 : 1, t);
        nor.push(Math.cos(a) * 0.2, 1, Math.sin(a) * 0.2);
      }
    }
    for (let i = 0; i < segs; i += 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

export interface FoliageOpts {
  grass: number; tufts: number; ferns: number; bushes: number;
  fern: Texture; fern2: Texture; tuft: Texture; bush: Texture; blossom: Texture;
  trees: { x: number; z: number; r: number }[];
}

const BLOOMS = [new Color(1.0, 0.32, 0.62), new Color(1.0, 0.58, 0.72), new Color(1, 1, 1), new Color(0.5, 0.6, 1.0), new Color(0.72, 0.5, 1.0), new Color(1.0, 0.85, 0.4)];

/** Candidate spot for undergrowth: anywhere walkable-looking, never on the path or in the water. */
function groundOk(x: number, z: number, pdMin: number): number {
  if (pondFactor(x, z) < 1.06) return -1;
  if (z > 4 && Math.abs(x) < 2.4 + (z - 4) * 0.28) return -1; // keep the landing view open
  if (z < CLIFF_Z + 1.5) return -1;
  const pd = z < -12 ? pathDistance(x, z) : 99;
  if (z < -12 && pd < pdMin) return -1;
  // the spring pool at the cave mouth
  if (heightAt(x, z, pd) < -0.05) return -1;
  return pd;
}

export function buildFoliage(o: FoliageOpts): Group {
  const group = new Group();
  group.name = 'foliage';
  const rand = rng(1234);
  const m4 = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), yAxis = new Vector3(0, 1, 0);
  const col = new Color();
  const chunked = (list: number[], stride: number, CH = 28) => {
    const chunks = new Map<string, number[]>();
    for (let i = 0; i < list.length; i += stride) {
      const key = `${Math.floor(list[i] / CH)},${Math.floor(list[i + 1] / CH)}`;
      let arr = chunks.get(key);
      if (!arr) { arr = []; chunks.set(key, arr); }
      for (let k = 0; k < stride; k += 1) arr.push(list[i + k]);
    }
    return chunks;
  };
  // lushness: thick along the walk and the pond bank, patchy under the deep trees
  const lush = (x: number, z: number, pd: number) => {
    let d = 0.3 + 0.7 * fbm(x * 0.07 + 3, z * 0.07);
    if (z < -12) d *= pd < 7 ? 1.15 : Math.max(0.25, 1 - (pd - 7) / 18);
    else d *= z > 5 ? 1.1 : 0.85;
    return d;
  };

  // ── grass blades: fine texture between the tufts ──
  const blade = bladeGeometry();
  const grassMat = windLambert({ vertexColors: true, bend: 0.35, translucency: 0.35 });
  const blades: number[] = [];
  let tries = 0;
  while (blades.length / 3 < o.grass && tries < o.grass * 6) {
    tries += 1;
    const z = 16 - rand() * 188;
    const x = z > -14 ? (rand() * 2 - 1) * 30 : (rand() * 2 - 1) * (rand() < 0.7 ? 10 : 24);
    const pd = groundOk(x, z, 0.6);
    if (pd < 0) continue;
    if (rand() > lush(x, z, pd)) continue;
    blades.push(x, z, pd);
  }
  for (const arr of chunked(blades, 3).values()) {
    const n = arr.length / 3;
    const mesh = new InstancedMesh(blade, grassMat, n);
    for (let i = 0; i < n; i += 1) {
      const x = arr[i * 3], z = arr[i * 3 + 1], pd = arr[i * 3 + 2];
      const y = heightAt(x, z, pd) - 0.07;
      const hgt = (0.3 + rand() * 0.55) * (pd < 2 ? 0.6 : 1) * (0.7 + 0.6 * fbm(x * 0.2, z * 0.2));
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (rand() - 0.5) * 0.5));
      s.set(0.8 + rand() * 0.6, hgt, 1);
      m4.compose(p.set(x, y, z), q, s);
      mesh.setMatrixAt(i, m4);
      const k = fbm(x * 0.05, z * 0.05);
      col.setRGB(0.12 + 0.12 * k + rand() * 0.04, 0.22 + 0.16 * k + rand() * 0.05, 0.05 + 0.03 * rand());
      if (rand() < 0.08) col.setRGB(0.3, 0.3, 0.12);
      mesh.setColorAt(i, col);
    }
    mesh.computeBoundingSphere();
    mesh.layers.set(LAYER_NO_REFLECT); // main camera sees layer 2, the pond's mirror camera does not
    mesh.receiveShadow = true;
    mesh.name = 'grass';
    group.add(mesh);
  }

  // ── grass tufts: dense clumps that close the gaps ──
  const tuft = tuftGeometry();
  const tuftMat = leafMaterial({ map: o.tuft, alphaTest: 0.42, sway: 0.18, height: 1, trans: 0.35 });
  const tufts: number[] = [];
  tries = 0;
  while (tufts.length / 3 < o.tufts && tries < o.tufts * 12) {
    tries += 1;
    // tufts come in drifts: pick a drift centre, then scatter around it
    const z0 = 18 - rand() * 190;
    const x0 = z0 > -14 ? (rand() * 2 - 1) * 32 : (rand() * 2 - 1) * (rand() < 0.65 ? 11 : 28);
    const pd0 = groundOk(x0, z0, 1.1);
    if (pd0 < 0 || rand() > lush(x0, z0, pd0)) continue;
    const k = 3 + Math.floor(rand() * 6);
    for (let j = 0; j < k; j += 1) {
      const x = x0 + (rand() - 0.5) * 2.2, z = z0 + (rand() - 0.5) * 2.2;
      const pd = groundOk(x, z, 1.0);
      if (pd < 0) continue;
      tufts.push(x, z, pd);
    }
  }
  for (const arr of chunked(tufts, 3).values()) {
    const n = arr.length / 3;
    const mesh = new InstancedMesh(tuft, tuftMat, n);
    for (let i = 0; i < n; i += 1) {
      const x = arr[i * 3], z = arr[i * 3 + 1], pd = arr[i * 3 + 2];
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
      const w = 0.5 + rand() * 0.55;
      const hh = w * (0.7 + rand() * 0.6) * (pd < 2.2 ? 0.65 : 1);
      s.set(w, hh, w);
      m4.compose(p.set(x, heightAt(x, z, pd) - 0.06, z), q, s);
      mesh.setMatrixAt(i, m4);
      const f = fbm(x * 0.04, z * 0.04);
      col.setRGB(0.75 + 0.3 * f + rand() * 0.1, 0.8 + 0.25 * f + rand() * 0.1, 0.7 + 0.1 * rand());
      if (rand() < 0.07) col.setRGB(1.25, 1.05, 0.6);
      mesh.setColorAt(i, col);
    }
    mesh.computeBoundingSphere();
    mesh.layers.set(LAYER_NO_REFLECT);
    mesh.name = 'tufts';
    group.add(mesh);
  }

  // ── ferns: path edges, clearings, the pond bank, tree feet ──
  const fernGeo = fernClumpGeometry(7);
  const fernMats = [o.fern, o.fern2].map((t) => windLambert({ map: t, alphaTest: 0.45, bend: 0.12, translucency: 0.4 }));
  const fernLists: number[][] = [[], []];
  const addFern = (x: number, z: number, pd: number) => { fernLists[rand() < 0.5 ? 0 : 1].push(x, z, pd); };
  let fp = 0, ft = 0;
  while (fp < o.ferns * 0.7 && ft < o.ferns * 20) {
    ft += 1;
    const z = 12 - rand() * 184;
    const x = (rand() * 2 - 1) * (z > -14 ? 28 : 18);
    const pd = groundOk(x, z, 1.4);
    if (pd < 0) continue;
    const pf = pondFactor(x, z);
    if (pf > 1.7 && z > -14 && Math.abs(x) < 6) continue;
    if (z < -12 && pd > 14) continue;
    const near = z < -12 ? (pd < 4.5 ? 1 : 0.4) : (pf < 1.35 ? 1 : 0.3);
    if (rand() > near * (0.4 + 0.6 * fbm(x * 0.1, z * 0.1 + 7))) continue;
    if (inClearing(x, z, -3.5)) continue;
    if (z > 2 && Math.abs(x) < 6.5) continue;
    addFern(x, z, pd);
    fp += 1;
  }
  // every trunk gets a skirt of ferns and a bush or two, so nothing stands on bare ground
  const bushSpots: number[] = [];
  for (const t of o.trees) {
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k += 1) {
      const a = rand() * Math.PI * 2, d = t.r * 0.9 + 0.3 + rand() * 1.4;
      const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      const pd = groundOk(x, z, 1.4);
      if (pd < 0) continue;
      if (rand() < 0.6) addFern(x, z, pd); else bushSpots.push(x, z, 0.55 + rand() * 0.6, 0);
    }
  }
  fernLists.forEach((arr, k) => {
    const n = arr.length / 3;
    if (!n) return;
    const mesh = new InstancedMesh(fernGeo, fernMats[k], n);
    for (let i = 0; i < n; i += 1) {
      const x = arr[i * 3], z = arr[i * 3 + 1], pd = arr[i * 3 + 2];
      const y = heightAt(x, z, pd) - 0.05;
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
      const sc = 0.75 + rand() * 0.9;
      s.set(sc, sc * (0.8 + rand() * 0.4), sc);
      m4.compose(p.set(x, y, z), q, s);
      mesh.setMatrixAt(i, m4);
      col.setRGB(0.75 + rand() * 0.35, 0.8 + rand() * 0.3, 0.7 + rand() * 0.2);
      mesh.setColorAt(i, col);
    }
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.name = 'ferns';
    group.add(mesh);
  });

  // ── bushes: azalea and box along the walk and the slopes, some in flower ──
  let bt = 0;
  while (bushSpots.length / 4 < o.bushes && bt < o.bushes * 30) {
    bt += 1;
    const z = 14 - rand() * 186;
    const x = z > -14 ? (rand() < 0.5 ? -1 : 1) * (4 + rand() * 30) : (rand() * 2 - 1) * 26;
    const pd = groundOk(x, z, 2.4);
    if (pd < 0) continue;
    if (z > -14 && pondFactor(x, z) < 1.12) continue;
    if (z > 2 && Math.abs(x) < 7.5) continue;
    if (inClearing(x, z, -2)) continue;
    const w = z < -12 ? (pd < 8 ? 1 : pd < 18 ? 0.55 : 0.3) : 0.8;
    if (rand() > w) continue;
    const bloom = (pd < 9 || z > -14) && rand() < 0.4 ? 1 + Math.floor(rand() * BLOOMS.length) : 0;
    bushSpots.push(x, z, 0.5 + rand() * 1.1 * (pd < 3.5 ? 0.6 : 1), bloom);
  }
  const bushGeos = [bushGeometry(5, 28), bushGeometry(17, 22)];
  const bushMat = leafMaterial({ map: o.bush, alphaTest: 0.5, sway: 0.08, height: 1.3, trans: 0.3 });
  const bloomMat = leafMaterial({ map: o.blossom, alphaTest: 0.5, sway: 0.08, height: 1.3, trans: 0.6 });
  bushGeos.forEach((geo, gi) => {
    const list: number[] = [];
    for (let i = 0; i < bushSpots.length; i += 4) if ((i / 4) % 2 === gi) list.push(bushSpots[i], bushSpots[i + 1], bushSpots[i + 2], bushSpots[i + 3]);
    for (const arr of chunked(list, 4, 70).values()) {
      const n = arr.length / 4;
      const leaves = new InstancedMesh(geo, bushMat, n);
      const blooms: Matrix4[] = [], bcol: Color[] = [];
      for (let i = 0; i < n; i += 1) {
        const x = arr[i * 4], z = arr[i * 4 + 1], sc = arr[i * 4 + 2], bloom = arr[i * 4 + 3];
        q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
        s.set(sc * (1 + rand() * 0.4), sc * (0.75 + rand() * 0.35), sc * (1 + rand() * 0.3));
        m4.compose(p.set(x, heightAt(x, z) - 0.12 * sc, z), q, s);
        leaves.setMatrixAt(i, m4);
        const g = 0.8 + rand() * 0.35;
        col.setRGB((0.3 + rand() * 0.12) * g, (0.46 + rand() * 0.12) * g, (0.2 + rand() * 0.06) * g);
        if (rand() < 0.1) col.setRGB(0.55, 0.3, 0.14); // a few already turned
        leaves.setColorAt(i, col);
        if (bloom > 0) {
          blooms.push(m4.clone().multiply(new Matrix4().makeScale(1.03, 1.03, 1.03)));
          bcol.push(BLOOMS[bloom - 1].clone().multiplyScalar(0.9 + rand() * 0.3));
        }
      }
      leaves.computeBoundingSphere();
      leaves.receiveShadow = true;
      leaves.layers.set(LAYER_NO_REFLECT);
      leaves.name = 'bushes';
      group.add(leaves);
      if (blooms.length) {
        const bm = new InstancedMesh(geo, bloomMat, blooms.length);
        blooms.forEach((mm, i) => { bm.setMatrixAt(i, mm); bm.setColorAt(i, bcol[i]); });
        bm.computeBoundingSphere();
        bm.layers.set(LAYER_NO_REFLECT);
        bm.name = 'blooms';
        group.add(bm);
      }
    }
  });

  return group;
}

export function placeObjectOnGround(obj: Object3D, x: number, z: number, sink = 0) {
  obj.position.set(x, heightAt(x, z) - sink, z);
}
