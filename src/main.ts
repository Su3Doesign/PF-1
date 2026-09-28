import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/base.css';
import './styles/experience.css';
import Lenis from 'lenis';
import { World } from './world/World';
import type { TargetKind } from './world/props';
import type { StationId } from './world/layout';
import { content, asset, archive } from './data/content';
import { Overlays } from './ui/overlays';
import { Panels, STOPS } from './ui/panels';
import { Sound } from './ui/sound';
import { Cursor } from './ui/cursor';
import { decode } from './ui/text';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const loader = document.getElementById('loader')!;
const bar = document.getElementById('loader-bar')!;
const pctEl = document.getElementById('loader-pct')!;
const labelEl = document.getElementById('loader-label')!;
const logEl = document.getElementById('loader-log')!;

const sound = new Sound();
const cursor = new Cursor();
let lenis: Lenis | null = null;
let world: World;

const overlays = new Overlays({
  opened: () => { if (world) world.overlay = true; lenis?.stop(); },
  closed: () => { if (world) world.overlay = false; lenis?.start(); },
  tick: () => sound.tick()
});

function go(id: StationId) {
  const y = panels.scrollTarget(id);
  if (lenis) {
    const d = Math.abs(lenis.scroll - y);
    lenis.scrollTo(y, { duration: Math.min(5, Math.max(1.2, d / 1800)), easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
  } else {
    window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }
}

function select(kind: TargetKind, i: number) {
  sound.tick();
  if (kind === 'world') overlays.openWorld(i);
  else if (kind === 'client') overlays.openClient(i);
  else if (kind === 'study') overlays.lightbox(content.studies, i, 'Studies');
  else if (kind === 'tier') { go('commissions'); panels.hot('tier', i); }
  else if (kind === 'contact') location.href = `mailto:${content.profile.email}`;
  else if (kind === 'art') overlays.lightbox(archive, i, 'The archive');
  else if (kind === 'home') go('worlds');
}

function label(kind: TargetKind, i: number): string {
  if (kind === 'world') return `Open ${content.worlds[i].title}`;
  if (kind === 'client') return content.clients[i].name;
  if (kind === 'study') { const s = content.studies[i]; return s ? `${s.name} · ${s.kind}` : 'Study'; }
  if (kind === 'tier') return content.tiers[i].name;
  if (kind === 'contact') return 'Write to me';
  if (kind === 'art') { const a = archive[i]; return a ? `${a.name}` : 'Open'; }
  return 'Enter the forest';
}

const panels = new Panels({
  hover: (kind, i) => { if (world?.ready) world.setHighlight(kind, i ?? -1); },
  select,
  go,
  tick: () => sound.tick()
});

// ── boot ────────────────────────────────────────────────────────────────────
const lines: string[] = [];
function log(msg: string) {
  lines.push(msg);
  logEl.innerHTML = lines.slice(-3).map((l, i, a) => (i === a.length - 1 ? `&gt; ${l} <b>…</b>` : `&gt; ${l} <b>ok</b>`)).join('<br>');
}

async function fontsReady() {
  const jobs = [
    document.fonts.load('800 40px "Archivo Variable"'),
    document.fonts.load('400 12px "Martian Mono Variable"'),
    document.fonts.load('800 70px "Shippori Mincho B1"', '世界七手顧客書庫絵馬手紙苔経蔵洞')
  ];
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 3000))]);
}

async function boot() {
  log('mounting the archive');
  world = new World(canvas, {
    hover: (t) => {
      cursor.set3d(t ? label(t.kind, t.index) : null);
      panels.hot(t ? t.kind : null, t?.index ?? -1);
    },
    select: (t) => select(t.kind, t.index),
    station: (id) => { if (id) { panels.setStation(id); sound.chime(); } },
    study: (i) => panels.setStudy(i)
  }, reduced);
  world.deskVideo = asset(content.profile.desk);
  if (/[?&]debug/.test(location.search)) (window as unknown as { __world: World }).__world = world;

  await fontsReady();
  let lastLabel = '';
  try {
    await world.init((p, text) => {
      bar.style.transform = `scaleX(${p.toFixed(3)})`;
      pctEl.textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (text !== lastLabel) { lastLabel = text; labelEl.textContent = text; log(text); }
    });
  } catch (err) {
    console.error(err);
    location.replace('work.html?from=forest');
    return;
  }
  log(`quality: ${world.q.tier}`);
  loader.classList.add('is-ready');
  labelEl.textContent = 'the forest is awake';
  const enterSound = document.getElementById('enter-sound') as HTMLButtonElement;
  const enterQuiet = document.getElementById('enter-quiet') as HTMLButtonElement;
  (Sound.wanted() ? enterSound : enterQuiet).focus({ preventScroll: true });
  enterSound.addEventListener('click', () => enter(true), { once: true });
  enterQuiet.addEventListener('click', () => enter(false), { once: true });
}

