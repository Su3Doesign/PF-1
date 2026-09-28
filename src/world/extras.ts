// Things you find by looking: a broken television in the moss still telling
// facts, a film projector throwing a reel onto a sheet between bamboo poles,
// seven kodama hiding in the forest, a spirit deer in the mist, and a whale
// of light crossing the sky over the sea.
import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, FrontSide, Group,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Points, ShaderMaterial, SRGBColorSpace,
  Texture, Vector3, VideoTexture, UniformsLib, UniformsUtils
} from 'three';
import { bakedGeometry, Emitter } from './props';
import { heightAt, SHORE } from './layout';
import { mossMaterial, screenMaterial, shared } from './materials';
import { rng } from './treegen';
import { rockGeometry } from './cave';

export interface ExtrasAssets {
  models: { tv: Object3D; projector: Object3D; kodama: Object3D; deer: Object3D; whale: Object3D };
  tex: { aoTv: Texture; aoProjector: Texture; lacquer: Texture; lacquerN: Texture; metal: Texture; metalN: Texture; moss: Texture; mossN: Texture; noise: Texture; stone: Texture; stoneN: Texture };
}

export interface Extras {
  group: Group;
  emitters: Emitter[];
  tv: Mesh;
  sheet: Mesh;
  kodama: Mesh[]; // instanced: the pick's instanceId is the kodama's index
  facts: string[];
  nextFact(): number;
  findKodama(i: number): boolean;
  found(): number;
  update(t: number, dt: number, cam: Vector3): void;
  setFilm(src: string): void;
}

const part = (root: Object3D, name: string) => bakedGeometry(root.getObjectByName(name) as Mesh);

// ── the television's picture: teletext facts on cracked glass ───────────────
function factCanvas(): { canvas: HTMLCanvasElement; draw: (i: number, facts: string[]) => void } {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480;
  const g = c.getContext('2d')!;
  const r = rng(404);
  // the crack is fixed to the glass: an impact low on the right, radiating
  const cracks: [number, number, number, number][] = [];
  const ix = 470, iy = 330;
  for (let k = 0; k < 16; k += 1) {
    let x = ix, y = iy, a = (k / 16) * Math.PI * 2 + r() * 0.3;
    const L = 60 + r() * 260;
    for (let s = 0; s < 8; s += 1) {
      const nx = x + Math.cos(a) * L / 8, ny = y + Math.sin(a) * L / 8;
      cracks.push([x, y, nx, ny]);
      x = nx; y = ny; a += (r() - 0.5) * 0.5;
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const rr = 18 + k * 22;
    for (let s = 0; s < 14; s += 1) {
      const a0 = (s / 14) * Math.PI * 2, a1 = a0 + 0.4 + r() * 0.2;
      cracks.push([ix + Math.cos(a0) * rr, iy + Math.sin(a0) * rr, ix + Math.cos(a1) * rr * (0.9 + r() * 0.2), iy + Math.sin(a1) * rr * (0.9 + r() * 0.2)]);
    }
  }
  const draw = (i: number, facts: string[]) => {
    g.fillStyle = '#020806';
    g.fillRect(0, 0, 640, 480);
    // teletext header
    g.fillStyle = '#3dffd0';
    g.fillRect(0, 0, 640, 54);
    g.fillStyle = '#021410';
    g.font = '700 26px "Martian Mono Variable", monospace';
    g.fillText(`P${(100 + i).toString()}  FOREST FACTS`, 22, 37);
    g.textAlign = 'right';
    g.fillText(`${String(i + 1).padStart(2, '0')}/${String(facts.length).padStart(2, '0')}`, 618, 37);
    g.textAlign = 'left';
    // the fact, wrapped
    g.fillStyle = '#e6fff6';
    g.font = '800 44px "Archivo Variable", sans-serif';
    const words = facts[i].split(' ');
    let line = '', y = 138;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > 580 && line) { g.fillText(line, 30, y); line = w; y += 56; } else line = test;
    }
    if (line) g.fillText(line, 30, y);
    g.fillStyle = '#ffb45e';
    g.font = '600 20px "Martian Mono Variable", monospace';
    g.fillText('CLICK THE SET FOR THE NEXT ONE', 30, 440);
    // the broken glass: dead pixels bleeding from the impact, then the cracks
    const grd = g.createRadialGradient(ix, iy, 4, ix, iy, 120);
    grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.5, 'rgba(10,0,20,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 640, 480);
    g.strokeStyle = 'rgba(210,235,230,0.55)';
    g.lineWidth = 1.4;
    g.beginPath();
    for (const [a, b, c2, d] of cracks) { g.moveTo(a, b); g.lineTo(c2, d); }
    g.stroke();
  };
  return { canvas: c, draw };
}

