import { CatmullRomCurve3, Vector3 } from 'three';
import { RAIL, StationId } from './layout';

export interface SectionBox { id: StationId; top: number; height: number }

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class Rail {
  pos!: CatmullRomCurve3;
  look!: CatmullRomCurve3;
  stationT = {} as Record<StationId, number>;
  private keys: { s: number; t: number }[] = [{ s: 0, t: 0 }];
  tall = false;

  constructor(tall: boolean) { this.build(tall); }

  build(tall: boolean) {
    this.tall = tall;
    const pts = RAIL.map((r) => new Vector3(...r.pos));
    const looks = RAIL.map((r) => new Vector3(...r.look));
    if (tall) {
      pts[0].set(0, 1.9, 17.5);
      looks[0].set(0, 2.6, -12);
      pts[1].set(0.3, 3.2, 2);
    }
    this.pos = new CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    this.look = new CatmullRomCurve3(looks, false, 'catmullrom', 0.3);
    const n = pts.length - 1;
    RAIL.forEach((r, i) => { if (r.station) this.stationT[r.station] = i / n; });
  }

  /** Build scroll → rail keys: hold while a section's panel is up, travel between. */
  setSections(sections: SectionBox[], vh: number) {
    const keys: { s: number; t: number }[] = [];
    sections.forEach((sec, i) => {
      const t = this.stationT[sec.id];
      const span = Math.max(1, sec.height - vh);
      const holdStart = i === 0 ? 0 : sec.top - vh * 0.05;
      const holdEnd = i === 0 ? span * 0.28 : sec.top + span * (i === sections.length - 1 ? 1 : 0.5);
      keys.push({ s: holdStart, t }, { s: holdEnd, t });
    });
    this.keys = keys;
  }

  /** Rail parameter for a scroll position. */
  tAt(scroll: number): number {
    const k = this.keys;
    if (scroll <= k[0].s) return k[0].t;
    for (let i = 0; i < k.length - 1; i += 1) {
      const a = k[i], b = k[i + 1];
      if (scroll <= b.s) {
        if (a.t === b.t) return a.t;
        const x = (scroll - a.s) / Math.max(1, b.s - a.s);
        return a.t + (b.t - a.t) * ease(Math.min(1, Math.max(0, x)));
      }
    }
    return k[k.length - 1].t;
  }

  /** Scroll position where the camera arrives at a station. */
  scrollFor(id: StationId): number {
    const t = this.stationT[id];
    const k = this.keys.find((x) => x.t === t);
    return k ? k.s + 2 : 0;
  }

  sample(t: number, pos: Vector3, look: Vector3) {
    const u = Math.min(1, Math.max(0, t));
    this.pos.getPoint(u, pos);
    this.look.getPoint(u, look);
  }
}
