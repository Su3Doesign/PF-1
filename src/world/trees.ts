import {
  BufferGeometry, BufferAttribute, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, Texture, Vector3, CatmullRomCurve3, TubeGeometry, Color, SphereGeometry, MeshBasicMaterial
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, inClearing, pathDistance, pondFactor, LIBRARY_TREE, fbm, CLIFF_Z, CAVE_MOUTH, keepClear } from './layout';
import { rng, sugi, broadleaf, leafMaterial, TreeGeo } from './treegen';

export function barkMaterial(tex: { bark: Texture; barkN: Texture; moss: Texture; noise: Texture }, mossiness = 1): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: tex.bark, normalMap: tex.barkN, roughness: 0.92, envMapIntensity: 0.2 });
  m.normalScale.set(1.2, 1.2);
  const u = { tMoss: { value: tex.moss }, tNoise: { value: tex.noise }, uMossy: { value: mossiness } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;')
      .replace('#include <worldpos_vertex>', /* glsl */ `#include <worldpos_vertex>
        vec4 tw4 = vec4(transformed, 1.0);
        vec3 tn = objectNormal;
        #ifdef USE_INSTANCING
          tw4 = instanceMatrix * tw4; tn = mat3(instanceMatrix) * tn;
        #endif
        vTW = (modelMatrix * tw4).xyz; vTN = normalize(mat3(modelMatrix) * tn);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMoss, tNoise;\nuniform float uMossy;\nvarying vec3 vTW;\nvarying vec3 vTN;\nfloat tMossK;')
      .replace('#include <map_fragment>', /* glsl */ `
        #include <map_fragment>
        float n1 = texture2D(tNoise, vec2(vTW.x * 0.11 + vTW.z * 0.07, vTW.y * 0.09)).r;
        float n2 = texture2D(tNoise, vec2(vTW.x * 0.5 + vTW.z * 0.3, vTW.y * 0.45)).g;
        float low = smoothstep(2.8 + n1 * 2.5, 0.2, vTW.y);
        float side = smoothstep(-0.2, 0.8, dot(normalize(vTN), normalize(vec3(-0.6, 0.2, 0.8))) + (n2 - 0.5) * 0.8);
        tMossK = clamp(max(low * 0.95, side * smoothstep(9.0, 1.0, vTW.y) * 0.75) * uMossy * smoothstep(0.25, 0.55, n2 + n1 * 0.4), 0.0, 1.0);
        vec3 mc = texture2D(tMoss, vec2(vTW.x + vTW.z, vTW.y) * 0.6).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, mc, tMossK);
        diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(-0.2, 1.4, vTW.y));
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, tMossK);');
  };
  m.customProgramCacheKey = () => 'bark';
  return m;
}

export interface TreeResult { group: Group; positions: { x: number; z: number; h: number; r: number }[] }
export interface TreeTex { bark: Texture; barkN: Texture; moss: Texture; noise: Texture; conifer: Texture; broad: Texture }

type Kind = 'sugi' | 'maple' | 'keyaki';

// autumn maples: the colour in the walk
const MAPLE = [new Color(0.95, 0.16, 0.08), new Color(0.78, 0.07, 0.07), new Color(1.0, 0.42, 0.1), new Color(1.0, 0.66, 0.18), new Color(0.5, 0.62, 0.18)];

