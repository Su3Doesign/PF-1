import {
  Mesh, ShaderMaterial, Texture, WebGLRenderTarget, HalfFloatType, PerspectiveCamera, Matrix4, Vector3, Vector4,
  Plane, Color, UniformsLib, UniformsUtils, BufferGeometry, BufferAttribute, WebGLRenderer, Scene, Frustum
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
  vRef = textureMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tReflect, tNormal, tNoise;
uniform float time, distortion;
uniform vec3 deep, moonDir, moonColor;
uniform vec4 drops[4];
varying vec4 vRef;
varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  vec3 n1 = texture2D(tNormal, p * 0.045 + vec2(time * 0.006, time * 0.004)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNormal, p * 0.11 - vec2(time * 0.005, -time * 0.008)).xyz * 2.0 - 1.0;
  vec2 slope = (n1.xy + n2.xy) * 0.5;
  // expanding ripple rings from falling drops
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
  vec3 n = normalize(vec3(slope.x, 1.0 / distortion, slope.y));
  vec3 V = normalize(cameraPosition - vW);
  float cosT = max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec2 ruv = vRef.xy / vRef.w + slope * 0.014;
  vec3 refl = texture2D(tReflect, ruv).rgb;
  float murk = texture2D(tNoise, p * 0.02).r;
  vec3 body = deep * (0.7 + 0.6 * murk);
  vec3 col = mix(body, refl, clamp(0.35 + fres * 0.75, 0.0, 0.94));
  vec3 H = normalize(moonDir + V);
  float spec = pow(max(dot(n, H), 0.0), 900.0);
  col += moonColor * spec * 0.9;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

function pondGeometry(): BufferGeometry {
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

export class Pond extends Mesh<BufferGeometry, ShaderMaterial> {
  private rt: WebGLRenderTarget;
  private cam = new PerspectiveCamera();
  private tm = new Matrix4();
  private frustum = new Frustum();
  private pv = new Matrix4();
  private dropIdx = 0;
  private nextDrop = 0;
  scale01: number;
  enabled = true;

  constructor(tex: { waterN: Texture; noise: Texture }, scale01: number) {
    const mat = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, {
        tReflect: { value: null }, tNormal: { value: null }, tNoise: { value: null }, textureMatrix: { value: new Matrix4() },
        time: { value: 0 }, distortion: { value: 3.2 }, deep: { value: new Color(0x031412) },
        moonDir: { value: new Vector3(-0.35, 0.55, -0.75).normalize() }, moonColor: { value: new Color(0xcfe0ff) },
        drops: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] }
      }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true
    });
    super(pondGeometry(), mat);
    this.name = 'pond';
    this.scale01 = scale01;
    this.rt = new WebGLRenderTarget(512, 512, { type: HalfFloatType });
    mat.uniforms.tReflect.value = this.rt.texture;
    mat.uniforms.tNormal.value = tex.waterN;
    mat.uniforms.tNoise.value = tex.noise;
    mat.uniforms.textureMatrix.value = this.tm;
    mat.uniforms.time = shared.time;
    this.frustumCulled = true;
  }

  setSize(w: number, h: number) {
    this.rt.setSize(Math.max(64, Math.round(w * this.scale01)), Math.max(64, Math.round(h * this.scale01)));
  }

  /** Occasional drops from the hanging moss above the water. */
  updateDrops(t: number) {
    if (t < this.nextDrop) return;
    this.nextDrop = t + 0.6 + Math.random() * 1.6;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.8;
    const d = this.material.uniforms.drops.value[this.dropIdx] as Vector4;
    d.set(POND.cx + Math.cos(a) * POND.rx * r, POND.cz + Math.sin(a) * POND.rz * r, t, 0.6 + Math.random() * 0.6);
    this.dropIdx = (this.dropIdx + 1) % 4;
  }

  /** Render the mirrored scene. Called by the world before the main render. */
  renderReflection(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    if (!this.enabled) return;
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    if (!this.geometry.boundingSphere || !this.frustum.intersectsSphere(this.geometry.boundingSphere)) return;
    if (camera.position.y < 0.05) return;

    const normal = new Vector3(0, 1, 0);
    const planePos = new Vector3(0, 0, 0);
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
    this.tm.multiply(c.projectionMatrix).multiply(c.matrixWorldInverse).multiply(this.matrixWorld);

    // oblique near plane so nothing below the water leaks into the reflection
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(c.matrixWorldInverse);
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
    this.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, c);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow;
    this.visible = true;
  }

  dispose() { this.rt.dispose(); this.geometry.dispose(); this.material.dispose(); }
}

