import {
  Box3, BufferAttribute, BufferGeometry, CanvasTexture, Points, PointsMaterial, AdditiveBlending, Color, CylinderGeometry, ExtrudeGeometry, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, ShaderMaterial, Shape, SRGBColorSpace, TorusGeometry,
  Vector3, Vector4, VideoTexture, DoubleSide, BoxGeometry, CatmullRomCurve3, TubeGeometry
} from 'three';
import type { Assets } from './assets';
import {
  DESK, EMA, LANTERNS, LETTERS_Z, LETTER_SCALE, LIBRARY_TREE, POND, RACK, TORII, WORLD_MONOLITHS, SEA_TORII, HALL, SHORE,
  heightAt, floorAt, pathCurve, pathDistance, pondFactor, inClearing
} from './layout';
import { mossMaterial, neonMaterial, screenMaterial } from './materials';
import { NEON, glowTexture, neonSign, neonTube } from './neon';

export type TargetKind = 'world' | 'client' | 'study' | 'tier' | 'contact' | 'home' | 'art';
export interface Target { object: Object3D; kind: TargetKind; index: number }
export interface Emitter { pos: Vector3; color: Color; intensity: number; range: number; level: () => number }

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Quantised glTF attributes → float, with the node transform baked in. */
function bakedGeometry(mesh: Mesh): BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry;
  const g = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name) as BufferAttribute;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i += 1) {
      out[i * a.itemSize] = a.getX(i);
      if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
      if (a.itemSize > 3) out[i * a.itemSize + 3] = a.getW(i);
    }
    g.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

function ensurePlanarUV(mesh: Mesh) {
  const g = mesh.geometry;
  if (g.getAttribute('uv')) return;
  const p = g.getAttribute('position') as BufferAttribute;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) {
    uv[i * 2] = (p.getX(i) - b.min.x) / (b.max.x - b.min.x || 1);
    uv[i * 2 + 1] = (p.getY(i) - b.min.y) / (b.max.y - b.min.y || 1);
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** Wrap a node in a pivot whose origin sits at the node's base centre. */
function pivotOf(node: Object3D): { pivot: Group; anchor: Vector3 } {
  node.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(node);
  const c = box.getCenter(new Vector3());
  const anchor = new Vector3(c.x, box.min.y, c.z);
  const world = node.matrixWorld.clone();
  node.removeFromParent();
  const pivot = new Group();
  world.premultiply(new Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z));
  world.decompose(node.position, node.quaternion, node.scale);
  pivot.add(node);
  return { pivot, anchor };
}

function meshesOf(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); });
  return out;
}

export class Props {
  group = new Group();
  emitters: Emitter[] = [];
  targets: Target[] = [];
  letterPivots: Group[] = [];
  letterAnchors: Vector3[] = [];
  letterNeon: MeshBasicMaterial[] = [];
  letterPower: number[] = [0, 0, 0, 0, 0, 0, 0];
  letterSink: number[] = [];
  letterTilt: Vector3[] = [];
  plinth!: Mesh;
  toriiNeon: Mesh[] = [];
  lanternLights: { level: number; target: number; method: boolean; x: number; z: number }[] = [];
  lanternMesh!: InstancedMesh;
  lanternGlow!: Points;
  private lcol = new Color();
  worldScreens: ShaderMaterial[] = [];
  clientScreens: ShaderMaterial[] = [];
  ring = new Group();
  ringMesh!: InstancedMesh;
  ringMat!: ShaderMaterial;
  ringCount = 0;
  ringSpin = 0;
  ringVel = 0.03;
  ringDrag = 0;
  ema: Group[] = [];
  deskScreen!: ShaderMaterial;
  deskVideo: HTMLVideoElement | null = null;
  deskOn = 0;
  private playTried = -1e9;
  signs: Mesh[] = [];
  guide!: Mesh;
  private moss: ReturnType<typeof mossMaterial>[] = [];

  constructor(private a: Assets, private shadows: boolean, data: { studies: number; tiers: { n: string; name: string }[] }) {
    this.group.name = 'props';
    this.buildLetters();
    this.buildTorii();
    this.buildLanterns();
    this.buildMonoliths();
    this.buildRack();
    this.buildRing(data.studies);
    this.buildEma(data.tiers);
    this.buildDesk();
    this.buildRocks();
    this.buildCables();
    this.buildGuide();
    this.buildSigns();
  }

  private mossMat(kind: 'concrete' | 'stone' | 'lacquer' | 'metal' | 'dark', ao?: keyof Assets['tex'], extra: Partial<Parameters<typeof mossMaterial>[0]> = {}) {
    const t = this.a.tex;
    const base = kind === 'concrete' || kind === 'dark' ? t.concrete : kind === 'stone' ? t.stone : kind === 'lacquer' ? t.lacquer : t.metal;
    const baseN = kind === 'concrete' || kind === 'dark' ? t.concreteN : kind === 'stone' ? t.stoneN : kind === 'lacquer' ? t.lacquerN : t.metalN;
    const m = mossMaterial({
      base, baseN, moss: t.moss, mossN: t.mossN, noise: t.noise, ao: ao ? t[ao] : undefined,
      tint: kind === 'dark' ? new Color(0.2, 0.2, 0.21) : undefined,
      ...extra
    });
    this.moss.push(m);
    return m;
  }