/** Lowest ground under a footprint, so no trunk ever hangs over a slope. */
export function groundUnder(x: number, z: number, r: number): number {
  let m = heightAt(x, z);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    m = Math.min(m, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return m;
}

export function buildTrees(count: number, tex: TreeTex, shadows: boolean, detail = 1, farCount = 0, saplingCount = 0): TreeResult {
  const group = new Group();
  group.name = 'trees';
  const rand = rng(77);
  const variants: { kind: Kind; geo: TreeGeo; far?: boolean }[] = [
    { kind: 'sugi', geo: sugi(11, 24, 0.46, detail) },
    { kind: 'sugi', geo: sugi(23, 29, 0.6, detail) },
    { kind: 'sugi', geo: sugi(37, 20, 0.38, detail) },
    { kind: 'maple', geo: broadleaf(41, { H: 7.5, r0: 0.2, fork: 1.7, R: 4.2, Rh: 2.2, leaders: 4, vase: 0.2, card: 1.7, count: 120 }, detail) },
    { kind: 'maple', geo: broadleaf(53, { H: 9.5, r0: 0.26, fork: 2.2, R: 5.0, Rh: 2.6, leaders: 5, vase: 0.35, card: 1.9, count: 150 }, detail) },
    { kind: 'keyaki', geo: broadleaf(67, { H: 17, r0: 0.55, fork: 3.6, R: 6.6, Rh: 4.4, leaders: 5, vase: 1, card: 2.5, count: 210 }, detail) },
    // light versions for the far ridges and for saplings
    { kind: 'sugi', geo: sugi(13, 24, 0.46, -1), far: true },
    { kind: 'sugi', geo: sugi(29, 28, 0.58, -1), far: true },
    { kind: 'sugi', geo: sugi(43, 20, 0.4, -1), far: true },
    { kind: 'maple', geo: broadleaf(47, { H: 8, r0: 0.22, fork: 1.8, R: 4.4, Rh: 2.3, leaders: 4, vase: 0.3, card: 1.8, count: 120 }, -1), far: true },
    { kind: 'keyaki', geo: broadleaf(71, { H: 16, r0: 0.5, fork: 3.4, R: 6.2, Rh: 4.2, leaders: 5, vase: 1, card: 2.4, count: 200 }, -1), far: true }
  ];
  const FAR0 = 6;
  const bark = barkMaterial(tex);
  const needles = leafMaterial({ map: tex.conifer, sway: 0.5, height: 26, trans: 0.18 });
  const leaves = leafMaterial({ map: tex.broad, sway: 0.35, height: 12, trans: 0.4 });

  const pts: { x: number; z: number; v: number; s: number; h: number; r: number }[] = [];
  const grid = new Map<string, { x: number; z: number }[]>();
  const ok = (x: number, z: number, minD: number) => {
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    for (let i = -2; i <= 2; i += 1) for (let j = -2; j <= 2; j += 1) {
      const arr = grid.get(`${gx + i},${gz + j}`);
      if (!arr) continue;
      for (const p of arr) if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
    }
    return true;
  };
  const pick = (near: boolean, pond: boolean): number => {
    const k = rand();
    if (pond) return k < 0.5 ? 3 + Math.floor(rand() * 2) : Math.floor(rand() * 3);
    if (near) return k < 0.3 ? 3 + Math.floor(rand() * 2) : k < 0.42 ? 5 : Math.floor(rand() * 3);
    return k < 0.14 ? 5 : Math.floor(rand() * 3);
  };
  let tries = 0;
  while (pts.length < count && tries < count * 60) {
    tries += 1;
    const z = 30 - rand() * 199;
    let x: number, near = false, pond = false;
    if (z > -22) {
      x = (rand() < 0.5 ? -1 : 1) * (8 + rand() * 34);
      if (pondFactor(x, z) < 1.2) continue;
      if (z > 5 && Math.abs(x) < 11) continue;
      pond = pondFactor(x, z) < 1.8;
    } else {
      x = (rand() * 2 - 1) * 40;
      const pd = pathDistance(x, z);
      if (pd < 3.8 + rand() * 1.5) continue;
      if (pd > 34) continue;
      if (inClearing(x, z, 1)) continue;
      if ((x - LIBRARY_TREE.x) ** 2 + (z - LIBRARY_TREE.z) ** 2 < 15 * 15) continue;
      if (z < CLIFF_Z + 5 && Math.abs(x - CAVE_MOUTH.x) < 9) continue;
      if (keepClear(x, z, 2.5)) continue;
      near = pd < 9 || inClearing(x, z, 6);
    }
    const v = pick(near, pond);
    const kind = variants[v].kind;
    const minD = kind === 'keyaki' ? 7 : kind === 'maple' ? 4.2 : 2.8;
    if (!ok(x, z, minD)) continue;
    const s = 0.85 + rand() * 0.35;
    const p = { x, z, v, s, h: variants[v].geo.height * s, r: variants[v].geo.foot * s };
    pts.push(p);
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
  }
  // a tree line along the top of the cliff, black against the sky
  for (let x = -70; x < 70; x += 3.2 + rand() * 3) {
    const z = CLIFF_Z - 3 - rand() * 12;
    pts.push({ x, z, v: FAR0 + Math.floor(rand() * 3), s: 0.9 + rand() * 0.4, h: 0, r: 0, top: true } as typeof pts[0] & { top: boolean });
  }
  // the far forest: ridges of trees up the valley walls on both sides, so there
  // is always another layer of trunks behind the last one
  let ft = 0, placedFar = 0;
  while (placedFar < farCount && ft < farCount * 50) {
    ft += 1;
    const z = 40 - rand() * 208;
    if (z < CLIFF_Z + 3) continue;
    const x = (rand() * 2 - 1) * 118;
    const pd = pathDistance(x, z);
    const lateral = z > -22 ? Math.abs(x) : pd;
    if (lateral < (z > -22 ? 40 : 30) || lateral > 92) continue;
    if (z > -22 && pondFactor(x, z) < 1.6) continue;
    const kr = rand();
    const v = FAR0 + (kr < 0.72 ? Math.floor(rand() * 3) : kr < 0.85 ? 3 : 4);
    if (!ok(x, z, 3.4)) continue;
    const s = 0.85 + rand() * 0.45;
    const p = { x, z, v, s, h: 0, r: 0 };
    pts.push(p);
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
    placedFar += 1;
  }
  // saplings and young trees: they fill the band at eye height between trunks
  let st = 0, placedS = 0;
  while (placedS < saplingCount && st < saplingCount * 40) {
    st += 1;
    const z = 30 - rand() * 197;
    if (z < CLIFF_Z + 4) continue;
    const x = (rand() * 2 - 1) * 60;
    const pd = pathDistance(x, z);
    if (z > -22) { if (pondFactor(x, z) < 1.3 || (z > 2 && Math.abs(x) < 9) || Math.abs(x) < 10) continue; }
    else if (pd < 5.5 || pd > 42 || inClearing(x, z, 0)) continue;
    if ((x - LIBRARY_TREE.x) ** 2 + (z - LIBRARY_TREE.z) ** 2 < 13 * 13) continue;
    if (keepClear(x, z, 1.5)) continue;
    if (!ok(x, z, 1.8)) continue;
    const kr = rand();
    const v = kr < 0.55 ? FAR0 + 2 : kr < 0.8 ? FAR0 + 3 : FAR0;
    const s = v === FAR0 + 3 ? 0.45 + rand() * 0.3 : 0.24 + rand() * 0.2;
    const p = { x, z, v, s, h: 0, r: 0 };
    pts.push(p);
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
    placedS += 1;
  }

  const m4 = new Matrix4(), q = new Quaternion(), sv = new Vector3(), pv = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const col = new Color();
  variants.forEach((vt, vi) => {
    const list = pts.filter((p) => p.v === vi);
    const bands = new Map<number, typeof list>();
    for (const p of list) {
      const b = Math.floor(p.z / (vt.far ? 120 : 80));
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b)!.push(p);
    }
    for (const band of bands.values()) {
      const trunks = new InstancedMesh(vt.geo.trunk, bark, band.length);
      const crowns = new InstancedMesh(vt.geo.crown, vt.kind === 'sugi' ? needles : leaves, band.length);
      band.forEach((p, i) => {
        const top = (p as { top?: boolean }).top;
        q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
        sv.set(p.s, p.s * (0.92 + rand() * 0.16), p.s);
        const y = top ? cliffTop(p.x, p.z) : groundUnder(p.x, p.z, vt.geo.foot * p.s) - 0.3;
        m4.compose(pv.set(p.x, y, p.z), q, sv);
        trunks.setMatrixAt(i, m4);
        crowns.setMatrixAt(i, m4);
        if (vt.kind === 'maple') {
          // red and orange near the walk, a few still green
          col.copy(MAPLE[Math.floor(rand() * MAPLE.length)]).multiplyScalar(0.85 + rand() * 0.3);
        } else if (vt.kind === 'keyaki') {
          col.setRGB(0.42 + rand() * 0.12, 0.58 + rand() * 0.1, 0.22 + rand() * 0.06);
        } else {
          const k = 0.8 + rand() * 0.35;
          col.setRGB(k, k * (0.95 + rand() * 0.1), k);
        }
        crowns.setColorAt(i, col);
      });
      for (const m of [trunks, crowns]) {
        m.computeBoundingSphere();
        m.castShadow = shadows && !vt.far;
        m.receiveShadow = true;
        group.add(m);
      }
      trunks.name = 'trunks';
      crowns.name = 'crowns';
    }
  });

  // the library tree: ancient, buttressed, a golden crown over the ring of studies
  const lib = broadleaf(404, { H: 30, r0: 1.7, fork: 8.5, R: 12.5, Rh: 6.5, leaders: 6, vase: 0.55, card: 3.4, count: 460 }, 1);
  const big = new Mesh(lib.trunk, barkMaterial(tex, 1.4));
  big.position.set(LIBRARY_TREE.x, groundUnder(LIBRARY_TREE.x, LIBRARY_TREE.z, 3.5) - 0.2, LIBRARY_TREE.z);
  big.castShadow = shadows;
  big.receiveShadow = true;
  big.name = 'library-tree';
  group.add(big);
  const gold = leafMaterial({ map: tex.broad, sway: 0.5, height: 30, trans: 0.7, color: new Color(1.0, 0.72, 0.22), emissive: new Color(0.09, 0.05, 0.0) });
  const crown = new Mesh(lib.crown, gold);
  crown.position.copy(big.position);
  crown.castShadow = shadows;
  crown.name = 'library-crown';
  group.add(crown);
  const roots: BufferGeometry[] = [];
  const rr = rng(505);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + rr() * 0.4;
    const len = 4 + rr() * 4;
    const pts3 = [0, 0.35, 0.7, 1].map((t) => {
      const d = 1.6 + t * len;
      const y = (1.6 - t * 1.9) + Math.sin(t * Math.PI) * 0.5;
      return new Vector3(Math.cos(a) * d, y, Math.sin(a) * d);
    });
    const curve = new CatmullRomCurve3(pts3);
    const tube = new TubeGeometry(curve, 20, 0.45 - 0.1 * rr(), 8, false);
    const tp = tube.getAttribute('position') as BufferAttribute;
    const tuv = tube.getAttribute('uv') as BufferAttribute;
    for (let k = 0; k < tuv.count; k += 1) tuv.setXY(k, tuv.getX(k) * len / 1.7, tuv.getY(k) * 2);
    for (let k = 0; k < tp.count; k += 1) {
      const t = Math.floor(k / 9) / 20;
      const c = curve.getPointAt(Math.min(1, t));
      const dx = tp.getX(k) - c.x, dy = tp.getY(k) - c.y, dz = tp.getZ(k) - c.z;
      const f = 1 - t * 0.75;
      tp.setXYZ(k, c.x + dx * f, c.y + dy * f, c.z + dz * f);
    }
    tube.computeVertexNormals();
    roots.push(tube);
  }
  const rootMesh = new Mesh(mergeGeometries(roots)!, big.material);
  rootMesh.position.copy(big.position);
  rootMesh.castShadow = shadows;
  rootMesh.receiveShadow = true;
  group.add(rootMesh);

  return { group, positions: pts.filter((p) => p.h > 0).map((p) => ({ x: p.x, z: p.z, h: p.h, r: p.r })) };
}

