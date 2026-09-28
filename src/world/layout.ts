// World layout: every placement decision in one file.
// Units are metres. +Y is up, the walk heads toward -Z.
import { CatmullRomCurve3, Vector2, Vector3 } from 'three';

export const POND = { cx: 0, cz: -6, rx: 21, rz: 14 };
export const LETTERS_Z = -9;
export const LETTER_SCALE = 1.25;
export const TORII = { x: 0, z: -18, scale: 1.3 };

export type StationId = 'landing' | 'worlds' | 'method' | 'clients' | 'studies' | 'commissions' | 'about' | 'archive' | 'contact';

/** Clearings: no trees or tall foliage inside `r`. */
export const CLEARINGS: { x: number; z: number; r: number }[] = [
  { x: -3, z: -52, r: 11 },
  { x: -3, z: -112, r: 8 },
  { x: 4, z: -140, r: 11 },
  { x: -1, z: -157, r: 6 },
  { x: -3, z: -167, r: 6 }
];

export const WORLD_MONOLITHS = [
  { x: -10, z: -55, faceX: -3, faceZ: -43 },
  { x: -3, z: -58.5, faceX: -3, faceZ: -43 },
  { x: 4, z: -55, faceX: -3, faceZ: -43 }
];

export const LANTERNS = Array.from({ length: 7 }, (_, i) => {
  const z = -71 - i * 3.2;
  const side = i % 2 === 0 ? -1 : 1;
  return { x: 2 + side * 2.7 - (z + 80) * 0.02, z };
});

export const RACK = { x: -3, z: -114 };
export const LIBRARY_TREE = { x: 4, z: -141, ringR: 6.6 };
export const EMA = { x: -1, z: -158 };
/** The finale. The forest ends at a cliff; a flooded cave runs through it to an
 *  overgrown hall, whose far door opens onto a terrace over the sea. */
export const CLIFF_Z = -171;
export const CAVE_MOUTH = { x: -3, z: -170, w: 7.5, h: 6.5 };
export const CAVE_PATH: [number, number][] = [[-3, -161], [-3, -170], [-2.2, -179], [-4.3, -189], [-3.9, -199], [-3.1, -207], [-3, -215]];
export const HALL = { x: -3, z0: -214, z1: -252, halfW: 9, wall: 9.5, vault: 13.5, pool: 4.6, floor: 0.35 };
export const SHORE = { z0: -252, z1: -265, y: 0.45 };
export const DESK = { x: 1.0, z: -261.0 };
// the gate stands on the moon's bearing from the contact stop, so the moon sets inside it
export const SEA_TORII = { x: 4.6, z: -332, scale: 2.6 };
export const MOON_SET = new Vector3(0.1, 0.1, -1).normalize();

/** Standing height for props: forest ground, the hall floor, or the terrace. */
export function floorAt(x: number, z: number): number {
  if (z < SHORE.z0) return SHORE.y;
  if (z < HALL.z0) return HALL.floor;
  return heightAt(x, z);
}

/** Forest walking path (x, z). The camera rail follows it at head height. */
export const PATH_POINTS: [number, number][] = [
  [0, -16], [0.5, -24], [1.5, -32], [-1.5, -40], [-2.5, -46], [-1, -60], [2, -68],
  [2.2, -80], [1.2, -92], [-1.5, -100], [-2.8, -106], [0, -120], [3, -126],
  [2.5, -136], [0, -146], [-1, -151], [-2.5, -160], [-3, -164]
];

