// What makes a forest floor read as old: stepping stones worn into the path,
// fallen trunks furred with moss, stumps, and boulders half swallowed by the
// ground.
import { BufferGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Quaternion, Texture, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLIFF_Z, LIBRARY_TREE, heightAt, inClearing, pathCurve, pathDistance, keepClear } from './layout';
import { mossMaterial } from './materials';
import { limb, rng } from './treegen';
import { barkMaterial } from './trees';
import { rockGeometry } from './cave';

export interface FloorTex { stone: Texture; stoneN: Texture; moss: Texture; mossN: Texture; noise: Texture; bark: Texture; barkN: Texture }

/** A fallen trunk lying along +x, 1 m long before scaling, with a snapped end. */
function logGeometry(seed: number): BufferGeometry {
  const r = rng(seed);
  const pts: Vector3[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    pts.push(new Vector3(t, Math.sin(t * 3 + seed) * 0.03, Math.cos(t * 2.3 + seed) * 0.04));
  }
  const log = limb(pts, (i, t, th) => {
    const jag = i === 10 ? 0.6 + 0.4 * Math.abs(Math.sin(th * 3 + seed)) : 1;
    return 0.1 * (1 - t * 0.25) * (1 + 0.06 * Math.sin(th * 9 + t * 20)) * jag;
  }, 12, 0.6);
  // a broken branch stub or two
  const parts = [log];
  for (let k = 0; k < 2; k += 1) {
    const t = 0.25 + r() * 0.5;
    const a = r() * Math.PI * 2;
    const p0 = new Vector3(t, Math.sin(a) * 0.08, Math.cos(a) * 0.08);
    const p1 = p0.clone().add(new Vector3(0.05, Math.sin(a) * 0.18, Math.cos(a) * 0.18));
    parts.push(limb([p0, p0.clone().lerp(p1, 0.5), p1], (_i, tt) => 0.025 * (1 - tt) + 0.008, 5, 0.6));
  }
  return mergeGeometries(parts)!;
}

