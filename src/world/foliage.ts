import {
  BufferGeometry, BufferAttribute, Color, Group, InstancedMesh, Matrix4, Object3D, Quaternion, Texture, Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, inClearing, pathDistance, pondFactor, fbm } from './layout';
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

function fernClumpGeometry(fronds = 7): BufferGeometry {
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

export interface FoliageOpts { grass: number; ferns: number; fern: Texture; fern2: Texture }

export function buildFoliage(o: FoliageOpts): Group {
  const group = new Group();
  group.name = 'foliage';
  const rand = rng(1234);
  const m4 = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), yAxis = new Vector3(0, 1, 0);
  const col = new Color();

  // ── grass in 16 m chunks so frustum culling works ──
  const blade = bladeGeometry();
  const grassMat = windLambert({ vertexColors: true, bend: 0.35, translucency: 0.35 });
  const chunks = new Map<string, number[]>();
  const CH = 28;
  let placed = 0, tries = 0;
  while (placed < o.grass && tries < o.grass * 6) {
    tries += 1;
    const z = 16 - rand() * 206;
    const pd0 = z < -12 ? 0 : 999;
    let x: number;
    if (z > -14) x = (rand() * 2 - 1) * 30;
    else x = (rand() * 2 - 1) * (rand() < 0.7 ? 10 : 24);
    const pd = pd0 === 0 ? pathDistance(x, z) : 99;
    const pf = pondFactor(x, z);
    if (pf < 1.06) continue;
    if (z < -12 && pd < 0.7) continue;
    if (z > 4 && Math.abs(x) < 2.2 + (z - 4) * 0.25) continue; // keep the landing view clear
    // density: lush along the path edge and the landing bank, patchy elsewhere
    let dens = 0.35 + 0.65 * fbm(x * 0.08 + 3, z * 0.08);
    if (z < -12) dens *= pd < 6 ? 1 : Math.max(0.15, 1 - (pd - 6) / 14);
    else dens *= z > 5 ? 1.1 : 0.7;
    if (rand() > dens) continue;
    const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
    let arr = chunks.get(key);
    if (!arr) { arr = []; chunks.set(key, arr); }
    arr.push(x, z, pd);
    placed += 1;
  }
  for (const arr of chunks.values()) {
    const n = arr.length / 3;
    const mesh = new InstancedMesh(blade, grassMat, n);
    for (let i = 0; i < n; i += 1) {
      const x = arr[i * 3], z = arr[i * 3 + 1], pd = arr[i * 3 + 2];
      const y = heightAt(x, z, pd) - 0.02;
      const hgt = (0.28 + rand() * 0.55) * (pd < 2 ? 0.6 : 1) * (0.7 + 0.6 * fbm(x * 0.2, z * 0.2));
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
      const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (rand() - 0.5) * 0.5);
      q.multiply(tilt);
      s.set(0.8 + rand() * 0.6, hgt, 1);
      p.set(x, y, z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      const k = fbm(x * 0.05, z * 0.05);
      col.setRGB(0.12 + 0.12 * k + rand() * 0.04, 0.22 + 0.16 * k + rand() * 0.05, 0.05 + 0.03 * rand());
      if (rand() < 0.08) col.setRGB(0.3, 0.3, 0.12);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.layers.set(LAYER_NO_REFLECT); // main camera sees layer 2, the pond's mirror camera does not
    mesh.receiveShadow = true;
    mesh.name = 'grass';
    group.add(mesh);
  }

  // ── ferns: path edges, clearings, the pond bank ──
  const fernGeo = fernClumpGeometry(7);
  const fernMats = [o.fern, o.fern2].map((t) => windLambert({ map: t, alphaTest: 0.45, bend: 0.12, translucency: 0.4 }));
  const fernLists: number[][] = [[], []];
  let fp = 0, ft = 0;
  while (fp < o.ferns && ft < o.ferns * 20) {
    ft += 1;
    const z = 12 - rand() * 200;
    const x = (rand() * 2 - 1) * (z > -14 ? 28 : 16);
    const pd = z < -12 ? pathDistance(x, z) : 99;
    const pf = pondFactor(x, z);
    if (pf < 1.05 || pf > 1.7 && z > -14 && Math.abs(x) < 6) continue;
    if (z < -12 && (pd < 1.3 || pd > 12)) continue;
    const near = z < -12 ? (pd < 4.5 ? 1 : 0.35) : (pf < 1.35 ? 1 : 0.25);
    if (rand() > near * (0.4 + 0.6 * fbm(x * 0.1, z * 0.1 + 7))) continue;
    if (inClearing(x, z, -3.5)) continue;
    if (z > 2 && Math.abs(x) < 6.5) continue; // nothing between the visitor and the pond
    fernLists[rand() < 0.5 ? 0 : 1].push(x, z, pd);
    fp += 1;
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

  return group;
}

export function placeObjectOnGround(obj: Object3D, x: number, z: number, sink = 0) {
  obj.position.set(x, heightAt(x, z) - sink, z);
}