let entered = false;
function enter(withSound: boolean) {
  if (entered) return;
  entered = true;
  sound.setOn(withSound);
  syncSoundBtn();
  loader.classList.add('is-done');
  document.body.classList.remove('is-loading');
  if (!reduced && !/[?&]skipintro/.test(location.search)) {
    document.body.classList.add('is-entering');
    setTimeout(() => document.body.classList.remove('is-entering'), 5200);
  }
  window.scrollTo(0, 0);
  setupScroll();
  world.start();
  panels.setStation('landing');
}

// ── scroll ──────────────────────────────────────────────────────────────────
function onScroll() {
  const y = lenis ? lenis.scroll : window.scrollY;
  world.setScroll(y);
  const st = panels.update(y);
  world.setMethodProgress(st.method);
  const pond = Math.max(0, 1 - st.landing * 0.8);
  sound.setPond(pond);
  sound.setHum(0.3 * pond);
}

function remeasure() {
  panels.measure();
  world.setSections(panels.boxes());
  onScroll();
}

function setupScroll() {
  panels.measure();
  world.setSections(panels.boxes());
  if (!reduced) {
    lenis = new Lenis({ autoRaf: true, lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.2 });
    lenis.on('scroll', onScroll);
    document.querySelectorAll<HTMLAnchorElement>('a[href="#top"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go('landing'); }));
  } else {
    addEventListener('scroll', onScroll, { passive: true });
  }
  onScroll();
  let t = 0;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => { world.resize(); remeasure(); }, 140);
  });
}

// ── chrome ──────────────────────────────────────────────────────────────────
const sndBtn = document.getElementById('snd') as HTMLButtonElement;
function syncSoundBtn() { sndBtn.setAttribute('aria-pressed', String(sound.on)); }
sndBtn.addEventListener('click', () => { sound.setOn(!sound.on); syncSoundBtn(); sound.tick(); });

document.getElementById('menu-btn')!.addEventListener('click', () => {
  sound.tick();
  overlays.openIndex(STOPS, (id) => go(id as StationId));
});

document.getElementById('study-prev')!.addEventListener('click', () => world.spinStudies(-1));
document.getElementById('study-next')!.addEventListener('click', () => world.spinStudies(1));
document.getElementById('study-open')!.addEventListener('click', () => overlays.lightbox(content.studies, panels.studyNow, 'Studies'));
document.getElementById('study-all')!.addEventListener('click', () => overlays.openStudies());
document.getElementById('archive-open')!.addEventListener('click', () => overlays.lightbox(archive, 0, 'The archive'));

const copyBtn = document.getElementById('copy-mail') as HTMLButtonElement;
copyBtn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(content.profile.email); decode(copyBtn, 'Copied'); }
  catch { decode(copyBtn, 'Select the address'); }
  setTimeout(() => decode(copyBtn, 'Copy email'), 1800);
});

const hyd = document.getElementById('hyd-time')!;
const clock = () => {
  const d = new Date(Date.now() + 330 * 60000);
  hyd.textContent = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} in Hyderabad (IST)`;
};
clock();
setInterval(clock, 30000);

document.getElementById('egg')!.addEventListener('click', () => {
  const img = new Image();
  img.src = asset('assets/images/manwiththestrawhat-flying.webp');
  img.className = 'egg-hat';
  img.alt = '';
  document.body.appendChild(img);
  img.animate([
    { transform: 'translate(-50%, 0) rotate(-20deg)' },
    { transform: `translate(-50%, ${innerHeight + 320}px) rotate(28deg)` }
  ], { duration: 2600, easing: 'cubic-bezier(.45,0,.9,.6)' }).finished.then(() => img.remove());
});

addEventListener('pointerdown', (e) => { if (e.target === canvas) cursor.setDrag(true); });
addEventListener('pointerup', () => cursor.setDrag(false));

boot();
