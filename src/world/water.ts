import {
  Mesh, ShaderMaterial, Texture, WebGLRenderTarget, HalfFloatType, PerspectiveCamera, Matrix4, Vector2, Vector3, Vector4,
  Plane, Color, UniformsLib, UniformsUtils, BufferGeometry, BufferAttribute, WebGLRenderer, Scene, Frustum, Sphere, IUniform
} from 'three';
import { POND } from './layout';
import { shared } from './materials';

export const LAYER_NO_REFLECT = 2;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform mat4 textureMatrix;
varying vec4 vRef;
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vRef = textureMatrix * w;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tReflect, tNormal, tNoise;
uniform float time, distortion, nScale, reflAmt, clarity, specPow, specAmt, murkAmt, caustic;
uniform vec2 flow;
uniform vec3 deep, moonDir, moonColor;
uniform vec4 drops[4];
varying vec4 vRef;
varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  float dist = length(cameraPosition - vW);
  vec2 f = flow * time;
  vec3 n1 = texture2D(tNormal, p * 0.045 * nScale + vec2(time * 0.006, time * 0.004) + f * 0.045).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNormal, p * 0.11 * nScale - vec2(time * 0.005, -time * 0.008) + f * 0.11).xyz * 2.0 - 1.0;
  vec2 slope = (n1.xy + n2.xy) * 0.5;
  for (int i = 0; i < 4; i++) {
    vec4 d = drops[i];
    float age = time - d.z;
    if (age > 0.0 && age < 4.0) {
      vec2 dv = p - d.xy;
      float r = length(dv);
      float front = age * 0.55;
      float ring = sin((r - front) * 14.0) * exp(-abs(r - front) * 5.0) * exp(-age * 0.9) * d.w;
      slope += normalize(dv + 1e-4) * ring * 0.35;
    }
  }
  slope /= 1.0 + dist * 0.004;
  vec3 n = normalize(vec3(slope.x, 1.0 / distortion, slope.y));
  vec3 V = normalize(cameraPosition - vW);
  float cosT = max(V.y, 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec2 ruv = vRef.xy / vRef.w + slope * 0.014;
  vec3 refl = texture2D(tReflect, ruv).rgb;
  float murk = texture2D(tNoise, p * 0.02).r;
  vec3 body = deep * (1.0 - murkAmt * 0.3 + murkAmt * 0.6 * murk);
  float rk = clamp(reflAmt * (0.35 + fres * 0.75), 0.0, 0.96);
  vec3 col = mix(body, refl, rk);
  vec3 H = normalize(moonDir + V);
  float spec = pow(max(dot(n, H), 0.0), specPow);
  col += moonColor * spec * specAmt;
  float a = 1.0;
  if (clarity > 0.0) {
    // clear water: see down to the floor where we look steeply, mirror where we graze
    a = clamp(mix(1.0 - clarity, 1.0, fres * 1.6 + rk * 0.4), 0.0, 1.0);
  }
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

export interface WaterLook {
  deep?: Color;
  scale?: number;       // normal-map frequency multiplier
  distortion?: number;  // larger = flatter
  refl?: number;
  clarity?: number;     // > 0 makes it see-through
  specPow?: number;
  specAmt?: number;
  murk?: number;
  flow?: Vector2;
}

/** One mirror for every water surface in the world: they all lie on y = 0. */
export class Reflector {
  rt: WebGLRenderTarget;
  private cam = new PerspectiveCamera();
  tm = new Matrix4();
  surfaces: Mesh[] = [];
  private frustum = new Frustum();
  private pv = new Matrix4();
  private sphere = new Sphere();
  enabled = true;
  uniforms: { tReflect: IUniform<Texture>; textureMatrix: IUniform<Matrix4> };

  constructor(private scale01: number) {
    this.rt = new WebGLRenderTarget(512, 512, { type: HalfFloatType });
    this.uniforms = { tReflect: { value: this.rt.texture }, textureMatrix: { value: this.tm } };
  }

  setSize(w: number, h: number) {
    this.rt.setSize(Math.max(64, Math.round(w * this.scale01)), Math.max(64, Math.round(h * this.scale01)));
  }

  material(tex: { waterN: Texture; noise: Texture }, o: WaterLook = {}): ShaderMaterial {
    const m = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, {
        tNormal: { value: null }, tNoise: { value: null },
        time: { value: 0 }, distortion: { value: o.distortion ?? 3.2 }, nScale: { value: o.scale ?? 1 },
        reflAmt: { value: o.refl ?? 1 }, clarity: { value: o.clarity ?? 0 }, specPow: { value: o.specPow ?? 900 },
        specAmt: { value: o.specAmt ?? 0.9 }, murkAmt: { value: o.murk ?? 1 }, caustic: { value: 0 },
        flow: { value: o.flow ?? new Vector2() }, deep: { value: o.deep ?? new Color(0x031412) },
        moonDir: { value: null }, moonColor: { value: null },
        drops: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] }
      }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      transparent: (o.clarity ?? 0) > 0
    });
    m.uniforms.tNormal.value = tex.waterN;
    m.uniforms.tNoise.value = tex.noise;
    m.uniforms.tReflect = this.uniforms.tReflect;
    m.uniforms.textureMatrix = this.uniforms.textureMatrix;
    m.uniforms.time = shared.time;
    m.uniforms.moonDir = shared.moonDir;
    m.uniforms.moonColor = shared.moonColor;
    return m;
  }

  add(mesh: Mesh) {
    mesh.geometry.computeBoundingSphere();
    this.surfaces.push(mesh);
    return mesh;
  }

  private anyVisible(camera: PerspectiveCamera): boolean {
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    for (const s of this.surfaces) {
      if (!s.visible || !s.geometry.boundingSphere) continue;
      this.sphere.copy(s.geometry.boundingSphere).applyMatrix4(s.matrixWorld);
      if (this.frustum.intersectsSphere(this.sphere)) return true;
    }
    return false;
  }

  /** Render the mirrored scene. Called by the world before the main render. */
  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    if (!this.enabled || camera.position.y < 0.05 || !this.anyVisible(camera)) return;
    const normal = new Vector3(0, 1, 0);
    const camPos = camera.position.clone();
    camPos.y = -camPos.y;
    const target = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    target.y = -target.y;
    const c = this.cam;
    c.position.copy(camPos);
    c.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(normal);
    c.lookAt(target);
    c.fov = camera.fov; c.aspect = camera.aspect; c.near = camera.near; c.far = camera.far;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();

    this.tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.tm.multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);

    // oblique near plane so nothing below the water leaks into the reflection
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3()).applyMatrix4(c.matrixWorldInverse);
    const clip = new Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = c.projectionMatrix;
    const q = new Vector4(
      (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5],
      -1,
      (1 + pm.elements[10]) / pm.elements[14]
    );
    clip.multiplyScalar(2 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1 - 0.003; pm.elements[14] = clip.w;

    c.layers.enableAll();
    c.layers.disable(LAYER_NO_REFLECT);
    const vis = this.surfaces.map((s) => s.visible);
    for (const s of this.surfaces) s.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, c);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow;
    this.surfaces.forEach((s, i) => { s.visible = vis[i]; });
  }

  dispose() { this.rt.dispose(); }
}

