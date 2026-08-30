/* ══════════════════════════════════════════════════════════════
   thesumanth.com — app.js
   Data, rendering, and the render-pass machinery.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  var IMG = 'assets/images/';
  var VID = 'assets/videos/';
  var POS = 'assets/posters/';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var touch = window.matchMedia('(hover:none)').matches;
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  /* ── helpers ─────────────────────────────────────────────── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function seq(prefix, a, b, suffix, pad) {
    var out = [];
    for (var i = a; i <= b; i++) {
      var n = pad && i < 10 ? '0' + i : String(i);
      out.push(prefix + n + (suffix || '.webp'));
    }
    return out;
  }
  function isVideo(p) { return /\.mp4$/i.test(p); }
  function baseName(p) { return p.split('/').pop().replace(/\.[a-z0-9]+$/i, ''); }

  /* ══ DATA ═══════════════════════════════════════════════════ */

  var WORLDS = [
    {
      id: 'roman-no-yoake',
      title: 'Rōman no Yoake',
      jp: '浪漫の夜明け',
      sub: 'Pagoda, first light, and a sea that has not started talking yet',
      year: '2025',
      kind: 'Personal',
      note: 'The hour before anything is awake. I wanted the fog to do the modelling — the pagoda barely earns its silhouette, the treeline dissolves, and the only hard edge in the frame is the sun clearing the ridge. Five renders, one sunrise, roughly four hundred rejected sun angles.',
      tags: ['Maya', 'Arnold', 'Substance', 'After Effects', 'Fog volumes', '5 renders'],
      plate: IMG + 'japa-render-1.webp',
      alt: 'A pagoda above a misty treeline at sunrise',
      shots: [
        { src: IMG + 'japa-render-3.webp', label: 'Pink hour', span: 'shot--wide', ratio: 'media--16x9' },
        { src: IMG + 'japa-render-5.webp', label: 'Eclipse', span: '', ratio: 'media--16x9' },
        { src: VID + 'Japa-Turntable-1.mp4', label: 'Turntable', span: 'shot--half', ratio: 'media--16x9' },
        { src: VID + 'Japa-Panningshot-2.mp4', label: 'Panning shot', span: 'shot--half', ratio: 'media--16x9' },
        { src: IMG + 'japa-render-2.webp', label: 'Tower, night sea', span: 'shot--half', ratio: 'media--16x9' },
        { src: IMG + 'japa-render-4.webp', label: 'Grass, moon', span: 'shot--half', ratio: 'media--16x9' }
      ]
    },
    {
      id: 'fudo-myo-o',
      title: 'Fudō Myō-ō',
      jp: '不動明王',
      sub: 'A forest shrine at the hour the candles take over from the sun',
      year: '2025',
      kind: 'Personal',
      note: 'Built around a single practical light. Everything else in the scene is either reflecting that candle or hiding from it. The foxes have stopped expecting visitors but they still keep watch, and the moss has opinions about where the water goes.',
      tags: ['Maya', 'ZBrush', 'Arnold', 'Substance', 'Practical light', 'Turntable'],
      plate: IMG + 'fudomyo-render-1.webp',
      alt: 'A forest shrine lit by candlelight through the trees',
      shots: [
        { src: VID + 'Fudomyo-Turntable-1.mp4', label: 'Turntable', span: 'shot--wide', ratio: 'media--16x9' },
        { src: IMG + 'fudomyo-render-mobile-1.webp', label: 'Vertical cut', span: '', ratio: 'media--3x4' },
        { src: IMG + 'fudomyo-render-2.webp', label: 'Approach', span: 'shot--full', ratio: 'media--16x9' }
      ]
    },
    {
      id: 'koi-pond',
      title: 'Koi Pond',
      jp: '錦鯉の池',
      sub: 'Bioluminescence, autumn, and light that comes from under the water',
      year: '2024',
      kind: 'Personal',
      note: 'The rule for this one: no light from above. Everything is lit from inside the water, so the caustics run the wrong way up the rocks and the leaves get their colour from below. Rendered twice — once in high summer, once after the maples turned.',
      tags: ['Maya', 'Arnold', 'Substance', 'Photoshop', 'Caustics', 'Two seasons'],
      plate: IMG + 'koipond-render-2.webp',
      alt: 'A glowing teal pond surrounded by rocks and palms at night',
      shots: [
        { src: IMG + 'koipond-render-1.webp', label: 'Shallows', span: 'shot--half', ratio: 'media--16x9' },
        { src: IMG + 'koipond-render-4.webp', label: 'Overgrowth', span: 'shot--half', ratio: 'media--16x9' },
        { src: IMG + 'koipond-render-5.webp', label: 'Wide, night', span: 'shot--wide', ratio: 'media--16x9' },
        { src: IMG + 'koipond-render-3.webp', label: 'Autumn pass', span: '', ratio: 'media--16x9' },
        { src: IMG + 'koipond-render-6.webp', label: 'Last light', span: 'shot--full', ratio: 'media--16x9' }
      ]
    }
  ];

  var STEPS = [
    ['Reference', 'Look at the real thing for longer than is comfortable. Then keep looking.'],
    ['Blockout', 'Grey boxes, honest proportions. If it is boring in clay it will be boring in colour.'],
    ['Hard-surface', 'Edges that hold a highlight. Bevels you could run a thumb along.'],
    ['Sculpt', 'Wear where hands have been. Nothing in a lived world is factory-new.'],
    ['Texture', 'A working life: dust settles, paint chips, water always stains downward.'],
    ['Light', 'One key that tells the truth. Everything after it is support and flattery.'],
    ['Comp', 'Grade it, then remove half of what you just added.']
  ];

  var CLIENTS = [
    { name: 'Classic Partnership', group: 'Agency', role: 'Calendar campaigns · visual design', files: seq(IMG + 'tcp-calendarposts-', 1, 13) },
    { name: 'Midea Canada', group: 'Agency', role: 'Social overlays · PWHL · Pelonis', files: seq(IMG + 'midea-posts-', 1, 6).concat(seq(VID + 'midea-overlays-', 1, 8, '.mp4'), [IMG + 'midea-PWHL-banner.webp', IMG + 'midea-pelonis-banner-1.webp']) },
    { name: 'Eureka', group: 'Agency', role: 'Product social · reels', files: seq(IMG + 'midea-eureka-overlays-', 1, 4).concat(seq(VID + 'midea-eureka-', 1, 3, '.mp4')) },
    { name: 'Comfee', group: 'Agency', role: 'Social campaign', files: [IMG + 'midea-comfee-post-01.webp', IMG + 'midea-comfee-post-02.webp'].concat(seq(VID + 'midea-comfee-social-', 1, 2, '.mp4')) },
    { name: 'Home Depot Canada', group: 'Agency', role: 'RAC advertisements', files: seq(IMG + 'midea-rac-advertisements-', 1, 8, '.webp', true) },
    { name: 'KD Displays', group: 'Agency', role: 'Retail display content', files: seq(IMG + 'kddisplays-posts-', 1, 10).concat([VID + 'kddisplays-posts-1.mp4']) },
    { name: 'GC Burger', group: 'Agency', role: 'Campaign · five locations', files: seq(IMG + 'gcburger-campaign-', 1, 28) },
    { name: 'Investohome PR', group: 'Agency', role: 'Google ads · social · web', files: seq(IMG + 'investohome-googleads-banners-', 1, 5).concat(seq(IMG + 'investohome-socialads-banners-', 1, 5), seq(IMG + 'investohome-websitebanner-', 1, 4), [VID + 'investohome-outro-1.mp4']) },
    { name: 'Amaya Restaurant', group: 'Agency', role: 'Calendar posts · reel', files: seq(IMG + 'amayarestaurant-calendarposts-', 1, 5).concat([VID + 'amayarestaurant-reel-1.mp4']) },
    { name: 'VS Design Studio', group: 'Studio', role: 'Event & brand posts', files: seq(IMG + 'vsdesignstudio-posts-', 1, 4).concat([VID + 'vsdesignstudio-event-1.mp4']) },
    { name: 'nxtwave', group: 'Freelance', role: 'Slide system', files: seq(IMG + 'nxtwave-slide-', 1, 7) },
    { name: 'Tamada Media', group: 'Freelance', role: 'Branding', files: [IMG + 'tamadamedia-branding-1.webp', VID + 'tamadamedia-branding-2.mp4'] },
    { name: 'Lakshmi Bakers', group: 'Freelance', role: 'Identity · via Tamada Media', files: seq(IMG + 'tamadamedia-laxmibakery-', 1, 3) },
    { name: 'Inertia Productions', group: 'Freelance', role: 'Motion graphics', files: [VID + 'motiongraphicsmozilla-3.mp4', VID + 'motiongraphicsnews-1.mp4', VID + 'motiongraphicsnews-2.mp4'] },
    { name: 'LLT Overseas', group: 'Freelance', role: 'Illustration', files: [IMG + 'overseas-illustration-1.webp'] },
    { name: 'AZ Coffee', group: 'Freelance', role: 'Via Coalition Technologies · under NDA', files: [] }
  ];

  var STUDIES = [
    { src: IMG + '1.webp', nm: 'Magma', kind: 'Beverage identity', span: 'bento__cell--w3', ratio: 'media--3x4' },
    { src: IMG + '3.webp', nm: 'Magma', kind: 'Can · product viz', span: '', ratio: 'media--3x4' },
    { src: IMG + '2.webp', nm: 'Magma', kind: 'Strawberry key art', span: '', ratio: 'media--3x4' },
    { src: IMG + '10.webp', nm: 'Nike Phantom', kind: 'Sport campaign', span: 'bento__cell--w4', ratio: 'media--3x4' },
    { src: IMG + '12.webp', nm: 'Reebok', kind: 'Sport campaign', span: '', ratio: 'media--3x4' },
    { src: IMG + '7.webp', nm: 'Messi × Ronaldo', kind: 'Match poster', span: '', ratio: 'media--3x4' },
    { src: IMG + '16.webp', nm: 'Cloudbank', kind: 'Sky study', span: 'bento__cell--w4', ratio: 'media--16x9' },
    { src: IMG + '8.webp', nm: 'Mustang', kind: 'Automotive', span: '', ratio: 'media--16x9' },
    { src: IMG + '1 (2).webp', nm: 'Octavia', kind: 'Automotive · night', span: '', ratio: 'media--3x4' },
    { src: IMG + '1 (10).webp', nm: 'Octavia', kind: 'Automotive · forest', span: '', ratio: 'media--3x4' },
    { src: IMG + 'car-render-2.webp', nm: 'Supra', kind: 'Studio viz', span: '', ratio: 'media--16x9' },
    { src: IMG + 'car-render-1.webp', nm: 'Supra', kind: 'Three-quarter', span: '', ratio: 'media--16x9' },
    { src: IMG + 'car2-shadowmatte-1.webp', nm: 'Ferrari', kind: 'Shadow matte', span: '', ratio: 'media--16x9' },
    { src: IMG + '11.webp', nm: 'Titan', kind: 'Product advert', span: '', ratio: 'media--3x4' },
    { src: IMG + 'op-perfume-1.webp', nm: 'Perfume', kind: 'Fragrance key art', span: '', ratio: 'media--3x4' },
    { src: IMG + '21.webp', nm: 'Nipura Luxe', kind: 'Jewellery · cool', span: '', ratio: 'media--3x4' },
    { src: IMG + '22.webp', nm: 'Nipura Luxe', kind: 'Jewellery · warm', span: '', ratio: 'media--3x4' },
    { src: IMG + 'cd.webp', nm: 'Nipura', kind: 'Seasonal post', span: '', ratio: 'media--1x1' },
    { src: IMG + '15.webp', nm: 'FittR', kind: 'Food packaging', span: 'bento__cell--w3', ratio: 'media--4x3' },
    { src: IMG + '4.webp', nm: 'Science Focus', kind: 'Editorial cover', span: 'bento__cell--w3', ratio: 'media--4x3' },
    { src: IMG + '5.webp', nm: 'The Alchemist', kind: 'Cover · mockup', span: '', ratio: 'media--4x3' },
    { src: IMG + '6.webp', nm: 'The Alchemist', kind: 'Title lockup', span: '', ratio: 'media--16x9' },
    { src: IMG + '13.webp', nm: 'Yesteryay Land', kind: 'Event poster', span: '', ratio: 'media--3x4' },
    { src: IMG + 'sensei-mugen.webp', nm: 'Sensei', kind: 'Character', span: '', ratio: 'media--3x4' },
    { src: IMG + '9.webp', nm: 'The lamppost', kind: 'Illustration', span: '', ratio: 'media--3x4' },
    { src: IMG + '14.webp', nm: 'Ship, dusk', kind: 'Illustration', span: '', ratio: 'media--16x9' },
    { src: IMG + '18.webp', nm: 'Dead wood', kind: 'Matte illustration', span: '', ratio: 'media--16x9' },
    { src: IMG + '17.webp', nm: 'Late room', kind: 'Interior light study', span: 'bento__cell--w3', ratio: 'media--16x9' },
    { src: IMG + 'conceptdesign-2.webp', nm: 'Red tree', kind: 'Concept', span: 'bento__cell--w3', ratio: 'media--16x9' },
    { src: IMG + 'conceptdesign-1.webp', nm: 'Moon field', kind: 'Concept', span: '', ratio: 'media--16x9' },
    { src: IMG + 'cylinder-1.webp', nm: 'Hard-surface', kind: 'Practice', span: '', ratio: 'media--16x9' },
    { src: IMG + 'cylinder-3.webp', nm: 'Extinguisher', kind: 'Texture study', span: '', ratio: 'media--16x9' },
    { src: IMG + 'conceptdesign-3.webp', nm: 'Clay pass', kind: 'Hard-surface', span: '', ratio: 'media--16x9' },
    { src: IMG + 'carousel_banner_full.webp', nm: 'Web carousel', kind: 'Banner system', span: 'bento__cell--w6', ratio: 'media--auto' }
  ];

  /* ══ LAZY MEDIA + BUCKET REVEAL ═════════════════════════════ */

  var lazyIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      img.addEventListener('load', function () { img.classList.add('is-in'); }, { once: true });
      if (img.complete) img.classList.add('is-in');
      lazyIO.unobserve(img);
    });
  }, { rootMargin: '600px 0px' });

  var bucketIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      resolveBuckets(e.target);
      bucketIO.unobserve(e.target);
    });
  }, { rootMargin: '80px 0px', threshold: 0.08 });

  var vidIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else if (!v.paused) v.pause();
    });
  }, { threshold: 0.25 });

  function makeBuckets(wrap, cols, rows) {
    if (reduced) return;
    var g = el('div', 'buckets');
    g.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    g.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';
    for (var i = 0; i < cols * rows; i++) g.appendChild(document.createElement('i'));
    wrap.appendChild(g);
    bucketIO.observe(wrap);
  }

  function resolveBuckets(wrap) {
    var g = wrap.querySelector('.buckets');
    if (!g) return;
    var tiles = Array.prototype.slice.call(g.children);
    var cols = (g.style.gridTemplateColumns.match(/\d+/) || [8])[0] * 1;
    // scanline order with a little jitter — how a bucket render actually lands
    var order = tiles.map(function (t, i) {
      return { t: t, k: Math.floor(i / cols) * cols * 1.4 + (i % cols) + Math.random() * cols * 0.9 };
    }).sort(function (a, b) { return a.k - b.k; });
    var stepMs = Math.max(9, 620 / order.length);
    order.forEach(function (o, i) {
      setTimeout(function () { o.t.classList.add('gone'); }, i * stepMs);
    });
    setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, order.length * stepMs + 700);
  }

  function mediaBlock(src, opts) {
    opts = opts || {};
    var wrap = el('div', 'media ' + (opts.ratio || 'media--16x9'));
    if (isVideo(src)) {
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.preload = 'none';
      v.poster = POS + baseName(src) + '.jpg';
      v.dataset.src = src;
      wrap.appendChild(v);
      vidIO.observe(v);
    } else {
      var img = document.createElement('img');
      img.alt = opts.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.dataset.src = src;
      wrap.appendChild(img);
      lazyIO.observe(img);
    }
    if (opts.buckets) makeBuckets(wrap, opts.buckets[0], opts.buckets[1]);
    return wrap;
  }

  /* ══ WORLDS ═════════════════════════════════════════════════ */

  var worldsMount = document.getElementById('worldsMount');

  WORLDS.forEach(function (w, wi) {
    var sec = el('article', 'world');
    sec.id = w.id;
    sec.setAttribute('data-wire', 'world.' + w.id);

    var plate = el('div', 'world__plate');
    var pm = mediaBlock(w.plate, { alt: w.alt, ratio: 'media--plate', buckets: [14, 8] });
    plate.appendChild(pm);
    plate.appendChild(el('div', 'hero__vig'));

    var cap = el('div', 'world__cap');
    cap.appendChild(el('div', '', '<span class="world__jp">' + w.jp + '</span><h3 class="world__title">' + w.title + '</h3>'));
    cap.appendChild(el('div', 'world__meta',
      '<span>' + String(wi + 1).padStart(2, '0') + ' / 03 · ' + w.kind + '</span><span>' + w.year + '</span>'));
    plate.appendChild(cap);
    sec.appendChild(plate);

    var body = el('div', 'world__body');
    body.appendChild(el('p', 'world__note reveal', '<em>' + w.sub + '.</em> ' + w.note));
    var tags = el('div', 'world__tags reveal');
    w.tags.forEach(function (t) { tags.appendChild(el('span', '', t)); });
    body.appendChild(tags);
    sec.appendChild(body);

    var shots = el('div', 'shots');
    w.shots.forEach(function (s, i) {
      var fig = el('figure', 'shot ' + (s.span || ''));
      fig.style.margin = '0';
      fig.appendChild(mediaBlock(s.src, { alt: w.title + ' — ' + s.label, ratio: s.ratio, buckets: [8, 5] }));
      fig.appendChild(el('span', 'shot__no', String(i + 1).padStart(2, '0') + ' · ' + s.label.toUpperCase()));
      if (isVideo(s.src)) fig.appendChild(el('span', 'shot__play', '▶ LOOP'));
      openable(fig, 'Open ' + w.title + ' — ' + s.label, function () {
        openLB(w.shots.map(function (x) { return x.src; }), i, w.title);
      });
      cursorTarget(fig, 'OPEN');
      shots.appendChild(fig);
    });
    sec.appendChild(shots);
    worldsMount.appendChild(sec);
  });

  /* ══ PIPELINE ═══════════════════════════════════════════════ */

  var pipeTrack = document.getElementById('pipeTrack');
  STEPS.forEach(function (s, i) {
    var li = el('li', 'step');
    li.innerHTML =
      '<span class="step__n">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="step__name">' + s[0] + '</span>' +
      '<span class="step__txt">' + s[1] + '</span>' +
      '<span class="step__bar"></span>';
    pipeTrack.appendChild(li);
  });

  /* ══ CLIENTS / SOLO ═════════════════════════════════════════ */

  var soloList = document.getElementById('soloList');
  var wall = document.getElementById('clientWall');
  var soloName = document.getElementById('soloName');
  var soloRole = document.getElementById('soloRole');
  var soloClear = document.getElementById('soloClear');
  var soloed = null;

  CLIENTS.forEach(function (c, i) {
    var b = el('button', 'solo__item');
    b.type = 'button';
    b.dataset.idx = String(i);
    b.innerHTML =
      '<span class="solo__dot"></span>' +
      '<span class="solo__nm">' + c.name + '</span>' +
      '<span class="solo__ct">' + (c.files.length ? String(c.files.length).padStart(2, '0') : 'NDA') + '</span>';
    b.addEventListener('click', function () { setSolo(soloed === i ? null : i); });
    cursorTarget(b, 'SOLO');
    soloList.appendChild(b);
  });

  // Build one shuffled wall of everything, tagged by client.
  var allCells = [];
  CLIENTS.forEach(function (c, ci) {
    c.files.forEach(function (f) {
      allCells.push({ src: f, ci: ci, name: c.name });
    });
  });
  // round-robin so no single client clumps together on the wall
  (function interleave() {
    var buckets = CLIENTS.map(function (c, ci) {
      return c.files.map(function (f) { return { src: f, ci: ci, name: c.name }; });
    });
    var out = [], left = true, i = 0;
    while (left) {
      left = false;
      for (var b = 0; b < buckets.length; b++) {
        if (buckets[b][i]) { out.push(buckets[b][i]); left = true; }
      }
      i++;
    }
    allCells = out;
  })();

  allCells.forEach(function (cell) {
    var d = el('div', 'wall__cell');
    d.dataset.ci = String(cell.ci);
    d.appendChild(mediaBlock(cell.src, { alt: cell.name + ' — commercial work', ratio: 'media--auto' }));
    d.appendChild(el('span', 'wall__tag', cell.name));
    openable(d, 'Open ' + cell.name + ' gallery', function () {
      var c = CLIENTS[cell.ci];
      openLB(c.files, c.files.indexOf(cell.src), c.name);
    });
    cursorTarget(d, 'VIEW');
    wall.appendChild(d);
  });

  function setSolo(idx) {
    soloed = idx;
    var items = soloList.querySelectorAll('.solo__item');
    Array.prototype.forEach.call(items, function (b, i) {
      b.classList.toggle('is-solo', idx === i);
      b.classList.toggle('is-dim', idx !== null && idx !== i);
    });
    Array.prototype.forEach.call(wall.children, function (cell) {
      cell.classList.toggle('is-fade', idx !== null && cell.dataset.ci !== String(idx));
    });
    if (idx === null) {
      soloName.textContent = 'ALL CLIENTS';
      soloRole.textContent = '2023 — 2025 · agency, studio & freelance';
      soloClear.hidden = true;
    } else {
      var c = CLIENTS[idx];
      soloName.textContent = c.name.toUpperCase();
      soloRole.textContent = c.group + ' · ' + c.role + (c.files.length ? '' : ' · no public assets');
      soloClear.hidden = false;
    }
  }
  soloClear.addEventListener('click', function () { setSolo(null); });

  /* ══ STUDIES ════════════════════════════════════════════════ */

  var studyGrid = document.getElementById('studyGrid');
  STUDIES.forEach(function (s, i) {
    var d = el('div', 'bento__cell ' + (s.span || ''));
    d.appendChild(mediaBlock(s.src, { alt: s.nm + ' — ' + s.kind, ratio: s.ratio, buckets: [6, 4] }));
    d.appendChild(el('div', 'bento__cap',
      '<span class="bento__nm">' + s.nm + '</span><span class="bento__kind">' + s.kind + '</span>'));
    openable(d, 'Open ' + s.nm + ' — ' + s.kind, function () {
      openLB(STUDIES.map(function (x) { return x.src; }), i, s.nm + ' — ' + s.kind);
    });
    cursorTarget(d, 'OPEN');
    studyGrid.appendChild(d);
  });

  /* ══ LIGHTBOX ═══════════════════════════════════════════════ */

  var lb = document.getElementById('lb');
  var lbStage = document.getElementById('lbStage');
  var lbTitle = document.getElementById('lbTitle');
  var lbCount = document.getElementById('lbCount');
  var lbList = [], lbIdx = 0;

  var lbReturn = null;
  function openLB(list, idx, title) {
    lbReturn = document.activeElement;
    lbList = list.slice(); lbIdx = Math.max(0, idx);
    lbTitle.textContent = title;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    if (window.__lenis) window.__lenis.stop();
    drawLB();
    document.getElementById('lbClose').focus();
  }
  function closeLB() {
    lb.hidden = true; lbStage.innerHTML = '';
    document.body.style.overflow = '';
    if (window.__lenis) window.__lenis.start();
    if (lbReturn && lbReturn.focus) lbReturn.focus();
  }
  function drawLB() {
    lbStage.innerHTML = '';
    var src = lbList[lbIdx];
    if (!src) return;
    var node;
    if (isVideo(src)) {
      node = document.createElement('video');
      node.src = src; node.controls = true; node.autoplay = true; node.loop = true;
      node.muted = true; node.playsInline = true;
    } else {
      node = document.createElement('img');
      node.src = src; node.alt = lbTitle.textContent;
    }
    lbStage.appendChild(node);
    lbCount.textContent = (lbIdx + 1) + ' / ' + lbList.length;
  }
  function stepLB(d) { lbIdx = (lbIdx + d + lbList.length) % lbList.length; drawLB(); }

  document.getElementById('lbClose').addEventListener('click', closeLB);
  document.getElementById('lbPrev').addEventListener('click', function () { stepLB(-1); });
  document.getElementById('lbNext').addEventListener('click', function () { stepLB(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target === lbStage) closeLB(); });

  document.addEventListener('keydown', function (e) {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLB();
      if (e.key === 'ArrowRight') stepLB(1);
      if (e.key === 'ArrowLeft') stepLB(-1);
      return;
    }
    var map = { '1': 'beauty', '2': 'clay', '3': 'wire', '4': 'depth' };
    if (map[e.key] && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) setPass(map[e.key]);
  });

  /* ══ RENDER PASSES ══════════════════════════════════════════ */

  var passBtns = document.querySelectorAll('[data-pass-btn]');
  var currentPass = 'beauty';

  function setPass(p) {
    currentPass = p;
    document.documentElement.setAttribute('data-pass', p);
    Array.prototype.forEach.call(passBtns, function (b) {
      var on = b.dataset.passBtn === p;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (window.HERO && window.HERO.setPass) window.HERO.setPass(p);
    if (p === 'depth') depthTick(); else clearDepth();
  }
  Array.prototype.forEach.call(passBtns, function (b) {
    b.addEventListener('click', function () { setPass(b.dataset.passBtn); });
  });

  var depthNodes = null;
  function depthTick() {
    if (currentPass !== 'depth') return;
    if (!depthNodes) depthNodes = document.querySelectorAll('.media');
    var h = window.innerHeight;
    Array.prototype.forEach.call(depthNodes, function (m) {
      var r = m.getBoundingClientRect();
      if (r.bottom < -200 || r.top > h + 200) return;
      var d = Math.abs((r.top + r.height / 2) - h / 2) / h; // 0 near → 1 far
      m.style.setProperty('--z', (1.25 - Math.min(1, d) * 1.05).toFixed(3));
    });
  }
  function clearDepth() {
    if (!depthNodes) return;
    Array.prototype.forEach.call(depthNodes, function (m) { m.style.removeProperty('--z'); });
  }

  /* ══ CURSOR ═════════════════════════════════════════════════ */

  var cursor = document.getElementById('cursor');
  var cursorLabel = document.getElementById('cursorLabel');
  var cx = 0, cy = 0, tx = 0, ty = 0;

  function openable(node, label, fn) {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', label);
    node.addEventListener('click', fn);
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
  }

  function cursorTarget(node, label) {
    if (touch) return;
    node.addEventListener('mouseenter', function () { cursor.classList.add('is-big'); cursorLabel.textContent = label; });
    node.addEventListener('mouseleave', function () { cursor.classList.remove('is-big'); cursorLabel.textContent = ''; });
  }
  if (!touch) {
    window.addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      cursor.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  /* ══ SPLIT TEXT ═════════════════════════════════════════════ */

  function splitWords(node) {
    var out = [];
    var walk = function (n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (piece) {
            if (!piece) return;
            if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(' ')); return; }
            var m = el('span', 'w-mask'), w = el('span', 'w-word', piece);
            m.appendChild(w); frag.appendChild(m); out.push(w);
          });
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    };
    walk(node);
    return out;
  }
  function splitChars(node) {
    var text = node.textContent, out = [];
    node.textContent = '';
    text.split('').forEach(function (ch) {
      if (ch === ' ') { node.appendChild(document.createTextNode(' ')); return; }
      var m = el('span', 'w-mask'), c = el('span', 'w-char', ch);
      m.appendChild(c); node.appendChild(m); out.push(c);
    });
    return out;
  }

  /* ══ MOTION ═════════════════════════════════════════════════ */

  var lenis = null;
  if (!reduced && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true, touchMultiplier: 1.6 });
    window.__lenis = lenis;
    lenis.stop();
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
    }
  }
  window.addEventListener('scroll', depthTick, { passive: true });

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      var target = id === '#top' ? document.body : document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.5 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  function buildMotion() {
    if (!hasGSAP || reduced) return;
    document.body.classList.add('js-anim');

    document.querySelectorAll('[data-split]').forEach(function (n) {
      var words = splitWords(n);
      gsap.to(words, {
        y: 0, duration: 1.05, ease: 'expo.out', stagger: 0.035,
        scrollTrigger: { trigger: n, start: 'top 86%' }
      });
    });
    document.querySelectorAll('[data-chars]').forEach(function (n) {
      if (n.closest('.hero')) return;
      var chars = splitChars(n);
      gsap.to(chars, {
        y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.03,
        scrollTrigger: { trigger: n, start: 'top 88%' }
      });
    });
    document.querySelectorAll('.reveal').forEach(function (n) {
      gsap.to(n, {
        opacity: 1, y: 0, duration: 1, ease: 'expo.out',
        scrollTrigger: { trigger: n, start: 'top 90%' }
      });
    });

    // pipeline: horizontal, pinned
    var track = document.getElementById('pipeTrack');
    var sticky = document.querySelector('.pipe__sticky');
    if (window.innerWidth > 760) {
      ScrollTrigger.create({
        trigger: '.pipeline', start: 'top top', end: function () { return '+=' + (track.scrollWidth - window.innerWidth + 400); },
        pin: sticky, scrub: 0.6, anticipatePin: 1,
        onUpdate: function (self) {
          var max = track.scrollWidth - window.innerWidth + parseFloat(getComputedStyle(track).paddingLeft) * 2;
          gsap.set(track, { x: -max * self.progress });
          var idx = Math.round(self.progress * (STEPS.length - 1));
          Array.prototype.forEach.call(track.children, function (li, i) { li.classList.toggle('is-on', i <= idx); });
        }
      });
    } else {
      Array.prototype.forEach.call(track.children, function (li) {
        ScrollTrigger.create({ trigger: li, start: 'top 80%', onEnter: function () { li.classList.add('is-on'); } });
      });
    }

    // plate parallax
    document.querySelectorAll('.world__plate .media img').forEach(function (img) {
      gsap.fromTo(img, { yPercent: -5, scale: 1.08 }, {
        yPercent: 5, ease: 'none',
        scrollTrigger: { trigger: img.closest('.world__plate'), start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    setTimeout(function () { ScrollTrigger.refresh(); }, 600);
  }

  /* ══ BOOT ═══════════════════════════════════════════════════ */

  var boot = document.getElementById('boot');
  var bootGrid = document.getElementById('bootGrid');
  var bootPct = document.getElementById('bootPct');
  var bootTask = document.getElementById('bootTask');
  var TASKS = ['allocating buckets', 'loading textures', 'building BVH', 'sampling 128/512', 'denoising', 'beauty pass'];

  var TILES = 16 * 9, tiles = [];
  for (var i = 0; i < TILES; i++) { var t = document.createElement('i'); bootGrid.appendChild(t); tiles.push(t); }
  var order = tiles.map(function (t, i) { return { t: t, k: Math.floor(i / 16) * 16 * 1.5 + (i % 16) + Math.random() * 10 }; })
    .sort(function (a, b) { return a.k - b.k; });

  var preload = [IMG + 'japa-render-1.webp', IMG + 'fudomyo-render-1.webp', IMG + 'koipond-render-2.webp'];
  var loaded = 0, ready = false;
  preload.forEach(function (src) {
    var im = new Image();
    im.onload = im.onerror = function () { loaded++; };
    im.src = src;
  });

  var p = 0, start = performance.now();
  (function tick() {
    var elapsed = (performance.now() - start) / 1000;
    var assetShare = loaded / preload.length;
    var target = Math.min(100, Math.max(elapsed / 2.6, 0) * 60 + assetShare * 40);
    if (elapsed > 6) target = 100; // never hang on a slow CDN
    p += (target - p) * 0.08;
    var shown = Math.min(100, Math.round(p));
    bootPct.textContent = String(shown).padStart(3, '0');
    bootTask.textContent = TASKS[Math.min(TASKS.length - 1, Math.floor(shown / 100 * TASKS.length))];
    var n = Math.floor(shown / 100 * order.length);
    for (var i = 0; i < n; i++) order[i].t.classList.add('on');
    if (shown >= 100 && !ready) { ready = true; finish(); }
    else requestAnimationFrame(tick);
  })();

  function finish() {
    setTimeout(function () {
      boot.classList.add('is-done');
      document.body.classList.remove('is-booting');
      if (lenis) lenis.start();
      if (window.HERO && window.HERO.start) window.HERO.start();
      heroIntro();
      buildMotion();
    }, 260);
  }

  function heroIntro() {
    var fam = document.querySelector('.hero__family');
    if (!hasGSAP || reduced) return;
    var chars = splitChars(fam);
    gsap.set(chars, { yPercent: 108 });
    var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to(chars, { yPercent: 0, duration: 1.25, stagger: 0.045 }, 0.1)
      .from('.hero__given', { opacity: 0, x: -16, duration: 1 }, 0.35)
      .from('.hero__eyebrow span', { opacity: 0, y: 12, duration: .9, stagger: .08 }, 0.5)
      .from('.hero__line', { opacity: 0, y: 18, duration: 1 }, 0.7)
      .from('.hero__hud', { opacity: 0, duration: .9 }, 0.85)
      .from('.topbar, .passbar, .hero__scroll', { opacity: 0, duration: .8, stagger: .06 }, 0.95);
  }

  /* ══ THE DESK ═══════════════════════════════════════════════ */
  var deskMount = document.getElementById('deskMount');
  if (deskMount) deskMount.appendChild(mediaBlock(VID + 'desk-hero.mp4', { ratio: 'media--desk' }));

  /* ══ ONE SMALL JOKE ═════════════════════════════════════════ */
  var egg = document.getElementById('egg');
  egg.addEventListener('click', function () {
    var img = new Image();
    img.src = IMG + 'manwiththestrawhat-flying.webp';
    img.className = 'egg-hat';
    img.alt = '';
    document.body.appendChild(img);
    if (hasGSAP) {
      gsap.fromTo(img, { y: 0, rotate: -20, opacity: 1 },
        { y: window.innerHeight * 1.35, rotate: 26, duration: 2.6, ease: 'power1.in',
          onComplete: function () { img.remove(); } });
    } else setTimeout(function () { img.remove(); }, 2000);
  });

})();
