// Things that move on their own: koi under the hall's lilies, paper lanterns
// drifting down the cave channel into the pool, paper cranes over the canopy
// and out across the sea toward the moon, and butterflies.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points,
  PointsMaterial, Quaternion, ShaderMaterial, SRGBColorSpace, UniformsLib, UniformsUtils, Vector3
} from 'three';
import { bakedGeometry } from './props';
import { HALL, LIBRARY_TREE, MOON_SET, POND, SHORE, CLEARINGS } from './layout';
import { caveCenter } from './cave';
import { HALL_POOL } from './hall';
import { shared } from './materials';
import { glowTexture } from './neon';
import { rng } from './treegen';

// ── koi ─────────────────────────────────────────────────────────────────────
function koiGeometry(): BufferGeometry {
  const segs = 14, ring = 8;
  const pos: number[] = [], nor: number[] = [], at: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const prof = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) ** 0.8 * (1 - t * 0.55);
    for (let k = 0; k < ring; k += 1) {
      const a = (k / ring) * Math.PI * 2;
      const y = Math.sin(a) * 0.055 * prof, z = Math.cos(a) * 0.075 * prof;
      pos.push(0.3 - t * 0.6, y, z);
      nor.push(0, Math.sin(a), Math.cos(a));
      at.push(t);
    }
  }
  for (let i = 0; i < segs; i += 1) {
    for (let k = 0; k < ring; k += 1) {
      const a = i * ring + k, b = i * ring + ((k + 1) % ring), c = a + ring, d = b + ring;
      idx.push(a, c, b, b, c, d);
    }
  }
  // tail fin and pectorals as flat, flowing quads
  const fin = (verts: number[][], t: number[]) => {
    const b = pos.length / 3;
    for (let i = 0; i < verts.length; i += 1) { pos.push(...verts[i]); nor.push(0, 1, 0); at.push(t[i]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  fin([[-0.28, 0, -0.01], [-0.44, 0.0, -0.13], [-0.47, 0, 0], [-0.44, 0, 0.13]], [0.95, 1.25, 1.3, 1.25]);
  fin([[0.14, -0.02, 0.05], [0.07, -0.03, 0.16], [0.02, -0.03, 0.14], [0.08, -0.02, 0.05]], [0.3, 0.45, 0.45, 0.3]);
  fin([[0.14, -0.02, -0.05], [0.08, -0.02, -0.05], [0.02, -0.03, -0.14], [0.07, -0.03, -0.16]], [0.3, 0.3, 0.45, 0.45]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('aT', new Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  return g;
}

function koiSchool(n: number, area: { x0: number; x1: number; z0: number; z1: number }, depth: number, seed: number): InstancedMesh {
  const r = rng(seed);
  const geo = koiGeometry();
  const p1 = new Float32Array(n * 4), p2 = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const PAL = [[1.0, 0.42, 0.1], [1.0, 1.0, 0.98], [0.95, 0.72, 0.25], [1.0, 0.95, 0.9], [0.9, 0.3, 0.12]];
  for (let i = 0; i < n; i += 1) {
    const cx = area.x0 + (area.x1 - area.x0) * (0.3 + r() * 0.4), cz = area.z0 + (area.z1 - area.z0) * (0.15 + r() * 0.7);
    p1.set([cx, cz, (area.x1 - area.x0) * (0.18 + r() * 0.18), Math.abs(area.z1 - area.z0) * (0.08 + r() * 0.3)], i * 4);
    p2.set([(0.12 + r() * 0.16) * (r() < 0.5 ? 1 : -1), r() * 6.28, depth + (r() - 0.5) * 0.18, 0.8 + r() * 0.7], i * 4);
    col.set(PAL[Math.floor(r() * PAL.length)], i * 3);
  }
  geo.setAttribute('aP1', new InstancedBufferAttribute(p1, 4));
  geo.setAttribute('aP2', new InstancedBufferAttribute(p2, 4));
  geo.setAttribute('aCol', new InstancedBufferAttribute(col, 3));
  const mat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time;
      attribute float aT; attribute vec4 aP1, aP2; attribute vec3 aCol;
      varying vec3 vCol; varying vec3 vN; varying vec2 vL; varying float vSeed;
      void main(){
        float th = aP2.y + time * aP2.x;
        vec2 c = aP1.xy + vec2(cos(th) * aP1.z, sin(th * 1.0) * aP1.w + sin(th * 2.3) * aP1.w * 0.25);
        vec2 dc = vec2(-sin(th) * aP1.z, cos(th) * aP1.w + cos(th * 2.3) * aP1.w * 0.575) * sign(aP2.x);
        vec2 fwd = normalize(dc);
        vec3 p = position * aP2.w;
        // swim: a travelling wave down the body, stronger toward the tail
        p.z += sin(aT * 5.5 - time * 6.0 * abs(aP2.x) * 4.0 - aP2.y) * 0.05 * aT * aT * aP2.w;
        vec3 side = vec3(-fwd.y, 0.0, fwd.x);
        vec3 w = vec3(c.x, aP2.z, c.y) + vec3(fwd.x, 0.0, fwd.y) * p.x + vec3(0.0, p.y, 0.0) + side * p.z;
        vN = normalize(vec3(fwd.x, 0.0, fwd.y) * normal.x + vec3(0.0, normal.y, 0.0) + side * normal.z);
        vCol = aCol; vL = position.xz * 7.0; vSeed = aP2.y;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vCol; varying vec3 vN; varying vec2 vL; varying float vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        // kohaku-style patches: red on white, some fish all gold
        float spots = smoothstep(0.45, 0.55, vn(vL + vSeed * 7.0));
        vec3 red = vec3(0.95, 0.2, 0.06);
        vec3 c = mix(vCol, red, spots * step(0.9, vCol.b));
        float l = 0.45 + 0.55 * max(vN.y, 0.0);
        c *= l;
        // seen through a little water
        c = mix(c, vec3(0.05, 0.16, 0.14), 0.28);
        gl_FragColor = vec4(c * 1.35, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
    side: DoubleSide
  });
  mat.uniforms.time = shared.time;
  const mesh = new InstancedMesh(geo, mat, n);
  for (let i = 0; i < n; i += 1) mesh.setMatrixAt(i, new Matrix4());
  mesh.frustumCulled = false;
  mesh.name = 'koi';
  return mesh;
}

// ── paper cranes ────────────────────────────────────────────────────────────
function craneGeometry(): BufferGeometry {
  // x forward; wings hinge on the x axis; aW marks how far a vertex is along a wing
  const v = [
    // body: a folded diamond with neck and tail spikes
    [0.0, 0.05, 0], [0.12, 0, 0], [0.0, -0.05, 0.0],
    [0.0, 0.05, 0], [-0.12, 0, 0], [0.0, -0.05, 0.0],
    [0.1, 0.0, 0], [0.26, 0.12, 0], [0.12, 0.02, 0],
    [-0.1, 0.0, 0], [-0.26, 0.1, 0], [-0.12, 0.02, 0],
    [0.26, 0.12, 0], [0.3, 0.1, 0], [0.24, 0.1, 0],
    // wings
    [0.06, 0.02, 0], [-0.08, 0.02, 0], [-0.02, 0.02, 0.32],
    [0.06, 0.02, 0], [-0.08, 0.02, 0], [-0.02, 0.02, -0.32]
  ];
  const w = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v.flat(), 3));
  g.setAttribute('aW', new Float32BufferAttribute(w, 1));
  g.computeVertexNormals();
  return g;
}

function craneMaterial(glow: number): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, glow: { value: glow } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time; attribute float aW; varying float vShade;
      void main(){
        float ph = float(gl_InstanceID) * 1.37;
        float flap = sin(time * 5.0 + ph) * 0.9;
        vec3 p = position;
        float a = flap * aW;
        p.y += abs(aW) * sin(abs(a)) * 0.3 * sign(flap);
        p.z *= mix(1.0, cos(a), abs(aW));
        vShade = 0.65 + 0.35 * abs(aW) * (0.5 + 0.5 * sin(time * 5.0 + ph + 1.0));
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float glow; varying float vShade;
      void main(){
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.85) * vShade * glow, 1.0);
        #include <fog_fragment>
      }`,
    side: DoubleSide,
    fog: true
  });
  m.uniforms.time = shared.time;
  return m;
}

// ── butterflies ─────────────────────────────────────────────────────────────
function butterflyGeometry(): BufferGeometry {
  const v = [
    [0, 0, 0], [0.05, 0, 0.07], [-0.02, 0, 0.09],
    [0, 0, 0], [-0.02, 0, 0.09], [-0.05, 0, 0.04],
    [0, 0, 0], [0.05, 0, -0.07], [-0.02, 0, -0.09],
    [0, 0, 0], [-0.02, 0, -0.09], [-0.05, 0, -0.04]
  ];
  const w = [0, 1, 1, 0, 1, 1, 0, -1, -1, 0, -1, -1];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v.flat(), 3));
  g.setAttribute('aW', new Float32BufferAttribute(w, 1));
  return g;
}

export interface Fauna { group: Group; update(t: number, dt: number, cam: Vector3): void }

/** Washi paper for the floating lanterns: warm, fibrous, an ink ensō brushed on each wall. */
function washiTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, '#fff2d6'); grd.addColorStop(0.55, '#ffd9a0'); grd.addColorStop(1, '#e8a860');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const r = rng(99);
  g.globalAlpha = 0.12;
  g.strokeStyle = '#a0643a';
  for (let i = 0; i < 90; i += 1) {
    g.lineWidth = 0.5 + r();
    g.beginPath();
    const x = r() * 128, y = r() * 128;
    g.moveTo(x, y);
    g.bezierCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
    g.stroke();
  }
  g.globalAlpha = 0.55;
  g.strokeStyle = '#3a2416';
  g.lineCap = 'round';
  for (let k = 0; k < 3; k += 1) {
    g.lineWidth = 5 - k * 1.4;
    g.beginPath();
    g.arc(64, 60, 26 + k * 0.8, -1.2 + k * 0.05, 4.4 - k * 0.1);
    g.stroke();
  }
  g.globalAlpha = 1;
  const vg = g.createRadialGradient(64, 64, 30, 64, 64, 90);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,40,10,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildFauna(tier: 'high' | 'medium' | 'low', lanternModel: Object3D): Fauna {
  const group = new Group();
  group.name = 'fauna';
  const r = rng(6161);
  const lo = tier === 'low';

  // koi in the hall pool
  group.add(koiSchool(lo ? 9 : 16, { x0: HALL_POOL.x0, x1: HALL_POOL.x1, z0: HALL_POOL.z0 - 1, z1: HALL_POOL.z1 + 1 }, -0.34, 12));

  // floating lanterns: circling the pond, and a procession down the channel
  const part = (n: string) => bakedGeometry(lanternModel.getObjectByName(n) as Mesh);
  const pondN = lo ? 7 : 12, chanN = lo ? 10 : 18;
  const lanterns = [
    new InstancedMesh(part('lantern_frame'), new MeshStandardMaterial({ color: new Color(0.16, 0.1, 0.06), roughness: 0.7 }), pondN + chanN),
    new InstancedMesh(part('lantern_paper'), new MeshBasicMaterial({ map: washiTexture(), color: new Color(1.35, 0.95, 0.62), side: DoubleSide }), pondN + chanN),
    new InstancedMesh(part('lantern_candle'), new MeshBasicMaterial({ color: new Color(2.4, 1.7, 0.9) }), pondN + chanN)
  ];
  for (const l of lanterns) { l.frustumCulled = false; group.add(l); }
  lanterns[0].name = 'floating-lanterns';
  const glowPos = new Float32Array((pondN + chanN) * 3);
  const gg = new BufferGeometry();
  gg.setAttribute('position', new BufferAttribute(glowPos, 3));
  const glow = new Points(gg, new PointsMaterial({ size: 0.9, map: glowTexture(), color: new Color(0.75, 0.42, 0.18), transparent: true, depthWrite: false, blending: AdditiveBlending }));
  glow.frustumCulled = false;
  glow.renderOrder = 6;
  group.add(glow);
  // pond lanterns drift in the far half of the water, behind the name, never up to the visitor's feet
  const pondL = Array.from({ length: pondN }, (_, i) => ({ a: Math.PI * (1.12 + 0.76 * (i + r() * 0.8) / pondN), rr: 0.35 + r() * 0.45, s: 0.05 + r() * 0.06, ph: r() * 6 }));
  const chanL = Array.from({ length: chanN }, (_, i) => ({ off: i / chanN, lane: (r() - 0.5) * 1.4, ph: r() * 6 }));
  const CHAN0 = -162, CHAN1 = HALL_POOL.z1 + 2, SPEED = 0.55;

  // cranes: a slow wheel over the canopy, and a flight out to sea toward the moon
  const craneGeo = craneGeometry();
  const forestN = lo ? 10 : 18, seaN = lo ? 22 : 44;
  const cranesF = new InstancedMesh(craneGeo, craneMaterial(0.55), forestN);
  const cranesS = new InstancedMesh(craneGeo, craneMaterial(1.6), seaN);
  for (const c of [cranesF, cranesS]) { c.frustumCulled = false; group.add(c); }
  cranesF.name = 'cranes'; cranesS.name = 'cranes-sea';
  const wheels = [{ x: CLEARINGS[0].x, z: CLEARINGS[0].z }, { x: LIBRARY_TREE.x, z: LIBRARY_TREE.z }, { x: 0, z: -90 }];
  const fc = Array.from({ length: forestN }, (_, i) => ({ w: wheels[i % wheels.length], rad: 5 + r() * 8, y: 8 + r() * 6, s: 0.12 + r() * 0.1, ph: r() * 6.28, sc: 2.2 + r() * 1.0 }));
  const moonFlat = new Vector3(MOON_SET.x, 0.12, MOON_SET.z).normalize();
  const sc = Array.from({ length: seaN }, () => ({
    start: new Vector3(HALL.x + (r() - 0.5) * 22, 3 + r() * 6, SHORE.z1 - 14 - r() * 22),
    dir: moonFlat.clone().add(new Vector3((r() - 0.5) * 0.3, (r() - 0.2) * 0.08, 0)).normalize(),
    speed: 2.6 + r() * 1.8, ph: r() * 150, sc: 2.4 + r() * 1.2
  }));

  // butterflies: blue and glowing in the cave, warm in the hall
  const bGeo = butterflyGeometry();
  const bMat = new ShaderMaterial({
    uniforms: { time: shared.time },
    vertexShader: /* glsl */ `
      uniform float time; attribute float aW; varying float vW;
      void main(){
        float ph = float(gl_InstanceID) * 2.11;
        float a = (0.35 + 0.65 * abs(sin(time * 14.0 + ph))) * 1.3 * aW;
        vec3 p = position;
        p.y += abs(p.z) * sin(abs(a));
        p.z *= cos(a);
        vW = abs(aW);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'varying float vW; void main(){ gl_FragColor = vec4(vec3(1.0) * (0.6 + 0.4 * vW), 1.0); }',
    side: DoubleSide
  });
  const bN = lo ? 16 : 30;
  const flies = new InstancedMesh(bGeo, bMat, bN);
  flies.frustumCulled = false;
  const flyData = Array.from({ length: bN }, (_, i) => {
    const inCave = i % 2 === 0;
    const z = inCave ? -176 - r() * 34 : HALL.z0 - 3 - r() * 30;
    const x = inCave ? caveCenter(z).x + (r() < 0.5 ? -1 : 1) * (2.6 + r() * 1.2) : HALL.x + (r() < 0.5 ? -1 : 1) * (5 + r() * 2.5);
    return { c: new Vector3(x, inCave ? 1 + r() * 1.5 : 1.2 + r() * 2.5, z), ph: r() * 6, s: 0.6 + r() * 0.6, cave: inCave };
  });
  // per-instance colour
  const flyCol = new Float32Array(bN * 3);
  flyData.forEach((f, i) => flyCol.set(f.cave ? [0.3, 0.85, 1.6] : [1.4, 0.7, 0.25], i * 3));
  bGeo.setAttribute('aC', new InstancedBufferAttribute(flyCol, 3));
  bMat.vertexShader = bMat.vertexShader.replace('attribute float aW; varying float vW;', 'attribute float aW; attribute vec3 aC; varying float vW; varying vec3 vC;').replace('vW = abs(aW);', 'vW = abs(aW); vC = aC;');
  bMat.fragmentShader = 'varying float vW; varying vec3 vC; void main(){ gl_FragColor = vec4(vC * (0.6 + 0.4 * vW), 1.0); }';
  group.add(flies);

  const o = new Object3D();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  return {
    group,
    update(t: number, dt: number, cam: Vector3) {
      void dt;
      const cz = cam.z;
      // lanterns
      let k = 0;
      if (cz > -60) {
        for (const l of pondL) {
          const a = l.a + Math.sin(t * l.s + l.ph) * 0.18;
          const x = POND.cx + Math.cos(a) * POND.rx * l.rr, z = POND.cz + Math.sin(a) * POND.rz * l.rr * 0.8;
          o.position.set(x, 0.02 + Math.sin(t * 0.9 + l.ph) * 0.015, z);
          o.rotation.set(Math.sin(t * 0.8 + l.ph) * 0.05, a, Math.cos(t * 0.7 + l.ph) * 0.05);
          o.updateMatrix();
          for (const l2 of lanterns) l2.setMatrixAt(k, o.matrix);
          glowPos.set([x, 0.12, z], k * 3);
          k += 1;
        }
      } else k = pondN;
      if (cz < -140) {
        const L = CHAN0 - CHAN1;
        for (const l of chanL) {
          const d = ((t * SPEED) / L + l.off) % 1;
          const z = CHAN0 - d * L;
          let x: number;
          if (z > HALL.z0) x = caveCenter(z).x + l.lane * 0.8 + Math.sin(t * 0.3 + l.ph) * 0.3;
          else x = HALL.x + l.lane * 2.2 + Math.sin(t * 0.2 + l.ph) * 0.8;
          const s = Math.min(1, d * 12, (1 - d) * 12);
          o.position.set(x, 0.02 + Math.sin(t * 0.9 + l.ph) * 0.015, z);
          o.rotation.set(Math.sin(t * 0.8 + l.ph) * 0.05, l.ph + t * 0.05, Math.cos(t * 0.7 + l.ph) * 0.05);
          o.scale.setScalar(Math.max(0.001, s));
          o.updateMatrix();
          for (const l2 of lanterns) l2.setMatrixAt(k, o.matrix);
          glowPos.set([x, 0.12, z], k * 3);
          k += 1;
        }
        o.scale.setScalar(1);
      }
      for (const l2 of lanterns) l2.instanceMatrix.needsUpdate = true;
      (gg.getAttribute('position') as BufferAttribute).needsUpdate = true;

      // cranes over the forest
      if (cz > -170) {
        fc.forEach((c, i) => {
          const a = c.ph + t * c.s;
          const x = c.w.x + Math.cos(a) * c.rad, z = c.w.z + Math.sin(a) * c.rad;
          o.position.set(x, c.y + Math.sin(t * 0.5 + c.ph) * 0.6, z);
          q.setFromAxisAngle(up, -a - Math.PI / 2);
          o.quaternion.copy(q);
          o.rotateX(0.25);
          o.scale.setScalar(c.sc);
          o.updateMatrix();
          cranesF.setMatrixAt(i, o.matrix);
        });
        cranesF.instanceMatrix.needsUpdate = true;
      }
      // cranes leaving for the moon
      if (cz < -230) {
        sc.forEach((c, i) => {
          const d = (t * c.speed + c.ph) % 170;
          const p = c.start.clone().addScaledVector(c.dir, d);
          p.y += Math.sin(t * 0.8 + c.ph) * 0.4 + d * 0.03;
          o.position.copy(p);
          q.setFromUnitVectors(new Vector3(1, 0, 0), c.dir);
          o.quaternion.copy(q);
          const fade = Math.min(1, d / 6) * Math.min(1, (170 - d) / 25);
          o.scale.setScalar(Math.max(0.001, c.sc * fade));
          o.updateMatrix();
          cranesS.setMatrixAt(i, o.matrix);
        });
        cranesS.instanceMatrix.needsUpdate = true;
      }
      // butterflies
      if (cz < -165 && cz > -262) {
        flyData.forEach((f, i) => {
          const a = t * f.s + f.ph;
          o.position.set(f.c.x + Math.sin(a) * 0.9 + Math.sin(a * 2.3) * 0.3, f.c.y + Math.sin(a * 1.7) * 0.4, f.c.z + Math.cos(a * 0.8) * 1.1);
          o.rotation.set(0, -a, Math.sin(a * 3) * 0.2);
          o.scale.setScalar(1.6);
          o.updateMatrix();
          flies.setMatrixAt(i, o.matrix);
        });
        flies.instanceMatrix.needsUpdate = true;
      }
    }
  };
}
