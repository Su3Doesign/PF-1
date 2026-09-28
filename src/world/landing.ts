// The pond at the start, dressed so it sits inside the forest rather than on
// a stage: reeds and cattails in the shallows, lilies, mossy boulders on the
// banks, two red maples arching into the frame, a bioluminescent willow
// trailing into the water on the left, and a bamboo grove on the right.
import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, PlaneGeometry, Quaternion, SphereGeometry, Texture, Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POND, heightAt, pondFactor, fbm } from './layout';
import { mossMaterial, windLambert } from './materials';
import { Cards, leafMaterial, limb, rng, tuftGeometry } from './treegen';
import { barkMaterial, groundUnder } from './trees';
import { rockGeometry } from './cave';
import { lotusGeometry } from './hall';
import { LAYER_NO_REFLECT } from './water';
import type { Emitter } from './props';

export interface LandingTex {
  tuft: Texture; bamboo: Texture; willow: Texture; lilypad: Texture; broad: Texture;
  stone: Texture; stoneN: Texture; moss: Texture; mossN: Texture; noise: Texture; bark: Texture; barkN: Texture;
}

/** A point on the pond's rim: f < 1 is in the water, > 1 on the bank. */
function rim(a: number, f: number): [number, number] {
  return [POND.cx + Math.cos(a) * POND.rx * f, POND.cz + Math.sin(a) * POND.rz * f];
}

