// The archive hall (経蔵): an overgrown baroque room inside the mountain. The
// cave's channel spills into a clear koi pool under a painted sky; wisteria
// pours from the cornice, roses and ivy take the walls, candle sconces and two
// chandeliers burn warm, and dawn light slants in through the high windows.
// The gilded frames on the walls hold the work itself.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide,
  ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  MeshStandardMaterial, Object3D, Path, PlaneGeometry, Points, PointsMaterial, Quaternion, ShaderMaterial, Shape,
  SphereGeometry, SRGBColorSpace, Texture, TextureLoader, TorusGeometry, TubeGeometry, UniformsLib, UniformsUtils, Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALL } from './layout';
import { mossMaterial, shared } from './materials';
import { broadleaf, bushGeometry, leafMaterial, rng, tuftGeometry } from './treegen';
import { barkMaterial } from './trees';
import { fernClumpGeometry } from './foliage';
import { Reflector, LAYER_NO_REFLECT } from './water';
import { NEON, glowTexture, neonSign } from './neon';
import type { Emitter } from './props';
import type { Media } from '../data/content';

export interface HallTex {
  plaster: Texture; plasterN: Texture; stone: Texture; stoneN: Texture; moss: Texture; mossN: Texture; noise: Texture;
  fresco: Texture; wisteria: Texture; rose: Texture; bushLeaves: Texture; ivy: Texture; lilypad: Texture; fern: Texture;
  tuft: Texture; broad: Texture; bark: Texture; barkN: Texture; waterN: Texture;
}

export interface HallResult {
  group: Group;
  emitters: Emitter[];
  art: Mesh[];
  pool: Mesh;
  update(t: number, camZ: number): void;
}

const X0 = HALL.x - HALL.halfW, X1 = HALL.x + HALL.halfW;
const Z0 = HALL.z0, Z1 = HALL.z1;
const PX0 = HALL.x - HALL.pool, PX1 = HALL.x + HALL.pool, PZ1 = Z1 + 5.5;
const BAY = (Z0 - Z1) / 8;
export const HALL_POOL = { x0: PX0, x1: PX1, z0: Z0 + 0.3, z1: PZ1 };

export const GOLD = new Color(1.0, 0.74, 0.36);

function arch(p: Path | Shape, cx: number, w: number, spring: number, bottom: number) {
  const r = w / 2;
  p.moveTo(cx - r, bottom);
  p.lineTo(cx + r, bottom);
  p.lineTo(cx + r, spring);
  p.absarc(cx, spring, r, 0, Math.PI, false);
  p.lineTo(cx - r, bottom);
}

function wall(len: number, height: number, holes: { c: number; w: number; spring: number; bottom: number }[], depth = 1.2): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, -3); s.lineTo(len, -3); s.lineTo(len, height); s.lineTo(0, height); s.lineTo(0, -3);
  for (const h of holes) { const p = new Path(); arch(p, h.c, h.w, h.spring, h.bottom); s.holes.push(p); }
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 18 });
}

/** Baroque barrel vault: plaster coffers, a gilded oval, the painted sky inside it. */
function vaultMaterial(tex: HallTex): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: tex.plaster, normalMap: tex.plasterN, roughness: 0.8, side: DoubleSide, envMapIntensity: 0.6 });
  const u = { tFresco: { value: tex.fresco }, uC: { value: new Vector3(HALL.x, 0, (Z0 + Z1) / 2) }, uR: { value: new Vector3(5.2, 0, 10.5) } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvVW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tFresco; uniform vec3 uC, uR; varying vec3 vVW; float vGold; float vPaint;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec2 q = vec2((vVW.x - uC.x) / uR.x, (vVW.z - uC.z) / uR.z);
        float e = length(q);
        vec3 plaster = texture2D(map, vVW.xz * 0.25).rgb * vec3(1.0, 0.95, 0.86);
        // coffers: recessed panels with a gilded rosette
        vec2 cq = vec2(atan(vVW.y - 9.5, vVW.x - uC.x) * 9.0 / 1.6, vVW.z / 1.6);
        vec2 f = abs(fract(cq) - 0.5);
        float border = smoothstep(0.36, 0.42, max(f.x, f.y));
        float rosette = smoothstep(0.1, 0.06, length(fract(cq) - 0.5));
        vec3 col = plaster * mix(0.72, 1.0, border);
        vGold = max(border * smoothstep(0.47, 0.44, max(f.x, f.y)) * 0.7, rosette);
        // the oval frame and the painting
        float ring = smoothstep(0.985, 1.0, e) * smoothstep(1.11, 1.09, e);
        float inner = smoothstep(1.0, 0.985, e);
        vec2 fuv = vec2((vVW.x - uC.x) / (uR.z * 2.0) + 0.5, (vVW.z - uC.z) / (uR.z * 2.0) + 0.5);
        vec3 paint = texture2D(tFresco, fuv).rgb;
        col = mix(col, paint, inner);
        vGold = mix(vGold, 1.0, ring);
        vGold *= 1.0 - inner;
        vPaint = inner;
        col = mix(col, vec3(1.0, 0.74, 0.36) * (0.75 + 0.25 * sin(e * 160.0)), ring);
        diffuseColor.rgb *= col;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, vGold);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, vGold);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vPaint * 0.55;');
  };
  m.customProgramCacheKey = () => 'vault';
  return m;
}