export function buildForestFloor(tex: FloorTex, tier: 'high' | 'medium' | 'low', shadows: boolean): Group {
  const group = new Group();
  group.name = 'forest-floor';
  const r = rng(8080);
  const lo = tier === 'low';
  const q = new Quaternion(), up = new Vector3(0, 1, 0);
  const stoneMat = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.5, mossScale: 0.9, mossAmount: 0.75, mossLow: 0.15, wet: 0.8, roughness: 0.6, tint: new Color(0.78, 0.78, 0.76)
  });

  // ── stepping stones down the middle of the path ──
  const stepGeo = rockGeometry(61, 2);
  const steps: Matrix4[] = [];
  const len = pathCurve.getLength();
  const tan = new Vector3();
  for (let d = 2; d < len - 1; d += 0.72 + r() * 0.3) {
    const u = d / len;
    const p = pathCurve.getPointAt(u);
    pathCurve.getTangentAt(u, tan);
    const side = (r() - 0.5) * 0.5;
    const x = p.x - tan.z * side, z = p.z + tan.x * side;
    if (inClearing(x, z, -4) && r() < 0.4) continue;
    q.setFromAxisAngle(up, Math.atan2(tan.x, tan.z) + (r() - 0.5) * 0.6);
    const w = 0.34 + r() * 0.16;
    steps.push(new Matrix4().compose(new Vector3(x, heightAt(x, z) - 0.035, z), q.clone(), new Vector3(w * 1.25, 0.09, w)));
  }
  const stepMesh = new InstancedMesh(stepGeo, stoneMat, steps.length);
  steps.forEach((m, i) => stepMesh.setMatrixAt(i, m));
  stepMesh.computeBoundingSphere();
  stepMesh.receiveShadow = true;
  stepMesh.name = 'stepping-stones';
  group.add(stepMesh);

  // ── boulders scattered through the woods ──
  const rockGeos = [rockGeometry(71, 2), rockGeometry(72, 2), rockGeometry(73, 2)];
  const spot = (pdMin: number, pdMax: number): [number, number] | null => {
    for (let t = 0; t < 30; t += 1) {
      const z = -18 - r() * 150;
      if (z < CLIFF_Z + 3) continue;
      const x = (r() * 2 - 1) * (pdMax + 6);
      const pd = pathDistance(x, z);
      if (pd < pdMin || pd > pdMax || inClearing(x, z, 0) || keepClear(x, z, 1)) continue;
      if ((x - LIBRARY_TREE.x) ** 2 + (z - LIBRARY_TREE.z) ** 2 < 10 * 10) continue;
      return [x, z];
    }
    return null;
  };
  rockGeos.forEach((g) => {
    const mats: Matrix4[] = [];
    for (let k = 0; k < (lo ? 18 : 30); k += 1) {
      const p = spot(2.8, 32);
      if (!p) continue;
      const s = 0.35 + Math.pow(r(), 2.2) * 2.2;
      q.setFromAxisAngle(new Vector3(r() - 0.5, 1, r() - 0.5).normalize(), r() * 6);
      mats.push(new Matrix4().compose(new Vector3(p[0], heightAt(p[0], p[1]) - s * 0.3, p[1]), q.clone(), new Vector3(s * (1 + r() * 0.6), s * (0.6 + r() * 0.4), s)));
    }
    const im = new InstancedMesh(g, stoneMat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.castShadow = shadows;
    im.receiveShadow = true;
    group.add(im);
  });

  // ── fallen trunks and stumps ──
  const bark = barkMaterial({ bark: tex.bark, barkN: tex.barkN, moss: tex.moss, noise: tex.noise }, 2.2);
  const logGeos = [logGeometry(1), logGeometry(2)];
  logGeos.forEach((g) => {
    const mats: Matrix4[] = [];
    for (let k = 0; k < (lo ? 10 : 18); k += 1) {
      const p = spot(3.5, 26);
      if (!p) continue;
      const L = 3 + r() * 6, R = 1.6 + r() * 2.8;
      const yaw = r() * Math.PI * 2;
      q.setFromAxisAngle(up, yaw);
      // settle the log on the lower of its two ends
      const ex = p[0] + Math.cos(yaw) * L, ez = p[1] - Math.sin(yaw) * L;
      const y = Math.min(heightAt(p[0], p[1]), heightAt(ex, ez)) - 0.12 * R;
      mats.push(new Matrix4().compose(new Vector3(p[0], y, p[1]), q.clone(), new Vector3(L, R, R)));
    }
    const im = new InstancedMesh(g, bark, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.name = 'fallen-logs';
    group.add(im);
  });
  const stumpGeo = new CylinderGeometry(0.34, 0.5, 1, 12, 3, false);
  stumpGeo.translate(0, 0.5, 0);
  const sp = stumpGeo.getAttribute('position');
  for (let i = 0; i < sp.count; i += 1) {
    const y = sp.getY(i);
    const a = Math.atan2(sp.getZ(i), sp.getX(i));
    const k = 1 + (y < 0.3 ? 0.45 * Math.pow(Math.abs(Math.sin(a * 2.5)), 3) * (1 - y / 0.3) : 0);
    const top = y > 0.99 ? 0.12 * Math.sin(a * 3) : 0;
    sp.setXYZ(i, sp.getX(i) * k, y + top, sp.getZ(i) * k);
  }
  stumpGeo.computeVertexNormals();
  const stumps: Matrix4[] = [];
  for (let k = 0; k < (lo ? 14 : 24); k += 1) {
    const p = spot(3, 24);
    if (!p) continue;
    const s = 0.5 + r() * 0.9;
    q.setFromAxisAngle(up, r() * 6);
    stumps.push(new Matrix4().compose(new Vector3(p[0], heightAt(p[0], p[1]) - 0.15, p[1]), q.clone(), new Vector3(s, s * (0.6 + r() * 0.9), s)));
  }
  const sm = new InstancedMesh(stumpGeo, bark, stumps.length);
  stumps.forEach((m, i) => sm.setMatrixAt(i, m));
  sm.computeBoundingSphere();
  sm.castShadow = shadows;
  sm.receiveShadow = true;
  group.add(sm);
  return group;
}