/** Rings from drops falling into a surface: hanging moss over the pond, stalactites in the cave. */
export class Drops {
  private i = 0;
  private next = 0;
  constructor(private mat: ShaderMaterial, private spot: () => [number, number], private every: [number, number] = [0.6, 1.6]) {}
  update(t: number) {
    if (t < this.next) return;
    this.next = t + this.every[0] + Math.random() * this.every[1];
    const [x, z] = this.spot();
    (this.mat.uniforms.drops.value[this.i] as Vector4).set(x, z, t, 0.6 + Math.random() * 0.6);
    this.i = (this.i + 1) % 4;
  }
}

export function pondGeometry(): BufferGeometry {
  // an irregular ellipse, a little larger than the basin so the bank meets the water
  const seg = 96, rings = 10;
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  for (let r = 1; r <= rings; r += 1) {
    const f = r / rings;
    for (let s = 0; s < seg; s += 1) {
      const a = (s / seg) * Math.PI * 2;
      const wob = 1 + 0.05 * Math.sin(a * 3 + 1.3) + 0.03 * Math.sin(a * 7);
      pos.push(POND.cx + Math.cos(a) * POND.rx * 1.12 * f * wob, 0, POND.cz + Math.sin(a) * POND.rz * 1.12 * f * wob);
    }
  }
  for (let s = 0; s < seg; s += 1) idx.push(0, 1 + ((s + 1) % seg), 1 + s);
  for (let r = 1; r < rings; r += 1) {
    const a0 = 1 + (r - 1) * seg, a1 = 1 + r * seg;
    for (let s = 0; s < seg; s += 1) {
      const s1 = (s + 1) % seg;
      idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A flat strip of water following a centre line: the cave's channel. */
export function ribbonGeometry(center: (t: number) => Vector3, width: (t: number) => number, steps: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const tan = new Vector3();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const c = center(t);
    const c2 = center(Math.min(1, t + 0.002));
    const c1 = center(Math.max(0, t - 0.002));
    tan.subVectors(c2, c1).setY(0).normalize();
    const w = width(t);
    pos.push(c.x - tan.z * w, 0, c.z + tan.x * w, c.x + tan.z * w, 0, c.z - tan.x * w);
    if (i < steps) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