export const pathCurve = new CatmullRomCurve3(PATH_POINTS.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
export const caveCurve = new CatmullRomCurve3(CAVE_PATH.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');

/** Where the camera is: 0 forest, then cave, hall and shore, blended over a few metres. */
export function zoneWeights(z: number) {
  const s = (a: number, b: number) => smooth(a, b, z);
  const cave = s(-164, -173) * (1 - s(-209, -217));
  const hall = s(-209, -217) * (1 - s(-247, -255));
  const shore = s(-247, -255);
  const forest = Math.max(0, 1 - cave - hall - shore);
  return { forest, cave, hall, shore };
}
const PATH_SAMPLES: Vector2[] = pathCurve.getSpacedPoints(600).map((p) => new Vector2(p.x, p.z));

/** Distance in the XZ plane from (x, z) to the forest path. The path only ever
 *  heads toward -Z, so a binary search on z narrows the samples to check. */
export function pathDistance(x: number, z: number): number {
  const S = PATH_SAMPLES;
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid].y > z) lo = mid; else hi = mid;
  }
  let best = Infinity;
  const a = Math.max(0, lo - 90), b = Math.min(S.length - 1, lo + 90);
  for (let i = a; i <= b; i += 1) {
    const p = S[i];
    const dx = p.x - x, dz = p.y - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  if (z > S[0].y) {
    const dx = S[0].x - x, dz = S[0].y - z;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

export function pondFactor(x: number, z: number): number {
  const dx = (x - POND.cx) / POND.rx, dz = (z - POND.cz) / POND.rz;
  return Math.sqrt(dx * dx + dz * dz); // < 1 inside the pond
}

export function inClearing(x: number, z: number, pad = 0): boolean {
  for (const c of CLEARINGS) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return true;
  }
  return false;
}

// Small deterministic value noise so terrain and placement agree everywhere.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i += 1) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ground height. Water surface is y = 0. */
export function heightAt(x: number, z: number, pathD?: number): number {
  const pf = pondFactor(x, z);
  let h = 0.35 + (fbm(x * 0.06, z * 0.06) - 0.5) * 1.6 + (fbm(x * 0.25 + 9, z * 0.25) - 0.5) * 0.35;
  // valley walls rise away from the path to hide the edge of the world
  const d = pathD ?? pathDistance(x, z);
  if (z < -14) h += smooth(10, 40, d) * 3.5;
  else h += smooth(24, 45, Math.abs(x)) * 3;
  // pond basin
  const basin = smooth(1.15, 0.85, pf);
  h = h * (1 - basin) + (-1.3 - (1 - Math.min(pf, 1)) * 0.6) * basin;
  // the bank where the visitor stands is a little higher and flatter
  if (z > 6 && Math.abs(x) < 8) h = h * 0.4 + 0.25;
  // a spring pool where the cave's channel spills into the forest
  const sx = x - CAVE_MOUTH.x, sz = (z - (CAVE_MOUTH.z + 4)) / 1.6;
  const spring = smooth(4.2, 2.4, Math.sqrt(sx * sx + sz * sz)) * smooth(-158, -163, z);
  // flatten the path
  if (z < -14) {
    const p = smooth(2.6, 0.6, d);
    h = h * (1 - p * 0.85) + (0.18 + (fbm(x * 0.1, z * 0.1) - 0.5) * 0.3) * p * 0.85;
  }
  if (spring > 0) h = h * (1 - spring) + -0.9 * spring;
  return h;
}

export interface Shot { pos: Vector3; look: Vector3 }

/** Camera rail. Stations are the rail points the camera holds at. */
export const RAIL: { pos: [number, number, number]; look: [number, number, number]; station?: StationId }[] = [
  { pos: [0, 1.15, 12], look: [0, 2.2, -14], station: 'landing' },
  { pos: [0.4, 2.6, -1], look: [0, 3.2, -22] },
  { pos: [0.3, 4.3, -9.5], look: [0, 3.6, -30] },
  { pos: [0.2, 2.6, -18], look: [0.5, 2.1, -34] },
  { pos: [1.2, 1.9, -29], look: [-2, 1.8, -44] },
  { pos: [-2.6, 1.95, -43], look: [-3, 1.75, -56], station: 'worlds' },
  { pos: [-0.8, 1.9, -58], look: [2.2, 1.7, -74] },
  { pos: [2.2, 1.75, -68], look: [2.0, 1.4, -84], station: 'method' },
  { pos: [1.6, 1.75, -90], look: [-1.5, 1.6, -104] },
  { pos: [-2.9, 1.8, -106.5], look: [-3, 1.45, -114], station: 'clients' },
  { pos: [0.3, 1.9, -119], look: [3.5, 2.0, -134] },
  { pos: [3.9, 2.25, -128.8], look: [4, 2.1, -141], station: 'studies' },
  { pos: [0.6, 1.9, -144], look: [-1, 1.8, -158] },
  { pos: [-1.1, 1.85, -151.8], look: [-1, 2.0, -158], station: 'commissions' },
  { pos: [-2.2, 1.9, -160.5], look: [-3, 2.4, -176] },
  { pos: [-3, 1.65, -168.5], look: [-2.4, 1.5, -184] },
  { pos: [-2.4, 1.5, -178.5], look: [-4.3, 3.1, -194], station: 'about' },
  { pos: [-4.1, 1.55, -192], look: [-3.3, 1.8, -208] },
  { pos: [-3, 1.7, -207], look: [-3, 8.2, -226] },
  { pos: [-3, 1.75, -219.5], look: [-3, 4.4, -242], station: 'archive' },
  { pos: [-3, 1.9, -236], look: [-3, 2.2, -262] },
  { pos: [-3, 1.95, -249], look: [-3, 1.9, -285] },
  { pos: [-3.2, 1.95, -254.5], look: [-1.4, 2.5, -330], station: 'contact' }
];

export const STATION_ORDER: StationId[] = ['landing', 'worlds', 'method', 'clients', 'studies', 'commissions', 'about', 'archive', 'contact'];
