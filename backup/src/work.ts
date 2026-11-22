import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/base.css';
import './styles/experience.css';
import './styles/work.css';
import { content, asset } from './data/content';
import { Overlays, mediaEl } from './ui/overlays';

const overlays = new Overlays();
const $ = (id: string) => document.getElementById(id)!;
const c = content;

if (new URLSearchParams(location.search).has('from')) $('notice').hidden = false;

$('about').innerHTML = c.profile.about.map((p) => `<p>${p}</p>`).join('');
$('specs').innerHTML = [['Based', c.profile.city], ...Object.entries(c.profile.tools), ['Status', 'Open — commission, full-time, collaboration']]
  .map(([k, v]) => `<div><dt>${k}</dt><dd${k === 'Status' ? ' class="live"' : ''}>${v}</dd></div>`).join('');

c.worlds.forEach((w, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fworld';
  b.innerHTML = `<img src="${asset(w.plate.src)}" alt="${w.alt}" loading="${i ? 'lazy' : 'eager'}" width="${w.plate.w}" height="${w.plate.h}">
    <div><span class="mono" style="color:var(--ink-3)">${w.year} · Personal · ${w.shots.length + 1} pieces</span><b class="display">${w.title}</b><small>${w.jp}</small><p>${w.sub}</p><span class="btn" style="justify-self:start">Open case study →</span></div>`;
  b.addEventListener('click', () => overlays.openWorld(i));
  $('f-worlds').appendChild(b);
});

$('f-steps').innerHTML = c.steps.map(([n, t]) => `<li><b>${n}</b><span>${t}</span></li>`).join('');

c.clients.forEach((cl, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fclient';
  const t = document.createElement('div');
  t.className = 'tile';
  if (cl.cover) {
    const img = document.createElement('img');
    img.src = asset(cl.cover.replace('assets/images/', 'assets/thumbs/640/').replace('assets/posters/', 'assets/thumbs/640/'));
    img.alt = '';
    img.loading = 'lazy';
    t.appendChild(img);
  } else {
    t.innerHTML = '<span class="mono" style="display:grid;place-items:center;height:100%;color:var(--teal)">NDA</span>';
  }
  b.appendChild(t);
  const d = document.createElement('div');
  d.innerHTML = `<b>${cl.name}</b><small>${cl.group} · ${cl.role}</small>`;
  b.appendChild(d);
  b.addEventListener('click', () => overlays.openClient(i));
  $('f-clients').appendChild(b);
});

c.studies.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tile';
  b.style.aspectRatio = `${s.w} / ${s.h}`;
  b.appendChild(mediaEl(s, { thumb: true }));
  const cap = document.createElement('span');
  cap.className = 'cap';
  cap.innerHTML = `<span>${s.name}</span><span>${s.kind}</span>`;
  b.appendChild(cap);
  b.addEventListener('click', () => overlays.lightbox(c.studies, i, 'Studies'));
  $('f-studies').appendChild(b);
});

$('f-tiers').innerHTML = c.tiers.map((t) => `<article class="ftier${t.flag ? ' ftier--flag' : ''}"><em>${t.n}</em><b>${t.name}</b><p>${t.for}</p><ul>${t.items.map((x) => `<li>${x}</li>`).join('')}</ul>${t.flag ? `<small>${t.flag}</small>` : ''}</article>`).join('');

const desk = $('desk') as HTMLVideoElement;
new IntersectionObserver(([e]) => { if (e.isIntersecting) desk.play().catch(() => {}); else desk.pause(); }, { threshold: 0.3 }).observe(desk);