  // ── SUMANTH ──────────────────────────────────────────────────────────────
  private buildLetters() {
    const scene = this.a.models.letters;
    const mat = this.mossMat('concrete', 'aoLetters', { baseScale: 0.28, mossScale: 0.75, mossLow: 0.35, mossAmount: 1.05 });
    const r = rng(3);
    for (let i = 0; i < 7; i += 1) {
      const node = scene.getObjectByName(`letter_${i}`)!;
      const { pivot, anchor } = pivotOf(node);
      for (const m of meshesOf(pivot)) {
        if (m.name.startsWith('neon')) {
          const nm = neonMaterial(NEON.teal, 0);
          m.material = nm;
          this.letterNeon.push(nm);
        } else {
          m.material = mat;
          m.castShadow = this.shadows;
          m.receiveShadow = true;
        }
      }
      pivot.scale.setScalar(LETTER_SCALE);
      this.letterPivots.push(pivot);
      this.letterAnchors.push(anchor);
      this.letterSink.push(0.35 + r() * 0.5);
      this.letterTilt.push(new Vector3((r() - 0.5) * 0.08, (r() - 0.5) * 0.12, (r() - 0.5) * 0.11));
      this.group.add(pivot);
      this.targets.push({ object: pivot, kind: 'home', index: i });
    }
    // a drowned concrete plinth that only surfaces in the portrait layout
    this.plinth = new Mesh(new BoxGeometry(1, 1, 1), mat);
    this.plinth.visible = false;
    this.group.add(this.plinth);
    this.layoutLetters(16 / 9);
  }

  layoutLetters(aspect: number) {
    const tall = aspect < 0.95;
    const xs = this.letterAnchors.map((a) => a.x * LETTER_SCALE);
    this.letterPivots.forEach((p, i) => {
      let x = xs[i], z = LETTERS_Z - Math.abs(xs[i]) * 0.06, y = -this.letterSink[i];
      if (tall) {
        // portrait: SUM stands on a drowned plinth behind, ANTH in the water in front
        const row = i < 3 ? 0 : 1;
        const ids = row === 0 ? [0, 1, 2] : [3, 4, 5, 6];
        const mean = ids.reduce((s, k) => s + xs[k], 0) / ids.length;
        x = (xs[i] - mean) * 0.96;
        z = row === 0 ? LETTERS_Z - 4 : LETTERS_Z + 2.5;
        y = row === 0 ? 2.1 - this.letterSink[i] * 0.3 : -this.letterSink[i] * 0.6;
      }
      p.position.set(x, y, z);
      const t = this.letterTilt[i];
      p.rotation.set(t.x, t.y - x * 0.012, t.z);
    });
    if (tall) {
      const ids = [0, 1, 2];
      const w = Math.max(...ids.map((k) => Math.abs(this.letterPivots[k].position.x))) * 2 + 3.4;
      this.plinth.visible = true;
      this.plinth.scale.set(w, 3.4, 2.2);
      this.plinth.position.set(0, 2.1 - 1.7 - 0.12, LETTERS_Z - 4);
    } else {
      this.plinth.visible = false;
    }
    // light emitters for the neon (re-register positions)
    this.emitters = this.emitters.filter((e) => !(e as Emitter & { letter?: boolean }).letter);
    this.letterPivots.forEach((p, i) => {
      const e: Emitter & { letter?: boolean } = {
        pos: p.position.clone().add(new Vector3(0, 1.4, 1.1)), color: new Color(NEON.teal), intensity: 2.4, range: 8,
        level: () => this.letterPower[i]
      };
      e.letter = true;
      this.emitters.push(e);
    });
  }

  // ── torii ────────────────────────────────────────────────────────────────
  private buildTorii() {
    const scene = this.a.models.torii;
    const body = scene.getObjectByName('torii_body') as Mesh;
    const kasagi = scene.getObjectByName('torii_kasagi') as Mesh;
    body.material = this.mossMat('lacquer', 'aoTorii', { baseScale: 0.42, mossScale: 0.8, mossAmount: 0.7, mossLow: 0.2, roughness: 0.55 });
    kasagi.material = this.mossMat('dark', 'aoKasagi', { baseScale: 0.4, mossAmount: 1.25, roughness: 0.7 });
    for (const m of [body, kasagi]) { m.castShadow = this.shadows; m.receiveShadow = true; }
    const g = new Group();
    g.add(scene);
    g.scale.setScalar(TORII.scale);
    g.position.set(TORII.x, -0.05, TORII.z);
    this.group.add(g);
    // neon: under the shimaki, and up the face of each pillar
    const under: Vector3[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const x = -4.1 + (8.2 * i) / 24;
      const t = Math.abs(x) / 4.2;
      under.push(new Vector3(x, 5.5 + 0.3 * t ** 3.2, 0.27));
    }
    const n1 = neonTube(under, NEON.red, 0.028, 9);
    g.add(n1);
    this.toriiNeon.push(n1);
    for (const s of [-1, 1]) {
      const pts = [0.15, 1.5, 3, 4.5].map((y) => new Vector3(s * (2.72 - y * 0.028), y, 0.37));
      const n = neonTube(pts, NEON.red, 0.024, 8);
      g.add(n);
      this.toriiNeon.push(n);
    }
    const plaque = neonSign({ lines: [{ text: '苔経蔵', font: '800 {s}px "Shippori Mincho B1", serif', size: 64 }], color: NEON.amber, width: 0.42, vertical: true, intensity: 2.6, pad: 18 });
    plaque.position.set(0, 5.2, 0.2);
    g.add(plaque);
    const sea = new Group();
    sea.add(scene.clone(true));
    const seaNeon = neonTube(under, NEON.red, 0.05, 7);
    sea.add(seaNeon);
    this.toriiNeon.push(seaNeon);
    sea.scale.setScalar(SEA_TORII.scale);
    sea.position.set(SEA_TORII.x, -1.4, SEA_TORII.z);
    sea.rotation.y = 0.04;
    this.group.add(sea);
    const wp = new Vector3();
    for (const x of [-2.7, 0, 2.7]) {
      wp.set(TORII.x + x * TORII.scale, 5.6 * TORII.scale, TORII.z + 0.5);
      this.emitters.push({ pos: wp.clone(), color: new Color(NEON.red), intensity: 6, range: 12, level: () => 1 });
    }
  }

