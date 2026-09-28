import { content, asset, archive } from '../data/content';
import type { StationId } from '../world/layout';
import type { TargetKind } from '../world/props';
import { decode } from './text';

export const STOPS: { id: StationId; label: string; jp: string }[] = [
  { id: 'landing', label: 'The pond', jp: '池' },
  { id: 'worlds', label: 'Worlds', jp: '世界' },
  { id: 'method', label: 'Method', jp: '七手' },
  { id: 'clients', label: 'Clients', jp: '顧客' },
  { id: 'studies', label: 'Library', jp: '書庫' },
  { id: 'commissions', label: 'Commissions', jp: '絵馬' },
  { id: 'about', label: 'About', jp: '洞' },
  { id: 'archive', label: 'Archive', jp: '経蔵' },
  { id: 'contact', label: 'Contact', jp: '手紙' }
];

interface Hooks {
  hover(kind: TargetKind, index: number | null): void;
  select(kind: TargetKind, index: number): void;
  go(id: StationId): void;
  tick(): void;
}

interface Sec { el: HTMLElement; id: StationId; top: number; height: number; panel: HTMLElement | null }

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const pad = (n: number) => String(n).padStart(2, '0');

export class Panels {
  secs: Sec[] = [];
  private railBtns: HTMLButtonElement[] = [];
  private steps: HTMLElement[] = [];
  private stationNow: StationId = 'landing';
  studyNow = 0;

  constructor(private hooks: Hooks) {
    this.secs = Array.from(document.querySelectorAll<HTMLElement>('.st')).map((el) => ({
      el, id: el.dataset.station as StationId, top: 0, height: 0, panel: el.querySelector('.panel, .hero')
    }));
    this.fill();
  }

