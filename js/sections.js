// Each kind of work is shown its own way.
// World: you walk forward and the places pass you in depth.  Web: a pinned viewer that reads each site top to bottom.
// Brand: a can you turn, a shelf of every brand board in motion, and doors that open onto a bottle.
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const G = window.gsap, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const progress = (el) => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
  const pad = (n) => String(n).padStart(2, '0');
  let stop = null;

  // ---------- World: a walk in depth ----------
  function world(root, items) {
    const N = items.length, GAP = 950;
    root.innerHTML = `<div class="walk" style="height:${N * 90 + 100}vh"><div class="walk__stage"><div class="walk__space">${items.map(([src, name], i) => `<figure class="walk__item${i % 4 === 0 ? ' is-wide' : ''}"><img src="img/${src}.jpg" alt="${name}"></figure>`).join('')}</div>
      <div class="walk__info"><p class="walk__count"><b>01</b> / ${pad(N)}</p><h3 class="walk__name"><span class="rise"><span></span></span></h3><p class="walk__kind"></p></div><p class="walk__hint">Keep walking</p></div></div>`;
    const walk = $('.walk', root), figs = $$('.walk__item', root), nameEl = $('.walk__name .rise > span', root), kindEl = $('.walk__kind', root), countEl = $('.walk__count b', root), hint = $('.walk__hint', root);
    const side = figs.map((f, i) => f.classList.contains('is-wide') ? 0 : (i % 2 ? 1 : -1)), lift = figs.map((f, i) => [0, -1, 0.6, -0.4, 0.8][i % 5]);
    let cam = 0, active = -1, raf;
    const setActive = (i) => { if (i === active) return; active = i; countEl.textContent = pad(i + 1); const swap = () => { nameEl.textContent = items[i][1]; kindEl.textContent = items[i][2]; };
      if (!G || reduce) return swap(); G.timeline().to(nameEl, { yPercent: -110, duration: 0.28, ease: 'power2.in' }).add(swap).set(nameEl, { yPercent: 110 }).to(nameEl, { yPercent: 0, duration: 0.7, ease: 'expo.out' }); G.fromTo(kindEl, { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.3 }); };
    // the walk dwells on each place and moves quickly between them; the whole space leans a little toward the pointer
    const space = $('.walk__space', root); let px = 0, py = 0, tx = 0, ty = 0; const onMove = (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }; addEventListener('pointermove', onMove, { passive: true });
    const dwell = (f) => { const i = Math.floor(f), t = f - i, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; return i + lerp(t, e, 0.8); };
    // the walk starts in daylight on paper and ends at night: the deeper you go into the worlds, the darker the room
    const stage = $('.walk__stage', root), mixc = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    (function tick() { const p = progress(walk), target = dwell(p * (N - 1)) * GAP; const d1 = sm(0.06, 0.42, p), d2 = sm(0.42, 0.85, p); stage.style.backgroundColor = `rgb(${mixc(mixc([230, 227, 221], [150, 122, 103], d1), [16, 16, 15], d2)})`; stage.style.color = `rgb(${mixc([13, 13, 13], [244, 240, 232], sm(0.22, 0.38, p))})`; cam = reduce ? target : lerp(cam, target, 0.09); px = lerp(px, tx, 0.06); py = lerp(py, ty, 0.06); if (fine && !reduce) space.style.transform = `rotateX(${(-py * 3).toFixed(3)}deg) rotateY(${(px * 5).toFixed(3)}deg)`; const vw = innerWidth, vh = innerHeight, narrow = vw < 760; let best = 0, bd = 1e9;
      figs.forEach((f, i) => { const z = cam - i * GAP; if (Math.abs(z) < bd) { bd = Math.abs(z); best = i; }
        const far = sm(-3.1 * GAP, -1.7 * GAP, z), near = 1 - sm(300, 620, z), o = far * near; f.style.opacity = o.toFixed(3); f.style.visibility = o < 0.004 ? 'hidden' : 'visible'; if (o < 0.004) return;
        const drift = 1 + Math.max(0, z) / 500; // as it passes, it slides off to its side
        f.style.transform = `translate(-50%, -50%) translate3d(${(side[i] * (narrow ? 5 : 19) * drift * vw / 100).toFixed(1)}px, ${(lift[i] * 7 * vh / 100 - 4 * vh / 100).toFixed(1)}px, ${z.toFixed(1)}px)`; f.style.zIndex = String(1000 + Math.round(z / 10)); });
      setActive(best); hint.style.opacity = String(1 - sm(0.02, 0.1, p)); raf = requestAnimationFrame(tick); })();
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); };
  }

  // ---------- Web: a pinned viewer ----------
  function web(root, items) {
    const N = items.length;
    root.innerHTML = `<div class="sites" style="height:${N * 115}vh"><div class="sites__stage">
      <ol class="sites__list">${items.map(([src, name, kind], i) => `<li><span>S/${pad(i + 1)}</span><b>${name}</b><i>${kind}</i></li>`).join('')}</ol>
      <div class="sites__window"><div class="sites__bar"><i></i><i></i><i></i><span class="sites__url"></span><em><b>01</b> / ${pad(N)}</em></div><div class="sites__port">${items.map(([src, name]) => `<img src="img/${src}.jpg" alt="${name} website">`).join('')}<div class="sites__meter"><i></i></div></div></div></div></div>`;
    const wrap = $('.sites', root), list = $('.sites__list', root), rows = $$('.sites__list li', root), imgs = $$('.sites__port img', root), port = $('.sites__port', root), url = $('.sites__url', root), num = $('.sites__bar b', root), meter = $('.sites__meter i', root);
    let active = -1, raf, y = 0, ly = 0;
    const setActive = (i) => { if (i === active) return; const prev = active; active = i; rows.forEach((r, k) => r.classList.toggle('is-on', k === i)); num.textContent = pad(i + 1); url.textContent = items[i][1].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '  /  ' + items[i][2];
      imgs.forEach((im, k) => { im.style.zIndex = k === i ? 2 : k === prev ? 1 : 0; });
      if (!G || reduce) { imgs.forEach((im, k) => { im.style.clipPath = k === i ? 'inset(0)' : 'inset(100% 0 0 0)'; }); return; }
      // the next site drops in through nine vertical slits, in a shuffled order, like a contact sheet being dealt
      if (slitTw) slitTw.kill(); const el = imgs[i], pr = { t: 0 };
      slitTw = G.to(pr, { t: 1, duration: 1.15, ease: 'none', onUpdate: () => slit(el, pr.t, port.clientHeight), onComplete: () => { el.style.clipPath = 'inset(0)'; } }); };
    let slitTw = null; const BANDS = 9, ORDER = [3, 0, 6, 1, 8, 4, 2, 7, 5];
    const slit = (el, t, H) => { const pts = []; for (let k = 0; k < BANDS; k++) { const d = ORDER[k] / BANDS * 0.45, q = clamp((t - d) / 0.55), e = 1 - Math.pow(1 - q, 3), h = (e * (H + 2)).toFixed(1), x0 = (k / BANDS * 100).toFixed(3), x1 = ((k + 1) / BANDS * 100).toFixed(3);
      pts.push(`${x0}% 0px`, `${x0}% ${h}px`, `${x1}% ${h}px`, `${x1}% 0px`); } el.style.clipPath = `polygon(${pts.join(',')})`; };
    imgs.forEach(im => { im.style.clipPath = 'inset(100% 0 0 0)'; });
    (function tick() { const p = progress(wrap), f = Math.min(N - 0.0001, p * N), i = Math.floor(f), t = f - i; setActive(i);
      const im = imgs[i], over = Math.max(0, im.offsetHeight - port.clientHeight); y = reduce ? t : lerp(y, sm(0.12, 0.92, t), 0.12); if (i !== ly) { y = 0; ly = i; } im.style.transform = `translateY(${(-over * y).toFixed(1)}px)`; meter.style.transform = `scaleY(${y.toFixed(3)})`;
      const row = rows[i]; list.style.transform = `translateY(${(list.clientHeight / 2 - row.offsetTop - row.offsetHeight / 2).toFixed(1)}px)`; raf = requestAnimationFrame(tick); })();
    return () => cancelAnimationFrame(raf);
  }

  // ---------- Brand: a can you turn, a shelf of living boards, doors that open onto a bottle ----------
  // how far the Jigri shot has visibly moved by each frame (0..1), measured from the renders: the scroll follows this, so the camera's pace on screen is even
  const JMAP = [0.0,0.0078,0.016,0.025,0.0346,0.0449,0.0556,0.0669,0.0788,0.0911,0.104,0.1173,0.1312,0.1456,0.1605,0.176,0.1921,0.2089,0.2264,0.2448,0.2641,0.2846,0.3064,0.3292,0.353,0.3778,0.4037,0.4306,0.4586,0.4877,0.5177,0.5486,0.5807,0.6135,0.6466,0.68,0.7135,0.7467,0.7776,0.8076,0.8364,0.863,0.8886,0.9133,0.9369,0.9592,0.9802,1.0];
  const jframeAt = (v) => { let i = 0; while (i < JMAP.length - 2 && JMAP[i + 1] < v) i++; return i + clamp((v - JMAP[i]) / Math.max(1e-6, JMAP[i + 1] - JMAP[i])); };
  const FLAVOURS = [['Irani Classic', '#E8661E'], ['Elaichi', '#9ED9B8'], ['Zafran', '#F2B91F'], ['Gulab', '#E0418A'], ['Thanda Cutting', '#2F55D4']];
  function brand(root) {
    const B = window.BOARDS || [], NB = B.length, NF = 96, JF = 48, kills = [];
    // identities first; a divider; then client and company work, credited as on the résumé
    const firstWork = B.findIndex(b => b.group === 'work');
    const cols = B.map((b, i) => (i === firstWork ? `<div class="shelf__sep" aria-hidden="true"><span>Client and company work</span></div>` : '') + `<button class="col${b.group === 'work' ? ' is-work' : ''}" type="button" data-key="${b.key}" aria-label="Read the ${b.name} board"><span class="col__strip"><img src="boards/${b.key}/shelf.jpg" alt="" draggable="false"><img src="boards/${b.key}/shelf.jpg" alt="" draggable="false"></span><span class="col__tag"><b>${pad(i + 1)}</b><span>${b.name}</span><i>${b.line}</i><em>${b.role}</em></span></button>`).join('');
    const nId = B.filter(b => b.group !== 'work').length;
    root.innerHTML = `<div class="spin" hidden><canvas class="spin__cv" aria-label="The Magma can, turning"></canvas>
        <div class="spin__txt"><p class="spin__eye">Magma · strawberry · 400 ml</p><h3>Ignite your<br>heart’s energy.</h3><p class="spin__hint">Drag to turn it</p><button class="spin__read" type="button" data-key="magma">Read the Magma board</button></div><p class="spin__deg"><b>000</b>°</p></div>
      <div class="duo"><div class="duo__stage">
        <div class="jg"><canvas class="jg__cv" aria-label="The Jigri bottle on a café table"></canvas>
          <div class="jg__words"><p class="jg__eye">Jigri · Irani chai concentrate · 200 ml</p>
            <h3 class="jg__l"><span class="rise"><span>Pour-and-go</span></span><span class="rise"><span>Irani chai.</span></span></h3>
            <p class="jg__s">Nakko ubaalo. Bas daalo.</p></div>
          <div class="jg__end"><h3><span class="rise"><span>A friend in</span></span><span class="rise"><span>every cutting.</span></span></h3>
            <ul class="jg__fl">${FLAVOURS.map(([n, c]) => `<li><i style="background:${c}"></i>${n}</li>`).join('')}</ul>
            <button class="jg__read" type="button" data-key="jigri">Read the Jigri board</button></div>
          <p class="jg__note mono">Jigri · Irani Classic · 200 ml</p></div>
        <div class="shelf"><div class="shelf__head"><p><b>${pad(NB)}</b> brands, read at once</p><p class="shelf__hint">${nId} identities, then ${NB - nId} for clients and companies.<br>${fine ? 'Move across them. Click one to read it whole.' : 'Scroll down to move through them. Tap one to read it whole.'}</p>
          <p class="shelf__count mono" aria-hidden="true"><b>01</b> / ${pad(NB)} <span></span><i><i></i></i></p></div>
          <div class="shelf__cols">${cols}</div></div>
      </div></div>`;

    // the can: ray-traced frames of one full turn; dragging sets the angle, and it keeps a little momentum
    const spin = $('.spin', root), cv = $('.spin__cv', root), cx = cv.getContext('2d'), deg = $('.spin__deg b', root), frames = []; let a = 0, va = 0.22, drag = null, shown = -1, sraf;
    const first = new Image(); first.onload = () => { spin.hidden = false; frames[0] = first; for (let i = 1; i < NF; i++) { const im = new Image(); im.src = `can/c_${String(i).padStart(4, '0')}.jpg`; frames[i] = im; } loop(); }; first.src = 'can/c_0000.jpg';
    function loop() { sraf = requestAnimationFrame(loop); const r = spin.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      if (!drag) { a += va; va = lerp(va, reduce ? 0 : 0.22, 0.03); } const i = ((Math.round(a) % NF) + NF) % NF, im = frames[i];
      const d = Math.min(devicePixelRatio || 1, 2), W = Math.round(cv.clientWidth * d), H = Math.round(cv.clientHeight * d);
      if (im && im.complete && im.naturalWidth && W && (i !== shown || cv.width !== W || cv.height !== H)) { if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        // the frame is fitted to the height; on a wide screen the studio wall carries on to both sides
        // on a tall phone the shot is lifted and shrunk a little; the wall above and the dark plinth below carry on to the edges
        const tall = W / H < 0.75, h = tall ? H * 0.8 : H, y0 = tall ? H * 0.03 : 0, k = h / im.height, w = im.width * k, x0 = Math.round((W - w) / 2);
        if (tall) { cx.drawImage(im, 0, 2, im.width, 1, x0, 0, w, y0 + 2); cx.drawImage(im, 0, im.height - 3, im.width, 1, x0, y0 + h - 2, w, H - y0 - h + 2); }
        if (x0 > 0) { cx.drawImage(im, 2, 0, 1, im.height, 0, y0, x0 + 2, h); cx.drawImage(im, im.width - 3, 0, 1, im.height, x0 + w - 2, y0, W - x0 - w + 2, h);
          if (tall) { cx.drawImage(cv, x0, 0, 1, y0, 0, 0, x0, y0); cx.drawImage(cv, x0 + w - 1, 0, 1, y0, x0 + w - 1, 0, W - x0 - w + 1, y0); cx.drawImage(cv, x0, y0 + h, 1, H - y0 - h, 0, y0 + h, x0, H - y0 - h); cx.drawImage(cv, x0 + w - 1, y0 + h, 1, H - y0 - h, x0 + w - 1, y0 + h, W - x0 - w + 1, H - y0 - h); } }
        cx.drawImage(im, x0, y0, w, h); shown = i; deg.textContent = String(Math.round(i / NF * 360)).padStart(3, '0'); } }
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, a }; cv.setPointerCapture(e.pointerId); cv.classList.add('is-drag'); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const na = drag.a + (e.clientX - drag.x) * 0.18; va = na - a; a = na; });
    const up = () => { drag = null; cv.classList.remove('is-drag'); }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); kills.push(() => cancelAnimationFrame(sraf));

    // the shelf: every board stands as a column and keeps moving; scrolling rushes them, the pointer swells the nearest
    const sep = $('.shelf__sep', root), duo = $('.duo', root), shelf = $('.shelf', root), head = $('.shelf__head', root), colsEl = $('.shelf__cols', root), colEls = $$('.col', root), strips = $$('.col__strip', root);
    const jg = $('.jg', root), jcv = $('.jg__cv', root), jcx = jcv.getContext('2d'), words = $('.jg__words', root), endc = $('.jg__end', root), note = $('.jg__note', root);
    const view = root.closest('.view') || document.scrollingElement, cursor = $('#cursor'), cursorTxt = cursor && cursor.querySelector('span');
    // On touch screens there is no pointer to sweep across the columns, so the shelf travels sideways as you scroll down:
    // the section grows by one stretch of scroll per brand (S, in vh), and every later moment keeps the timing it has on a desktop.
    const touch = !fine, S = touch ? Math.max(162, NB * 24) : 162, AFTER = 378; duo.style.height = `${100 + S + AFTER}vh`;
    const count = $('.shelf__count b', root), countName = $('.shelf__count span', root), countBar = $('.shelf__count i i', root); let centers = [], travel = 0, lastC = -1;
    const SW = NB > 14 ? 5.6 : 3.4, SS = NB > 14 ? 2.2 : 1.3;   // the more boards, the stronger the swell, so the one you look at still opens wide
    const st = B.map((b, i) => ({ off: (i * 977) % 3000, dir: i % 2 ? -1 : 1, base: 16 + (i % 3) * 7, grow: 1, h: 0 }));
    let hx = null, lastTop = view.scrollTop, vel = 0, t0 = performance.now(), draw = -1, hoverI = -1, raf;
    const jframes = []; let jload = false, hs = []; const measure = () => { hs = strips.map(x => x.firstElementChild.offsetHeight); centers = colEls.map(c => c.offsetLeft + c.offsetWidth / 2); travel = Math.max(0, colsEl.scrollWidth - shelf.clientWidth); }; addEventListener('resize', measure); kills.push(() => removeEventListener('resize', measure));
    strips.forEach(x => x.firstElementChild.addEventListener('load', measure));
    const loadJ = () => { if (jload) return; jload = true; for (let i = 0; i < JF; i++) { const im = new Image(); im.src = `jigri/j_${String(i).padStart(4, '0')}.jpg`; jframes[i] = im; } };
    colsEl.addEventListener('pointermove', (e) => { if (!fine) return; const r = colsEl.getBoundingClientRect(); hx = (e.clientX - r.left) / r.width * NB - 0.5; });
    colsEl.addEventListener('pointerleave', () => { hx = null; setHover(-1); });
    function setHover(i) { if (i === hoverI) return; hoverI = i; colEls.forEach((c, k) => c.classList.toggle('is-on', k === i)); shelf.classList.toggle('is-looking', i >= 0);
      if (cursor) { cursor.classList.toggle('is-big', i >= 0); if (cursorTxt) cursorTxt.textContent = i >= 0 ? 'Read' : 'Enter'; } }
    colEls.forEach((c) => c.addEventListener('click', () => window.Reader.open(c.dataset.key, c.getBoundingClientRect())));
    $$('.spin__read, .jg__read', root).forEach((b) => b.addEventListener('click', () => window.Reader.open(b.dataset.key, null)));
    const drawJ = (f) => { const i = Math.floor(f), k = f - i, A = jframes[i], Bm = jframes[Math.min(JF - 1, i + 1)]; if (!A || !A.complete || !A.naturalWidth) return;
      const d = Math.min(devicePixelRatio || 1, 2), W = Math.round(jcv.clientWidth * d), H = Math.round(jcv.clientHeight * d); if (!W) return; if (jcv.width !== W || jcv.height !== H) { jcv.width = W; jcv.height = H; }
      const s = Math.max(W / A.width, H / A.height), w = A.width * s, h = A.height * s, x = (W - w) / 2, y = (H - h) / 2;
      jcx.globalAlpha = 1; jcx.drawImage(A, x, y, w, h); if (k > 0.02 && Bm && Bm.complete && Bm.naturalWidth) { jcx.globalAlpha = k; jcx.drawImage(Bm, x, y, w, h); jcx.globalAlpha = 1; } };
    let jlast = -1, wordsOn = false, endOn = false;
    const reveal = (el, on) => { el.classList.toggle('is-on', on); if (G && !reduce) G.to(el.querySelectorAll('.rise > *'), { yPercent: on ? 0 : 110, duration: on ? 1.1 : 0.5, ease: on ? 'expo.out' : 'power3.in', stagger: 0.08, overwrite: true }); };
    if (G) { G.set(words.querySelectorAll('.rise > *'), { yPercent: 110 }); G.set(endc.querySelectorAll('.rise > *'), { yPercent: 110 }); }
    (function tick(now) { raf = requestAnimationFrame(tick); const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      const r = duo.getBoundingClientRect(); if (r.bottom < -50 || r.top > innerHeight * 2) return; if (r.top < innerHeight * 3) loadJ();
      // sv: how far into the section you have scrolled, in vh. p: the same moment on the desktop timeline (the shelf owns 0 to 0.3)
      const sv = clamp(-r.top, 0, Math.max(1, r.height - innerHeight)) / innerHeight * 100, p = sv < S ? 0.3 * sv / S : Math.min(1, 0.3 + (sv - S) / 540);
      const top = view.scrollTop; vel = lerp(vel, top - lastTop, 0.25); lastTop = top;
      let ctr = (NB - 1) / 2;
      if (touch) { if (!centers.length) measure();
        // the row steps from brand to brand: it rests with one brand in the middle, then glides to the next
        const u = clamp((sv / S - 0.03) / 0.94) * (NB - 1), k = Math.min(NB - 2, Math.floor(u)), t = u - k, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, f = lerp(t, e, 0.85);
        const cx = lerp(centers[k], centers[k + 1], f), xs = clamp(cx - shelf.clientWidth / 2, 0, travel), mid = cx;
        colsEl.style.transform = `translate3d(${(-xs).toFixed(1)}px, 0, 0)`; let bi = 0, bd = 1e9; centers.forEach((c, k) => { const d = Math.abs(c - mid); if (d < bd) { bd = d; bi = k; } }); ctr = bi;
        if (bi !== lastC) { lastC = bi; count.textContent = pad(bi + 1); countName.textContent = '· ' + B[bi].name; }
        countBar.style.transform = `scaleX(${Math.min(1, sv / S).toFixed(4)})`; }
      // doors: centre columns part first, odd ones lift, even ones drop
      const door = sm(0.3, 0.46, p), live = door < 0.98;
      if (live) { const c = ctr, cs = Math.max(c, NB - 1 - c, 1);
        let best = -1, bd = 9;
        colEls.forEach((el, i) => { const s = st[i];
          s.off += s.dir * (s.base * dt * (reduce ? 0 : 1) + vel * 0.55);
          const g = hx === null || door > 0.05 ? 1 : 1 + SW * Math.exp(-((i - hx) ** 2) / SS); s.grow = lerp(s.grow, g, 0.14); if (fine) el.style.flexGrow = s.grow.toFixed(3);
          if (hx !== null && Math.abs(i - hx) < bd) { bd = Math.abs(i - hx); best = i; }
          if (!hs[i]) measure(); const h = hs[i] || 1, y = ((s.off % h) + h) % h; strips[i].style.transform = `translate3d(-50%, ${(-y).toFixed(1)}px, 0)`;
          const k = clamp((door - Math.abs(i - c) / cs * 0.35) / 0.65), e = k * k * (3 - 2 * k); el.style.transform = e > 0 ? `translate3d(0, ${(i % 2 ? -1 : 1) * e * 105}%, 0)` : ''; });
        setHover(door > 0.05 ? -1 : touch ? ctr : best); shelf.style.visibility = 'visible'; } else shelf.style.visibility = 'hidden';
      head.style.opacity = String(1 - sm(0.27, 0.34, p)); if (sep) sep.style.opacity = String(1 - sm(0.29, 0.33, p)); shelf.style.pointerEvents = door > 0.3 ? 'none' : '';
      // behind the doors: the café, and the camera moving in on the bottle
      const jp = sm(0.44, 0.93, p), f = lerp(jp * (JF - 1), jframeAt(jp), 0.65); jcv.style.transform = `scale(${(1.1 - 0.1 * door).toFixed(4)})`;
      if (Math.abs(f - jlast) > 0.004 || jcv.width === 0) { drawJ(f); jlast = f; }
      const wOn = p > 0.5 && p < 0.82, eOn = p > 0.86; if (wOn !== wordsOn) { wordsOn = wOn; reveal(words, wOn); } if (eOn !== endOn) { endOn = eOn; reveal(endc, eOn); }
      note.style.opacity = String(sm(0.46, 0.52, p) * (1 - sm(0.84, 0.88, p))); jg.classList.toggle('is-live', door > 0.5); })(t0);
    kills.push(() => { cancelAnimationFrame(raf); setHover(-1); });
    return () => kills.forEach(k => k());
  }

  // ---------- the reader: one board, whole, full screen; its own colours glow around it as you read ----------
  window.Reader = (function () {
    let el = null, cur = -1, from = null, sraf, target = 0, pos = 0, smooth = false;
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    function build() { el = document.createElement('div'); el.className = 'reader'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      el.innerHTML = `<div class="reader__bg"></div><div class="reader__scroll"><div class="reader__board"></div><button class="reader__next" type="button"><span>Next board</span><b></b></button></div>
        <aside class="reader__side"><p class="reader__num"></p><h2 class="reader__name"></h2><p class="reader__line"></p><p class="reader__role"></p><p class="reader__pct"><b>00</b>% read</p></aside>
        <div class="reader__map" aria-hidden="true"><img alt=""><i></i></div><button class="reader__close" type="button">Close</button>`;
      document.body.appendChild(el);
      const sc = $('.reader__scroll', el), map = $('.reader__map', el);
      $('.reader__close', el).addEventListener('click', close); $('.reader__next', el).addEventListener('click', () => show((cur + 1) % window.BOARDS.length, true));
      addEventListener('keydown', (e) => { if (el.hidden) return; if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); } }, true);
      sc.addEventListener('scroll', paint, { passive: true });
      if (fine && !reduce) { sc.addEventListener('wheel', (e) => { if (e.ctrlKey) return; e.preventDefault(); if (!smooth) pos = target = sc.scrollTop; target = clamp(target + e.deltaY * (e.deltaMode === 1 ? 32 : 1), 0, sc.scrollHeight - sc.clientHeight); smooth = true; }, { passive: false });
        (function ease() { sraf = requestAnimationFrame(ease); if (!smooth || el.hidden) return; pos += (target - pos) * 0.12; if (Math.abs(target - pos) < 0.4) { pos = target; smooth = false; } sc.scrollTop = pos; })(); }
      const jump = (e) => { const r = map.getBoundingClientRect(); smooth = false; sc.scrollTop = clamp((e.clientY - r.top) / r.height) * sc.scrollHeight - sc.clientHeight / 2; };
      map.addEventListener('pointerdown', (e) => { map.setPointerCapture(e.pointerId); jump(e); map.onpointermove = jump; }); map.addEventListener('pointerup', () => { map.onpointermove = null; }); }
    function paint() { const b = window.BOARDS[cur], sc = $('.reader__scroll', el), max = Math.max(1, sc.scrollHeight - sc.clientHeight), p = clamp(sc.scrollTop / max);
      const board = $('.reader__board', el), bh = board.offsetHeight || 1, q = clamp((sc.scrollTop + sc.clientHeight / 2) / bh), c = b.amb[Math.min(47, Math.floor(q * 48))];
      el.style.setProperty('--amb', c); el.classList.toggle('is-light', lum(c) > 0.55); el.style.setProperty('--p', p.toFixed(4));
      $('.reader__pct b', el).textContent = String(Math.round(p * 100)).padStart(2, '0');
      const m = $('.reader__map i', el); m.style.top = `${(sc.scrollTop / Math.max(1, bh) * 100).toFixed(2)}%`; m.style.height = `${Math.min(100, sc.clientHeight / Math.max(1, bh) * 100).toFixed(2)}%`; }
    // the side panel and the mini-map only appear where the board leaves them room; otherwise a thin progress line runs along the top
    function fit() { if (!el) return; const board = $('.reader__board', el), w = board.offsetWidth || Math.min(innerWidth, 1400), m = (innerWidth - w) / 2;
      el.style.setProperty('--bwv', w + 'px'); el.classList.toggle('has-side', m >= 240); el.classList.toggle('has-map', m >= 64); }
    addEventListener('resize', () => { if (el && !el.hidden) fit(); });
    function show(i, swap) { const b = window.BOARDS[i]; cur = i; const sc = $('.reader__scroll', el), board = $('.reader__board', el);
      // the board at its native width (never upscaled); each tile repeats the last rows of the one above and is pulled up by
      // exactly that much, so the stitching never shows; a soft copy of the whole board sits underneath until each tile arrives
      const fill = () => { const ov = b.ov || 0; board.style.setProperty('--bw', b.w + 'px'); board.style.setProperty('--ovf', (ov / b.w).toFixed(6)); board.style.backgroundImage = `url(boards/${b.key}/shelf.jpg)`;
        board.innerHTML = Array.from({ length: b.tiles }, (_, k) => { const h = Math.min(b.tile, b.h - k * b.tile) + (k ? ov : 0); return `<img src="boards/${b.key}/t_${String(k).padStart(2, '0')}.jpg" width="${b.w}" height="${h}" alt="${k ? '' : b.name + ' brand board'}" ${k > 1 ? 'loading="lazy"' : ''} decoding="async">`; }).join('');
        $$('img', board).forEach(im => { if (im.complete && im.naturalWidth) im.classList.add('is-in'); else im.addEventListener('load', () => im.classList.add('is-in'), { once: true }); });
        fit();
        $('.reader__num', el).textContent = `${pad(i + 1)} / ${pad(window.BOARDS.length)}`; $('.reader__name', el).textContent = b.name; $('.reader__line', el).textContent = b.line; $('.reader__role', el).textContent = b.role || '';
        $('.reader__map img', el).src = `boards/${b.key}/shelf.jpg`; const nx = window.BOARDS[(i + 1) % window.BOARDS.length]; $('.reader__next b', el).textContent = nx.name;
        smooth = false; sc.scrollTop = 0; paint(); };
      if (swap && G && !reduce) { G.timeline().to([board, '.reader__side', '.reader__next'].map(x => typeof x === 'string' ? $(x, el) : x), { opacity: 0, y: -30, duration: 0.4, ease: 'power2.in' }).add(fill).fromTo([board, $('.reader__side', el), $('.reader__next', el)], { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.06 }); }
      else fill(); }
    function rectClip(r) { return r ? `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px)` : 'inset(50% 50% 50% 50%)'; }
    function open(key, rect) { if (!el) build(); const i = window.BOARDS.findIndex(b => b.key === key); if (i < 0) return; from = rect; show(i, false);
      el.hidden = false; fit(); document.body.classList.add('is-reading'); const cursor = $('#cursor'); if (cursor) cursor.classList.remove('is-big');
      if (!G || reduce) return; G.fromTo(el, { clipPath: rectClip(rect) }, { clipPath: 'inset(0px 0px 0px 0px)', duration: 1.15, ease: 'expo.inOut' });
      G.fromTo([$('.reader__board', el), $('.reader__side', el)], { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', delay: 0.45, stagger: 0.08 });
      G.fromTo([$('.reader__map', el), $('.reader__close', el)], { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.8 }); }
    function close() { if (!el || el.hidden) return; const done = () => { el.hidden = true; document.body.classList.remove('is-reading'); el.style.clipPath = ''; };
      if (!G || reduce) return done(); G.to(el, { clipPath: rectClip(from && from.width ? from : null), duration: 0.9, ease: 'expo.inOut', onComplete: done }); }
    return { open, close };
  })();

  window.Sections = { mount(key, root, items) { if (stop) stop(); stop = ({ world, web, brand })[key](root, items); }, unmount() { if (stop) stop(); stop = null; } };
})();