  // ── stone lanterns (instanced: stone, paper light, glow) ─────────────────
  private buildLanterns() {
    const scene = this.a.models.toro;
    const stoneMat = this.mossMat('stone', 'aoToro', { baseScale: 0.9, mossScale: 1.1, mossAmount: 1.15 });
    const spots: { x: number; z: number; sink?: number; method?: boolean; s?: number }[] = [
      { x: -7.5, z: 7.4 }, { x: 7.9, z: 6.4 },
      { x: -6.2, z: -16.4, sink: 0.7 }, { x: 6.2, z: -16.4, sink: 0.7 },
      { x: -7.2, z: -47.5 }, { x: 1.4, z: -48.2 },
      ...LANTERNS.map((l) => ({ ...l, method: true, s: 1.1 })),
      { x: -6.4, z: -110.2 }, { x: 0.5, z: -110.4 },
      { x: -3.9, z: -154.4 }, { x: 1.9, z: -154.6 },
      { x: -9.2, z: -167.4 }, { x: 3.2, z: -167.8 },
      { x: HALL.x - 4.6, z: SHORE.z1 + 0.6, s: 1.15 }, { x: HALL.x + 4.6, z: SHORE.z1 + 0.6, s: 1.15 }
    ];
    const stoneGeo = bakedGeometry(scene.getObjectByName('toro') as Mesh);
    const lightGeo = bakedGeometry(scene.getObjectByName('toro_light') as Mesh);
    stoneGeo.computeVertexNormals();
    const n = spots.length;
    const stone = new InstancedMesh(stoneGeo, stoneMat, n);
    const lights = new InstancedMesh(lightGeo, new MeshBasicMaterial({ color: 0xffffff }), n);
    const glowPos = new Float32Array(n * 3), glowCol = new Float32Array(n * 3);
    const m4 = new Matrix4(), q = new Quaternion(), sc = new Vector3(), pv = new Vector3(), up = new Vector3(0, 1, 0);
    spots.forEach((sp, i) => {
      const k = sp.s ?? 1;
      const y = floorAt(sp.x, sp.z) - (sp.sink ?? 0.05);
      q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
      m4.compose(pv.set(sp.x, y, sp.z), q, sc.set(k, k, k));
      stone.setMatrixAt(i, m4);
      lights.setMatrixAt(i, m4);
      lights.setColorAt(i, new Color(0, 0, 0));
      glowPos.set([sp.x, y + 1.6 * k, sp.z], i * 3);
      const rec = { level: sp.method ? 0 : 1, target: sp.method ? 0 : 1, method: !!sp.method, x: sp.x, z: sp.z };
      this.lanternLights.push(rec);
      this.emitters.push({ pos: new Vector3(sp.x, y + 1.6 * k, sp.z), color: new Color(NEON.amber), intensity: 4, range: 8, level: () => rec.level });
    });
    stone.castShadow = this.shadows;
    stone.receiveShadow = true;
    stone.computeBoundingSphere();
    lights.computeBoundingSphere();
    stone.name = 'lanterns';
    lights.name = 'lantern-lights';
    const gg = new BufferGeometry();
    gg.setAttribute('position', new BufferAttribute(glowPos, 3));
    gg.setAttribute('color', new BufferAttribute(glowCol, 3));
    const glow = new Points(gg, new PointsMaterial({ size: 2.4, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
    glow.name = 'lantern-glow';
    glow.renderOrder = 6;
    this.lanternMesh = lights;
    this.lanternGlow = glow;
    this.group.add(stone, lights, glow);
  }

  /** Method stop: light lanterns up to `n` (0–7, fractional). */
  setMethodProgress(n: number) {
    let k = 0;
    for (const l of this.lanternLights) {
      if (!l.method) continue;
      l.target = n > k + 0.2 ? 1 : 0;
      k += 1;
    }
  }

  // ── monolith screens: the three worlds ───────────────────────────────────
  private buildMonoliths() {
    const t = this.a.tex;
    const worlds = [t.worldA, t.worldB, t.worldC];
    const tints = [new Color(1.0, 0.72, 0.8), new Color(1.0, 0.62, 0.3), new Color(0.3, 1.0, 0.85)];
    const bodyMat = this.mossMat('concrete', 'aoMonolith', { baseScale: 0.4, mossAmount: 1.1 });
    WORLD_MONOLITHS.forEach((mp, i) => {
      const g = this.a.models.monolith.clone(true);
      for (const m of meshesOf(g)) {
        if (m.name.includes('screen')) {
          ensurePlanarUV(m);
          const sm = screenMaterial({ map: worlds[i], tint: tints[i], gain: 1.4, curve: 0.04, lines: 220, noise: 0.02, scan: 0.1 });
          m.material = sm;
          this.worldScreens.push(sm);
          this.targets.push({ object: m, kind: 'world', index: i });
        } else {
          m.material = bodyMat;
          m.castShadow = this.shadows;
          m.receiveShadow = true;
        }
      }
      g.position.set(mp.x, heightAt(mp.x, mp.z) - 0.15, mp.z);
      g.rotation.y = Math.atan2(mp.faceX - mp.x, mp.faceZ - mp.z);
      g.rotation.z = (i - 1) * 0.025;
      this.group.add(g);
      const front = new Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
      this.emitters.push({ pos: g.position.clone().add(new Vector3(0, 1.6, 0)).addScaledVector(front, 1.4), color: tints[i].clone(), intensity: 3.2, range: 9, level: () => 1 });
    });
  }

  // ── the CRT rack: sixteen clients ────────────────────────────────────────
  private buildRack() {
    const scene = this.a.models.rack;
    const t = this.a.tex;
    const body = this.mossMat('metal', 'aoRack', { baseScale: 0.7, mossScale: 1.0, mossAmount: 0.85, metalness: 0.35, roughness: 0.6 });
    for (const m of meshesOf(scene)) {
      const match = /screen_(\d+)/.exec(m.name);
      if (match) {
        const i = Number(match[1]);
        ensurePlanarUV(m);
        const col = i % 4, row = Math.floor(i / 4);
        const sm = screenMaterial({ map: t.clientsAtlas, rect: new Vector4(col / 4, 1 - (row + 1) / 4, 1 / 4, 1 / 4), tint: new Color(NEON.teal), gain: 1.3, curve: 0.28, lines: 120 });
        m.material = sm;
        this.clientScreens[i] = sm;
        this.targets.push({ object: m, kind: 'client', index: i });
      } else {
        m.material = body;
        m.castShadow = this.shadows;
        m.receiveShadow = true;
      }
    }
    const g = new Group();
    g.add(scene);
    g.scale.setScalar(1.15);
    g.position.set(RACK.x, heightAt(RACK.x, RACK.z) - 0.05, RACK.z);
    g.rotation.y = 0.04;
    this.group.add(g);
    this.emitters.push({ pos: new Vector3(RACK.x - 1, 1.6, RACK.z + 1.5), color: new Color(NEON.teal), intensity: 3, range: 8, level: () => 1 });
    this.emitters.push({ pos: new Vector3(RACK.x + 1.2, 2.4, RACK.z + 1.5), color: new Color(0.7, 0.85, 1), intensity: 2.5, range: 8, level: () => 1 });
  }

  // ── the library ring: studies orbiting the ancient tree ──────────────────
  private buildRing(count: number) {
    const t = this.a.tex;
    this.ringCount = count;
    const perRow = Math.ceil(count / 2);
    const geo = new PlaneGeometry(1.0, 1.25);
    const idx = new Float32Array(count);
    for (let i = 0; i < count; i += 1) idx[i] = i;
    geo.setAttribute('aIndex', new InstancedBufferAttribute(idx, 1));
    this.ringMat = screenMaterial({ map: t.studiesAtlas, instanced: true, grid: [8, 5], tint: new Color(NEON.teal), gain: 1.25, curve: 0.02, lines: 150, noise: 0.012, scan: 0.07 });
    this.ringMesh = new InstancedMesh(geo, this.ringMat, count);
    const m4 = new Matrix4(), q = new Quaternion(), s = new Vector3(1, 1, 1), p = new Vector3(), y = new Vector3(0, 1, 0);
    const R = LIBRARY_TREE.ringR;
    for (let i = 0; i < count; i += 1) {
      const row = i < perRow ? 0 : 1;
      const k = row === 0 ? i : i - perRow;
      const n = row === 0 ? perRow : count - perRow;
      const ang = (k / n) * Math.PI * 2 + row * (Math.PI / n);
      p.set(Math.cos(ang) * R, row === 0 ? 1.45 : 2.95, Math.sin(ang) * R);
      q.setFromAxisAngle(y, Math.atan2(Math.cos(ang), Math.sin(ang)));
      m4.compose(p, q, s);
      this.ringMesh.setMatrixAt(i, m4);
    }
    this.ringMesh.computeBoundingSphere();
    this.ring.add(this.ringMesh);
    for (const hy of [0.62, 3.78]) {
      const hoop = new Mesh(new TorusGeometry(R, 0.028, 8, 160), neonMaterial(NEON.teal, 5));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = hy;
      this.ring.add(hoop);
    }
    this.ring.position.set(LIBRARY_TREE.x, heightAt(LIBRARY_TREE.x, LIBRARY_TREE.z + R), LIBRARY_TREE.z);
    this.group.add(this.ring);
    this.targets.push({ object: this.ringMesh, kind: 'study', index: -1 });
    this.emitters.push({ pos: new Vector3(LIBRARY_TREE.x, 2.2, LIBRARY_TREE.z + R + 1), color: new Color(NEON.teal), intensity: 3.5, range: 10, level: () => 1 });
    this.emitters.push({ pos: new Vector3(LIBRARY_TREE.x - R, 2.2, LIBRARY_TREE.z), color: new Color(0.6, 0.8, 1), intensity: 2.5, range: 9, level: () => 1 });
  }

  /** Index of the ring panel nearest the camera. */
  frontStudy(cam: PerspectiveCamera): number {
    let best = -1, bd = Infinity;
    const m4 = new Matrix4(), p = new Vector3();
    this.ring.updateMatrixWorld();
    for (let i = 0; i < this.ringCount; i += 1) {
      this.ringMesh.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4).applyMatrix4(this.ring.matrixWorld);
      const d = p.distanceToSquared(cam.position) + (p.y > 2.5 ? 1.2 : 0);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** Spin the ring so panel `i` faces the camera. */
  focusStudy(i: number, cam: PerspectiveCamera) {
    const perRow = Math.ceil(this.ringCount / 2);
    const row = i < perRow ? 0 : 1;
    const k = row === 0 ? i : i - perRow;
    const n = row === 0 ? perRow : this.ringCount - perRow;
    const ang = (k / n) * Math.PI * 2 + row * (Math.PI / n);
    const toCam = Math.atan2(cam.position.z - this.ring.position.z, cam.position.x - this.ring.position.x);
    // ring.rotation.y = φ rotates local angle a to a - φ in world
    let target = ang - toCam;
    const cur = this.ring.rotation.y;
    target = cur + Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
    this.ringTarget = target;
  }
  ringTarget: number | null = null;

  // ── ema plaques: commissions ─────────────────────────────────────────────
  private buildEma(tiers: { n: string; name: string }[]) {
    const x0 = EMA.x - 3.3, x1 = EMA.x + 3.3, yTop = 2.85;
    const ropePts: Vector3[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      ropePts.push(new Vector3(x0 + (x1 - x0) * t, yTop - Math.sin(t * Math.PI) * 0.42, EMA.z));
    }
    const rope = new Mesh(new TubeGeometry(new CatmullRomCurve3(ropePts), 60, 0.055, 8, false), new MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.95 }));
    this.group.add(rope);
    const glowRope = neonTube(ropePts.map((p) => p.clone().add(new Vector3(0, -0.07, 0.05))), NEON.amber, 0.012, 4, 0.6);
    this.group.add(glowRope);
    const postMat = this.mossMat('lacquer', undefined, { baseScale: 0.5, mossAmount: 0.9 });
    for (const x of [x0, x1]) {
      const post = new Mesh(new CylinderGeometry(0.13, 0.16, 3.4, 12), postMat);
      post.position.set(x, heightAt(x, EMA.z) + 1.5, EMA.z);
      post.castShadow = this.shadows;
      this.group.add(post);
    }
    const shape = new Shape();
    shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.3, 0.34); shape.lineTo(0, 0.46); shape.lineTo(-0.3, 0.34); shape.closePath();
    const geo = new ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1 });
    geo.translate(0, -0.52, 0);
    // UVs for the face
    const pos = geo.getAttribute('position') as BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) { uv[i * 2] = (pos.getX(i) + 0.3) / 0.6; uv[i * 2 + 1] = (pos.getY(i) + 0.52) / 0.46; }
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    tiers.forEach((tier, i) => {
      const tex = emaTexture(tier.n, tier.name);
      const mat = new MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new Color(0.55, 0.45, 0.32), roughness: 0.85, side: DoubleSide });
      const plaque = new Mesh(geo, mat);
      const holder = new Group();
      const t = (i + 1) / (tiers.length + 1);
      holder.position.set(x0 + (x1 - x0) * t, yTop - Math.sin(t * Math.PI) * 0.42 - 0.02, EMA.z + 0.04);
      holder.add(plaque);
      const string = new Mesh(new CylinderGeometry(0.006, 0.006, 0.07, 4), new MeshBasicMaterial({ color: 0xd8c8a0 }));
      string.position.y = -0.035;
      holder.add(string);
      holder.userData.phase = i * 1.7;
      this.ema.push(holder);
      this.group.add(holder);
      this.targets.push({ object: plaque, kind: 'tier', index: i });
    });
    this.emitters.push({ pos: new Vector3(EMA.x, 2.2, EMA.z + 1.2), color: new Color(NEON.amber), intensity: 3, range: 7, level: () => 1 });
  }

  // ── the writing desk + koi basin: contact ────────────────────────────────
  private buildDesk() {
    const stone = this.mossMat('stone', undefined, { baseScale: 0.8, mossAmount: 1.1 });
    const gy = floorAt(DESK.x, DESK.z);
    const desk = new Group();
    desk.position.set(DESK.x, 0, DESK.z);
    desk.rotation.y = -0.55; // turned toward the visitor on the terrace
    this.group.add(desk);
    const top = new Mesh(new BoxGeometry(2.3, 0.16, 1.0), stone);
    top.position.set(0, gy + 0.86, 0);
    const legs = [-0.8, 0.8].map((dx) => {
      const l = new Mesh(new BoxGeometry(0.35, 0.8, 0.8), stone);
      l.position.set(dx, gy + 0.4, 0);
      return l;
    });
    for (const m of [top, ...legs]) { m.castShadow = this.shadows; m.receiveShadow = true; desk.add(m); }
    const crt = this.a.models.desk.clone(true);
    this.deskScreen = screenMaterial({ map: this.a.tex.worldA, tint: new Color(NEON.magenta), gain: 1.4, curve: 0.3, lines: 110 });
    this.deskScreen.uniforms.power.value = 0.001;
    for (const m of meshesOf(crt)) {
      if (m.name.includes('screen')) {
        ensurePlanarUV(m);
        m.material = this.deskScreen;
        this.targets.push({ object: m, kind: 'contact', index: 0 });
      } else {
        m.material = this.mossMat('metal', 'aoDesk', { baseScale: 1.2, mossAmount: 0.6, metalness: 0.3, roughness: 0.55 });
        m.castShadow = this.shadows;
      }
    }
    crt.position.set(0.25, gy + 0.94, -0.05);
    crt.rotation.y = -0.18;
    crt.scale.setScalar(1.35);
    desk.add(crt);

    this.emitters.push({ pos: new Vector3(DESK.x, gy + 1.9, DESK.z + 1.4), color: new Color(NEON.magenta), intensity: 4, range: 9, level: () => 1 });
  }

  setDeskActive(on: boolean, src: string) {
    if (on && !this.deskVideo) {
      const v = document.createElement('video');
      v.src = src;
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.crossOrigin = 'anonymous';
      this.deskVideo = v;
      const vt = new VideoTexture(v);
      vt.colorSpace = SRGBColorSpace;
      this.deskScreen.uniforms.map.value = vt;
    }
    if (!this.deskVideo) return;
    const now = performance.now();
    if (on && this.deskVideo.paused && now - this.playTried > 2500) {
      this.playTried = now;
      this.deskVideo.play().then(() => { this.deskOn = 1; }).catch(() => { this.deskOn = 1; });
    }
    if (!on && !this.deskVideo.paused) this.deskVideo.pause();
  }

  // ── rocks ────────────────────────────────────────────────────────────────
  private buildRocks() {
    const scene = this.a.models.rocks;
    const mat = this.mossMat('stone', 'aoRocks', { baseScale: 0.7, mossScale: 0.9, mossAmount: 1.3, mossLow: 0.4 });
    const geos: BufferGeometry[] = [];
    for (let i = 0; i < 4; i += 1) {
      const m = scene.getObjectByName(`rock_${i}`) as Mesh;
      const g = bakedGeometry(m);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      g.computeVertexNormals();
      geos.push(g);
    }
    const r = rng(42);
    const lists: [number, number, number, number, number][][] = [[], [], [], []];
    // pond rim
    for (let i = 0; i < 26; i += 1) {
      const a = r() * Math.PI * 2;
      const f = 0.97 + r() * 0.14;
      const x = POND.cx + Math.cos(a) * POND.rx * f, z = POND.cz + Math.sin(a) * POND.rz * f;
      if (z > 5 && Math.abs(x) < 5) continue;
      lists[i % 4].push([x, z, 0.7 + r() * 1.4, r() * 6.28, 0.25]);
    }
    // path edges and clearings
    let n = 0, tries = 0;
    while (n < 90 && tries < 3000) {
      tries += 1;
      const z = -20 - r() * 165, x = (r() * 2 - 1) * 14;
      const pd = pathDistance(x, z);
      if (pd < 1.7 || pd > 9) continue;
      if (inClearing(x, z, -2)) continue;
      lists[n % 4].push([x, z, 0.35 + r() * (r() < 0.15 ? 1.8 : 0.8), r() * 6.28, 0.1]);
      n += 1;
    }
    const m4 = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), ax = new Vector3();
    lists.forEach((list, vi) => {
      const mesh = new InstancedMesh(geos[vi], mat, list.length);
      list.forEach(([x, z, sc, rot, sink], i) => {
        ax.set(r() - 0.5, 3, r() - 0.5).normalize();
        q.setFromAxisAngle(ax, rot);
        s.set(sc, sc * (0.7 + r() * 0.5), sc);
        const pf = pondFactor(x, z);
        const y = pf < 1.05 ? Math.min(heightAt(x, z), -0.25) : heightAt(x, z);
        m4.compose(p.set(x, y - sink * sc, z), q, s);
        mesh.setMatrixAt(i, m4);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = true;
      mesh.name = 'rocks';
      this.group.add(mesh);
    });
  }

  // ── cables strung between the trees, some still carrying current ─────────
  private buildCables() {
    const r = rng(8);
    const cableMat = new MeshStandardMaterial({ color: 0x0b0d0c, roughness: 0.55, metalness: 0.2 });
    const mossTex = this.a.tex.hangingMoss;
    const hangMat = new MeshLambertMaterial({ map: mossTex, alphaTest: 0.35, side: DoubleSide, color: new Color(0.55, 0.62, 0.5) });
    const hangGeo = new PlaneGeometry(0.55, 1.9);
    hangGeo.translate(0, -0.95, 0);
    const hangs: Matrix4[] = [];
    const colors = [NEON.teal, NEON.magenta, NEON.amber, NEON.teal];
    const cables: BufferGeometry[] = [];
    for (let z = -26; z > -182; z -= 5 + r() * 6) {
      const c = pathCurve.getPointAt(Math.min(1, Math.max(0, (-(z) - 16) / 166)));
      const xa = c.x - (4 + r() * 5), xb = c.x + (4 + r() * 5);
      if (inClearing(c.x, z, 2) && r() < 0.6) continue;
      const ya = 4.2 + r() * 3.5, yb = 4.2 + r() * 3.5;
      const za = z + (r() - 0.5) * 5, zb = z + (r() - 0.5) * 5;
      const sag = 0.8 + r() * 1.6;
      const pts: Vector3[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        pts.push(new Vector3(xa + (xb - xa) * t, ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag, za + (zb - za) * t));
      }
      const curve = new CatmullRomCurve3(pts);
      cables.push(new TubeGeometry(curve, 40, 0.028 + r() * 0.02, 5, false));
      if (r() < 0.45) {
        const seg = pts.slice(3 + Math.floor(r() * 3), 11 + Math.floor(r() * 4)).map((p) => p.clone().add(new Vector3(0, -0.04, 0)));
        const col = colors[Math.floor(r() * colors.length)];
        const tube = neonTube(seg, col, 0.02, 5.5, r() < 0.5 ? 0.7 : 0);
        this.group.add(tube);
        const mid = seg[Math.floor(seg.length / 2)];
        this.emitters.push({ pos: mid.clone(), color: new Color(col), intensity: 2.2, range: 7, level: () => 1 });
      }
      const nh = 1 + Math.floor(r() * 4);
      for (let k = 0; k < nh; k += 1) {
        const pp = curve.getPoint(0.15 + r() * 0.7);
        const sc = 0.6 + r() * 0.9;
        hangs.push(new Matrix4().compose(pp, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6.28), new Vector3(sc, sc * (0.7 + r() * 0.8), sc)));
      }
    }
    // a few long strands over the pond, hanging from the torii and the near trees
    for (let i = 0; i < 10; i += 1) {
      const x = (r() * 2 - 1) * 4.4 * TORII.scale, sc = 0.7 + r() * 0.6;
      hangs.push(new Matrix4().compose(new Vector3(x, 5.2 * TORII.scale, TORII.z + (r() - 0.5) * 0.5), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 0.5), new Vector3(sc, sc * 1.2, sc)));
    }
    if (cables.length) {
      const merged = new Mesh(mergeAll(cables), cableMat);
      merged.name = 'cables';
      this.group.add(merged);
    }
    const hm = new InstancedMesh(hangGeo, hangMat, hangs.length);
    hangs.forEach((m, i) => hm.setMatrixAt(i, m));
    hm.computeBoundingSphere();
    hm.name = 'hanging-moss';
    this.group.add(hm);
  }

  // ── neon guide line along the walk ───────────────────────────────────────
  private buildGuide() {
    const pts: Vector3[] = [];
    const len = pathCurve.getLength();
    const steps = Math.round(len / 1.2);
    const tan = new Vector3(), side = new Vector3(), up = new Vector3(0, 1, 0);
    for (let i = 2; i <= steps; i += 1) {
      const u = i / steps;
      const p = pathCurve.getPointAt(u);
      pathCurve.getTangentAt(u, tan);
      side.crossVectors(tan, up).normalize();
      const x = p.x + side.x * 1.35, z = p.z + side.z * 1.35;
      pts.push(new Vector3(x, heightAt(x, z) + 0.13, z));
    }
    this.guide = neonTube(pts, NEON.teal, 0.016, 3.2, 1);
    this.guide.name = 'guide';
    this.group.add(this.guide);
  }

  // ── station signage ──────────────────────────────────────────────────────
  private buildSigns() {
    const latin = '800 {s}px "Archivo Variable", "Archivo", sans-serif';
    const kanji = '800 {s}px "Shippori Mincho B1", serif';
    const make = (jp: string, en: string, color: number, w: number, x: number, y: number, z: number, ry = 0) => {
      const s = neonSign({ lines: [{ text: jp, font: kanji, size: 70 }, { text: en, font: latin, size: 34, tracking: 0.28 }], color, width: w });
      s.position.set(x, y, z);
      s.rotation.y = ry;
      this.group.add(s);
      this.signs.push(s);
      return s;
    };
    make('世界', 'WORLDS', NEON.teal, 1.7, -3, 4.7, -60, 0);
    make('七手', 'METHOD', NEON.amber, 1.4, 5.3, 3.4, -69, -0.5);
    make('顧客', 'CLIENTS', NEON.magenta, 1.5, -3, 4.35, -114.6, 0.04);
    make('書庫', 'LIBRARY', NEON.teal, 1.8, 4, 5.6, -134.1, 0);
    make('絵馬', 'COMMISSIONS', NEON.amber, 1.6, -1, 4.1, -158.3, 0);
    const hello = neonSign({ lines: [{ text: 'SAY HELLO', font: latin, size: 96, tracking: 0.08 }], color: NEON.magenta, width: 3.4, intensity: 2.8 });
    hello.position.set(DESK.x + 0.4, floorAt(DESK.x, DESK.z) + 2.55, DESK.z - 1.9);
    hello.rotation.y = -0.45;
    hello.scale.setScalar(0.62);
    this.group.add(hello);
    this.signs.push(hello);
    const tegami = neonSign({ lines: [{ text: '手紙', font: kanji, size: 80 }], color: NEON.teal, width: 0.5, vertical: true, intensity: 2.4 });
    tegami.position.set(DESK.x + 2.2, floorAt(DESK.x, DESK.z) + 1.9, DESK.z - 0.9);
    tegami.rotation.y = -0.45;
    make('洞', 'ABOUT', NEON.teal, 1.2, -5.6, 3.3, -186.5, 0.45);
    this.group.add(tegami);
    this.signs.push(tegami);
  }

  update(t: number, dt: number) {
    // letters: power follows the intro, with a nervous flicker
    this.letterNeon.forEach((m, i) => {
      const f = Math.sin(t * 60 + i * 7) > 0.97 - (1 - this.letterPower[i]) * 0.3 ? 0.35 : 1;
      const k = this.letterPower[i] * f * (0.93 + 0.07 * Math.sin(t * 3 + i));
      m.color.copy(m.userData.base).multiplyScalar(7.5 * k);
    });
    const gc = this.lanternGlow.geometry.getAttribute('color') as BufferAttribute;
    this.lanternLights.forEach((l, i) => {
      l.level += (l.target - l.level) * Math.min(1, dt * 2.5);
      const fl = 0.88 + 0.12 * Math.sin(t * 11 + l.x) * Math.sin(t * 7.3 + l.z);
      this.lcol.set(NEON.amber).multiplyScalar(3.2 * l.level * fl);
      this.lanternMesh.setColorAt(i, this.lcol);
      this.lcol.set(NEON.amber).multiplyScalar(1.1 * l.level * fl);
      gc.setXYZ(i, this.lcol.r, this.lcol.g, this.lcol.b);
    });
    this.lanternMesh.instanceColor!.needsUpdate = true;
    gc.needsUpdate = true;
    // ring: idle drift, drag, or a spin toward a chosen panel
    if (this.ringTarget !== null) {
      this.ring.rotation.y += (this.ringTarget - this.ring.rotation.y) * Math.min(1, dt * 3);
      if (Math.abs(this.ringTarget - this.ring.rotation.y) < 0.002) this.ringTarget = null;
    } else {
      this.ring.rotation.y += (this.ringVel + this.ringDrag) * dt;
      this.ringDrag *= Math.pow(0.12, dt);
    }
    for (const e of this.ema) {
      e.rotation.z = Math.sin(t * 0.9 + e.userData.phase) * 0.06;
      e.rotation.x = Math.sin(t * 0.7 + e.userData.phase * 1.3) * 0.08;
    }
    const pw = this.deskScreen.uniforms.power;
    pw.value += (this.deskOn - pw.value) * Math.min(1, dt * 1.5);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    if (this.deskVideo) { this.deskVideo.pause(); this.deskVideo.src = ''; }
  }
}

