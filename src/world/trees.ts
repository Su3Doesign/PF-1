import {
  BufferGeometry, BufferAttribute, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, Texture, Vector3, CatmullRomCurve3, TubeGeometry, Color, SphereGeometry, MeshBasicMaterial
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, inClearing, pathDistance, pondFactor, LIBRARY_TREE, fbm } from './layout';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function trunkGeometry(r0: number, H: number, seed: number, flareAmt = 1.2, radial = 22, rows = 30): BufferGeometry {
  const g = new CylinderGeometry(1, 1, 1, radial, rows, true);
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute('position') as BufferAttribute;
  const uv = g.getAttribute('uv') as BufferAttribute;
  const r = rng(seed);
  const phase = r() * 6, lean = (r() - 0.5) * 0.6, leanZ = (r() - 0.5) * 0.6;
  const around = Math.max(2, Math.round((Math.PI * 2 * r0) / 1.1));
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), yN = pos.getY(i), z = pos.getZ(i);
    // compress rows toward the base where the flare needs detail
    const t = Math.pow(yN, 1.6);
    const y = t * H;
    const th = Math.atan2(z, x);
    const taper = 1 - 0.45 * t;
    const buttress = Math.pow(Math.abs(Math.sin(th * 2.5 + phase)), 3);
    const flare = flareAmt * Math.exp(-y * 2.0) * (0.45 + 0.9 * buttress);
    const furrow = 0.035 * Math.sin(th * 16 + fbm(th * 3, y * 0.4) * 4) + 0.02 * (fbm(th * 5, y * 0.8) - 0.5);
    const rad = r0 * taper * (1 + flare) * (1 + furrow);
    const bend = Math.sin(t * Math.PI * 0.9) * 0.6;
    pos.setXYZ(i, Math.cos(th) * rad + lean * bend * t * 3, y - 0.25, Math.sin(th) * rad + leanZ * bend * t * 3);
    uv.setXY(i, (th / (Math.PI * 2) + 0.5) * around, y / 1.7);
  }
  g.computeVertexNormals();
  return g;
}

function barkMaterial(tex: { bark: Texture; barkN: Texture; moss: Texture; noise: Texture }, mossiness = 1): MeshStandardMaterial {
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

export interface TreeResult { group: Group; positions: { x: number; z: number; h: number }[] }

export function buildTrees(count: number, tex: { bark: Texture; barkN: Texture; moss: Texture; noise: Texture }, shadows: boolean, detail = 1): TreeResult {
  const group = new Group();
  group.name = 'trees';
  const rand = rng(77);
  const variants = [
    { r: 0.42, H: 19, flare: 1.1 },
    { r: 0.58, H: 22, flare: 1.3 },
    { r: 0.8, H: 24, flare: 1.5 }
  ];
  const radial = detail >= 1 ? 22 : 13, rows = detail >= 1 ? 30 : 18;
  const geos = variants.map((v, i) => trunkGeometry(v.r, v.H, 11 + i * 7, v.flare, radial, rows));
  const mat = barkMaterial(tex);
  const pts: { x: number; z: number; v: number; s: number; h: number }[] = [];
  const grid = new Map<string, { x: number; z: number }[]>();
  const ok = (x: number, z: number, minD: number) => {
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
      const arr = grid.get(`${gx + i},${gz + j}`);
      if (!arr) continue;
      for (const p of arr) if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
    }
    return true;
  };
  let tries = 0;
  while (pts.length < count && tries < count * 40) {
    tries += 1;
    const z = 30 - rand() * 232;
    let x: number;
    if (z > -22) {
      x = (rand() < 0.5 ? -1 : 1) * (9 + rand() * 32);
      if (pondFactor(x, z) < 1.25) continue;
      if (z > 5 && Math.abs(x) < 10) continue;
    } else {
      x = (rand() * 2 - 1) * 38;
      const pd = pathDistance(x, z);
      if (pd < 3.6 + rand() * 1.5) continue;
      if (pd > 30) continue;
      if (inClearing(x, z, 1)) continue;
      if ((x - LIBRARY_TREE.x) ** 2 + (z - LIBRARY_TREE.z) ** 2 < 14 * 14) continue;
    }
    if (!ok(x, z, 2.6)) continue;
    const v = rand() < 0.45 ? 0 : rand() < 0.65 ? 1 : 2;
    const s = 0.85 + rand() * 0.35;
    const p = { x, z, v, s, h: variants[v].H * s };
    pts.push(p);
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
  }
  const m4 = new Matrix4(), q = new Quaternion(), sv = new Vector3(), pv = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  geos.forEach((geo, vi) => {
    const list = pts.filter((p) => p.v === vi);
    // split into rows along z for culling
    const bands = new Map<number, typeof list>();
    for (const p of list) {
      const b = Math.floor(p.z / 60);
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b)!.push(p);
    }
    for (const band of bands.values()) {
      const mesh = new InstancedMesh(geo, mat, band.length);
      band.forEach((p, i) => {
        q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
        sv.set(p.s, p.s, p.s);
        m4.compose(pv.set(p.x, heightAt(p.x, p.z), p.z), q, sv);
        mesh.setMatrixAt(i, m4);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.name = 'trunks';
      group.add(mesh);
    }
  });

  // the library tree: ancient, buttressed, holding the studies ring
  const big = new Mesh(trunkGeometry(2.1, 30, 404, 2.2, 48, 60), barkMaterial(tex, 1.4));
  big.position.set(LIBRARY_TREE.x, heightAt(LIBRARY_TREE.x, LIBRARY_TREE.z) - 0.2, LIBRARY_TREE.z);
  big.castShadow = shadows;
  big.receiveShadow = true;
  big.name = 'library-tree';
  group.add(big);
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
      // taper along the root
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

  return { group, positions: pts.map((p) => ({ x: p.x, z: p.z, h: p.h })) };
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