  private fill() {
    const c = content;
    // worlds
    const cards = document.getElementById('world-cards')!;
    c.worlds.forEach((w, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.innerHTML = `<img src="${asset(w.plate.thumb)}" alt="" width="84" height="56" loading="lazy"><span><b>${w.title}</b><small>${w.jp} · ${w.sub}</small></span><em>${w.year}</em>`;
      this.bind(b, 'world', i);
      cards.appendChild(b);
    });
    // method
    const ol = document.getElementById('steps')!;
    c.steps.forEach(([name, text]) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${name}</b><span>${text}</span>`;
      ol.appendChild(li);
      this.steps.push(li);
    });
    // clients
    const cl = document.getElementById('client-list')!;
    c.clients.forEach((cc, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (!cc.files.length) b.className = 'nda';
      b.innerHTML = `<b>${cc.name}</b><small>${cc.files.length ? String(cc.files.length).padStart(2, '0') : 'NDA'}</small>`;
      b.title = `${cc.name} · ${cc.group} · ${cc.files.length ? cc.files.length + ' pieces' : 'under NDA'}`;
      this.bind(b, 'client', i);
      cl.appendChild(b);
    });
    // tiers
    const tiers = document.getElementById('tiers')!;
    c.tiers.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'tier';
      d.dataset.tier = String(i);
      d.innerHTML = `<header><em>${t.n}</em><b>${t.name}</b>${t.flag ? `<small>${t.flag}</small>` : ''}</header><p>${t.for}</p><ul>${t.items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
      tiers.appendChild(d);
    });
    // about
    document.getElementById('about-text')!.innerHTML = c.profile.about.map((t) => `<p>${t}</p>`).join('');
    document.getElementById('about-tools')!.innerHTML = Object.entries(c.profile.tools).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    // archive
    const al = document.getElementById('archive-list')!;
    archive.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `${m.name ?? 'Piece'} — open`);
      b.title = m.name ?? '';
      b.innerHTML = `<img src="${asset(m.thumb)}" alt="" loading="lazy" width="64" height="64">`;
      this.bind(b, 'art', i);
      al.appendChild(b);
    });
    // rail
    const rail = document.getElementById('rail')!;
    STOPS.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${s.label}</span><i></i>`;
      b.setAttribute('aria-label', `Go to ${s.label}`);
      b.addEventListener('click', () => { this.hooks.tick(); this.hooks.go(s.id); });
      rail.appendChild(b);
      this.railBtns.push(b);
    });
    const pct = document.createElement('div');
    pct.className = 'rail__pct';
    pct.id = 'rail-pct';
    pct.textContent = '000';
    rail.appendChild(pct);
    document.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => this.hooks.go(b.dataset.go as StationId)));
    // study controls are wired in main
    this.setStudy(0);
  }

  private bind(el: HTMLElement, kind: TargetKind, i: number) {
    el.addEventListener('mouseenter', () => this.hooks.hover(kind, i));
    el.addEventListener('focus', () => this.hooks.hover(kind, i));
    el.addEventListener('mouseleave', () => this.hooks.hover(kind, null));
    el.addEventListener('blur', () => this.hooks.hover(kind, null));
    el.addEventListener('click', () => { this.hooks.tick(); this.hooks.select(kind, i); });
  }

  measure() {
    const unit = CSS.supports('height', '1svh') ? 'svh' : 'vh';
    for (const s of this.secs) s.el.style.height = `${Number(s.el.dataset.h || 200)}${unit}`;
    for (const s of this.secs) { s.top = s.el.offsetTop; s.height = s.el.offsetHeight; }
  }

  boxes() { return this.secs.map((s) => ({ id: s.id, top: s.top, height: s.height })); }

  scrollTarget(id: StationId): number {
    const s = this.secs.find((x) => x.id === id);
    if (!s) return 0;
    if (id === 'landing') return 0;
    return s.top + Math.max(0, s.height - innerHeight) * 0.12;
  }

  /** Per-scroll update. Returns the method stop's lantern count (0–7). */
  update(scroll: number): { method: number; landing: number } {
    const vh = innerHeight;
    let method = 0, landing = 0;
    const last = this.secs.length - 1;
    this.secs.forEach((s, i) => {
      const span = Math.max(1, s.height - vh);
      const p = (scroll - s.top) / span;
      let k: number;
      if (i === 0) { k = 1 - smooth(0.12, 0.36, p); landing = p; }
      else if (i === last) k = smooth(-0.14, 0.02, p);
      else k = Math.min(smooth(-0.14, 0.02, p), 1 - smooth(0.5, 0.66, p));
      s.el.style.setProperty('--in', k.toFixed(3));
      s.el.classList.toggle('is-live', k > 0.02);
      if (s.id === 'method') method = Math.min(1, Math.max(0, (p + 0.02) / 0.5)) * 7;
    });
    const lit = Math.floor(method + 0.35);
    this.steps.forEach((li, i) => li.classList.toggle('is-lit', i < lit));
    const max = document.documentElement.scrollHeight - vh;
    const pct = document.getElementById('rail-pct');
    if (pct) pct.textContent = String(Math.round((scroll / Math.max(1, max)) * 100)).padStart(3, '0');
    return { method, landing };
  }

  setStation(id: StationId) {
    if (id === this.stationNow) return;
    this.stationNow = id;
    const i = STOPS.findIndex((s) => s.id === id);
    const s = STOPS[i];
    document.getElementById('hud-k')!.textContent = s.jp;
    decode(document.getElementById('hud-name'), s.label.toUpperCase());
    document.getElementById('hud-idx')!.textContent = `${pad(i + 1)} / ${pad(STOPS.length)}`;
    this.railBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  }

  setStudy(i: number) {
    if (i < 0) return;
    this.studyNow = i;
    const st = content.studies[i];
    const img = document.getElementById('study-img') as HTMLImageElement;
    img.src = asset(st.thumb);
    img.alt = `${st.name} — ${st.kind}`;
    decode(document.getElementById('study-name'), (st.name ?? '').toUpperCase(), 18, 120);
    document.getElementById('study-kind')!.textContent = st.kind ?? '';
    document.getElementById('study-count')!.textContent = `${pad(i + 1)} / ${pad(content.studies.length)}`;
  }

  /** Mirror a 3D hover onto the matching list item. */
  hot(kind: TargetKind | null, index: number) {
    document.querySelectorAll('.card.is-hot, .clients .is-hot, .tier.is-hot, .archive-grid .is-hot').forEach((n) => n.classList.remove('is-hot'));
    if (kind === 'art') document.querySelectorAll('#archive-list button')[index]?.classList.add('is-hot');
    if (kind === 'world') document.querySelectorAll('#world-cards .card')[index]?.classList.add('is-hot');
    if (kind === 'client') document.querySelectorAll('#client-list button')[index]?.classList.add('is-hot');
    if (kind === 'tier') document.querySelector(`.tier[data-tier="${index}"]`)?.classList.add('is-hot');
  }
}
