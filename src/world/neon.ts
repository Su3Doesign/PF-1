import {
  CanvasTexture, Color, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, AdditiveBlending, CatmullRomCurve3,
  TubeGeometry, Vector3, ShaderMaterial, UniformsLib, UniformsUtils, Sprite, SpriteMaterial, Texture
} from 'three';
import { shared } from './materials';

export const NEON = {
  teal: 0x3dffd0,
  amber: 0xffb45e,
  red: 0xff3b2e,
  magenta: 0xff4fa3,
  white: 0xdffcf4
};

export interface SignOpts {
  lines: { text: string; font: string; size: number; tracking?: number }[];
  color: number;
  width: number; // metres
  vertical?: boolean;
  intensity?: number;
  pad?: number;
}

/** Neon sign: text rendered with glow to a canvas, drawn additively. */
export function neonSign(o: SignOpts): Mesh {
  const S = 2;
  const measure = document.createElement('canvas').getContext('2d')!;
  const pad = (o.pad ?? 40) * S;
  let w = 0, h = 0;
  const metrics = o.lines.map((l) => {
    measure.font = l.font.replace('{s}', String(l.size * S));
    const tr = (l.tracking ?? 0) * l.size * S;
    const chars = Array.from(l.text);
    const cw = chars.map((c) => measure.measureText(c).width);
    const lw = o.vertical ? l.size * S : cw.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
    const lh = o.vertical ? chars.length * l.size * S * 1.05 : l.size * S * 1.25;
    if (o.vertical) { w += lw * 1.3; h = Math.max(h, lh); } else { w = Math.max(w, lw); h += lh; }
    return { l, chars, cw, tr, lw, lh };
  });
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w + pad * 2);
  cv.height = Math.ceil(h + pad * 2);
  const ctx = cv.getContext('2d')!;
  const col = new Color(o.color);
  const css = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
  const draw = (pass: 'glow' | 'core') => {
    let cx = pad, cy = pad;
    for (const m of metrics) {
      ctx.font = m.l.font.replace('{s}', String(m.l.size * S));
      ctx.textBaseline = 'top';
      if (pass === 'glow') { ctx.shadowColor = css; ctx.shadowBlur = 26 * S; ctx.fillStyle = css; }
      else { ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; }
      if (o.vertical) {
        let yy = cy;
        for (const c of m.chars) { ctx.fillText(c, cx, yy); yy += m.l.size * S * 1.05; }
        cx += m.lw * 1.3;
      } else {
        let xx = cx + (w - m.lw) / 2;
        m.chars.forEach((c, i) => { ctx.fillText(c, xx, cy); xx += m.cw[i] + m.tr; });
        cy += m.lh;
      }
    }
  };
  draw('glow'); draw('glow');
  ctx.globalAlpha = 0.9;
  draw('core');
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  const aspect = cv.height / cv.width;
  const mat = new MeshBasicMaterial({
    map: tex, transparent: true, blending: AdditiveBlending, depthWrite: false,
    color: col.clone().lerp(new Color(1, 1, 1), 0.15).multiplyScalar(o.intensity ?? 2.2), fog: true
  });
  mat.userData.intensity = o.intensity ?? 2.2;
  mat.userData.base = mat.color.clone().multiplyScalar(1 / (o.intensity ?? 2.2));
  const mesh = new Mesh(new PlaneGeometry(o.width, o.width * aspect), mat);
  mesh.renderOrder = 5;
  return mesh;
}

/** Emissive tube along points with a travelling pulse. */
export function neonTube(points: Vector3[], color: number, radius = 0.03, intensity = 6, pulse = 0): Mesh {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const len = curve.getLength();
  const geo = new TubeGeometry(curve, Math.max(8, Math.round(len * 6)), radius, 6, false);
  const mat = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      color: { value: new Color(color).multiplyScalar(intensity) },
      len: { value: len }, pulse: { value: pulse }, time: { value: 0 }, power: { value: 1 }, dir: { value: 1 }
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying float vU;
      void main(){ vU = uv.x; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 color; uniform float len, pulse, time, power, dir; varying float vU;
      void main(){
        float d = vU * len;
        float p = pulse > 0.0 ? pow(0.5 + 0.5 * sin((d * 0.35 - time * 2.4 * dir)), 8.0) * pulse : 0.0;
        float base = 0.55 + 0.45 * (1.0 - pulse * 0.6);
        gl_FragColor = vec4(color * (base + p * 2.5) * power, 1.0);
        #include <fog_fragment>
      }`,
    fog: true
  });
  mat.uniforms.time = shared.time;
  const m = new Mesh(geo, mat);
  m.userData.curve = curve;
  return m;
}

let glowTex: Texture | null = null;
function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color: number, size: number, intensity = 1.5): Sprite {
  const m = new SpriteMaterial({ map: glowTexture(), color: new Color(color).multiplyScalar(intensity), blending: AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  const s = new Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 6;
  return s;
}
