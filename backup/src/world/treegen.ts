// Procedural trees: tapered, closed limbs swept along bent spines, with crowns
// built from textured foliage cards whose normals point out of the crown so the
// canopy shades like one soft volume instead of a pile of planes.
import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, IUniform, MeshLambertMaterial, Texture, Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shared } from './materials';

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

type RadiusFn = (i: number, t: number, theta: number) => number;

/** A tapered tube along `pts`. The last ring collapses to a point so tips close. */
export function limb(pts: Vector3[], radius: RadiusFn, radial: number, texel = 1.7): BufferGeometry {
  const n = pts.length;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const idx: number[] = [];
  const T = new Vector3(), N = new Vector3(), B = new Vector3(), prevT = new Vector3();
  let len = 0;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i];
    if (i < n - 1) T.subVectors(pts[i + 1], p).normalize(); else T.subVectors(p, pts[i - 1]).normalize();
    if (i === 0) {
      N.set(0, 0, 1);
      if (Math.abs(T.z) > 0.9) N.set(1, 0, 0);
      B.crossVectors(T, N).normalize();
      N.crossVectors(B, T).normalize();
    } else {
      // parallel transport keeps the rings from twisting
      const ax = new Vector3().crossVectors(prevT, T);
      const s = ax.length();
      if (s > 1e-5) {
        ax.normalize();
        const ang = Math.asin(Math.min(1, s));
        N.applyAxisAngle(ax, ang);
        B.applyAxisAngle(ax, ang);
      }
      len += p.distanceTo(pts[i - 1]);
    }
    prevT.copy(T);
    const t = i / (n - 1);
    const r0 = radius(i, t, 0);
    const around = Math.max(1, Math.round((Math.PI * 2 * Math.max(r0, 0.05)) / texel));
    for (let k = 0; k <= radial; k += 1) {
      const th = (k / radial) * Math.PI * 2;
      const r = i === n - 1 ? 0.002 : radius(i, t, th);
      const cx = Math.cos(th), sx = Math.sin(th);
      const dx = N.x * cx + B.x * sx, dy = N.y * cx + B.y * sx, dz = N.z * cx + B.z * sx;
      pos.push(p.x + dx * r, p.y + dy * r, p.z + dz * r);
      nor.push(dx, dy, dz);
      uv.push((k / radial) * around, len / texel);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k < radial; k += 1) {
      const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A spine from `a` heading `dir`, bending by `droop` (negative y per unit²) and a little noise. */
export function spine(a: Vector3, dir: Vector3, L: number, segs: number, droop: number, wobble: number, r: () => number): Vector3[] {
  const pts: Vector3[] = [];
  const d = dir.clone().normalize();
  const side = new Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(wobble);
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const p = a.clone().addScaledVector(d, L * t);
    p.y -= droop * (L * t) * (L * t);
    p.addScaledVector(side, Math.sin(t * Math.PI) * L * 0.25);
    pts.push(p);
  }
  return pts;
}

// ── foliage cards ───────────────────────────────────────────────────────────
export class Cards {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  private n = 0;

