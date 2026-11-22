// s3.atelier. The mark is three faces; each face is a window into one kind of work, and you step through it.
(function () {
  const NS = 'http://www.w3.org/2000/svg', $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const svg = $('#markSvg'), mark = $('#mark'), view = $('#view'), G = window.gsap, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const OUT = 'expo.out', INOUT = 'expo.inOut', lerp = (a, b, k) => a + (b - a) * k;

  // ---------- the work ----------
  const WORK = [
    { key: 'world', n: '01', title: 'World', line: 'Places that don’t exist yet.', note: 'Environments and products, modelled, lit and rendered from scratch.', cover: 'img/world.jpg', coverName: 'Koi Pond',
      items: [['w_hyperion', 'Hyperion', 'A hypercar designed and modelled from scratch', 'wide'], ['w_castle', 'Castle on the Rock', 'Environment', 'half'], ['w_roman', 'Dawn Pagoda', 'Environment', 'half'], ['w_ringgate', 'Ring Gate', 'World concept', 'wide'], ['w_fudo', 'Fudo', 'Environment', 'third'], ['w_rotunda', 'Rotunda', 'World concept', 'two'], ['w_caves', 'Caves', 'Environment', 'two'], ['w_mustang', 'Mustang', 'Automotive render', 'third'], ['w_altair', 'Altair', 'Masterplan flyover', 'wide']] },
    { key: 'web', n: '02', title: 'Web', line: 'Sites you can walk through.', note: 'Designed and coded by me. WebGL, scroll and type doing the talking.', cover: 'img/web.jpg', coverName: 'The Overgrown Archive',
      items: [['web_thesumanth', 'thesumanth.com', 'My own site: the work drawn in light particles', 'half'], ['web_overgrown', 'The Overgrown Archive', 'A 3D portfolio you walk through at night', 'half'], ['web_vanta', 'Vanta Flightworks', 'Brand site for a flight-helmet maker', 'half'], ['web_parian', 'Parian Atelier', 'A marble head that turns as you scroll', 'half'], ['web_hyperion', 'Hyperion', 'Interactive launch page for the hypercar', 'third'], ['web_threehouses', 'Three Houses', 'Aevum, Volta, Vespera: three brands, three moods', 'two'], ['web_coachwork', 'Coachwork', 'A car magazine you read by scrolling', 'two'], ['web_halden', 'Halden', 'Portrait studio', 'third']] },
    { key: 'brand', n: '03', title: 'Brand', line: 'Marks that carry weight.', note: 'Identity systems, packaging and campaigns. Concept work is marked as concept.', cover: 'img/brand.jpg', coverName: 'Mitti',
      items: [['b_maruneta', 'Maruneta', 'Colour that comes back', 'half'], ['b_kerb_full', 'Kerb', 'Coffee roasted at race pace', 'half'], ['mg_can', 'Magma', 'Energy drink', 'third'], ['b_bsnl', 'BSNL', 'Concept: a network for 1.4 billion', 'two'], ['b_rem', 'REM', 'After-hours food and dreamwear', 'two'], ['b_jigri', 'Jigri', 'A friend in every cutting', 'third'], ['b_deccan', 'Deccan Night Run', 'Event identity', 'half'], ['b_kosh', 'Kosh', 'Investing that feels like a game', 'half'], ['b_lagrange', 'Lagrange', 'Where systems hold still', 'wide']] },
  ];

  // ---------- the mark's geometry: three faces on a triangular lattice (same construction as the logo) ----------
  const n = 7.6, u = 118, S3 = Math.sqrt(3) / 2, cx0 = (n / 2) * u, cy0 = -(n / 3) * S3 * u, P = (i, j) => [(i + j / 2) * u - cx0, -(j * S3) * u - cy0];
  const SHAPES = [[[n - 1, 0], [1, 0], [1, n - 3], [2, n - 4], [2, 1], [n - 1, 1]], [[1, n - 1], [n - 1, 1], [2, 1], [2, 2], [n - 3, 2], [0, n - 1]], [[0, 1], [0, n - 1], [n - 3, 2], [n - 4, 2], [1, n - 3], [1, 0]]].map(sh => sh.map(([a, b]) => P(a, b)));
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  // the SVG is the touch and keyboard surface; the picture itself is drawn on the canvas beneath it
  const hits = SHAPES.map((pts, i) => el('polygon', { class: 'face', points: pts.map(p => p.join(',')).join(' '), 'data-face': i, tabindex: 0, role: 'button', 'aria-label': `Open ${WORK[i].title}` }, svg));
  const faceCentre = SHAPES.map(pts => [pts.reduce((s, p) => s + p[0], 0) / 6, pts.reduce((s, p) => s + p[1], 0) / 6]);

  // ---------- the live picture ----------
  const gl = window.makeMarkGL && window.makeMarkGL($('#gl')), S = gl && gl.s;
  const T = { off: [0, 0, 0], rk: [0, 0, 0], inside: 0 }; let open = -1, busy = false, hover = null, scrollK = 0;
  if (!gl) document.documentElement.classList.add('no-gl');
  function layout() { if (!gl) return; const m = svg.getScreenCTM(); if (!m) return; const vw = innerWidth, vh = innerHeight;
    SHAPES.forEach((pts, i) => { const c = faceCentre[i], l = Math.hypot(c[0], c[1]) || 1, ox = c[0] / l * T.off[i], oy = c[1] / l * T.off[i]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach((p, j) => { const x = m.a * p[0] + m.e + ox, y = m.d * p[1] + m.f + oy; S.pts[i * 12 + j * 2] = x; S.pts[i * 12 + j * 2 + 1] = y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
      const pad = (x1 - x0) * 0.08, k = T.rk[i]; S.rect[i * 4] = lerp(x0 - pad, 0, k); S.rect[i * 4 + 1] = lerp(y0 - pad, 0, k); S.rect[i * 4 + 2] = lerp(x1 - x0 + pad * 2, vw, k); S.rect[i * 4 + 3] = lerp(y1 - y0 + pad * 2, vh, k); }); }
  let mx = 0, my = 0, lx = null, ly = null;
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; if (gl) { S.pos[0] = e.clientX / innerWidth; S.pos[1] = e.clientY / innerHeight; if (lx !== null) { S.vel[0] = Math.max(-0.5, Math.min(0.5, S.vel[0] + (e.clientX - lx) / innerWidth * 9)); S.vel[1] = Math.max(-0.5, Math.min(0.5, S.vel[1] + (e.clientY - ly) / innerHeight * 9)); } lx = e.clientX; ly = e.clientY; } }, { passive: true });
  const t0 = performance.now();
  const covered = () => { const c = document.body.classList; return c.contains('is-reading') || (c.contains('is-about') && !G) || c.contains('is-menu-full'); };
  (function frame(now) { if (gl && !covered() && !(open >= 0 && !busy && view.scrollTop > innerHeight * 1.05)) { layout(); S.mouse[0] += (mx - S.mouse[0]) * 0.06; S.mouse[1] += (my - S.mouse[1]) * 0.06; if (open >= 0 && !busy) { S.zoom[open] = 1 + scrollK * 0.1; S.dim = scrollK * 0.55; } gl.render((now - t0) / 1000); } requestAnimationFrame(frame); })(t0);

  // ---------- hover: the chosen face keeps its colour and swells slightly; the others wash out ----------
  const labels = $$('#labels li'), links = $$('.bar__nav a[data-face]'), cursor = $('#cursor');
  function focus(i) { if (open >= 0 || busy) return; hover = i; mark.classList.toggle('is-dim', i !== null); labels.forEach((l, k) => l.classList.toggle('is-on', k === i)); links.forEach((l, k) => l.classList.toggle('is-on', k === i)); cursor.classList.toggle('is-big', i !== null);
    if (gl && G) [0, 1, 2].forEach(k => { G.to(S.sat, { [k]: i === null || k === i ? 1 : 0, duration: 0.6, ease: 'power2.out', overwrite: 'auto' }); G.to(S.grow, { [k]: k === i ? 6 : 0, duration: 0.7, ease: OUT, overwrite: 'auto' }); G.to(S.zoom, { [k]: k === i ? 1.2 : 1.12, duration: 1.2, ease: OUT, overwrite: 'auto' }); }); }
  [...hits, ...labels, ...links].forEach((node) => { const i = +node.dataset.face; node.addEventListener('pointerenter', () => focus(i)); node.addEventListener('pointerleave', () => focus(null));
    node.addEventListener('click', (e) => { e.preventDefault(); enter(i, e); }); node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(i); } }); });
  if (fine) { let cx = innerWidth / 2, cy = innerHeight / 2; (function loop() { cx += ((mx + 0.5) * innerWidth - cx) * 0.2; cy += ((my + 0.5) * innerHeight - cy) * 0.2; cursor.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); })(); }

  // ---------- inside a face ----------
  const vHero = $('#viewHero'), vBody = $('#viewBody'), vNum = $('#viewNum'), vTitle = $('#viewTitle'), vLine = $('#viewLine'), vNote = $('#viewNote'), vCap = $('#viewCap'), vNext = $('#viewNext'), back = $('#back');
  function fill(i) { const w = WORK[i]; vNum.textContent = w.n + ' / 03'; vTitle.textContent = w.title; vLine.textContent = w.line; vNote.textContent = w.note; vCap.textContent = w.coverName; vHero.style.setProperty('--cover', `url(../${w.cover})`);
    window.Sections.mount(w.key, vBody, w.items);
    const nx = WORK[(i + 1) % 3]; vNext.dataset.face = (i + 1) % 3; const run = `${nx.title} <i>—</i> `.repeat(6);
    vNext.innerHTML = `<span class="next__k">Next · ${nx.n} / 03 · ${nx.line}</span><span class="next__m" aria-hidden="true"><span class="next__t">${run}</span><span class="next__t">${run}</span></span><span class="sr">${nx.title}</span>`; observe(); }
  const HEAD = '.view__hero .rise > *', SOFT = '.view__hero .fade, #back';
  const headIn = (tl, at) => tl.fromTo(HEAD, { yPercent: 110 }, { yPercent: 0, duration: 1.15, ease: OUT, stagger: 0.09 }, at).fromTo(SOFT, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: OUT, stagger: 0.06 }, at + 0.25);

  function enter(i, e) { if (busy || open === i) return; if (open >= 0) return swap(i); busy = true; open = i; hover = null; mark.classList.remove('is-dim'); cursor.classList.remove('is-big'); fill(i);
    view.hidden = false; view.scrollTop = 0; scrollK = 0; vHero.style.setProperty('--veil', gl && G && !reduce ? 0 : 1); if (G) G.set(HEAD, { yPercent: 110 }), G.set(SOFT, { opacity: 0 }); document.body.classList.add('is-inside');
    if (!gl || !G || reduce) { if (gl) { S.active = i; S.grow[i] = 4000; T.rk[i] = 1; S.zoom[i] = 1; S.ink = 0; S.reveal = 0; S.topo = 0; [0, 1, 2].forEach(k => { if (k !== i) S.alpha[k] = 0; }); } G && G.set('.stage > *', { opacity: 0 }); busy = false; return; }
    const diag = Math.hypot(innerWidth, innerHeight), others = [0, 1, 2].filter(k => k !== i); S.active = i; S.click = e && e.clientX ? [e.clientX, e.clientY] : [innerWidth / 2, innerHeight / 2];
    const tl = G.timeline({ onComplete: () => { busy = false; } });
    tl.to(S, { reveal: 0, topo: 0, duration: 0.6, ease: 'power2.out' }, 0).fromTo(S, { ripple: 0.001 }, { ripple: 1, duration: 1.3, ease: 'power2.out' }, 0)
      .to(S.sat, { 0: 1, 1: 1, 2: 1, duration: 0.3 }, 0).to(S, { ink: 0, duration: 0.45, ease: 'power2.out' }, 0)
      .to('.stage > *', { opacity: 0, duration: 0.45, ease: 'power2.inOut', stagger: 0.03 }, 0);
    others.forEach((k, j) => tl.to(T.off, { [k]: 520, duration: 1.1, ease: 'power3.in' }, 0.05 + j * 0.06).to(S.alpha, { [k]: 0, duration: 0.7, ease: 'power2.in' }, 0.3 + j * 0.06).to(S.grow, { [k]: -50, duration: 0.9, ease: 'power2.in' }, 0.1));
    // the chosen face swells: its edge goes liquid, the picture relaxes to full size, and it takes the whole screen
    tl.to(S.grow, { [i]: diag, duration: 1.5, ease: INOUT }, 0.12).to(T.rk, { [i]: 1, duration: 1.5, ease: INOUT }, 0.12).to(S.zoom, { [i]: 1, duration: 1.7, ease: INOUT }, 0.12).to(S.depth, { [i]: 0.004, duration: 1.2 }, 0.12)
      .to(S.edge, { [i]: 150, duration: 0.75, ease: 'power2.in' }, 0.12).to(S.edge, { [i]: 0, duration: 0.7, ease: 'power2.out' }, 0.9);
    tl.fromTo(vHero, { '--veil': 0 }, { '--veil': 1, duration: 0.9, ease: 'power2.out' }, 0.95); headIn(tl, 1.05); }

  function leave() { if (busy || open < 0) return; const i = open; busy = true; stopSmooth(); view.scrollTo({ top: 0, behavior: 'instant' }); scrollK = 0;
    const done = () => { view.hidden = true; document.body.classList.remove('is-inside'); open = -1; busy = false; if (gl) S.active = -1; window.Sections.unmount(); };
    if (!gl || !G || reduce) { if (gl) { S.grow = [0, 0, 0]; S.alpha = [1, 1, 1]; T.rk = [0, 0, 0]; T.off = [0, 0, 0]; S.zoom = [1.12, 1.12, 1.12]; S.ink = 1; S.dim = 0; S.topo = 1; S.reveal = reduce ? 0 : 1; } G && G.set('.stage > *', { opacity: 1 }); done(); return; }
    const others = [0, 1, 2].filter(k => k !== i), tl = G.timeline({ onComplete: done });
    tl.to(HEAD, { yPercent: -110, duration: 0.5, ease: 'power3.in', stagger: 0.04 }, 0).to(SOFT, { opacity: 0, duration: 0.3 }, 0).to(S, { dim: 0, duration: 0.4 }, 0).to(vHero, { '--veil': 0, duration: 0.4 }, 0)
      .to(S.grow, { [i]: 0, duration: 1.35, ease: INOUT }, 0.2).to(T.rk, { [i]: 0, duration: 1.35, ease: INOUT }, 0.2).to(S.zoom, { [i]: 1.12, duration: 1.4, ease: INOUT }, 0.2).to(S.depth, { [i]: [0.012, 0.018, 0.024][i], duration: 1 }, 0.4)
      .to(S.edge, { [i]: 120, duration: 0.6, ease: 'power2.in' }, 0.2).to(S.edge, { [i]: 0, duration: 0.7, ease: 'power2.out' }, 0.85);
    others.forEach((k, j) => tl.to(T.off, { [k]: 0, duration: 1.2, ease: OUT }, 0.75 + j * 0.07).to(S.alpha, { [k]: 1, duration: 0.6 }, 0.75 + j * 0.07).to(S.grow, { [k]: 0, duration: 1.0, ease: OUT }, 0.8));
    tl.to(S, { ink: 1, duration: 0.6 }, 1.2).to(S, { reveal: 1, topo: 1, duration: 1.2, ease: 'power2.out' }, 1.3).to('.stage > *', { opacity: 1, duration: 0.8, ease: OUT, stagger: 0.04 }, 1.1); }

  // one section melts into the next: the new picture rises through the old one
  function swap(j) { const i = open; if (busy || i === j) return; busy = true; stopSmooth();
    const settle = () => { if (gl) { S.alpha[i] = 0; S.grow[i] = -50; T.rk[i] = 0; T.off[i] = 520; S.zoom[i] = 1.12; S.depth[i] = [0.012, 0.018, 0.024][i]; S.active = j; S.alpha[j] = 1; S.grow[j] = Math.hypot(innerWidth, innerHeight); T.rk[j] = 1; T.off[j] = 0; S.zoom[j] = 1; S.depth[j] = 0.004; S.swap = 0; S.dim = 0; } open = j; };
    if (!gl || !G || reduce) { settle(); fill(j); view.scrollTop = 0; scrollK = 0; busy = false; return; }
    S.swapTo = j; const tl = G.timeline({ onComplete: () => { busy = false; } });
    tl.to(HEAD, { yPercent: -110, duration: 0.5, ease: 'power3.in', stagger: 0.04 }, 0).to(SOFT, { opacity: 0, duration: 0.3 }, 0)
      .to('.view__rest', { opacity: 0, duration: 0.35 }, 0)
      .add(() => { view.scrollTo({ top: 0, behavior: 'instant' }); scrollK = 0; fill(j); }, 0.5).to(S, { dim: 0, duration: 0.3 }, 0.5)
      .fromTo(S, { swap: 0.001 }, { swap: 1, duration: 1.5, ease: 'power2.inOut' }, 0.5).add(settle, 2.0).set('.view__rest', { opacity: 1 }, 2.0);
    headIn(tl, 1.45); }

  back.addEventListener('click', leave); vNext.addEventListener('click', () => enter(+vNext.dataset.face)); addEventListener('keydown', (e) => { if (e.key === 'Escape') leave(); });
  $('.bar__name').addEventListener('click', (e) => { e.preventDefault(); leave(); });
  view.addEventListener('scroll', () => { scrollK = Math.min(1, view.scrollTop / innerHeight); document.body.classList.toggle('is-deep', view.scrollTop > innerHeight * 0.9); }, { passive: true });

  // wheel scrolling inside a section eases to where it is going instead of stepping
  let smoothOn = false, sTarget = 0, sCur = 0; const stopSmooth = () => { smoothOn = false; };
  if (fine && !reduce) { view.addEventListener('wheel', (e) => { if (e.ctrlKey) return; e.preventDefault(); if (busy) return; if (!smoothOn) sCur = sTarget = view.scrollTop; sTarget = Math.max(0, Math.min(view.scrollHeight - view.clientHeight, sTarget + e.deltaY * (e.deltaMode === 1 ? 32 : 1))); smoothOn = true; }, { passive: false });
    (function ease() { if (smoothOn) { sCur += (sTarget - sCur) * 0.11; if (Math.abs(sTarget - sCur) < 0.4) { sCur = sTarget; smoothOn = false; } view.scrollTop = sCur; } requestAnimationFrame(ease); })(); }

  // pieces open as you reach them: the frame unclips while the picture settles; inside, the picture drifts a little as it passes
  let io; function observe() { if (io) io.disconnect(); const pieces = $$('.piece', vBody); if (!G || reduce || !('IntersectionObserver' in window)) return;
    pieces.forEach(p => { G.set(p.querySelector('.piece__im'), { clipPath: 'inset(100% 0 0 0)' }); G.set(p.querySelector('img'), { scale: 1.3 }); G.set(p.querySelector('figcaption'), { opacity: 0, y: 12 }); });
    io = new IntersectionObserver((es) => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); const p = e.target;
      G.to(p.querySelector('.piece__im'), { clipPath: 'inset(0% 0 0 0)', duration: 1.3, ease: OUT }); G.to(p.querySelector('img'), { scale: 1.08, duration: 1.7, ease: OUT }); G.to(p.querySelector('figcaption'), { opacity: 1, y: 0, duration: 0.9, ease: OUT, delay: 0.35 }); }), { root: view, rootMargin: '0px 0px -10% 0px' });
    pieces.forEach(p => io.observe(p)); }
  if (!reduce) (function drift() { if (open >= 0 && !busy) $$('.piece img', vBody).forEach(im => { const r = im.parentNode.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; const k = (r.top + r.height / 2) / innerHeight - 0.5; im.style.translate = `0 ${(-k * 5).toFixed(2)}%`; }); requestAnimationFrame(drift); })();

  // ---------- arrival: count the pictures in, then the faces fill from their spines ----------
  const load = $('#load'), loadN = $('#loadN'); let got = 0;
  const ready = () => { load.classList.add('is-done'); document.body.classList.remove('is-loading'); if (!G || reduce) { if (gl) { S.grow = [0, 0, 0]; S.topo = 1; S.reveal = reduce ? 0 : 1; } return; }
    const tl = G.timeline(); if (gl) { S.reveal = 1; tl.fromTo(S, { topo: 0 }, { topo: 1, duration: 2.4, ease: 'power2.out' }, 0.2); S.edge = [46, 46, 46]; [2, 0, 1].forEach((k, j) => tl.to(S.grow, { [k]: 0, duration: 1.7, ease: OUT }, 0.15 + j * 0.16).to(S.edge, { [k]: 0, duration: 1.5, ease: 'power2.out' }, 0.35 + j * 0.16)); tl.fromTo(S, { ink: 0 }, { ink: 1, duration: 0.9 }, 1.0); }
    tl.to('.trace', { opacity: 0, duration: 0.8, ease: 'power2.out' }, 1.1);
    tl.from('.say .rise > *', { yPercent: 110, duration: 1.2, ease: OUT, stagger: 0.1 }, 0.5).from('.bar > *, .now, .hint, #labels li', { opacity: 0, y: 12, duration: 1, ease: OUT, stagger: 0.05 }, 0.9); };
  // the mark is traced first, one face after another, as a single accent line; the pictures then fill it
  const traces = SHAPES.map(pts => el('polygon', { class: 'trace', points: pts.map(p => p.join(',')).join(' '), pathLength: 1 }, svg));
  let loaded = false, traced = reduce || !G; const go = () => { if (loaded && traced) setTimeout(ready, 120); };
  if (!traced) G.timeline({ onComplete: () => { traced = true; go(); } }).fromTo(traces, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.85, ease: 'power2.inOut', stagger: 0.32 }, 0.15);
  else traces.forEach(t => t.setAttribute('hidden', ''));
  WORK.forEach((w, i) => { const im = new Image(); im.onload = im.onerror = () => { if (gl && im.naturalWidth) gl.setImage(i, im); got++; loadN.textContent = String(Math.round(got / 3 * 100)).padStart(3, '0'); if (got === 3) { loaded = true; go(); } }; im.src = w.cover; });
  if (!gl) SHAPES.forEach((pts, i) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys); const cp = el('clipPath', { id: 'clip' + i }, svg); el('polygon', { points: pts.map(p => p.join(',')).join(' ') }, cp); svg.insertBefore(el('image', { href: WORK[i].cover, x: x0 - 60, y: y0 - 60, width: Math.max(...xs) - x0 + 120, height: Math.max(...ys) - y0 + 120, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#clip${i})` }), svg.firstChild); });

  const clocks = $$('#clock, #clock2'); const tick = () => { try { const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); clocks.forEach(c => { c.textContent = t; }); } catch (e) {} }; tick(); setInterval(tick, 20000);

  // ---------- a contour map drawn once onto a canvas: the ground under the menu and the About page ----------
  function topo(cv, ink, alpha) { const W = cv.clientWidth, H = cv.clientHeight; if (!W || (cv.width === W && cv.height === H)) return; cv.width = W; cv.height = H;
    const hs = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = hs(xi, yi), b = hs(xi + 1, yi), c = hs(xi, yi + 1), d = hs(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
    const F = new Float32Array(W * H), k = 1.35 / H; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = x * k + 3.1, Y = y * k + 1.7; F[y * W + x] = (0.6 * vn(X, Y) + 0.3 * vn(X * 2.1 + 3.7, Y * 2.1 + 3.7) + 0.1 * vn(X * 4.3 + 9.1, Y * 4.3 + 9.1)) * 20; }
    const cx = cv.getContext('2d'), im = cx.createImageData(W, H), D = im.data;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, f = F[i], g = Math.hypot(F[i + 1] - F[i - 1], F[i + W] - F[i - W]) / 2 || 1e-4, n = Math.floor(f + 0.5), dd = Math.abs(f - n) / g, maj = n % 5 === 0;
      const a = Math.max(0, 1 - Math.max(0, dd - (maj ? 0.7 : 0.35))) * (maj ? alpha * 2.1 : alpha); if (a <= 0) continue; const o = i * 4; D[o] = ink[0]; D[o + 1] = ink[1]; D[o + 2] = ink[2]; D[o + 3] = a * 255; }
    cx.putImageData(im, 0, 0); }

  // ---------- the menu: a square button opens the whole screen; the cover of the link you are on follows the cursor ----------
  const menu = $('#menu'), menuBtn = $('#menuBtn'), peek = $('.menu__peek'), peekImg = $('img', peek), about = $('#about'); let menuOpen = false, aboutOpen = false;
  const COVERS = [...WORK.map(w => w.cover), 'img/s3_posters.jpg'];
  const centre = () => { const r = menuBtn.getBoundingClientRect(); return `${r.left + r.width / 2}px ${r.top + r.height / 2}px`; };
  function openMenu() { if (menuOpen) return; menuOpen = true; menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); document.body.classList.add('is-menu'); topo($('.topo', menu), [246, 244, 239], 0.06);
    if (!G || reduce) { document.body.classList.add('is-menu-full'); return; } G.fromTo(menu, { clipPath: `circle(0px at ${centre()})` }, { clipPath: `circle(${Math.hypot(innerWidth, innerHeight)}px at ${centre()})`, duration: 1.05, ease: INOUT, onComplete: () => { if (menuOpen) document.body.classList.add('is-menu-full'); } });
    G.fromTo('.menu__links a', { yPercent: 70, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: OUT, stagger: 0.07, delay: 0.3 }); G.fromTo('.menu__foot > *', { opacity: 0 }, { opacity: 1, duration: 0.8, stagger: 0.05, delay: 0.7 }); }
  function closeMenu(then) { if (!menuOpen) { if (then) then(); return; } menuOpen = false; document.body.classList.remove('is-menu-full'); menuBtn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('is-menu'); peek.classList.remove('is-on');
    const done = () => { menu.hidden = true; if (then) then(); }; if (!G || reduce) return done(); G.to(menu, { clipPath: `circle(0px at ${centre()})`, duration: 0.75, ease: INOUT, onComplete: done }); }
  menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  $$('.menu__links a').forEach((a, k) => {
    a.addEventListener('pointerenter', () => { peekImg.src = COVERS[k]; peek.classList.add('is-on'); $$('.menu__links a').forEach(b => b.classList.toggle('is-dim', b !== a)); });
    a.addEventListener('pointerleave', () => { peek.classList.remove('is-on'); $$('.menu__links a').forEach(b => b.classList.remove('is-dim')); });
    if (a.dataset.face !== undefined) a.addEventListener('click', (e) => { e.preventDefault(); const i = +a.dataset.face; closeMenu(() => enter(i)); }); });
  // the index: every piece of work as one thin strip of thumbnails, drifting like a contact sheet; each one takes you to it
  const reel = $('.menu__reel'), track = $('.menu__track'), reelCap = $('.menu__cap b');
  const INDEX = [...WORK[0].items.map(([src, name]) => ({ src: `img/${src}.jpg`, name, kind: 'World', go: () => enter(0) })), ...WORK[1].items.map(([src, name]) => ({ src: `img/${src}.jpg`, name, kind: 'Web', go: () => enter(1) })),
    ...(window.BOARDS || []).map(bd => ({ src: `boards/${bd.key}/thumb.jpg`, name: bd.name, kind: 'Brand', go: () => window.Reader.open(bd.key, null) }))];
  const cell = (it, k) => `<button class="menu__item" type="button" data-k="${k}" aria-label="${it.kind}: ${it.name}"><img data-src="${it.src}" alt=""></button>`;
  track.innerHTML = INDEX.map(cell).join('') + INDEX.map(cell).join('');
  let reelLoaded = false; const loadReel = () => { if (reelLoaded) return; reelLoaded = true; $$('img[data-src]', track).forEach(im => { im.src = im.dataset.src; }); };
  $$('.menu__item', track).forEach(btn => { const it = INDEX[+btn.dataset.k];
    btn.addEventListener('pointerenter', () => { reelCap.textContent = `${it.kind} · ${it.name}`; reel.classList.add('is-looking'); peekImg.src = it.src; peek.classList.add('is-on'); });
    btn.addEventListener('pointerleave', () => { reel.classList.remove('is-looking'); peek.classList.remove('is-on'); });
    btn.addEventListener('click', () => closeMenu(it.go)); });
  menuBtn.addEventListener('click', loadReel);
  let px = innerWidth / 2, py = innerHeight / 2, pr = 0;
  (function peekLoop() { if (menuOpen) { const tx = (mx + 0.5) * innerWidth, ty = (my + 0.5) * innerHeight, vx = tx - px; px += vx * 0.12; py += (ty - py) * 0.12; pr += (Math.max(-12, Math.min(12, vx * 0.06)) - pr) * 0.1;
    peek.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) rotate(${pr.toFixed(2)}deg)`; } requestAnimationFrame(peekLoop); })();

  // ---------- About: off the screen ----------
  const aScroll = $('.about__scroll', about);
  function openAbout() { if (aboutOpen) return; aboutOpen = true; about.hidden = false; document.body.classList.add('is-about'); aScroll.scrollTop = 0; requestAnimationFrame(() => light()); topo($('.topo', about), [13, 13, 13], 0.07);
    if (!G || reduce) { document.body.classList.add('is-menu-full'); return; } G.fromTo(about, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: INOUT, onComplete: () => { if (aboutOpen) document.body.classList.add('is-menu-full'); } });
    G.fromTo('.about__say .rise > *', { yPercent: 110 }, { yPercent: 0, duration: 1.25, ease: OUT, stagger: 0.09, delay: 0.5 }); G.fromTo('.about__who, .about__head .mono, .about__close', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1, ease: OUT, delay: 0.85, stagger: 0.06 }); }
  function closeAbout() { if (!aboutOpen) return; aboutOpen = false; document.body.classList.remove('is-menu-full'); const done = () => { about.hidden = true; document.body.classList.remove('is-about'); };
    if (!G || reduce) return done(); G.to(about, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.9, ease: INOUT, onComplete: done }); }
  $$('[data-about]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); closeMenu(openAbout); }));
  $('.about__close', about).addEventListener('click', closeAbout);
  // as you read the About page, its lists light up word by word
  const words = []; $$('.brands span, .tools, .about__who', about).forEach(el => { if (el.classList.contains('tools') || el.classList.contains('about__who')) { el.innerHTML = el.innerHTML.split(/(\s+)/).map(w => /\S/.test(w) && !/[<>]/.test(w) ? `<span class="lit">${w}</span>` : w).join(''); $$('.lit', el).forEach(w => words.push(w)); } else { el.classList.add('lit'); words.push(el); } });
  const light = () => { const vh = innerHeight; for (const w of words) { const r = w.getBoundingClientRect(); const k = Math.max(0, Math.min(1, (vh * 0.92 - r.top) / (vh * 0.42))); w.style.opacity = (0.14 + 0.86 * k).toFixed(3); } };
  aScroll.addEventListener('scroll', light, { passive: true }); addEventListener('resize', light);
  if ('IntersectionObserver' in window) { const aio = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-in'); }), { root: aScroll, rootMargin: '0px 0px -12% 0px' }); $$('.about__row, .about__end', about).forEach(r => aio.observe(r)); }
  else $$('.about__row, .about__end', about).forEach(r => r.classList.add('is-in'));
  if (fine && !reduce) { let at = 0, ap = 0, as = false;
    aScroll.addEventListener('wheel', (e) => { if (e.ctrlKey) return; e.preventDefault(); if (!as) ap = at = aScroll.scrollTop; at = Math.max(0, Math.min(aScroll.scrollHeight - aScroll.clientHeight, at + e.deltaY * (e.deltaMode === 1 ? 32 : 1))); as = true; }, { passive: false });
    (function ease() { if (as) { ap += (at - ap) * 0.11; if (Math.abs(at - ap) < 0.4) { ap = at; as = false; } aScroll.scrollTop = ap; } requestAnimationFrame(ease); })(); }
  addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (aboutOpen) { e.stopImmediatePropagation(); closeAbout(); } else if (menuOpen) { e.stopImmediatePropagation(); closeMenu(); } }, true);
})();
