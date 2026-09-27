import {
  WebGLRenderer, Scene, PerspectiveCamera, FogExp2, SRGBColorSpace, NoToneMapping, PCFSoftShadowMap, HemisphereLight,
  DirectionalLight, PointLight, Color, Vector2, Vector3, Raycaster, PMREMGenerator, Mesh, SphereGeometry, MeshBasicMaterial,
  BackSide, PlaneGeometry, Object3D, Points, ShaderMaterial, MathUtils, HalfFloatType, SpotLight
} from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect,
  ChromaticAberrationEffect, SMAAEffect, BlendFunction, SMAAPreset
} from 'postprocessing';
import { loadAssets, Assets } from './assets';
import { detectTier, qualityFor, FrameGovernor, Quality } from './quality';
import { buildTerrain } from './terrain';
import { Pond, LAYER_NO_REFLECT } from './water';
import { buildTrees, buildMushrooms } from './trees';
import { buildFoliage } from './foliage';
import { Props, Target, Emitter, TargetKind } from './props';
import { buildSky, buildFireflies, buildVolumes, MOON_DIR, FOG_COLOR } from './atmosphere';
import { Rail, SectionBox } from './rail';
import { StationId, STATION_ORDER, LETTERS_Z, TORII } from './layout';
import { shared } from './materials';

export interface WorldEvents {
  hover(t: { kind: TargetKind; index: number } | null): void;
  select(t: { kind: TargetKind; index: number }): void;
  station(id: StationId | null): void;
  study(index: number): void;
}

const FOG_DENSITY = 0.032;

