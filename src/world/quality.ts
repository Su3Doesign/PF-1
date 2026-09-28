// Picks a quality tier from the device, then keeps the frame rate honest by
// scaling the render resolution at runtime.
export type Tier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: Tier;
  dprMax: number;
  dprMin: number;
  grass: number;
  tufts: number;
  bushes: number;
  ferns: number;
  trees: number;
  farTrees: number;
  saplings: number;
  fireflies: number;
  reflection: number; // fraction of drawing-buffer size
  shadows: boolean;
  msaa: number;
  godRays: boolean;
}

const PRESETS: Record<Tier, Quality> = {
  high: { tier: 'high', dprMax: 1.75, dprMin: 0.9, grass: 42000, tufts: 9000, bushes: 950, ferns: 1100, trees: 240, farTrees: 520, saplings: 320, fireflies: 520, reflection: 0.5, shadows: true, msaa: 4, godRays: true },
  medium: { tier: 'medium', dprMax: 1.25, dprMin: 0.75, grass: 22000, tufts: 6000, bushes: 650, ferns: 700, trees: 190, farTrees: 380, saplings: 220, fireflies: 340, reflection: 0.38, shadows: false, msaa: 0, godRays: true },
  low: { tier: 'low', dprMax: 1.0, dprMin: 0.6, grass: 8000, tufts: 3400, bushes: 380, ferns: 340, trees: 140, farTrees: 260, saplings: 140, fireflies: 180, reflection: 0.28, shadows: false, msaa: 0, godRays: false }
};

export function detectTier(gl: WebGL2RenderingContext | WebGLRenderingContext): Tier {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch { /* ignore */ }
  const r = renderer.toLowerCase();
  const software = /swiftshader|llvmpipe|software|basic render/.test(r);
  const strongGPU = /nvidia|geforce|rtx|radeon rx|radeon pro|apple m[1-9]|apple gpu|arc a/.test(r);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 8;
  if (software) return 'low';
  if (mobile) return (/apple gpu|adreno \(tm\) (7[3-9]|8)\d\d|mali-g7[1-9]|mali-g[7-9]\d\d|immortalis/.test(r) && mem >= 6) ? 'medium' : 'low';
  if (strongGPU && cores >= 8) return 'high';
  if (/intel/.test(r) && !/iris xe|arc/.test(r)) return 'medium';
  return cores >= 6 ? 'high' : 'medium';
}

export function qualityFor(tier: Tier): Quality {
  return { ...PRESETS[tier] };
}

/** Adaptive resolution: nudges the pixel ratio to hold ~55 fps. */
export class FrameGovernor {
  private acc = 0;
  private frames = 0;
  private settle = 0;
  dpr: number;

  constructor(private q: Quality, private onChange: (dpr: number) => void) {
    this.dpr = Math.min(window.devicePixelRatio || 1, q.dprMax);
  }

  tick(dt: number) {
    if (this.settle > 0) { this.settle -= dt; return; }
    this.acc += dt;
    this.frames += 1;
    if (this.acc < 1.2) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    const max = Math.min(window.devicePixelRatio || 1, this.q.dprMax);
    let next = this.dpr;
    if (fps < 42) next = Math.max(this.q.dprMin, this.dpr * 0.85);
    else if (fps > 58 && this.dpr < max) next = Math.min(max, this.dpr * 1.08);
    if (Math.abs(next - this.dpr) > 0.02) {
      this.dpr = next;
      this.settle = 1.5;
      this.onChange(next);
    }
  }
}