function mergeAll(list: BufferGeometry[]): BufferGeometry {
  // cables only carry position/normal/uv, so a straight concat is safe
  let verts = 0, idx = 0;
  for (const g of list) { verts += g.getAttribute('position').count; idx += g.index!.count; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), uv = new Float32Array(verts * 2);
  const index = new Uint32Array(idx);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.getAttribute('position').array as Float32Array;
    const n = g.getAttribute('normal').array as Float32Array;
    const u = g.getAttribute('uv').array as Float32Array;
    pos.set(p, vo * 3); nor.set(n, vo * 3); uv.set(u, vo * 2);
    const ii = g.index!.array;
    for (let k = 0; k < ii.length; k += 1) index[io + k] = ii[k] + vo;
    vo += p.length / 3; io += ii.length;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setIndex(new BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

function emaTexture(n: string, name: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 400;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 400);
  grd.addColorStop(0, '#b89468'); grd.addColorStop(1, '#8c6a44');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 400);
  g.globalAlpha = 0.12;
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = i % 2 ? '#5a3f22' : '#d8b98a';
    g.beginPath();
    const y = Math.random() * 400;
    g.moveTo(0, y); g.bezierCurveTo(170, y + 6, 340, y - 6, 512, y + 3);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#1b120a';
  g.textAlign = 'center';
  g.font = '800 120px "Archivo Variable", "Archivo", sans-serif';
  g.fillText(n, 256, 190);
  g.font = '700 44px "Archivo Variable", "Archivo", sans-serif';
  g.fillText(name.toUpperCase(), 256, 270);
  g.fillStyle = '#b3261e';
  g.beginPath(); g.arc(256, 330, 16, 0, Math.PI * 2); g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}