// ── glowing spirit material (deer, whale) ────────────────────────────────────
function spiritMaterial(color: Color, strength: number, bend = 0): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { color: { value: color }, time: { value: 0 }, strength: { value: strength }, fade: { value: 1 }, bend: { value: bend }, tNoise: { value: null } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time, bend;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 p = position;
        // a whale's tail beats slowly; the deer only breathes
        float tail = smoothstep(0.0, -8.0, p.z);
        p.y += sin(time * 0.9 - p.z * 0.25) * tail * tail * bend;
        p *= 1.0 + sin(time * 1.4) * 0.006;
        vP = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        vec4 mvPosition = mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 color; uniform float time, strength, fade; uniform sampler2D tNoise;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        float flow = texture2D(tNoise, vP.xy * 0.35 + vec2(0.0, time * 0.05)).r;
        float veins = smoothstep(0.62, 0.7, texture2D(tNoise, vP.zy * 0.9 - vec2(time * 0.03, 0.0)).b);
        vec3 c = color * (0.05 + fres * 1.4 + flow * 0.12 + veins * 0.25) * strength * fade;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: FrontSide, fog: true
  });
  m.uniforms.time = shared.time;
  return m;
}

// kodama hide at the feet of trees, on rocks and stumps, never on the path
const KODAMA_SPOTS: [number, number, number][] = [
  [-6.8, -31, 0.3], [5.6, -52.5, -0.6], [-7.2, -76, 0.8], [6.4, -99, -0.4], [-8.5, -126, 0.5], [9.5, -146, -0.9], [-6.2, -161.5, 0.4]
];

