import { content, asset, Media } from '../data/content';

interface Hooks { opened?(): void; closed?(): void; tick?(): void }
interface Layer { el: HTMLElement; restore: HTMLElement | null; onClose?: () => void }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pad = (n: number) => String(n).padStart(2, '0');

const videoIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target as HTMLVideoElement;
    if (e.isIntersecting) {
      if (!v.src && v.dataset.src) v.src = v.dataset.src;
      v.play().catch(() => { /* ignored */ });
    } else if (!v.paused) v.pause();
  }
}, { threshold: 0.2 });

export function mediaEl(m: Media, opts: { thumb?: boolean; controls?: boolean } = {}): HTMLElement {
  if (m.type === 'video') {
    const v = h('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
    v.setAttribute('playsinline', '');
    if (m.poster) v.poster = asset(m.poster);
    v.dataset.src = asset(m.src);
    v.width = m.w; v.height = m.h;
    if (opts.controls) v.controls = true;
    videoIO.observe(v);
    return v;
  }
  const img = h('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = asset(opts.thumb ? m.thumb : m.src);
  img.width = m.w; img.height = m.h;
  img.alt = m.label ?? m.name ?? '';
  return img;
}

export class Overlays {
  private stack: Layer[] = [];
  private lb: { el: HTMLElement; list: Media[]; i: number; title: string } | null = null;

  constructor(private hooks: Hooks = {}) {
    document.addEventListener('keydown', (e) => this.key(e));
  }

  get isOpen() { return this.stack.length > 0; }

  private mount(el: HTMLElement, label: string, onClose?: () => void) {
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', label);
    el.tabIndex = -1;
    document.body.appendChild(el);
    this.stack.push({ el, restore: document.activeElement as HTMLElement | null, onClose });
    requestAnimationFrame(() => el.classList.add('is-open'));
    const f = (el.querySelector('[data-autofocus]') as HTMLElement | null) ?? el;
    f.focus({ preventScroll: true });
    if (this.stack.length === 1) { document.documentElement.style.overflow = 'hidden'; this.hooks.opened?.(); }
  }

  close() {
    const top = this.stack.pop();
    if (!top) return;
    if (this.lb && this.lb.el === top.el) this.lb = null;
    top.el.classList.remove('is-open');
    top.el.querySelectorAll('video').forEach((v) => { v.pause(); videoIO.unobserve(v); });
    setTimeout(() => top.el.remove(), 450);
    top.onClose?.();
    top.restore?.focus({ preventScroll: true });
    if (!this.stack.length) { document.documentElement.style.overflow = ''; this.hooks.closed?.(); }
  }

  closeAll() { while (this.stack.length) this.close(); }

  private key(e: KeyboardEvent) {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (this.lb && top.el === this.lb.el && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      this.step(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key === 'Tab') {
      const f = Array.from(top.el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), video[controls], [tabindex="0"]')).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  private shell(label: string, extra = ''): { el: HTMLElement; body: HTMLElement } {
    const el = h('div', 'ov');
    const bar = h('div', 'ov__bar', `<span class="mono">${esc(label)}</span><div class="row">${extra}<button class="btn" type="button" data-close data-autofocus>Close ✕</button></div>`);
    const body = h('div', 'ov__body');
    el.append(bar, body);
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) this.close();
      if (t.closest('button, a')) this.hooks.tick?.();
    });
    return { el, body };
  }

  // ── index ───────────────────────────────────────────────────────────────
  openIndex(stops: { id: string; label: string; jp: string }[], go: (id: string) => void) {
    const { el, body } = this.shell('Index · 目次', '<a class="btn" href="work.html">Flat view</a>');
    const list = h('ol', 'index');
    stops.forEach((s, i) => {
      const li = h('li');
      const b = h('button', '', `<em>${pad(i)}</em><b class="moss moss--quiet">${esc(s.label)}</b><small>${esc(s.jp)}</small>`);
      b.type = 'button';
      b.addEventListener('click', () => { this.close(); go(s.id); });
      li.appendChild(b);
      list.appendChild(li);
    });
    body.appendChild(list);
    const p = content.profile;
    body.appendChild(h('div', 'row', `<a class="btn" href="mailto:${p.email}">${p.email}</a>${p.links.map(([n, u]) => `<a class="btn" href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}`));
    this.mount(el, 'Index');
  }

  // ── world case study ────────────────────────────────────────────────────
  openWorld(i: number) {
    const n = content.worlds.length;
    const build = (idx: number) => {
      const w = content.worlds[idx];
      body.innerHTML = '';
      const head = h('header', 'case__head', `
        <div class="row mono" style="color:var(--ink-2)"><span>World ${pad(idx + 1)} / ${pad(n)}</span><span>·</span><span>${esc(w.year)}</span><span>·</span><span>Personal</span></div>
        <h2 class="moss">${esc(w.title)}</h2>
        <p class="case__jp">${esc(w.jp)}</p>
        <p class="case__sub">${esc(w.sub)}</p>`);
      const plate = mediaEl(w.plate) as HTMLImageElement;
      plate.className = 'case__plate';
      plate.alt = w.alt;
      plate.loading = 'eager';
      const plateBtn = h('button', 'tile');
      plateBtn.type = 'button';
      plateBtn.setAttribute('aria-label', `Open ${w.title} full screen`);
      plateBtn.appendChild(plate);
      const all = [w.plate, ...w.shots];
      plateBtn.addEventListener('click', () => this.lightbox(all, 0, w.title));
      const cols = h('div', 'case__cols', `<p class="case__note">${esc(w.note)}</p><div class="case__tags">${w.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>`);
      const grid = h('div', 'grid grid--wide');
      w.shots.forEach((s, k) => {
        const t = h('button', 'tile');
        t.type = 'button';
        t.style.aspectRatio = `${s.w} / ${s.h}`;
        t.appendChild(mediaEl(s, { thumb: true }));
        t.appendChild(h('span', 'cap', `<span>${esc(s.label ?? '')}</span><span>${s.type === 'video' ? 'Video' : 'Still'}</span>`));
        t.setAttribute('aria-label', `Open ${w.title}: ${s.label ?? ''}`);
        t.addEventListener('click', () => this.lightbox(all, k + 1, w.title));
        grid.appendChild(t);
      });
      const nav = h('nav', 'case__nav');
      const prev = h('button', 'btn', `← ${esc(content.worlds[(idx - 1 + n) % n].title)}`);
      const next = h('button', 'btn', `${esc(content.worlds[(idx + 1) % n].title)} →`);
      prev.type = next.type = 'button';
      prev.addEventListener('click', () => { build((idx - 1 + n) % n); el.scrollTo({ top: 0 }); });
      next.addEventListener('click', () => { build((idx + 1) % n); el.scrollTo({ top: 0 }); });
      nav.append(prev, next);
      body.append(head, plateBtn, cols, grid, nav);
      (el.querySelector('.ov__bar .mono') as HTMLElement).textContent = `${w.title} · ${w.jp}`;
    };
    const { el, body } = this.shell('World');
    build(i);
    this.mount(el, 'World case study');
  }

  // ── client gallery ──────────────────────────────────────────────────────
  openClient(i: number) {
    const c = content.clients[i];
    const { el, body } = this.shell(`Client ${pad(i + 1)} / ${pad(content.clients.length)} · ${c.group}`);
    body.appendChild(h('header', 'case__head', `<h2 class="moss">${esc(c.name)}</h2><p class="case__sub">${esc(c.role)}</p>`));
    if (!c.files.length) {
      body.appendChild(h('p', 'case__note', 'This work is under NDA. Ask, and I can walk you through it on a call.'));
    } else {
      const grid = h('div', 'grid');
      c.files.forEach((f, k) => {
        const t = h('button', 'tile');
        t.type = 'button';
        t.style.aspectRatio = `${f.w} / ${f.h}`;
        t.appendChild(mediaEl(f, { thumb: true }));
        if (f.type === 'video') t.appendChild(h('span', 'chip play', 'Video'));
        t.setAttribute('aria-label', `Open ${c.name}, item ${k + 1}`);
        t.addEventListener('click', () => this.lightbox(c.files, k, c.name));
        grid.appendChild(t);
      });
      body.appendChild(grid);
    }
    this.mount(el, `${c.name} gallery`);
  }

  // ── all studies ─────────────────────────────────────────────────────────
  openStudies() {
    const { el, body } = this.shell(`The library · ${content.studies.length} studies`);
    body.appendChild(h('header', 'case__head', '<h2 class="moss">The other half of the desk.</h2><p class="case__sub">Packaging, posters, automotive viz, hard-surface practice, and the occasional Sunday illustration.</p>'));
    const grid = h('div', 'grid');
    content.studies.forEach((s, k) => {
      const t = h('button', 'tile');
      t.type = 'button';
      t.style.aspectRatio = `${s.w} / ${s.h}`;
      t.appendChild(mediaEl(s, { thumb: true }));
      t.appendChild(h('span', 'cap', `<span>${esc(s.name ?? '')}</span><span>${esc(s.kind ?? '')}</span>`));
      t.addEventListener('click', () => this.lightbox(content.studies, k, 'Studies'));
      grid.appendChild(t);
    });
    body.appendChild(grid);
    this.mount(el, 'All studies');
  }

  // ── lightbox ────────────────────────────────────────────────────────────
  lightbox(list: Media[], i: number, title: string) {
    const el = h('div', 'lb');
    el.innerHTML = `
      <div class="ov__bar"><span class="mono" data-t></span><div class="row"><span class="mono" data-c></span><button class="btn" type="button" data-close data-autofocus>Close ✕</button></div></div>
      <div class="lb__stage" data-s>
        <button class="lb__nav lb__nav--prev" type="button" aria-label="Previous">←</button>
        <button class="lb__nav lb__nav--next" type="button" aria-label="Next">→</button>
      </div>
      <div class="lb__cap mono"><span data-l></span><span>← → to browse · Esc to close</span></div>`;
    this.lb = { el, list, i, title };
    el.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    el.querySelector('.lb__nav--prev')!.addEventListener('click', () => this.step(-1));
    el.querySelector('.lb__nav--next')!.addEventListener('click', () => this.step(1));
    const stage = el.querySelector('[data-s]') as HTMLElement;
    let sx = 0;
    stage.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    stage.addEventListener('pointerup', (e) => { const d = e.clientX - sx; if (Math.abs(d) > 50) this.step(d < 0 ? 1 : -1); });
    stage.addEventListener('click', (e) => { if (e.target === stage) this.close(); });
    const nav = list.length > 1;
    el.querySelectorAll<HTMLElement>('.lb__nav').forEach((b) => { b.hidden = !nav; });
    this.draw();
    this.mount(el, `${title} viewer`);
  }

  private step(d: number) {
    if (!this.lb) return;
    this.lb.i = (this.lb.i + d + this.lb.list.length) % this.lb.list.length;
    this.hooks.tick?.();
    this.draw();
  }

  private draw() {
    if (!this.lb) return;
    const { el, list, i, title } = this.lb;
    const m = list[i];
    const stage = el.querySelector('[data-s]') as HTMLElement;
    stage.querySelectorAll('img, video').forEach((n) => n.remove());
    let node: HTMLElement;
    if (m.type === 'video') {
      const v = h('video');
      v.src = asset(m.src); v.controls = true; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
      if (m.poster) v.poster = asset(m.poster);
      node = v;
    } else {
      const img = h('img');
      img.src = asset(m.src);
      img.alt = m.label ?? m.name ?? title;
      img.decoding = 'async';
      node = img;
    }
    stage.prepend(node);
    (el.querySelector('[data-t]') as HTMLElement).textContent = title;
    (el.querySelector('[data-c]') as HTMLElement).textContent = `${pad(i + 1)} / ${pad(list.length)}`;
    (el.querySelector('[data-l]') as HTMLElement).textContent = [m.name, m.kind ?? m.label].filter(Boolean).join(' — ');
    // warm the neighbours
    for (const k of [i + 1, i - 1]) {
      const n = list[(k + list.length) % list.length];
      if (n.type === 'image') { const p = new Image(); p.src = asset(n.src); }
    }
  }
}