function vaultGeometry(): BufferGeometry {
  const nt = 48, nz = 60;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const a = HALL.halfW, b = HALL.vault - HALL.wall;
  for (let j = 0; j <= nz; j += 1) {
    const z = Z0 + 0.3 - (j / nz) * (Z0 - Z1 + 0.6);
    for (let i = 0; i <= nt; i += 1) {
      const th = (i / nt) * Math.PI;
      const x = HALL.x + a * Math.cos(th), y = HALL.wall + b * Math.sin(th);
      pos.push(x, y, z);
      const n = new Vector3(-Math.cos(th) / a, -Math.sin(th) / b, 0).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(i / nt, j / nz);
    }
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nt; i += 1) {
      const p = j * (nt + 1) + i, q = p + 1, r = p + nt + 1, s = r + 1;
      idx.push(p, r, q, q, r, s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A water lily: two rings of pointed petals, pink tips fading to white. */
function lotusGeometry(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const ring = (n: number, len: number, tilt: number, rot: number) => {
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2 + rot;
      const d = new Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new Vector3(-d.z, 0, d.x);
      const tip = d.clone().multiplyScalar(Math.cos(tilt) * len).setY(Math.sin(tilt) * len);
      const mid = tip.clone().multiplyScalar(0.5);
      const b = pos.length / 3;
      const w = len * 0.28;
      pos.push(0, 0, 0, mid.x + side.x * w, mid.y, mid.z + side.z * w, tip.x, tip.y, tip.z, mid.x - side.x * w, mid.y, mid.z - side.z * w);
      col.push(1, 1, 1, 1, 0.92, 0.95, 1, 0.55, 0.72, 1, 0.92, 0.95);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  ring(10, 0.17, 0.55, 0);
  ring(8, 0.14, 0.95, 0.3);
  ring(6, 0.09, 1.25, 0.1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildHall(tex: HallTex, reflector: Reflector, tier: 'high' | 'medium' | 'low', shadows: boolean, art: Media[]): HallResult {
  const group = new Group();
  group.name = 'hall';
  const r = rng(9090);
  const emitters: Emitter[] = [];
  const lo = tier === 'low';
  const m4 = new Matrix4(), q = new Quaternion(), sv = new Vector3(), pv = new Vector3(), up = new Vector3(0, 1, 0);

  const plaster = mossMaterial({
    base: tex.plaster, baseN: tex.plasterN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.22, mossScale: 0.8, mossAmount: 0.35, mossLow: 1.1, wet: 0.5, roughness: 0.85, tint: new Color(1.0, 0.96, 0.9)
  });
  const marble = mossMaterial({
    base: tex.stone, baseN: tex.stoneN, moss: tex.moss, mossN: tex.mossN, noise: tex.noise,
    baseScale: 0.4, mossScale: 0.9, mossAmount: 0.35, mossLow: 0.5, wet: 0.9, roughness: 0.42, tint: new Color(1.3, 1.18, 1.04), paving: 1.2
  });
  const gold = new MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.32, envMapIntensity: 1.2 });

  // ── floor: walkways either side of the pool, a landing before the door ──
  const floorParts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new BoxGeometry(w, h, d); b.translate(x, y, z); floorParts.push(b); };
  box(PX0 - X0, 2, Z0 - Z1, (X0 + PX0) / 2, HALL.floor - 1, (Z0 + Z1) / 2);
  box(X1 - PX1, 2, Z0 - Z1, (X1 + PX1) / 2, HALL.floor - 1, (Z0 + Z1) / 2);
  box(PX1 - PX0, 2, PZ1 - Z1, HALL.x, HALL.floor - 1, (PZ1 + Z1) / 2);
  // coping around the pool
  box(0.5, 0.14, Z0 - PZ1, PX0 + 0.25, HALL.floor + 0.07, (Z0 + PZ1) / 2);
  box(0.5, 0.14, Z0 - PZ1, PX1 - 0.25, HALL.floor + 0.07, (Z0 + PZ1) / 2);
  box(PX1 - PX0, 0.14, 0.5, HALL.x, HALL.floor + 0.07, PZ1 + 0.25);
  // two shallow steps down from the landing to the water
  box(PX1 - PX0 - 1, 0.3, 0.6, HALL.x, 0.05, PZ1 + 0.3 + 0.3);
  const floor = new Mesh(mergeGeometries(floorParts)!, marble);
  floor.receiveShadow = true;
  floor.name = 'hall-floor';
  group.add(floor);

  // pool bed, lit by moving caustics
  const bedMat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { tNoise: { value: tex.noise }, tStone: { value: tex.stone }, time: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tNoise, tStone; uniform float time; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        vec3 base = texture2D(tStone, p * 0.35).rgb * vec3(0.55, 0.62, 0.52);
        float c1 = texture2D(tNoise, p * 0.09 + vec2(time * 0.012, time * 0.007)).b;
        float c2 = texture2D(tNoise, p * 0.13 - vec2(time * 0.009, -time * 0.011)).b;
        float caus = pow(c1 * c2, 2.2) * 3.2;
        vec3 col = base * 0.55 + vec3(1.0, 0.9, 0.7) * caus * 0.55;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true
  });
  bedMat.uniforms.time = shared.time;
  const bed = new Mesh(new PlaneGeometry(PX1 - PX0, Z0 - PZ1 + 2), bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(HALL.x, -0.72, (Z0 + PZ1) / 2);
  group.add(bed);

  const poolMat = reflector.material({ waterN: tex.waterN, noise: tex.noise }, { deep: new Color(0x0b1e1a), clarity: 0.62, refl: 0.95, murk: 0.4, scale: 1.3, distortion: 4.5, specPow: 400, specAmt: 0.6 });
  const pool = new Mesh(new PlaneGeometry(PX1 - PX0, Z0 - PZ1), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(HALL.x, 0, (Z0 + PZ1) / 2);
  pool.renderOrder = 2;
  pool.name = 'hall-pool';
  group.add(pool);
  reflector.add(pool);

  // ── walls ──
  const back = new Mesh(wall(X1 - X0 + 2, HALL.vault + 1, [{ c: HALL.x - X0 + 1, w: 7.6, spring: 4.6, bottom: -1.5 }]), plaster);
  back.position.set(X0 - 1, 0, Z0 - 0.1); // extrudes toward +z, away from the hall
  const front = new Mesh(wall(X1 - X0 + 2, HALL.vault + 1, [{ c: HALL.x - X0 + 1, w: 6, spring: 5.6, bottom: -1.5 }]), plaster);
  front.position.set(X0 - 1, 0, Z1);
  front.scale.z = -1;
  const WIN = [-222, -233, -244];
  const left = new Mesh(wall(Z0 - Z1, HALL.wall, []), plaster);
  left.rotation.y = Math.PI / 2;
  left.position.set(X0 - 1.2, 0, Z0);
  const right = new Mesh(wall(Z0 - Z1, HALL.wall, WIN.map((z) => ({ c: z - Z1, w: 2.4, spring: 7.8, bottom: 5.2 }))), plaster);
  right.rotation.y = -Math.PI / 2;
  right.position.set(X1 + 1.2, 0, Z1);
  for (const w of [back, front, left, right]) { w.receiveShadow = true; group.add(w); }

  // the windows glow with the morning outside
  const winGlow = new MeshBasicMaterial({ color: new Color(2.2, 1.6, 1.05) });
  for (const z of WIN) {
    const p = new Mesh(new PlaneGeometry(3, 4.6), winGlow);
    p.position.set(X1 + 1.4, 7.2, z);
    p.rotation.y = -Math.PI / 2;
    group.add(p);
  }

  // ── pilasters, cornice, vault, ribs ──
  const pil: BufferGeometry[] = [];
  const cap: BufferGeometry[] = [];
  const zs: number[] = [];
  for (let k = 0; k <= 8; k += 1) zs.push(Z0 - k * BAY);
  for (const side of [-1, 1]) {
    const x = side < 0 ? X0 + 0.25 : X1 - 0.25;
    for (const z of zs) {
      const shaft = new BoxGeometry(0.5, HALL.wall, 0.9); shaft.translate(x, HALL.wall / 2, z); pil.push(shaft);
      const base = new BoxGeometry(0.75, 0.8, 1.15); base.translate(x, HALL.floor + 0.4, z); pil.push(base);
      const c = new BoxGeometry(0.8, 0.5, 1.2); c.translate(x, HALL.wall - 0.55, z); cap.push(c);
    }
    const cor = new BoxGeometry(0.9, 0.6, Z0 - Z1); cor.translate(side < 0 ? X0 + 0.45 : X1 - 0.45, HALL.wall - 0.05, (Z0 + Z1) / 2); pil.push(cor);
    const trim = new BoxGeometry(0.95, 0.1, Z0 - Z1); trim.translate(side < 0 ? X0 + 0.48 : X1 - 0.48, HALL.wall - 0.4, (Z0 + Z1) / 2); cap.push(trim);
  }
  const pilMesh = new Mesh(mergeGeometries(pil)!, plaster);
  pilMesh.receiveShadow = true;
  group.add(pilMesh);
  group.add(new Mesh(mergeGeometries(cap)!, gold));
  const vault = new Mesh(vaultGeometry(), vaultMaterial(tex));
  vault.name = 'vault';
  group.add(vault);
  const ribs: BufferGeometry[] = [];
  for (const z of zs) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const th = (i / 24) * Math.PI;
      pts.push(new Vector3(HALL.x + (HALL.halfW - 0.2) * Math.cos(th), HALL.wall + (HALL.vault - HALL.wall - 0.15) * Math.sin(th), z));
    }
    ribs.push(new TubeGeometry(new CatmullRomCurve3(pts), 48, 0.14, 6, false));
  }
  group.add(new Mesh(mergeGeometries(ribs)!, gold));

  // ── the work, in gilded frames ──
  const artMeshes: Mesh[] = [];
  const frames: BufferGeometry[] = [];
  const slots: { x: number; z: number; ry: number }[] = [];
  for (let k = 0; k < 8; k += 1) slots.push({ x: X0 + 0.04, z: Z0 - (k + 0.5) * BAY, ry: Math.PI / 2 });
  for (let k = 0; k < 8; k += 1) slots.push({ x: X1 - 0.04, z: Z0 - (k + 0.5) * BAY, ry: -Math.PI / 2 });
  const canvasMats: MeshBasicMaterial[] = [];
  art.slice(0, slots.length).forEach((m, i) => {
    const s = slots[i];
    const a = m.w / m.h;
    const W = a > 2.7 / 2.4 ? 2.7 : 2.4 * a, H = W / a;
    const cy = 3.5;
    const o = new Object3D();
    o.position.set(s.x, cy, s.z);
    o.rotation.y = s.ry;
    o.updateMatrixWorld();
    const mat = new MeshBasicMaterial({ color: new Color(0.1, 0.09, 0.08) });
    canvasMats.push(mat);
    const canvas = new Mesh(new PlaneGeometry(W, H), mat);
    canvas.position.set(s.x, cy, s.z);
    canvas.rotation.y = s.ry;
    canvas.translateZ(0.09);
    canvas.userData.index = i;
    canvas.name = 'art';
    group.add(canvas);
    artMeshes.push(canvas);
    const t = 0.17, d = 0.14;
    for (const [w, h, x, y] of [[W + 2 * t, t, 0, H / 2 + t / 2], [W + 2 * t, t, 0, -H / 2 - t / 2], [t, H, W / 2 + t / 2, 0], [t, H, -W / 2 - t / 2, 0]]) {
      const b = new BoxGeometry(w, h, d);
      b.translate(x, y, 0.07);
      b.applyMatrix4(o.matrixWorld);
      frames.push(b);
    }
    // a little brass picture light
    const pl = new BoxGeometry(0.9, 0.06, 0.08);
    pl.translate(0, H / 2 + 0.5, 0.35);
    pl.applyMatrix4(o.matrixWorld);
    frames.push(pl);
  });
  group.add(new Mesh(mergeGeometries(frames)!, gold));
  let artLoaded = false;
  const loadArt = () => {
    artLoaded = true;
    const tl = new TextureLoader();
    art.slice(0, slots.length).forEach((m, i) => {
      tl.loadAsync('./' + m.thumb).then((t) => {
        t.colorSpace = SRGBColorSpace;
        canvasMats[i].map = t;
        canvasMats[i].color.setRGB(0.92, 0.9, 0.86);
        canvasMats[i].needsUpdate = true;
      }).catch(() => { /* keep the dark canvas */ });
    });
  };

  // ── sconces with little lampshades, and two chandeliers ──
  const shadeGeo = new CylinderGeometry(0.08, 0.15, 0.22, 14, 1, true);
  const shadeMat = new MeshBasicMaterial({ color: new Color(2.4, 1.55, 0.8), side: DoubleSide });
  const shades: Matrix4[] = [];
  const arms: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (let k = 1; k < 8; k += 1) {
      const z = Z0 - k * BAY;
      const x = side < 0 ? X0 + 0.55 : X1 - 0.55;
      const y = 5.3;
      const arm = new BoxGeometry(0.5, 0.05, 0.9); arm.translate(x - side * 0.2, y - 0.1, z); arms.push(arm);
      for (const dz of [-0.4, 0.4]) shades.push(new Matrix4().makeTranslation(x - side * 0.4, y + 0.08, z + dz));
      emitters.push({ pos: new Vector3(x - side * 0.8, y, z), color: new Color(1.0, 0.62, 0.3), intensity: 2.4, range: 7, level: () => 1 });
    }
  }
  group.add(new Mesh(mergeGeometries(arms)!, gold));
  const shadeMesh = new InstancedMesh(shadeGeo, shadeMat, shades.length);
  shades.forEach((mm, i) => shadeMesh.setMatrixAt(i, mm));
  shadeMesh.computeBoundingSphere();
  group.add(shadeMesh);

  const flames: number[] = [];
  const chandParts: BufferGeometry[] = [];
  for (const cz of [Z0 - 10.5, Z0 - 27.5]) {
    const cx = HALL.x, top = HALL.vault - 0.1, y = 8.6;
    const chain = new CylinderGeometry(0.025, 0.025, top - y, 5); chain.translate(cx, (top + y) / 2, cz); chandParts.push(chain);
    for (const [R, yy] of [[1.15, y], [0.72, y + 0.55]]) {
      const ring = new TorusGeometry(R, 0.045, 6, 40); ring.rotateX(Math.PI / 2); ring.translate(cx, yy, cz); chandParts.push(ring);
      const n = R > 1 ? 12 : 8;
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * Math.PI * 2;
        const px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
        const candle = new CylinderGeometry(0.03, 0.03, 0.2, 6); candle.translate(px, yy + 0.12, pz); chandParts.push(candle);
        flames.push(px, yy + 0.27, pz);
      }
    }
    const bowl = new SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5); bowl.translate(cx, y, cz); chandParts.push(bowl);
    emitters.push({ pos: new Vector3(cx, y - 0.3, cz), color: new Color(1.0, 0.7, 0.4), intensity: 7, range: 16, level: () => 1 });
  }
  group.add(new Mesh(mergeGeometries(chandParts)!, gold));
  const fg = new BufferGeometry();
  fg.setAttribute('position', new Float32BufferAttribute(flames, 3));
  const flameMat = new PointsMaterial({ size: 0.55, map: glowTexture(), color: new Color(2.6, 1.6, 0.7), transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
  const flamePts = new Points(fg, flameMat);
  flamePts.renderOrder = 6;
  group.add(flamePts);

  // ── the pool's life: lily pads and lotus ──
  const padGeo = new PlaneGeometry(1, 1);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new MeshLambertMaterial({ map: tex.lilypad, alphaTest: 0.5, side: DoubleSide });
  const pads: { m: Matrix4; c: Color }[] = [];
  const lotus: { m: Matrix4; c: Color }[] = [];
  const clusters = lo ? 16 : 26;
  for (let c = 0; c < clusters; c += 1) {
    const cx = PX0 + 0.8 + r() * (PX1 - PX0 - 1.6);
    const cz = Z0 - 1.5 - r() * (Z0 - PZ1 - 3);
    // keep a clear lane down the middle for the reflection of the door
    if (Math.abs(cx - HALL.x) < 1.2 && r() < 0.7) continue;
    const n = 3 + Math.floor(r() * 7);
    for (let k = 0; k < n; k += 1) {
      const x = cx + (r() - 0.5) * 2.2, z = cz + (r() - 0.5) * 2.2;
      if (x < PX0 + 0.3 || x > PX1 - 0.3) continue;
      const s = 0.45 + r() * 0.55;
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      m4.compose(pv.set(x, 0.012 + r() * 0.004, z), q, sv.set(s, 1, s));
      const g = 0.8 + r() * 0.4;
      pads.push({ m: m4.clone(), c: new Color(g, g, g * 0.9) });
      if (r() < 0.22) {
        const ls = 0.9 + r() * 0.6;
        lotus.push({ m: new Matrix4().compose(new Vector3(x, 0.03, z), q.clone(), new Vector3(ls, ls, ls)), c: r() < 0.5 ? new Color(1, 1, 1) : new Color(1, 0.8, 0.9) });
      }
    }
  }
  const padMesh = new InstancedMesh(padGeo, padMat, pads.length);
  pads.forEach((p, i) => { padMesh.setMatrixAt(i, p.m); padMesh.setColorAt(i, p.c); });
  padMesh.computeBoundingSphere();
  padMesh.layers.set(LAYER_NO_REFLECT);
  group.add(padMesh);
  const lotusMat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: new Color(0.25, 0.12, 0.16) });
  const lotusMesh = new InstancedMesh(lotusGeometry(), lotusMat, lotus.length);
  lotus.forEach((p, i) => { lotusMesh.setMatrixAt(i, p.m); lotusMesh.setColorAt(i, p.c); });
  lotusMesh.computeBoundingSphere();
  group.add(lotusMesh);

  // ── overgrowth ──
  // wisteria pouring off the cornice and the ribs
  const wisGeo = new PlaneGeometry(0.62, 2.8);
  wisGeo.translate(0, -1.4, 0);
  const wisMat = leafMaterial({ map: tex.wisteria, alphaTest: 0.35, sway: 0.18, height: 2.8, trans: 0.7, hang: true, emissive: new Color(0.08, 0.05, 0.12) });
  const wis: { m: Matrix4; c: Color }[] = [];
  const WIS = [new Color(1, 1, 1), new Color(0.82, 0.7, 1.05), new Color(0.95, 0.85, 1.1), new Color(1.2, 1.15, 1.2)];
  const addWis = (x: number, y: number, z: number, face: number, s: number) => {
    q.setFromAxisAngle(up, face + (r() - 0.5) * 1.2);
    wis.push({ m: new Matrix4().compose(new Vector3(x, y, z), q.clone(), new Vector3(s, s * (0.7 + r() * 0.7), s)), c: WIS[Math.floor(r() * WIS.length)] });
  };
  const nW = lo ? 220 : 420;
  for (let k = 0; k < nW; k += 1) {
    const kind = r();
    if (kind < 0.62) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side < 0 ? X0 + 0.7 + r() * 0.8 : X1 - 0.7 - r() * 0.8;
      addWis(x, HALL.wall - 0.2 + r() * 0.3, Z0 - 0.5 - r() * (Z0 - Z1 - 1), side < 0 ? Math.PI / 2 : -Math.PI / 2, 0.8 + r() * 0.7);
    } else if (kind < 0.88) {
      // hanging from the ribs, over the walkways rather than the middle of the pool
      const z = zs[1 + Math.floor(r() * 7)] + (r() - 0.5) * 0.5;
      const th = r() < 0.5 ? (0.08 + r() * 0.25) * Math.PI : (0.67 + r() * 0.25) * Math.PI;
      const x = HALL.x + (HALL.halfW - 0.4) * Math.cos(th);
      const y = HALL.wall + (HALL.vault - HALL.wall) * Math.sin(th) - 0.25;
      addWis(x, y, z, r() * Math.PI * 2, 0.7 + r() * 0.6);
    } else {
      // around the doorway
      const a = r() * Math.PI;
      addWis(HALL.x + Math.cos(a) * 3.4, 5.6 + Math.sin(a) * 3.3, Z1 + 0.3, 0, 0.6 + r() * 0.5);
    }
  }
  const wisMesh = new InstancedMesh(wisGeo, wisMat, wis.length);
  wis.forEach((w, i) => { wisMesh.setMatrixAt(i, w.m); wisMesh.setColorAt(i, w.c); });
  wisMesh.computeBoundingSphere();
  wisMesh.name = 'wisteria';
  group.add(wisMesh);

  const bushGeo = bushGeometry(33, 22);
  const vineLeaves = leafMaterial({ map: tex.bushLeaves, alphaTest: 0.5, sway: 0.05, height: 1.3, trans: 0.3 });
  const vines: { m: Matrix4; c: Color }[] = [];
  // rose bushes along the walkways and in the corners
  const roses: { m: Matrix4; c: Color }[] = [];
  const ROSE = [new Color(1.0, 0.18, 0.22), new Color(1.0, 0.55, 0.66), new Color(1.0, 0.82, 0.35), new Color(1.05, 1.0, 0.98), new Color(0.85, 0.12, 0.3)];
  const roseSpots: { x: number; z: number; s: number }[] = [];
  for (let k = 0; k < (lo ? 26 : 44); k += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const nearWall = r() < 0.6;
    const x = side < 0 ? (nearWall ? X0 + 1.0 + r() * 0.6 : PX0 - 0.6 - r() * 0.4) : (nearWall ? X1 - 1.0 - r() * 0.6 : PX1 + 0.6 + r() * 0.4);
    const z = Z0 - 0.8 - r() * (Z0 - Z1 - 1.6);
    roseSpots.push({ x, z, s: 0.55 + r() * 0.7 });
  }
  for (const [x, z] of [[X0 + 1.2, Z1 + 1.3], [X1 - 1.2, Z1 + 1.3], [PX0 + 0.8, Z1 + 1.5], [PX1 - 0.8, Z1 + 1.5], [X0 + 1.2, Z0 - 1.2], [X1 - 1.2, Z0 - 1.2]]) roseSpots.push({ x, z, s: 1.1 + r() * 0.4 });
  for (const sp of roseSpots) {
    q.setFromAxisAngle(up, r() * 6);
    const mm = new Matrix4().compose(new Vector3(sp.x, HALL.floor - 0.05, sp.z), q.clone(), new Vector3(sp.s, sp.s * (0.8 + r() * 0.4), sp.s));
    vines.push({ m: mm, c: new Color(0.2 + r() * 0.08, 0.34 + r() * 0.1, 0.14) });
    roses.push({ m: mm.clone().multiply(new Matrix4().makeScale(1.04, 1.04, 1.04)), c: ROSE[Math.floor(r() * ROSE.length)] });
  }
  const vineMesh = new InstancedMesh(bushGeo, vineLeaves, vines.length);
  vines.forEach((v, i) => { vineMesh.setMatrixAt(i, v.m); vineMesh.setColorAt(i, v.c); });
  vineMesh.computeBoundingSphere();
  group.add(vineMesh);
  const roseMat = leafMaterial({ map: tex.rose, alphaTest: 0.5, sway: 0.05, height: 1.3, trans: 0.5 });
  const roseMesh = new InstancedMesh(bushGeo, roseMat, roses.length);
  roses.forEach((v, i) => { roseMesh.setMatrixAt(i, v.m); roseMesh.setColorAt(i, v.c); });
  roseMesh.computeBoundingSphere();
  group.add(roseMesh);

  // ivy climbing walls and pilasters
  const ivyMat = new MeshLambertMaterial({ map: tex.ivy, alphaTest: 0.5, side: DoubleSide });
  const ivy: Matrix4[] = [];
  for (let k = 0; k < (lo ? 70 : 130); k += 1) {
    const s = 1.0 + r() * 1.4;
    const wallPick = r();
    const y = HALL.floor + s * 0.4 + Math.pow(r(), 1.8) * 7;
    if (wallPick < 0.8) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side < 0 ? X0 + 0.03 + (r() < 0.3 ? 0.5 : 0) : X1 - 0.03 - (r() < 0.3 ? 0.5 : 0);
      q.setFromAxisAngle(up, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      ivy.push(new Matrix4().compose(new Vector3(x, y, Z0 - r() * (Z0 - Z1)), q.clone(), new Vector3(s, s, s)));
    } else {
      const back = r() < 0.5;
      q.setFromAxisAngle(up, back ? Math.PI : 0);
      const x = HALL.x + (r() < 0.5 ? -1 : 1) * (3.6 + r() * 5);
      ivy.push(new Matrix4().compose(new Vector3(x, y, back ? Z0 - 0.12 : Z1 + 0.03), q.clone(), new Vector3(s, s, s)));
    }
  }
  const ivyMesh = new InstancedMesh(new PlaneGeometry(1, 1), ivyMat, ivy.length);
  ivy.forEach((mm, i) => ivyMesh.setMatrixAt(i, mm));
  ivyMesh.computeBoundingSphere();
  group.add(ivyMesh);

  // ferns and grass at the pool edge and in the cracks
  const fernMat = leafMaterial({ map: tex.fern, alphaTest: 0.45, sway: 0.06, height: 1, trans: 0.4 });
  const fernList: Matrix4[] = [];
  const tuftList: Matrix4[] = [];
  for (let k = 0; k < (lo ? 40 : 70); k += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side < 0 ? PX0 - 0.35 - r() * 1.2 : PX1 + 0.35 + r() * 1.2;
    const z = Z0 - 0.6 - r() * (Z0 - Z1 - 1.2);
    const s = 0.5 + r() * 0.6;
    q.setFromAxisAngle(up, r() * 6);
    (r() < 0.5 ? fernList : tuftList).push(new Matrix4().compose(new Vector3(x, HALL.floor - 0.03, z), q.clone(), new Vector3(s, s, s)));
  }
  const fernMesh = new InstancedMesh(fernClumpGeometry(7), fernMat, fernList.length);
  fernList.forEach((mm, i) => fernMesh.setMatrixAt(i, mm));
  const tuftMat = leafMaterial({ map: tex.tuft, alphaTest: 0.42, sway: 0.1, height: 1, trans: 0.35 });
  const tuftMesh = new InstancedMesh(tuftGeometry(), tuftMat, tuftList.length);
  tuftList.forEach((mm, i) => tuftMesh.setMatrixAt(i, mm));
  for (const im of [fernMesh, tuftMesh]) { im.computeBoundingSphere(); group.add(im); }

  // two maples have rooted in the floor and reached for the vault
  const bark = barkMaterial({ bark: tex.bark, barkN: tex.barkN, moss: tex.moss, noise: tex.noise }, 1.2);
  const mapleLeaves = leafMaterial({ map: tex.broad, sway: 0.2, height: 10, trans: 0.55 });
  const maple = broadleaf(711, { H: 8.8, r0: 0.3, fork: 2.3, R: 3.8, Rh: 2.2, leaders: 4, vase: 0.5, card: 1.6, count: 150 }, 1);
  for (const [x, z, s, c] of [[X1 - 2.2, Z1 + 2.8, 1, new Color(1.0, 0.28, 0.12)], [X0 + 2.2, Z0 - 3.2, 0.85, new Color(1.0, 0.55, 0.15)]] as [number, number, number, Color][]) {
    const t = new Mesh(maple.trunk, bark);
    t.position.set(x, HALL.floor - 0.4, z);
    t.scale.setScalar(s);
    t.rotation.y = r() * 6;
    const cr = new InstancedMesh(maple.crown, mapleLeaves, 1);
    cr.setMatrixAt(0, new Matrix4().compose(t.position, t.quaternion, t.scale));
    cr.setColorAt(0, c);
    cr.computeBoundingSphere();
    t.castShadow = cr.castShadow = shadows;
    group.add(t, cr);
  }

  // ── light: warm shafts through the windows, the door blazing ──
  const shaftMat = new ShaderMaterial({
    uniforms: { tNoise: { value: tex.noise }, time: shared.time },
    vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tNoise; uniform float time; varying vec2 vUv; varying float vD;
      void main(){
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        float len = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float n = texture2D(tNoise, vec2(vUv.x * 0.8 + time * 0.006, vUv.y * 0.2 - time * 0.012)).r;
        float streak = texture2D(tNoise, vec2(vUv.x * 2.5, 0.37)).g;
        float a = edge * len * (0.4 + 0.6 * n) * (0.45 + streak) * smoothstep(1.0, 5.0, vD);
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * a * 0.075, 1.0);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide
  });
  const sun = new Vector3(-0.78, -0.55, -0.3).normalize();
  const motes: number[] = [];
  for (const z of WIN) {
    const top = new Vector3(X1 + 0.2, 7.3, z);
    const L = 13;
    for (let k = 0; k < 2; k += 1) {
      const g = new PlaneGeometry(2.6 + k * 0.8, L);
      const m = new Mesh(g, shaftMat);
      m.position.copy(top).addScaledVector(sun, L / 2);
      m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), sun.clone().negate());
      m.rotateY(k * 1.4 + 0.4);
      m.layers.set(LAYER_NO_REFLECT);
      group.add(m);
    }
    const hit = top.clone().addScaledVector(sun, L * 0.85);
    emitters.push({ pos: hit.clone().add(new Vector3(0, 1.2, 0)), color: new Color(1.0, 0.72, 0.45), intensity: 3, range: 9, level: () => 1 });
    for (let k = 0; k < 60; k += 1) {
      const p = top.clone().addScaledVector(sun, r() * L).add(new Vector3((r() - 0.5) * 1.6, (r() - 0.5) * 1.2, (r() - 0.5) * 1.6));
      motes.push(p.x, p.y, p.z);
    }
  }
  const mg = new BufferGeometry();
  mg.setAttribute('position', new BufferAttribute(new Float32Array(motes), 3));
  const moteMat = new ShaderMaterial({
    uniforms: { time: shared.time, pr: { value: 1 } },
    vertexShader: 'uniform float time, pr; varying float vA; void main(){ vec3 p = position; float ph = dot(p, vec3(1.3, 2.1, 0.7)); p += vec3(sin(time * 0.3 + ph), sin(time * 0.21 + ph * 1.7) * 0.6, cos(time * 0.25 + ph)) * 0.35; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = 0.5 + 0.5 * sin(time * 1.1 + ph * 3.0); gl_PointSize = pr * 3.5 / max(1.0, -mv.z * 0.25); }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * pow(max(1.0 - d, 0.0), 2.0) * vA * 0.9, 1.0); }',
    transparent: true, blending: AdditiveBlending, depthWrite: false
  });
  const moteP = new Points(mg, moteMat);
  moteP.layers.set(LAYER_NO_REFLECT);
  moteP.frustumCulled = false;
  group.add(moteP);

  // the doorway: a warm haze that the bloom turns into morning
  const hazeMat = new ShaderMaterial({
    uniforms: { time: shared.time },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float time; varying vec2 vUv; void main(){ vec2 c = vUv - vec2(0.5, 0.35); float a = exp(-dot(c * vec2(2.2, 1.4), c * vec2(2.2, 1.4)) * 3.0); gl_FragColor = vec4(vec3(1.0, 0.7, 0.45) * a * 0.22, 1.0); }',
    transparent: true, blending: AdditiveBlending, depthWrite: false
  });
  const haze = new Mesh(new PlaneGeometry(12, 11), hazeMat);
  haze.position.set(HALL.x, 5, Z1 + 1.5);
  haze.layers.set(LAYER_NO_REFLECT);
  group.add(haze);
  emitters.push({ pos: new Vector3(HALL.x, 3.2, Z1 + 2.5), color: new Color(1.0, 0.75, 0.55), intensity: 6, range: 16, level: () => 1 });

  // the name over the door
  const sign = neonSign({ lines: [{ text: '経蔵', font: '800 {s}px "Shippori Mincho B1", serif', size: 70 }, { text: 'THE ARCHIVE', font: '800 {s}px "Archivo Variable", "Archivo", sans-serif', size: 30, tracking: 0.3 }], color: NEON.amber, width: 1.9, intensity: 2.2 });
  sign.position.set(HALL.x, 10.2, Z1 + 0.25);
  group.add(sign);

  return {
    group, emitters, art: artMeshes, pool,
    update(t: number, camZ: number) {
      if (!artLoaded && camZ < -186) loadArt();
      const f = 0.9 + 0.1 * Math.sin(t * 9) * Math.sin(t * 5.3);
      flameMat.color.setRGB(2.6 * f, 1.6 * f, 0.7 * f);
      shadeMat.color.setRGB(2.4 * (0.96 + 0.04 * f), 1.55 * (0.96 + 0.04 * f), 0.8);
    }
  };
}

export function hallPointMaterials(g: Group): ShaderMaterial[] {
  const out: ShaderMaterial[] = [];
  g.traverse((o) => {
    const m = (o as Points).material as ShaderMaterial;
    if ((o as Points).isPoints && m.uniforms?.pr) out.push(m);
  });
  return out;
}