export function buildExtras(a: ExtrasAssets): Extras {
  const group = new Group();
  group.name = 'extras';
  const emitters: Emitter[] = [];
  const t = a.tex;

  // ── the television ──
  const wood = mossMaterial({ base: t.lacquer, baseN: t.lacquerN, moss: t.moss, mossN: t.mossN, noise: t.noise, ao: t.aoTv, baseScale: 1.6, mossAmount: 0.8, mossLow: 0.35, roughness: 0.7, tint: new Color(0.55, 0.36, 0.22) });
  const trim = mossMaterial({ base: t.metal, baseN: t.metalN, moss: t.moss, mossN: t.mossN, noise: t.noise, ao: t.aoTv, baseScale: 2.2, mossAmount: 0.5, mossLow: 0.3, metalness: 0.3, roughness: 0.55, tint: new Color(0.4, 0.4, 0.42) });
  const fact = factCanvas();
  const facts = [
    'Three personal worlds: a pagoda at first light, a fire shrine, a koi pond.',
    'Sixteen clients across Toronto, San Juan and Hyderabad.',
    'Thirty-nine studies circle the oldest tree in this forest.',
    'Core kit: Maya, ZBrush, Substance and Arnold.',
    'Every texture in this forest was grown from noise. No photos were used.',
    'The letters by the pond were modelled and lit in Blender, then shipped to your browser.',
    'Seven moves, every time. Skipping one shows up three weeks later.',
    'Seven kodama are hiding in these woods. Find them all.',
    'Open for commissions, full-time roles and collaborations.'
  ];
  let factIdx = 0;
  fact.draw(0, facts);
  const factTex = new CanvasTexture(fact.canvas);
  factTex.colorSpace = SRGBColorSpace;
  factTex.flipY = false; // glTF texture coordinates
  const screen = screenMaterial({ map: factTex, tint: new Color(0x3dffd0), gain: 1.3, curve: 0.25, lines: 140, noise: 0.07, scan: 0.22 });
  screen.side = DoubleSide; // the exported glass is wound toward the back of the set
  const makeTV = (live: boolean) => {
    const tv = new Group();
    const w = new Mesh(part(a.models.tv, 'tv_wood'), wood);
    const tr = new Mesh(part(a.models.tv, 'tv_trim'), trim);
    // the tube's glass sits just proud of the bezel (the exported mesh is a few mm behind the recess)
    const glass = part(a.models.tv, 'tv_screen');
    glass.translate(0, 0, 0.012);
    const sc = new Mesh(glass, live ? screen : new MeshStandardMaterial({ color: 0x0a0d0c, roughness: 0.15, metalness: 0.2 }));
    for (const m of [w, tr]) { m.castShadow = true; m.receiveShadow = true; }
    tv.add(w, tr, sc);
    return { tv, screen: sc };
  };
  const live = makeTV(true);
  const TX = 4.1, TZ = -96.2;
  live.tv.position.set(TX, heightAt(TX, TZ) - 0.07, TZ);
  live.tv.rotation.set(-0.06, -0.3, 0.1);
  live.tv.scale.setScalar(1.25);
  group.add(live.tv);
  const dead = makeTV(false);
  dead.tv.position.set(TX + 1.3, heightAt(TX + 1.3, TZ - 1.1) - 0.12, TZ - 1.1);
  dead.tv.rotation.set(0.1, 0.9, -1.45); // on its side in the ferns
  dead.tv.scale.setScalar(1.1);
  group.add(dead.tv);
  emitters.push({ pos: new Vector3(TX - 0.5, 0.9, TZ + 1.1), color: new Color(0.3, 1.0, 0.85), intensity: 2.2, range: 5, level: () => 1 });

  // ── the projector and its sheet ──
  const PX = -2.3, PZ = -120.9;
  const proj = new Group();
  const brass = mossMaterial({ base: t.metal, baseN: t.metalN, moss: t.moss, mossN: t.mossN, noise: t.noise, ao: t.aoProjector, baseScale: 3, mossAmount: 0.35, mossLow: 0.2, metalness: 0.55, roughness: 0.42, tint: new Color(0.42, 0.44, 0.46) });
  proj.add(new Mesh(part(a.models.projector, 'projector'), brass));
  const reels: Mesh[] = [];
  for (const n of ['reel_front', 'reel_rear']) {
    // bake to model space, then pivot on the hub so the reel spins true
    const g = part(a.models.projector, n);
    g.computeBoundingBox();
    const hub = new Vector3();
    g.boundingBox!.getCenter(hub);
    g.translate(-hub.x, -hub.y, -hub.z);
    const m = new Mesh(g, brass);
    m.position.copy(hub);
    proj.add(m);
    reels.push(m);
  }
  const lens = new Mesh(part(a.models.projector, 'proj_lens'), new MeshBasicMaterial({ color: new Color(3, 2.6, 2) }));
  proj.add(lens);
  proj.position.set(PX, heightAt(PX, PZ) - 0.02, PZ);
  // aim at the sheet
  const SX = -2.9, SZ = -129.8, SY = 2.05;
  const sheetPos = new Vector3(SX, heightAt(SX, SZ) + SY, SZ);
  proj.lookAt(sheetPos.x, proj.position.y, sheetPos.z); // props face +Z, so the lens now points at the sheet
  group.add(proj);
  proj.updateMatrixWorld(true);
  const lensW = new Vector3();
  lens.geometry.computeBoundingBox();
  lens.geometry.boundingBox!.getCenter(lensW);
  lens.localToWorld(lensW);

  // the sheet: a bit of slack cloth tied between two bamboo poles
  const sheetGeo = new PlaneGeometry(3.0, 1.8, 24, 14);
  const sp = sheetGeo.getAttribute('position');
  for (let i = 0; i < sp.count; i += 1) {
    const x = sp.getX(i), y = sp.getY(i);
    const sag = (1 - (x / 1.5) ** 2) * 0.06 * (1 - (y + 0.9) / 1.8);
    const wrinkle = Math.sin(x * 7 + y * 2) * 0.012 + Math.sin(y * 11 - x * 3) * 0.008;
    sp.setXYZ(i, x, y - (1 - (x / 1.5) ** 2) * 0.05 * ((y + 0.9) / 1.8), sag + wrinkle);
  }
  sheetGeo.computeVertexNormals();
  const filmMat = new ShaderMaterial({
    uniforms: { map: { value: null }, time: shared.time, on: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float time, on; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
      void main(){
        vec2 uv = vUv;
        float weave = 0.9 + 0.1 * sin(uv.x * 900.0) * sin(uv.y * 540.0);
        vec3 cloth = vec3(0.16, 0.16, 0.15) * weave;
        // the film, a little soft, with a hot centre, gate weave and the flicker of the shutter
        vec2 fuv = uv + vec2(h(floor(time * 18.0)) - 0.5, h(floor(time * 18.0) + 7.0) - 0.5) * 0.0025;
        vec3 film = on > 0.5 ? texture2D(map, fuv).rgb : vec3(0.0);
        float hot = 1.0 - 0.45 * length((uv - 0.5) * vec2(1.2, 1.6));
        float flick = 0.92 + 0.08 * h(floor(time * 24.0));
        float frame = smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
        vec3 c = cloth + film * hot * flick * frame * 1.6 + vec3(1.0, 0.95, 0.85) * frame * 0.06 * flick;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: DoubleSide
  });
  const sheet = new Mesh(sheetGeo, filmMat);
  sheet.position.copy(sheetPos);
  sheet.lookAt(lensW.x, sheetPos.y, lensW.z);
  group.add(sheet);
  // two bamboo poles and the cords
  const pole = new CylinderGeometry(0.045, 0.055, 3.6, 8);
  pole.translate(0, 1.8, 0);
  const poleMat = new MeshStandardMaterial({ color: new Color(0.42, 0.44, 0.22), roughness: 0.6 });
  const cordMat = new MeshStandardMaterial({ color: 0x6b5b45, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const local = new Vector3(sx * 1.75, 0, -0.05);
    const w = local.clone().applyQuaternion(sheet.quaternion).add(new Vector3(sheetPos.x, 0, sheetPos.z));
    const pm = new Mesh(pole, poleMat);
    pm.position.set(w.x, heightAt(w.x, w.z) - 0.2, w.z);
    pm.rotation.z = sx * 0.03;
    pm.castShadow = true;
    group.add(pm);
    for (const yy of [0.88, -0.88]) {
      const cord = new Mesh(new CylinderGeometry(0.006, 0.006, 0.28, 4), cordMat);
      const c = new Vector3(sx * 1.6, yy, 0).applyQuaternion(sheet.quaternion).add(sheetPos);
      cord.position.copy(c);
      cord.rotation.copy(sheet.rotation);
      cord.rotateZ(Math.PI / 2);
      group.add(cord);
    }
  }
  // the beam: a dusty pyramid of light from the lens to the sheet
  const corners = [[-1.5, -0.9], [1.5, -0.9], [1.5, 0.9], [-1.5, 0.9]].map(([x, y]) => new Vector3(x, y, 0.02).applyQuaternion(sheet.quaternion).add(sheetPos));
  const bpos: number[] = [], buv: number[] = [];
  for (let k = 0; k < 4; k += 1) {
    const c0 = corners[k], c1 = corners[(k + 1) % 4];
    bpos.push(lensW.x, lensW.y, lensW.z, c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
    buv.push(0.5, 0, 0, 1, 1, 1);
  }
  const beamGeo = new BufferGeometry();
  beamGeo.setAttribute('position', new Float32BufferAttribute(bpos, 3));
  beamGeo.setAttribute('uv', new Float32BufferAttribute(buv, 2));
  beamGeo.computeVertexNormals();
  const beamMat = new ShaderMaterial({
    uniforms: { time: shared.time, tNoise: { value: t.noise }, on: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform float time, on; uniform sampler2D tNoise; varying vec2 vUv; varying vec3 vW;
      void main(){
        float along = vUv.y;
        // soft where the faces of the pyramid meet, so it reads as a volume, not a wedge
        float across = abs(vUv.x - 0.5) / max(0.02, along * 0.5);
        float edge = smoothstep(1.0, 0.35, across);
        float dust = texture2D(tNoise, vW.xz * 0.6 + vec2(time * 0.02, -time * 0.015)).r * 0.6 + texture2D(tNoise, vW.xy * 1.3 - time * 0.03).g * 0.4;
        float streak = texture2D(tNoise, vec2(vUv.x * 3.0, along * 0.4 - time * 0.05)).b;
        float a = (0.3 + 0.7 * dust) * (0.55 + 0.45 * streak) * mix(1.0, 0.35, along) * smoothstep(0.0, 0.06, along) * edge * on;
        float flick = 0.9 + 0.1 * fract(sin(floor(time * 24.0) * 12.9898) * 43758.5);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a * 0.05 * flick, 1.0);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide
  });
  const beam = new Mesh(beamGeo, beamMat);
  group.add(beam);
  emitters.push({ pos: sheetPos.clone().add(new Vector3(0, 0, 1.5).applyQuaternion(sheet.quaternion)), color: new Color(0.9, 0.85, 0.75), intensity: 2.4, range: 7, level: () => beamMat.uniforms.on.value });
  let filmSrc = '';
  let video: HTMLVideoElement | null = null;
  let playTried = -1e9;

  // ── kodama ──
  const kodamaMat = new MeshStandardMaterial({ color: new Color(0.9, 0.93, 0.88), roughness: 0.55, emissive: new Color(0.16, 0.2, 0.17) });
  const headGeo = part(a.models.kodama, 'kodama_head');
  const bodyGeo = part(a.models.kodama, 'kodama_body');
  headGeo.computeBoundingBox();
  const neckY = headGeo.boundingBox!.min.y;
  headGeo.translate(0, -neckY, 0);
  // one instanced mesh each for bodies, heads and perches; plain Object3Ds carry the pose
  const kodama: Object3D[] = [];
  const nK = KODAMA_SPOTS.length;
  const kBody = new InstancedMesh(bodyGeo, kodamaMat, nK);
  const kHead = new InstancedMesh(headGeo, kodamaMat, nK);
  const state = KODAMA_SPOTS.map(() => ({ found: false, rattle: 0, next: 2 + Math.random() * 8, fade: 1 }));
  // each kodama sits on its own mossy boulder, above the grass
  const perchGeo = rockGeometry(97, 2);
  const perchMat = mossMaterial({ base: t.stone, baseN: t.stoneN, moss: t.moss, mossN: t.mossN, noise: t.noise, baseScale: 0.6, mossAmount: 1.4, mossLow: 0.2, roughness: 0.7, tint: new Color(0.7, 0.72, 0.7) });
  const perches = new InstancedMesh(perchGeo, perchMat, nK);
  KODAMA_SPOTS.forEach(([x, z, ry], i) => {
    const gy = heightAt(x, z);
    const ps = 0.55 + (i % 3) * 0.12;
    const perch = new Object3D();
    perch.scale.set(ps * 1.2, ps * 0.9, ps);
    perch.position.set(x, gy - ps * 0.25, z);
    perch.rotation.y = i * 1.7;
    perch.updateMatrix();
    perches.setMatrixAt(i, perch.matrix);
    const k = new Object3D();
    const head = new Object3D();
    head.position.y = neckY;
    k.add(head);
    k.position.set(x, gy - ps * 0.25 + ps * 0.62, z);
    k.rotation.y = ry;
    k.scale.setScalar(1.7 + (i % 3) * 0.2);
    k.userData.s = k.scale.x;
    k.userData.y = k.position.y;
    k.userData.head = head;
    kodama.push(k);
  });
  perches.computeBoundingSphere();
  perches.castShadow = true;
  perches.receiveShadow = true;
  const poseKodama = () => {
    kodama.forEach((k, i) => {
      k.updateMatrixWorld(true);
      kBody.setMatrixAt(i, k.matrixWorld);
      kHead.setMatrixAt(i, (k.userData.head as Object3D).matrixWorld);
    });
    kBody.instanceMatrix.needsUpdate = true;
    kHead.instanceMatrix.needsUpdate = true;
  };
  poseKodama();
  for (const im of [kBody, kHead]) { im.computeBoundingSphere(); im.castShadow = true; im.name = 'kodama'; }
  group.add(perches, kBody, kHead);
  // when one is found it goes up in a small swarm of motes
  const MOTES = 48;
  const moteSeed = new Float32Array(MOTES * 4);
  const mr = rng(4242);
  for (let i = 0; i < moteSeed.length; i += 1) moteSeed[i] = mr();
  const moteGeo = new BufferGeometry();
  moteGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(MOTES * 3), 3));
  moteGeo.setAttribute('seed', new Float32BufferAttribute(moteSeed, 4));
  const moteMat = new ShaderMaterial({
    uniforms: { origin: { value: new Vector3() }, age: { value: 10 }, pr: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform vec3 origin; uniform float age, pr; attribute vec4 seed; varying float vA;
      void main(){
        float a = age - seed.w * 0.35;
        float spread = 1.0 - exp(-max(a, 0.0) * 2.2);
        float ang = seed.x * 6.2832;
        float rad = 0.15 + seed.y * 0.55;
        vec3 p = origin + vec3(cos(ang) * rad * spread, max(a, 0.0) * (0.35 + seed.z * 0.7), sin(ang) * rad * spread);
        p.x += sin(a * 2.7 + seed.y * 30.0) * 0.07;
        p.z += cos(a * 2.3 + seed.x * 30.0) * 0.07;
        vA = smoothstep(0.0, 0.12, a) * (1.0 - smoothstep(1.0 + seed.z, 2.2 + seed.z, a));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = pr * (5.0 + 5.0 * seed.y) / max(1.0, -mv.z * 0.35);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float g = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.62, 1.0, 0.82) * g * g * vA * 1.6, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const motes = new Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  motes.visible = false;
  motes.name = 'kodama-motes';
  group.add(motes);

  // ── the spirit deer in the mist ──
  const deer = new Group();
  const deerMat = spiritMaterial(new Color(0.55, 1.0, 0.95), 1.35);
  deerMat.uniforms.tNoise.value = t.noise;
  const antlerMat = spiritMaterial(new Color(0.9, 1.1, 0.8), 1.6);
  antlerMat.uniforms.tNoise.value = t.noise;
  deer.add(new Mesh(part(a.models.deer, 'deer_body'), deerMat), new Mesh(part(a.models.deer, 'deer_antlers'), antlerMat));
  const DX = -6.8, DZ = -85.5;
  deer.position.set(DX, heightAt(DX, DZ), DZ);
  deer.scale.setScalar(1.8);
  group.add(deer);
  emitters.push({ pos: new Vector3(DX, 1.8, DZ), color: new Color(0.4, 1.0, 0.9), intensity: 1.6, range: 7, level: () => deerMat.uniforms.fade.value });

  // ── a whale of light over the sea ──
  const whaleMat = spiritMaterial(new Color(0.45, 0.8, 1.0), 0.9, 0.9);
  whaleMat.uniforms.tNoise.value = t.noise;
  const whale = new Mesh(part(a.models.whale, 'whale'), whaleMat);
  whale.scale.setScalar(1.6);
  whale.frustumCulled = false;
  group.add(whale);

  const tmp = new Vector3();
  return {
    group, emitters, tv: live.screen, sheet, kodama: [kBody, kHead], facts,
    nextFact() {
      factIdx = (factIdx + 1) % facts.length;
      fact.draw(factIdx, facts);
      factTex.needsUpdate = true;
      screen.uniforms.hover.value = 1.5;
      return factIdx;
    },
    findKodama(i: number) {
      if (state[i].found) return false;
      state[i].found = true;
      state[i].rattle = 1.2;
      const k = kodama[i];
      moteMat.uniforms.origin.value.set(k.position.x, k.position.y + 0.3 * k.scale.y, k.position.z);
      moteMat.uniforms.age.value = 0;
      motes.visible = true;
      return true;
    },
    found() { return state.filter((s) => s.found).length; },
    setFilm(src: string) { filmSrc = src; },
    update(time: number, dt: number, cam: Vector3) {
      const cz = cam.z;
      // television: flip to the next fact now and then; the hover flash decays
      screen.uniforms.hover.value *= Math.pow(0.02, dt);
      if (cz < -70 && cz > -125 && Math.floor(time / 9) !== Math.floor((time - dt) / 9)) {
        factIdx = (factIdx + 1) % facts.length;
        fact.draw(factIdx, facts);
        factTex.needsUpdate = true;
      }
      // projector: runs while the visitor is nearby
      const near = cz < -95 && cz > -150;
      if (near && !video && filmSrc) {
        video = document.createElement('video');
        video.src = filmSrc;
        video.muted = true; video.loop = true; video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.crossOrigin = 'anonymous';
        const vt = new VideoTexture(video);
        vt.colorSpace = SRGBColorSpace;
        filmMat.uniforms.map.value = vt;
      }
      if (video) {
        const now = performance.now();
        if (near && video.paused && now - playTried > 2500) {
          playTried = now;
          video.play().then(() => { filmMat.uniforms.on.value = 1; }).catch(() => { /* retry later */ });
        }
        if (!near && !video.paused) video.pause();
      }
      const on = filmMat.uniforms.on.value;
      beamMat.uniforms.on.value += ((near ? 1 : 0) * (on > 0.5 ? 1 : 0.35) - beamMat.uniforms.on.value) * Math.min(1, dt * 2);
      if (near) for (const r of reels) r.rotateX(-dt * 2.2);
      // kodama: every so often one rattles its head; found ones fade into the ground
      kodama.forEach((k, i) => {
        const s = state[i];
        if (time > s.next) { s.rattle = 0.6; s.next = time + 4 + Math.random() * 10; }
        s.rattle = Math.max(0, s.rattle - dt);
        const head = k.userData.head as Object3D;
        head.rotation.z = s.rattle > 0 ? Math.sin(time * 38) * 0.28 * Math.min(1, s.rattle * 3) : head.rotation.z * 0.8;
        // kodama turn to look at the visitor
        tmp.set(cam.x - k.position.x, 0, cam.z - k.position.z);
        const want = Math.atan2(tmp.x, tmp.z);
        k.rotation.y += Math.atan2(Math.sin(want - k.rotation.y), Math.cos(want - k.rotation.y)) * Math.min(1, dt * 0.8);
        if (s.found && s.fade > 0) {
          // a beat of rattling, then it folds away into the moss
          s.fade = Math.max(0, s.fade - Math.min(dt, 0.1) * 0.7);
          const f = Math.min(1, s.fade / 0.7);
          const e = f * f * (3 - 2 * f);
          k.scale.setScalar(k.userData.s * Math.max(0.0001, e));
          k.position.y = k.userData.y - (1 - e) * 0.25;
        }
      });
      if (cz > -170) poseKodama();
      if (motes.visible) {
        moteMat.uniforms.age.value += Math.min(dt, 0.1);
        if (moteMat.uniforms.age.value > 3.6) motes.visible = false;
      }
      // deer: turns its head toward the visitor, dissolves if you get too close
      tmp.set(cam.x - deer.position.x, 0, cam.z - deer.position.z);
      const d = tmp.length();
      deer.rotation.y += (Math.atan2(tmp.x, tmp.z) - deer.rotation.y) * Math.min(1, dt * 0.6);
      deerMat.uniforms.fade.value = antlerMat.uniforms.fade.value = Math.min(1, Math.max(0, (d - 5) / 6)) * (d < 60 ? 1 : 0);
      deer.visible = d < 60;
      // whale: a slow crossing of the sky above the horizon, once every seventy seconds
      const show = cz < -225;
      whale.visible = show;
      if (show) {
        // it rises out of the haze on the left, passes over the gate and sinks away to the right
        const u = ((time / 70) % 1) * 2 - 1;
        const x = -3 + u * 125, y = 24 + Math.sin((u + 1) * 1.5) * 7, z = SHORE.z1 - 72 - Math.cos(u * 1.6) * 18;
        whale.position.set(x, y, z);
        whale.rotation.set(Math.sin(time * 0.3) * 0.05, Math.PI / 2 - 0.25 * u, Math.sin(time * 0.2) * 0.08);
        whaleMat.uniforms.fade.value = Math.min(1, (1 - Math.abs(u)) * 4);
      }
    }
  };
}
