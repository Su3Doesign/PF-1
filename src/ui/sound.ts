// Night forest, synthesised: crickets, wind in the canopy, water, and the
// low hum of neon that should have died years ago. Off until asked.
const KEY = 'koke-sound';

export class Sound {
  on = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private water!: GainNode;
  private hum!: GainNode;
  private timers: number[] = [];

  static wanted(): boolean {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  }

  private build() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    const noise = (sec: number, brown = false) => {
      const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i += 1) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w;
      }
      const s = c.createBufferSource();
      s.buffer = b;
      s.loop = true;
      return s;
    };

    // wind: brown noise through a slowly breathing low-pass
    const wind = noise(6, true);
    const wlp = c.createBiquadFilter();
    wlp.type = 'lowpass'; wlp.frequency.value = 380;
    const wg = c.createGain(); wg.gain.value = 0.22;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(wlp.frequency);
    wind.connect(wlp).connect(wg).connect(this.master);
    wind.start(); lfo.start();

    // water: band-passed noise, louder by the pond
    const wn = noise(4);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    this.water = c.createGain(); this.water.gain.value = 0.035;
    wn.connect(bp).connect(this.water).connect(this.master);
    wn.start();

    // neon hum: 60 Hz mains with a buzzy harmonic
    this.hum = c.createGain(); this.hum.gain.value = 0.0;
    for (const [f, g, type] of [[60, 0.5, 'sawtooth'], [120, 0.25, 'square'], [180, 0.08, 'sine']] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const og = c.createGain(); og.gain.value = g * 0.05;
      o.connect(lp).connect(og).connect(this.hum);
      o.start();
    }
    this.hum.connect(this.master);

    // crickets: three voices, each a pulse train at ~4.5 kHz
    for (let v = 0; v < 3; v += 1) {
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) { pan.pan.value = -0.7 + v * 0.7; pan.connect(this.master); }
      const chirp = () => {
        if (!this.ctx) return;
        const t = c.currentTime + 0.02;
        const pulses = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < pulses; k += 1) {
          const o = c.createOscillator();
          o.frequency.value = 4300 + v * 260 + Math.random() * 60;
          const g = c.createGain();
          const s = t + k * 0.055;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.exponentialRampToValueAtTime(0.018, s + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
          o.connect(g).connect(pan ?? this.master);
          o.start(s); o.stop(s + 0.05);
        }
        this.timers.push(window.setTimeout(chirp, 700 + Math.random() * 1400 + v * 170));
      };
      this.timers.push(window.setTimeout(chirp, 400 * v));
    }

    // water drops
    const drop = () => {
      if (!this.ctx) return;
      const t = c.currentTime + 0.01;
      const o = c.createOscillator();
      const f = 900 + Math.random() * 1600;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(this.water);
      o.start(t); o.stop(t + 0.15);
      this.timers.push(window.setTimeout(drop, 500 + Math.random() * 2600));
    };
    drop();
  }

  setOn(on: boolean) {
    this.on = on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
    if (on && !this.ctx) this.build();
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.5);
  }

  /** 0 = deep forest, 1 = at the pond. */
  setPond(k: number) {
    if (this.ctx) this.water.gain.setTargetAtTime(0.02 + k * 0.09, this.ctx.currentTime, 0.8);
  }

  setHum(k: number) {
    if (this.ctx) this.hum.gain.setTargetAtTime(k, this.ctx.currentTime, 0.4);
  }

  tick() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.005;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.08);
  }

  /** A soft wind-chime when the camera settles at a stop. */
  chime() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    const base = 1320 + Math.random() * 80;
    [0, 0.38].forEach((delay, k) => {
      const t = c.currentTime + 0.02 + delay;
      [[1, 0.05, 2.2], [2.76, 0.02, 1.4], [5.4, 0.01, 0.8]].forEach(([r, g, d]) => {
        const o = c.createOscillator();
        o.frequency.value = base * r;
        const gg = c.createGain();
        gg.gain.setValueAtTime(0.0001, t);
        gg.gain.exponentialRampToValueAtTime(g * (k ? 0.55 : 1), t + 0.005);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(gg).connect(this.master);
        o.start(t); o.stop(t + d + 0.05);
      });
    });
  }
}