/** Cattail: a thin stem and a brown seed head, 1.5 m. */
function cattailGeometry(): BufferGeometry {
  const stem = new CylinderGeometry(0.004, 0.007, 1.5, 5, 1, true).toNonIndexed();
  stem.translate(0, 0.75, 0);
  const head = new CylinderGeometry(0.019, 0.019, 0.17, 8, 1).toNonIndexed();
  head.translate(0, 1.3, 0);
  const tip = new CylinderGeometry(0.002, 0.004, 0.14, 4, 1, true).toNonIndexed();
  tip.translate(0, 1.46, 0);
  const g = mergeGeometries([stem, head, tip])!;
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const sc = stem.getAttribute('position').count, hc = head.getAttribute('position').count;
  for (let i = 0; i < n; i += 1) {
    const c = i < sc ? [0.28, 0.36, 0.16] : i < sc + hc ? [0.3, 0.17, 0.08] : [0.35, 0.33, 0.2];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** One bamboo culm, 10 m, with swollen nodes, and a crown of leaf sprays. */
function bambooGeometry(seed: number): { culm: BufferGeometry; leaves: BufferGeometry } {
  const r = rng(seed);
  const H = 10;
  const radial = 8, rows = 40;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rows; j += 1) {
    const y = -0.3 + (j / rows) * (H + 0.3);
    const seg = (y % 0.42) / 0.42;
    const node = Math.exp(-((seg - 0.02) ** 2) / 0.002) + Math.exp(-((seg - 1) ** 2) / 0.002);
    const rad = 0.05 * (1 - 0.35 * (y / H)) * (1 + 0.12 * node);
    const bend = (y / H) ** 2 * 0.35;
    const shade = 0.75 + 0.25 * (1 - node) - 0.2 * (y / H);
    for (let k = 0; k <= radial; k += 1) {
      const th = (k / radial) * Math.PI * 2;
      pos.push(Math.cos(th) * rad + bend, y, Math.sin(th) * rad);
      nor.push(Math.cos(th), 0, Math.sin(th));
      col.push(0.52 * shade, 0.6 * shade, 0.3 * shade);
    }
  }
  const row = radial + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let k = 0; k < radial; k += 1) {
      const a = j * row + k, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const culm = new BufferGeometry();
  culm.setAttribute('position', new Float32BufferAttribute(pos, 3));
  culm.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  culm.setAttribute('color', new Float32BufferAttribute(col, 3));
  culm.setIndex(idx);
  const cards = new Cards();
  for (let k = 0; k < 26; k += 1) {
    const y = 4.2 + r() * 5.6;
    const a = r() * Math.PI * 2;
    const out = new Vector3(Math.cos(a), 0.2, Math.sin(a));
    const reach = 0.4 + r() * 1.1 * (1 - (y - 4) / 8);
    const p = new Vector3(Math.cos(a) * reach + ((y / H) ** 2) * 0.35, y, Math.sin(a) * reach);
    cards.add(p, out, 1.1 + r() * 0.6, 0.6 + 0.4 * (y / H), r, { tilt: 0.8 });
  }
  return { culm, leaves: cards.geometry() };
}

export function buildLanding(tex: LandingTex, tier: 'high' | 'medium' | 'low', shadows: boolean): { group: Group; emitters: Emitter[] } {
  const group = new Group();
  group.name = 'landing';
  const r = rng(2323);
  const emitters: Emitter[] = [];
  const lo = tier === 'low';
  const m4 = new Matrix4(), q = new Quaternion(), sv = new Vector3(), pv = new Vector3(), up = new Vector3(0, 1, 0);
  // the view from the bank: keep the middle of the water open
  const inView = (x: number, z: number) => z > 2 && Math.abs(x) < 4.2 + (z - 2) * 0.2;

  // ── reeds and cattails in the shallows ──
  const reeds: Matrix4[] = [], cats: Matrix4[] = [];
  const nClumps = lo ? 34 : 56;
  for (let c = 0; c < nClumps; c += 1) {
    const a = r() * Math.PI * 2;
    const [cx, cz] = rim(a, 0.93 + r() * 0.1);
    if (inView(cx, cz)) continue;
    // fewer behind the letters, where they would crowd the name
    if (cz < -10 && Math.abs(cx) < 12 && r() < 0.7) continue;
    const n = 4 + Math.floor(r() * 7);
    for (let k = 0; k < n; k += 1) {
      const x = cx + (r() - 0.5) * 1.6, z = cz + (r() - 0.5) * 1.6;
      if (inView(x, z)) continue;
      const y = Math.min(heightAt(x, z), -0.05) - 0.05;
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      const w = 0.45 + r() * 0.35;
      reeds.push(new Matrix4().compose(new Vector3(x, y, z), q.clone(), new Vector3(w, 1.3 + r() * 0.9, w)));
      if (r() < 0.45) {
        q.setFromAxisAngle(new Vector3(r() - 0.5, 8, r() - 0.5).normalize(), r() * 6);
        const s = 0.8 + r() * 0.45;
        cats.push(new Matrix4().compose(new Vector3(x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3), q.clone(), new Vector3(s, s, s)));
      }
    }
  }
  const reedMat = leafMaterial({ map: tex.tuft, alphaTest: 0.42, sway: 0.28, height: 2, trans: 0.3, color: new Color(0.78, 0.9, 0.62) });
  const reedMesh = new InstancedMesh(tuftGeometry(), reedMat, reeds.length);
  reeds.forEach((mm, i) => reedMesh.setMatrixAt(i, mm));
  const catMesh = new InstancedMesh(cattailGeometry(), windLambert({ vertexColors: true, bend: 0.06 }), lo ? 0 : cats.length);
  if (!lo) cats.forEach((mm, i) => catMesh.setMatrixAt(i, mm));
  for (const im of [reedMesh, catMesh]) { im.computeBoundingSphere(); group.add(im); }
  reedMesh.name = 'reeds';

  // ── lilies in the still water near the banks ──
  const padGeo = new PlaneGeometry(1, 1);
  padGeo.rotateX(-Math.PI / 2);
  const pads: { m: Matrix4; c: Color }[] = [], lot: { m: Matrix4; c: Color }[] = [];
  for (let c = 0; c < (lo ? 14 : 22); c += 1) {
    const a = r() * Math.PI * 2;
    const [cx, cz] = rim(a, 0.62 + r() * 0.28);
    if (inView(cx, cz) || (Math.abs(cx) < 11 && Math.abs(cz + 9) < 3)) continue;
    const n = 3 + Math.floor(r() * 8);
    for (let k = 0; k < n; k += 1) {
      const x = cx + (r() - 0.5) * 2.4, z = cz + (r() - 0.5) * 2.4;
      if (pondFactor(x, z) > 0.97 || inView(x, z)) continue;
      const s = 0.4 + r() * 0.5;
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      m4.compose(pv.set(x, 0.012 + r() * 0.003, z), q, sv.set(s, 1, s));
      const g = 0.7 + r() * 0.35;
      pads.push({ m: m4.clone(), c: new Color(g, g, g * 0.9) });
      if (r() < 0.16) {
        const ls = 0.8 + r() * 0.5;
        lot.push({ m: new Matrix4().compose(new Vector3(x, 0.03, z), q.clone(), new Vector3(ls, ls, ls)), c: r() < 0.5 ? new Color(1, 1, 1) : new Color(1, 0.75, 0.88) });
      }
    }
  }
  const padMesh = new InstancedMesh(padGeo, new MeshLambertMaterial({ map: tex.lilypad, alphaTest: 0.5, side: DoubleSide }), pads.length);
  pads.forEach((p, i) => { padMesh.setMatrixAt(i, p.m); padMesh.setColorAt(i, p.c); });
  padMesh.layers.set(LAYER_NO_REFLECT);
  const lotusMesh = new InstancedMesh(lotusGeometry(), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: new Color(0.18, 0.1, 0.14) }), lot.length);
  lot.forEach((p, i) => { lotusMesh.setMatrixAt(i, p.m); lotusMesh.setColorAt(i, p.c); });
  for (const im of [padMesh, lotusMesh]) { im.computeBoundingSphere(); group.add(im); }

  // ── mossy boulders on the banks, half in the water ──
  const stone = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.35, mossScale: 0.8, mossAmount: 1.2, mossLow: 0.3, wet: 1.2, roughness: 0.6, tint: new Color(0.7, 0.72, 0.72)
  });
  const rockGeos = [rockGeometry(21), rockGeometry(22), rockGeometry(23)];
  rockGeos.forEach((g, gi) => {
    const mats: Matrix4[] = [];
    for (let k = 0; k < (lo ? 14 : 22); k += 1) {
      const a = r() * Math.PI * 2;
      const [x, z] = rim(a, 0.97 + r() * 0.2);
      if (inView(x, z) || (k + gi) % 3 !== 0 && r() < 0.2) continue;
      const s = 0.45 + Math.pow(r(), 2) * 1.6;
      q.setFromAxisAngle(new Vector3(r() - 0.5, 1, r() - 0.5).normalize(), r() * 6);
      mats.push(new Matrix4().compose(new Vector3(x, Math.min(heightAt(x, z), 0.1) - s * 0.3, z), q.clone(), new Vector3(s * (1 + r() * 0.5), s * 0.8, s)));
    }
    const im = new InstancedMesh(g, stone, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    im.castShadow = shadows;
    im.receiveShadow = true;
    group.add(im);
  });

  // ── maple limbs reaching in over the water from behind the visitor ──
  // Their trunks stand behind the camera; only the long, leaf-hung limbs enter
  // the frame, along its top corners, and in the pond's reflection.
  const bark = barkMaterial({ bark: tex.bark, barkN: tex.barkN, moss: tex.moss, noise: tex.noise }, 1.1);
  const mapleLeaves = leafMaterial({ map: tex.broad, sway: 0.25, height: 6, trans: 0.55 });
  const reach = (side: number, seed: number) => {
    const rr = rng(seed);
    const s = side;
    const base = new Vector3(s * 6.8, 0, 16.2);
    const gy = groundUnder(base.x, base.z, 0.6) - 0.4;
    const trunk = [0, 0.3, 0.65, 1].map((t) => new Vector3(s * (6.8 - t * 0.9), gy + t * 5.2, 16.2 - t * 1.4));
    const limbPts = [trunk[3], new Vector3(s * 5.3, gy + 5.6, 12.4), new Vector3(s * 4.1, gy + 5.3, 9.0), new Vector3(s * 3.0, gy + 4.9, 6.4), new Vector3(s * 2.1, gy + 4.5, 4.2)];
    const wood = [
      limb(trunk, (_i, t, th) => 0.34 * (1 - t * 0.35) * (1 + 0.8 * Math.exp(-t * 7) * (0.5 + Math.abs(Math.sin(th * 2.5)))), 12),
      limb(limbPts, (_i, t) => 0.22 * (1 - t * 0.85) + 0.02, 9)
    ];
    const cards = new Cards();
    const curve = limbPts;
    const at = (t: number) => {
      const f = t * (curve.length - 1), i = Math.min(curve.length - 2, Math.floor(f));
      return curve[i].clone().lerp(curve[i + 1], f - i);
    };
    // twigs off the limb, each ending in a hanging spray of leaves
    for (let k = 0; k < 16; k += 1) {
      const t = 0.25 + (k / 15) * 0.75;
      const p0 = at(t);
      const a = rr() * Math.PI * 2;
      const tw = p0.clone().add(new Vector3(Math.cos(a) * 0.9, -0.2 - rr() * 0.5, Math.sin(a) * 0.9));
      wood.push(limb([p0, p0.clone().lerp(tw, 0.5).add(new Vector3(0, 0.1, 0)), tw], (_i, tt) => 0.04 * (1 - tt) + 0.008, 5));
      for (let j = 0; j < 5; j += 1) {
        const c = tw.clone().add(new Vector3((rr() - 0.5) * 0.9, -rr() * 1.1, (rr() - 0.5) * 0.9));
        cards.add(c, new Vector3(Math.cos(a), -0.3, Math.sin(a)), 0.8 + rr() * 0.6, 0.6 + 0.4 * rr(), rr, { tilt: 1.0 });
      }
    }
    return { wood: mergeGeometries(wood)!, leaves: cards.geometry() };
  };
  const MAPLE_TINT = [new Color(0.98, 0.2, 0.09), new Color(1.0, 0.42, 0.12)];
  [-1, 1].forEach((side, i) => {
    const b = reach(side, 31 + i * 7);
    const w = new Mesh(b.wood, bark);
    w.castShadow = shadows;
    group.add(w);
    const l = new InstancedMesh(b.leaves, mapleLeaves, 1);
    l.setMatrixAt(0, new Matrix4());
    l.setColorAt(0, MAPLE_TINT[i]);
    l.computeBoundingSphere();
    l.castShadow = shadows;
    group.add(l);
  });

  // ── a willow that glows, trailing into the water on the left bank ──
  const WX = -17.6, WZ = -15.6;
  const wy = groundUnder(WX, WZ, 1.2) - 0.3;
  const trunkPts = [0, 0.2, 0.45, 0.7, 1].map((t) => new Vector3(Math.sin(t * 2.2) * 0.5 + t * 1.4, -1 + t * 5.2, Math.cos(t * 1.7) * 0.3));
  const wtrunk = new Mesh(mergeGeometries([
    limb(trunkPts, (_i, t, th) => 0.62 * (1 - t * 0.45) * (1 + 0.7 * Math.exp(-t * 6) * (0.5 + Math.abs(Math.sin(th * 2.5)))), 14),
    ...[0, 1, 2, 3, 4].map((k) => {
      const a = k * 1.3 + 0.4;
      const base = trunkPts[4];
      const pts = [0, 0.33, 0.66, 1].map((t) => new Vector3(base.x + Math.cos(a) * 3.4 * t, base.y + Math.sin(t * Math.PI) * 1.5 - t * 0.4, base.z + Math.sin(a) * 3.4 * t));
      return limb(pts, (_i, t) => 0.26 * (1 - t * 0.8), 7);
    })
  ])!, bark);
  wtrunk.position.set(WX, wy, WZ);
  wtrunk.castShadow = shadows;
  group.add(wtrunk);
  const strandGeo = new PlaneGeometry(0.75, 4.6);
  strandGeo.translate(0, -2.3, 0);
  const willowMat = leafMaterial({ map: tex.willow, alphaTest: 0.35, sway: 0.35, height: 4.6, trans: 1.6, hang: true, color: new Color(0.5, 0.95, 1.05) });
  const strands: Matrix4[] = [];
  const nS = lo ? 150 : 260;
  const top = trunkPts[4];
  for (let k = 0; k < nS; k += 1) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 4.6;
    const x = WX + top.x + Math.cos(a) * rr, z = WZ + top.z + Math.sin(a) * rr;
    const y = wy + top.y + 1.6 - (rr / 4.6) ** 2 * 2.4 + (r() - 0.5) * 0.4;
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    const len = 0.7 + r() * 0.55;
    strands.push(new Matrix4().compose(new Vector3(x, y, z), q.clone(), new Vector3(1, Math.min(len, (y - 0.15) / 4.6), 1)));
  }
  const strandMesh = new InstancedMesh(strandGeo, willowMat, strands.length);
  strands.forEach((mm, i) => strandMesh.setMatrixAt(i, mm));
  strandMesh.computeBoundingSphere();
  strandMesh.name = 'willow';
  group.add(strandMesh);
  emitters.push({ pos: new Vector3(WX + top.x, wy + 3.2, WZ + top.z), color: new Color(0.25, 0.85, 1.0), intensity: 3.2, range: 10, level: () => 1 });
  // spores of light drifting down from it
  const orb = new InstancedMesh(new SphereGeometry(0.03, 6, 4), new MeshLambertMaterial({ color: 0x000000, emissive: new Color(0.5, 1.4, 1.6) }), 40);
  for (let k = 0; k < 40; k += 1) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 4.2;
    orb.setMatrixAt(k, new Matrix4().makeTranslation(WX + top.x + Math.cos(a) * rr, wy + 0.8 + r() * 4, WZ + top.z + Math.sin(a) * rr));
  }
  orb.layers.set(LAYER_NO_REFLECT);
  if (!lo) group.add(orb);

  // ── a bamboo grove on the right bank ──
  const bam = [bambooGeometry(3), bambooGeometry(9)];
  const culmMat = leafMaterial({ sway: 0.6, height: 10, trans: 0.1 });
  const bamLeaves = leafMaterial({ map: tex.bamboo, alphaTest: 0.45, sway: 0.6, height: 10, trans: 0.4 });
  const spots: { x: number; z: number }[] = [];
  const nB = lo ? 55 : 95;
  for (let k = 0; k < nB * 6 && spots.length < nB; k += 1) {
    const x = 17 + r() * 22, z = -24 + r() * 30;
    if (pondFactor(x, z) < 1.18) continue;
    if (fbm(x * 0.2, z * 0.2) < 0.38) continue; // clumps, not a lawn
    spots.push({ x, z });
  }
  bam.forEach((b, bi) => {
    const list = spots.filter((_, i) => i % 2 === bi);
    const cm = new InstancedMesh(b.culm, culmMat, list.length);
    const lm = new InstancedMesh(b.leaves, bamLeaves, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, r() - 0.5).normalize(), (r() - 0.5) * 0.12));
      const s = 0.7 + r() * 0.5;
      m4.compose(pv.set(p.x, groundUnder(p.x, p.z, 0.2) - 0.1, p.z), q, sv.set(0.9 + r() * 0.5, s, 0.9 + r() * 0.5));
      cm.setMatrixAt(i, m4);
      lm.setMatrixAt(i, m4);
      lm.setColorAt(i, new Color(0.85 + r() * 0.3, 0.9 + r() * 0.2, 0.8));
    });
    for (const im of [cm, lm]) { im.computeBoundingSphere(); im.castShadow = shadows; group.add(im); }
  });

  return { group, emitters };
}