/** Height of the ground on top of the cliff (only the tree line uses it). */
export function cliffTop(x: number, z: number): number {
  return 34 + (fbm(x * 0.05, z * 0.05) - 0.5) * 10 + Math.max(0, CLIFF_Z - z) * 0.4;
}

/** Bioluminescent mushrooms around roots, rocks and the path edge. */
export function buildMushrooms(count: number): InstancedMesh {
  const cap = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(1, 0.55, 1);
  const stem = new CylinderGeometry(0.28, 0.35, 1, 6, 1, true);
  stem.translate(0, -0.5, 0);
  const geo = mergeGeometries([cap, stem])!;
  geo.translate(0, 1, 0);
  const mat = new MeshBasicMaterial({ color: new Color(0.25, 1.6, 1.1) });
  const mesh = new InstancedMesh(geo, mat, count);
  const r = rng(909);
  const m4 = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3();
  const col = new Color();
  let n = 0;
  while (n < count) {
    // clusters
    let cx: number, cz: number;
    if (r() < 0.35) {
      const a = r() * Math.PI * 2, d = 2 + r() * 7;
      cx = LIBRARY_TREE.x + Math.cos(a) * d; cz = LIBRARY_TREE.z + Math.sin(a) * d;
    } else {
      cz = -24 - r() * 160; cx = (r() * 2 - 1) * 9;
      const pd = pathDistance(cx, cz);
      if (pd < 1.6 || pd > 7) continue;
    }
    const k = 3 + Math.floor(r() * 5);
    for (let i = 0; i < k && n < count; i += 1) {
      const x = cx + (r() - 0.5) * 0.8, z = cz + (r() - 0.5) * 0.8;
      const sc = 0.03 + r() * 0.06;
      q.setFromAxisAngle(new Vector3(r() - 0.5, 4, r() - 0.5).normalize(), r() * 0.4);
      m4.compose(p.set(x, heightAt(x, z) - 0.01, z), q, s.set(sc, sc * (0.8 + r() * 0.8), sc));
      mesh.setMatrixAt(n, m4);
      const hue = r();
      col.setRGB(0.2 + hue * 0.4, 1.2 + r() * 0.8, 0.9 + (1 - hue) * 0.8);
      mesh.setColorAt(n, col);
      n += 1;
    }
  }
  mesh.computeBoundingSphere();
  mesh.name = 'mushrooms';
  return mesh;
}