  /**
   * One quad at `c`, facing roughly along `out`, `size` metres wide.
   * `shade` darkens cards deep inside the crown; `aspect` stretches it vertically.
   */
  add(c: Vector3, out: Vector3, size: number, shade: number, r: () => number, opts: { aspect?: number; tilt?: number; hang?: boolean; soft?: number } = {}) {
    const o = out.clone().normalize();
    const tilt = opts.tilt ?? 0.9;
    const nrm = o.clone().add(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(tilt * 2)).normalize();
    let t1 = new Vector3(0, 1, 0).cross(nrm);
    if (t1.lengthSq() < 1e-4) t1 = new Vector3(1, 0, 0);
    t1.normalize();
    const t2 = new Vector3().crossVectors(nrm, t1).normalize();
    const spin = r() * Math.PI * 2;
    const a1 = t1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t2, Math.sin(spin));
    const a2 = new Vector3().crossVectors(nrm, a1).normalize();
    if (opts.hang) { a1.copy(t1); a2.set(0, 1, 0); }
    const hw = size * 0.5, hh = size * 0.5 * (opts.aspect ?? 1);
    const soft = opts.soft ?? 0.75;
    const sn = o.clone().multiplyScalar(soft).addScaledVector(nrm, 1 - soft).normalize();
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    const j = 0.9 + r() * 0.2;
    for (const [sx, sy, u, v] of corners) {
      const px = c.x + a1.x * sx * hw + a2.x * sy * hh;
      const py = c.y + a1.y * sx * hw + a2.y * sy * hh;
      const pz = c.z + a1.z * sx * hw + a2.z * sy * hh;
      this.pos.push(px, py, pz);
      this.nor.push(sn.x, sn.y, sn.z);
      this.uv.push(u, v);
      // bottom edge of hanging cards darker; everything deep in the crown darker
      const k = shade * j * (opts.hang ? 0.75 + 0.25 * v : 1);
      this.col.push(k, k, k);
    }
    const b = this.n;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export interface TreeGeo { trunk: BufferGeometry; crown: BufferGeometry; height: number; foot: number }


/** Sugi (Japanese cedar): straight column, short drooping branches, a narrow cone of dense tufts. */
/** detail: 1 full, 0 lighter, -1 far (distant ridges and saplings: no branches, fewer, larger tufts). */
export function sugi(seed: number, H: number, r0: number, detail: number): TreeGeo {
  const r = rng(seed);
  const far = detail < 0;
  const radial = far ? 6 : detail ? 14 : 9, rows = far ? 7 : detail ? 22 : 14;
  const lean = new Vector3((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
  const pts: Vector3[] = [];
  for (let i = 0; i <= rows; i += 1) {
    const t = i / rows;
    const y = -1.4 + t * (H + 1.4);
    pts.push(new Vector3(lean.x * t * t + Math.sin(t * 5 + seed) * 0.08, y, lean.z * t * t + Math.cos(t * 4 + seed) * 0.08));
  }
  const phase = r() * 6;
  const trunk = limb(pts, (_i, t, th) => {
    const y = -1.4 + t * (H + 1.4);
    const taper = Math.pow(1 - t, 0.85);
    const but = Math.pow(Math.abs(Math.sin(th * 2.5 + phase)), 3);
    const flare = 1.3 * Math.exp(-Math.max(0, y + 0.3) * 1.5) * (0.4 + 0.9 * but);
    const furrow = 0.03 * Math.sin(th * 14 + y * 0.3);
    return r0 * (0.12 + 0.88 * taper) * (1 + flare) * (1 + furrow);
  }, radial);
  const parts: BufferGeometry[] = [trunk];
  const cards = new Cards();
  const base = H * (0.34 + r() * 0.1);
  const Rmax = 2.2 + r() * 1.1;
  const trunkAt = (y: number) => {
    const t = (y + 1.4) / (H + 1.4);
    return new Vector3(lean.x * t * t, y, lean.z * t * t);
  };
  // a few dead snags below the living crown
  for (let y = base * 0.45; y < base; y += 1.1 + r() * 1.2) {
    if (r() < 0.5) continue;
    const a = r() * Math.PI * 2;
    const dir = new Vector3(Math.cos(a), -0.1, Math.sin(a));
    if (detail > 0) parts.push(limb(spine(trunkAt(y), dir, 0.6 + r() * 0.8, 3, 0.05, 0.1, r), (_i, t) => 0.05 * (1 - t) + 0.01, 4));
  }
  for (let y = base; y < H - 0.4; y += far ? 1.05 + r() * 0.5 : 0.55 + r() * 0.35) {
    const u = (y - base) / (H - base);
    const L = Rmax * Math.pow(1 - u, 0.9) + 0.4;
    const nb = u < 0.7 ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
    for (let b = 0; b < nb; b += 1) {
      const a = r() * Math.PI * 2;
      const dir = new Vector3(Math.cos(a), 0.15 - u * 0.1 + (r() - 0.5) * 0.25, Math.sin(a));
      const root = trunkAt(y);
      const sp = spine(root, dir, L, 3, 0.04 + 0.03 * (1 - u), 0.3, r);
      if (detail > 0 && L > 1.2) parts.push(limb(sp, (_i, t) => (0.07 + 0.05 * (1 - u)) * (1 - t) + 0.01, 4));
      const clumps = L > 2 ? 3 : L > 1.1 ? 2 : 1;
      for (let k = 0; k < clumps; k += 1) {
        const t = clumps === 1 ? 0.9 : 0.4 + (k / (clumps - 1)) * 0.6;
        const p = sp[Math.min(sp.length - 1, Math.round(t * (sp.length - 1)))].clone();
        p.y += 0.15;
        const out = p.clone().sub(root).setY(0.45).normalize();
        const size = (1.25 + 0.8 * (1 - u) * r() + 0.35) * (far ? 1.45 : 1);
        const shade = 0.55 + 0.45 * t * (0.7 + 0.3 * u);
        if (far && k === 1) continue;
        cards.add(p, out, size, shade, r, { tilt: 0.7 });
        if (!far && r() < 0.55) cards.add(p.clone().add(new Vector3(0, -0.2, 0)), out, size * 0.8, shade * 0.85, r, { tilt: 1.0 });
      }
    }
  }
  const top = trunkAt(H);
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2;
    cards.add(top.clone().add(new Vector3(Math.cos(a) * 0.3, -0.5 - r() * 0.6, Math.sin(a) * 0.3)), new Vector3(Math.cos(a), 0.8, Math.sin(a)), 1.1, 1, r, { tilt: 0.5 });
  }
  return { trunk: mergeGeometries(parts)!, crown: cards.geometry(), height: H, foot: r0 * 2.2 };
}

/** Broadleaf: trunk that forks into spreading leaders under a domed crown.
 *  `vase` > 0 makes a keyaki-like upswept crown; 0 makes an umbrella maple. */
export function broadleaf(seed: number, o: { H: number; r0: number; fork: number; R: number; Rh: number; leaders: number; vase: number; card: number; count: number }, detail: number): TreeGeo {
  const r = rng(seed);
  const far = detail < 0;
  if (far) o = { ...o, count: Math.round(o.count * 0.45), card: o.card * 1.5 };
  const radial = far ? 6 : detail ? 12 : 8;
  const parts: BufferGeometry[] = [];
  const lean = new Vector3((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
  const tpts: Vector3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    tpts.push(new Vector3(lean.x * t, -1.2 + t * (o.fork + 1.2), lean.z * t));
  }
  const phase = r() * 6;
  parts.push(limb(tpts, (_i, t, th) => {
    const y = -1.2 + t * (o.fork + 1.2);
    const but = Math.pow(Math.abs(Math.sin(th * 2 + phase)), 3);
    return o.r0 * (1 - 0.25 * t) * (1 + 1.1 * Math.exp(-Math.max(0, y + 0.2) * 1.8) * (0.5 + but));
  }, radial));
  const fork = tpts[tpts.length - 1];
  const center = new Vector3(lean.x, o.H - o.Rh * 0.9, lean.z);
  const cards = new Cards();
  const tips: Vector3[] = [];
  for (let l = 0; l < o.leaders; l += 1) {
    const a = (l / o.leaders) * Math.PI * 2 + r() * 0.8;
    const out = new Vector3(Math.cos(a), 0, Math.sin(a));
    const target = center.clone().addScaledVector(out, o.R * (0.55 + 0.25 * r())).add(new Vector3(0, o.Rh * (0.1 + 0.3 * r()), 0));
    const dir = target.clone().sub(fork);
    const L = dir.length();
    const pts: Vector3[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      // leaders rise steeply then arch out
      const p = fork.clone().lerp(target, t);
      p.addScaledVector(out, -Math.sin(t * Math.PI) * L * 0.12 * (1 - o.vase));
      p.y += Math.sin(t * Math.PI) * L * 0.08;
      pts.push(p);
    }
    parts.push(limb(pts, (_i, t) => o.r0 * 0.62 * (1 - t * 0.8) + 0.02, far ? 5 : detail ? 8 : 6));
    tips.push(target);
    // secondary branches off each leader
    for (let s = 0; s < 3; s += 1) {
      const p0 = pts[2 + s];
      const sa = a + (r() - 0.5) * 1.8;
      const sdir = new Vector3(Math.cos(sa), 0.3 + r() * 0.4, Math.sin(sa));
      const sl = o.R * (0.35 + 0.25 * r());
      const sp = spine(p0, sdir, sl, 3, 0.03, 0.2, r);
      if (detail > 0 || (s === 0 && !far)) parts.push(limb(sp, (_i, t) => o.r0 * 0.25 * (1 - t) + 0.015, 5));
      tips.push(sp[sp.length - 1]);
    }
  }
  // the crown: cards over an oblate dome, layered so the underside reads darker
  for (let k = 0; k < o.count; k += 1) {
    const u = r(), v = r();
    const th = u * Math.PI * 2;
    const ph = Math.acos(1 - v * 1.35); // mostly the upper hemisphere
    const dir = new Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const shell = 0.62 + 0.38 * Math.sqrt(r());
    const p = center.clone().add(new Vector3(dir.x * o.R * shell, dir.y * o.Rh * shell, dir.z * o.R * shell));
    // clumps gather around branch tips
    if (r() < 0.45) {
      const tp = tips[Math.floor(r() * tips.length)];
      p.lerp(tp, 0.55);
      p.add(new Vector3((r() - 0.5) * o.card, (r() - 0.3) * o.card * 0.6, (r() - 0.5) * o.card));
    }
    const outward = p.clone().sub(center);
    outward.y *= 1.6;
    const shade = 0.5 + 0.5 * Math.min(1, shell * (0.6 + 0.4 * Math.max(0, dir.y + 0.3)));
    cards.add(p, outward, o.card * (0.8 + 0.45 * r()), shade, r, { tilt: 0.85 });
  }
  return { trunk: mergeGeometries(parts)!, crown: cards.geometry(), height: o.H, foot: o.r0 * 2 };
}

/** Black pine: a twisting, leaning trunk with flat cloud pads — for the sea cliffs. */
export function blackPine(seed: number, H: number, detail: number): TreeGeo {
  const r = rng(seed);
  const parts: BufferGeometry[] = [];
  const cards = new Cards();
  const lean = new Vector3(r() - 0.5, 0, r() - 0.5).normalize().multiplyScalar(H * 0.35);
  const pts: Vector3[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    pts.push(new Vector3(lean.x * t * t + Math.sin(t * 6 + seed) * 0.4 * t, -1 + t * (H + 1), lean.z * t * t + Math.cos(t * 5 + seed) * 0.4 * t));
  }
  parts.push(limb(pts, (_i, t) => 0.32 * (1 - t * 0.75) * (1 + 0.8 * Math.exp(-(t * H) * 1.2)), detail ? 10 : 7));
  const pads = 5 + Math.floor(r() * 3);
  for (let k = 0; k < pads; k += 1) {
    const t = 0.45 + (k / pads) * 0.55;
    const p0 = pts[Math.round(t * 12)];
    const a = r() * Math.PI * 2;
    const dir = new Vector3(Math.cos(a), 0.15, Math.sin(a));
    const L = (1 - t) * H * 0.55 + 0.8;
    const sp = spine(p0, dir, L, 4, 0.05, 0.3, r);
    parts.push(limb(sp, (_i, tt) => 0.09 * (1 - tt) + 0.02, 5));
    const c = sp[sp.length - 1];
    const R = 1.1 + (1 - t) * 1.2;
    for (let j = 0; j < 14; j += 1) {
      const aa = r() * Math.PI * 2, rr = Math.sqrt(r()) * R;
      const p = c.clone().add(new Vector3(Math.cos(aa) * rr, 0.1 + r() * 0.35, Math.sin(aa) * rr));
      cards.add(p, new Vector3(Math.cos(aa) * 0.4, 1, Math.sin(aa) * 0.4), 1.1 + r() * 0.5, 0.65 + 0.35 * r(), r, { tilt: 0.35 });
    }
  }
  return { trunk: mergeGeometries(parts)!, crown: cards.geometry(), height: H, foot: 0.6 };
}

/** Round bush: a shell of leaf cards. Unit radius, sits on y = 0. */
export function bushGeometry(seed: number, cards = 26): BufferGeometry {
  const r = rng(seed);
  const c = new Cards();
  for (let k = 0; k < cards; k += 1) {
    const th = r() * Math.PI * 2;
    const ph = Math.acos(1 - r() * 1.2);
    const dir = new Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const shell = 0.55 + 0.45 * r();
    const p = new Vector3(dir.x * shell, 0.55 + dir.y * shell * 0.75, dir.z * shell);
    c.add(p, dir.clone().setY(dir.y + 0.3), 0.95 + r() * 0.5, 0.45 + 0.55 * shell * (0.6 + 0.4 * Math.max(0, dir.y)), r, { tilt: 0.8 });
  }
  return c.geometry();
}

/** Grass tuft: two crossed vertical cards, 1 m wide, 1 m tall. */
export function tuftGeometry(): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    for (let i = 0; i < 4; i += 1) nor.push(0, 1, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1, 1, 1, 1, 1, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ── foliage material ────────────────────────────────────────────────────────
export interface LeafOpts {
  map?: Texture;
  alphaTest?: number;
  sway?: number;     // metres of sway at the top of the object
  height?: number;   // local height the sway is normalised to
  trans?: number;    // back-lit translucency
  color?: Color;
  emissive?: Color;
  grow?: IUniform<number>; // camera z: things ahead unfurl as the visitor approaches
  hang?: boolean;          // geometry hangs below y = 0 (wisteria): sway grows downward
  vertexColors?: boolean;
}

/** Lambert foliage with wind, soft crown normals and a hint of translucency. */
export function leafMaterial(o: LeafOpts): MeshLambertMaterial {
  const m = new MeshLambertMaterial({
    map: o.map ?? null,
    alphaTest: o.map ? o.alphaTest ?? 0.5 : 0,
    side: DoubleSide,
    vertexColors: o.vertexColors ?? true,
    color: o.color ?? new Color(1, 1, 1),
    emissive: o.emissive ?? new Color(0, 0, 0)
  });
  const u = {
    uTime: shared.time, uWind: shared.wind, uSway: { value: o.sway ?? 0.3 }, uH: { value: o.height ?? 20 },
    uTrans: { value: o.trans ?? 0.25 }, uCamZ: o.grow ?? { value: 1e6 }, uMoon: shared.moonDir, uMoonCol: shared.moonColor
  };
  const growing = !!o.grow;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uSway, uH, uCamZ;\nvarying float vLeafH;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        ${growing ? `
        float ahead = ip.z - uCamZ; // negative: ahead of the visitor
        float g = smoothstep(-17.0, -5.0, ahead);
        transformed *= mix(0.02, 1.0, g);
        transformed.y -= (1.0 - g) * 0.2;` : ''}
        float hN = clamp(${o.hang ? '-' : ''}position.y / uH, 0.0, 1.5);
        vLeafH = hN;
        float ph = ip.x * 0.21 + ip.z * 0.17;
        float gust = sin(uTime * 0.45 + ip.x * 0.03 + ip.z * 0.02) * 0.5 + 0.5;
        float w = (sin(uTime * 1.1 + ph) * 0.7 + sin(uTime * 2.7 + ph * 1.7 + position.x) * 0.3) * (0.4 + gust);
        float k = hN * hN * uSway * uWind;
        transformed.x += w * k;
        transformed.z += w * k * 0.6;
        // leaves flutter on their own
        transformed += normal * sin(uTime * 4.0 + position.x * 3.0 + position.z * 2.0) * 0.03 * uWind * step(0.01, uSway);
      `);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeafH;\nuniform float uTrans;\nuniform vec3 uMoon, uMoonCol;')
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        // light scattering through the leaves when the visitor looks toward the moon
        vec3 Lv = normalize((viewMatrix * vec4(uMoon, 0.0)).xyz);
        float back = pow(max(dot(normalize(vViewPosition), -Lv), 0.0), 6.0);
        totalEmissiveRadiance += diffuseColor.rgb * uTrans * ((0.25 + 0.75 * vLeafH) * 0.3 + back * uMoonCol * 1.6);
      `);
  };
  m.customProgramCacheKey = () => 'leaf' + (growing ? 'G' : '') + (o.hang ? 'H' : '') + (o.map ? '' : 'N');
  return m;
}