export class World {
  renderer: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(45, 1, 0.1, 120); // fog swallows everything past ~100 m
  q!: Quality;
  composer!: EffectComposer;
  pond!: Pond;
  props!: Props;
  rail!: Rail;
  assets!: Assets;
  private gov!: FrameGovernor;
  private moon!: DirectionalLight;
  private fireflies!: Points;
  private pool: { l: PointLight; e: Emitter | null; fade: number }[] = [];
  private fog = new FogExp2(FOG_COLOR, FOG_DENSITY);
  private time = 0;
  private last = 0;
  private running = false;
  private scrollY = 0;
  private tCur = 0;
  private mouse = new Vector2();
  private mouseS = new Vector2();
  private look = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, idle: 0 };
  private drag = { active: false, x: 0, y: 0, moved: 0, ring: false, id: -1 };
  private ray = new Raycaster();
  private ndc = new Vector2(-2, -2);
  private pointerDirty = false;
  private hovered: Target | null = null;
  private hoverInstance = -1;
  private stationNow: StationId | null = 'landing';
  private studyNow = -1;
  private frameNo = 0;
  private introStart = -1;
  private tmpPos = new Vector3();
  private tmpLook = new Vector3();
  private bloom!: BloomEffect;
  overlay = false;
  ready = false;
  deskVideo = '';

  constructor(private canvas: HTMLCanvasElement, private events: WorldEvents, private reduced: boolean) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' });
  }

  async init(onProgress: (p: number, label: string) => void) {
    const r = this.renderer;
    const tier = detectTier(r.getContext());
    this.q = qualityFor(tier);
    r.outputColorSpace = SRGBColorSpace;
    r.info.autoReset = false;
    r.toneMapping = NoToneMapping;
    r.setClearColor(FOG_COLOR);
    r.shadowMap.enabled = this.q.shadows;
    r.shadowMap.type = PCFSoftShadowMap;
    this.gov = new FrameGovernor(this.q, (dpr) => this.resize(dpr));

    onProgress(0.02, 'waking the signal');
    this.assets = await loadAssets(r, (p) => onProgress(0.05 + p * 0.7, 'unpacking the archive'));
    const a = this.assets;

    onProgress(0.78, 'growing the forest');
    await nextFrame();
    const s = this.scene;
    s.fog = this.fog;
    s.add(buildSky());
    s.add(buildTerrain({ ground: a.tex.ground, groundN: a.tex.groundN, moss: a.tex.moss, noise: a.tex.noise }));
    this.pond = new Pond({ waterN: a.tex.waterN, noise: a.tex.noise }, this.q.reflection);
    s.add(this.pond);
    const trees = buildTrees(this.q.trees, { bark: a.tex.bark, barkN: a.tex.barkN, moss: a.tex.moss, noise: a.tex.noise }, this.q.shadows, this.q.tier === 'high' ? 1 : 0);
    s.add(trees.group);
    await nextFrame();
    s.add(buildFoliage({ grass: this.q.grass, ferns: this.q.ferns, fern: a.tex.fern, fern2: a.tex.fern2 }));
    const mush = buildMushrooms(this.q.tier === 'low' ? 120 : 260);
    mush.layers.set(LAYER_NO_REFLECT);
    s.add(mush);
    onProgress(0.86, 'wiring the neon');
    await nextFrame();
    const content = await import('../data/content.json');
    this.props = new Props(a, this.q.shadows, { studies: content.studies.length, tiers: content.tiers.map((t) => ({ n: t.n, name: t.name })) });
    s.add(this.props.group);
    this.fireflies = buildFireflies(this.q.fireflies);
    this.fireflies.layers.set(LAYER_NO_REFLECT);
    s.add(this.fireflies);
    s.add(buildVolumes(a.tex.noise, this.q.godRays));

    // lights
    const hemi = new HemisphereLight(0x2c4262, 0x0b1609, 0.42);
    s.add(hemi);
    this.moon = new DirectionalLight(0xa9c0ff, 1.05);
    this.moon.position.copy(MOON_DIR).multiplyScalar(60);
    if (this.q.shadows) {
      this.moon.castShadow = true;
      this.moon.shadow.mapSize.set(2048, 2048);
      const c = this.moon.shadow.camera;
      c.left = -22; c.right = 22; c.top = 22; c.bottom = -22; c.near = 1; c.far = 140;
      this.moon.shadow.bias = -0.0004;
      this.moon.shadow.normalBias = 0.04;
    }
    s.add(this.moon, this.moon.target);
    for (let i = 0; i < 6; i += 1) {
      const l = new PointLight(0xffffff, 0, 8, 2);
      s.add(l);
      this.pool.push({ l, e: null, fade: 0 });
    }
    this.environment();
    // neon spill: a low teal wash across the letters and a red one under the torii's lintel
    const wash = new SpotLight(0x3dffd0, 38, 30, 1.05, 1, 2);
    wash.position.set(0, 0.45, LETTERS_Z + 7);
    wash.target.position.set(0, 1.2, LETTERS_Z);
    s.add(wash, wash.target);
    const toriiWash = new SpotLight(0xff3b2e, 30, 16, 0.9, 1, 2);
    toriiWash.position.set(0, 7.3, TORII.z + 3.5);
    toriiWash.target.position.set(0, 3, TORII.z);
    s.add(toriiWash, toriiWash.target);

    this.camera.layers.enable(LAYER_NO_REFLECT);
    this.rail = new Rail(innerWidth / innerHeight < 0.95);
    this.setupPost();
    this.resize();
    this.bindPointer();

    onProgress(0.93, 'compiling light');
    await nextFrame();
    this.placeCamera(0);
    try { await r.compileAsync(s, this.camera); } catch { r.compile(s, this.camera); }
    this.composer.render(0.016);
    onProgress(1, 'ready');
    this.ready = true;
  }

  private environment() {
    const env = new Scene();
    const sky = new Mesh(new SphereGeometry(20, 24, 12), new MeshBasicMaterial({ color: new Color(0.02, 0.04, 0.05), side: BackSide }));
    env.add(sky);
    const panel = (c: Color, x: number, y: number, z: number, w: number, h: number) => {
      const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: c, side: 2 }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(new Color(0.2, 1.4, 1.1), 8, 2, -8, 6, 2);
    panel(new Color(1.6, 0.8, 0.25), -9, 1, 5, 4, 3);
    panel(new Color(1.8, 0.35, 0.3), 0, 3, -12, 8, 1);
    panel(new Color(0.7, 0.8, 1.0), -4, 12, -8, 5, 5);
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  private setupPost() {
    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType, multisampling: this.q.msaa });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({ mipmapBlur: true, intensity: 1.1, luminanceThreshold: 0.78, luminanceSmoothing: 0.2, radius: 0.66 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vig = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
    const passes = [new EffectPass(this.camera, this.bloom, tone, vig)];
    if (this.q.tier !== 'low') {
      const noise = new NoiseEffect({ premultiply: false, blendFunction: BlendFunction.OVERLAY });
      noise.blendMode.opacity.value = 0.1;
      const ca = new ChromaticAberrationEffect({ offset: new Vector2(0.00055, 0.00035), radialModulation: true, modulationOffset: 0.35 });
      passes.push(new EffectPass(this.camera, ca, noise));
    }
    if (this.q.msaa === 0) passes.push(new EffectPass(this.camera, new SMAAEffect({ preset: this.q.tier === 'low' ? SMAAPreset.LOW : SMAAPreset.MEDIUM })));
    for (const p of passes) this.composer.addPass(p);
  }

  resize(dpr?: number) {
    const w = innerWidth, h = innerHeight;
    const ratio = dpr ?? this.gov?.dpr ?? Math.min(devicePixelRatio || 1, this.q?.dprMax ?? 1.5);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    const tall = w / h < 0.95;
    this.camera.fov = tall ? 58 : w / h < 1.3 ? 50 : 45;
    this.camera.updateProjectionMatrix();
    this.pond?.setSize(w * ratio, h * ratio);
    if (this.props) this.props.layoutLetters(w / h);
    if (this.rail && this.rail.tall !== tall) this.rail.build(tall);
    if (this.fireflies) (this.fireflies.material as ShaderMaterial).uniforms.pr.value = ratio * (h / 800) * 1.6;
  }

  setSections(sections: SectionBox[]) {
    this.rail?.setSections(sections, innerHeight);
  }

  setScroll(y: number) { this.scrollY = y; }

  scrollFor(id: StationId) { return this.rail.scrollFor(id); }

  setMethodProgress(n: number) { this.props?.setMethodProgress(n); }

  setHighlight(kind: TargetKind, index: number) {
    if (!this.props) return;
    this.props.clientScreens.forEach((m, i) => { m.uniforms.hover.value = kind === 'client' && i === index ? 1 : 0; });
    this.props.worldScreens.forEach((m, i) => { m.uniforms.hover.value = kind === 'world' && i === index ? 1 : 0; });
    if (kind === 'study' && index >= 0) {
      this.props.ringMat.uniforms.hoverIndex.value = index;
      this.props.focusStudy(index, this.camera);
    }
  }

  spinStudies(dir: number) {
    if (!this.props) return;
    const n = this.props.ringCount;
    const next = ((this.studyNow < 0 ? 0 : this.studyNow) + dir + n) % n;
    this.props.focusStudy(next, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.introStart = this.reduced || /[?&]skipintro/.test(location.search) ? -10 : 0.05;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private bindPointer() {
    const c = this.canvas;
    addEventListener('pointermove', (e) => {
      this.mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (e.target === c) { this.ndc.copy(this.mouse); this.pointerDirty = true; }
      else if (this.hovered) { this.ndc.set(-2, -2); this.pointerDirty = true; }
      if (this.drag.active && e.pointerId === this.drag.id) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        if (this.drag.ring) {
          this.props.ringTarget = null;
          this.props.ringDrag = MathUtils.clamp(this.props.ringDrag - dx * 0.06, -3, 3);
        } else {
          this.look.tYaw = MathUtils.clamp(this.look.tYaw + dx * 0.0035, -0.95, 0.95);
          this.look.tPitch = MathUtils.clamp(this.look.tPitch + dy * 0.0025, -0.35, 0.4);
          this.look.idle = 0;
        }
      }
    }, { passive: true });
    c.addEventListener('pointerdown', (e) => {
      this.drag = { active: true, x: e.clientX, y: e.clientY, moved: 0, ring: this.hovered?.kind === 'study', id: e.pointerId };
    });
    const up = (e: PointerEvent) => {
      if (!this.drag.active || e.pointerId !== this.drag.id) return;
      const click = this.drag.moved < 8;
      this.drag.active = false;
      if (click && e.target === c) {
        this.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        const hit = this.pick();
        if (hit) this.events.select(hit);
      }
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.ndc.set(-2, -2); this.pointerDirty = true; });
  }

  private pick(): { kind: TargetKind; index: number } | null {
    if (!this.props || this.overlay) return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    this.ray.layers.enableAll();
    this.ray.far = 45;
    const objs: Object3D[] = this.props.targets.map((t) => t.object);
    const hits = this.ray.intersectObjects(objs, true);
    if (!hits.length) { this.hoverInstance = -1; return null; }
    const h = hits[0];
    let o: Object3D | null = h.object;
    while (o) {
      const t = this.props.targets.find((x) => x.object === o);
      if (t) {
        this.hovered = t;
        if (t.kind === 'study') { this.hoverInstance = h.instanceId ?? -1; return { kind: 'study', index: this.hoverInstance }; }
        return { kind: t.kind, index: t.index };
      }
      o = o.parent;
    }
    return null;
  }

  private placeCamera(dt: number): void {
    const target = this.rail.tAt(this.scrollY);
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 5);
    this.tCur += (target - this.tCur) * (dt === 0 ? 1 : k);
    this.rail.sample(this.tCur, this.tmpPos, this.tmpLook);
    const cam = this.camera;
    // intro: descend from above the canopy to the water's edge
    if (this.introStart >= 0) {
      const intro = MathUtils.clamp((this.time - this.introStart) / 4.2, 0, 1);
      const e = 1 - Math.pow(1 - intro, 3);
      const from = new Vector3(0, 9, 38), fromLook = new Vector3(0, 0.5, -14);
      this.tmpPos.lerpVectors(from, this.tmpPos, e);
      this.tmpLook.lerpVectors(fromLook, this.tmpLook, e);
      this.fog.density = MathUtils.lerp(0.075, FOG_DENSITY, e);
    }
    const speed = Math.abs(target - this.tCur);
    const bob = this.reduced ? 0 : Math.sin(this.time * 1.7) * 0.025 + Math.sin(this.time * 0.6) * 0.04 + Math.sin(this.time * 5.5) * speed * 0.8;
    cam.position.copy(this.tmpPos);
    cam.position.y += bob;
    cam.lookAt(this.tmpLook);
    // parallax + drag look
    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 3));
    if (!this.drag.active) {
      this.look.idle += dt;
      if (this.look.idle > 1.4) { this.look.tYaw *= Math.pow(0.25, dt); this.look.tPitch *= Math.pow(0.25, dt); }
    }
    this.look.yaw += (this.look.tYaw - this.look.yaw) * (1 - Math.exp(-dt * 6));
    this.look.pitch += (this.look.tPitch - this.look.pitch) * (1 - Math.exp(-dt * 6));
    const par = this.reduced ? 0 : 1;
    cam.rotateOnWorldAxis(new Vector3(0, 1, 0), -this.mouseS.x * 0.05 * par - this.look.yaw);
    cam.rotateX(this.mouseS.y * 0.03 * par - this.look.pitch);
  }

  private updateLights(dt: number) {
    const cam = this.camera.position;
    const scored = this.props.emitters
      .map((e) => ({ e, s: (e.intensity * e.level()) / (1 + e.pos.distanceToSquared(cam) / (e.range * e.range * 4)) }))
      .filter((x) => x.s > 0.05 && x.e.pos.distanceTo(cam) < 38)
      .sort((a, b) => b.s - a.s)
      .slice(0, this.pool.length)
      .map((x) => x.e);
    const want = new Set(scored);
    for (const slot of this.pool) {
      if (slot.e && !want.has(slot.e)) {
        slot.fade = Math.max(0, slot.fade - dt * 4);
        if (slot.fade === 0) slot.e = null;
      }
    }
    for (const e of scored) {
      if (this.pool.some((s) => s.e === e)) continue;
      const free = this.pool.find((s) => !s.e);
      if (free) { free.e = e; free.fade = 0; free.l.position.copy(e.pos); free.l.color.copy(e.color); free.l.distance = e.range; }
    }
    for (const slot of this.pool) {
      if (!slot.e) { slot.l.intensity = 0; continue; }
      if (want.has(slot.e)) slot.fade = Math.min(1, slot.fade + dt * 3);
      const fl = 0.94 + 0.06 * Math.sin(this.time * 17 + slot.e.pos.x);
      slot.l.intensity = slot.e.intensity * slot.e.level() * slot.fade * fl;
    }
  }

  private frame = (now: number) => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameNo += 1;
    if (this.overlay && this.frameNo % 3 !== 0) return; // dim the world while a case study is open
    this.time += dt;
    shared.time.value = this.time;

    this.placeCamera(dt);
    // letters ignite one after another as the intro lands
    const p = this.props;
    for (let i = 0; i < 7; i += 1) {
      const t0 = this.introStart < 0 ? -1 : this.introStart + 1.6 + i * 0.24;
      const on = this.time > t0 + 0.45 ? 1 : this.time > t0 ? (Math.random() < 0.55 ? 1 : 0.1) : 0;
      p.letterPower[i] = this.reduced || this.introStart < 0 ? 1 : on;
    }
    p.update(this.time, dt);
    this.pond.updateDrops(this.time);
    this.updateLights(dt);

    // shadow camera follows what we are looking at
    if (this.q.shadows) {
      const f = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(12).add(this.camera.position);
      f.x = Math.round(f.x); f.z = Math.round(f.z); f.y = 0;
      this.moon.target.position.copy(f);
      this.moon.position.copy(f).addScaledVector(MOON_DIR, 70);
    }

    // which stop are we at?
    let st: StationId | null = null;
    for (const id of STATION_ORDER) if (Math.abs(this.rail.stationT[id] - this.tCur) < 0.02) st = id;
    if (st !== this.stationNow) {
      this.stationNow = st;
      this.events.station(st);
    }
    const nearContact = this.camera.position.z < -150;
    p.setDeskActive(nearContact, this.deskVideo);
    if (this.stationNow === 'studies' && this.frameNo % 8 === 0) {
      const f = p.frontStudy(this.camera);
      if (f !== this.studyNow) { this.studyNow = f; this.events.study(f); }
    }

    if (this.pointerDirty && this.frameNo % 2 === 0) {
      this.pointerDirty = false;
      const prev = this.hovered;
      const hit = this.pick();
      if (!hit) this.hovered = null;
      if (prev !== this.hovered || (hit && hit.kind === 'study')) {
        this.events.hover(hit);
        this.canvas.style.cursor = hit ? 'pointer' : '';
        this.setHighlight(hit?.kind ?? 'home', hit?.index ?? -1);
        if (!hit) this.props.ringMat.uniforms.hoverIndex.value = -1;
      }
    }

    // grass sway reacts a touch to scrolling speed
    shared.wind.value = 1 + Math.min(1.5, Math.abs(this.rail.tAt(this.scrollY) - this.tCur) * 30);
    this.bloom.intensity = 1.05 + 0.08 * Math.sin(this.time * 0.7);

    this.renderer.info.reset();
    if (!this.overlay) this.pond.renderReflection(this.renderer, this.scene, this.camera);
    this.composer.render(dt);
    this.gov.tick(dt);
  };

  pause() { this.running = false; }
  resume() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.frame); } }
}

function nextFrame() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

