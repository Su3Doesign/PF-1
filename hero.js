/* ══════════════════════════════════════════════════════════════
   hero.js — the hero plate resolves the way Arnold actually works:
   in buckets, noisy first, clean last. Every shot change re-renders.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SHOTS = [
    { src: 'assets/images/japa-render-1.webp', name: 'roman-no-yoake', res: '3840 × 2160', spp: '512 spp' },
    { src: 'assets/images/fudomyo-render-1.webp', name: 'fudo-myo-o', res: '3840 × 2160', spp: '640 spp' },
    { src: 'assets/images/koipond-render-2.webp', name: 'koi-pond', res: '1920 × 1080', spp: '384 spp' }
  ];

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.getElementById('heroCanvas');
  var fallback = document.getElementById('heroFallback');
  var stage = document.getElementById('heroStage');

  var hudShot = document.getElementById('hudShot');
  var hudName = document.getElementById('hudName');
  var hudRes = document.getElementById('hudRes');
  var hudSpp = document.getElementById('hudSpp');
  var hudTime = document.getElementById('hudTime');
  var hudFill = document.getElementById('hudFill');

  var idx = 0, started = false;
  var PASS = { beauty: 0, clay: 1, wire: 2, depth: 3 };

  /* ── plain fallback (no WebGL / no three) ─────────────────── */
  function fallbackMode() {
    canvas.style.display = 'none';
    fallback.classList.add('is-shown');
    fallback.style.transition = 'opacity .8s ease';
    window.HERO = {
      start: function () {
        if (reduced) return;
        setInterval(function () {
          idx = (idx + 1) % SHOTS.length;
          fallback.style.opacity = '0';
          setTimeout(function () {
            fallback.src = SHOTS[idx].src;
            fallback.style.opacity = '1';
            writeHud(1);
          }, 500);
        }, 7000);
      },
      setPass: function () {}
    };
  }

  function writeHud(progress) {
    if (!hudShot) return;
    var s = SHOTS[idx];
    hudShot.textContent = 'SHOT ' + String(idx + 1).padStart(2, '0') + '/0' + SHOTS.length;
    hudName.textContent = s.name;
    hudRes.textContent = s.res;
    hudSpp.textContent = progress < 1
      ? Math.round(progress * parseInt(s.spp, 10)) + ' / ' + s.spp
      : s.spp;
    if (hudFill) hudFill.style.transform = 'scaleX(' + progress.toFixed(3) + ')';
  }

  if (typeof window.THREE === 'undefined') { fallbackMode(); return; }

  /* ── shader ──────────────────────────────────────────────── */
  var VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uPrev, uNext;',
    'uniform vec2 uRes, uMouse;',
    'uniform float uPrevAspect, uNextAspect, uProgress, uPass, uTime, uEnter;',

    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',

    'vec2 cover(vec2 uv, float imgA){',
    '  float scrA = uRes.x / uRes.y;',
    '  vec2 s = scrA > imgA ? vec2(1.0, imgA / scrA) : vec2(scrA / imgA, 1.0);',
    '  return (uv - 0.5) * s + 0.5;',
    '}',

    'vec3 grade(vec3 c, vec2 uv){',
    '  if (uPass < 0.5) return c;',                                  // beauty
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  if (uPass < 1.5) return vec3(pow(l, 0.85)) * 0.86 + 0.06;',   // clay
    '  if (uPass < 2.5) {',                                          // wire
    '    vec2 g = fract(uv * vec2(46.0, 26.0));',
    '    float line = step(0.965, max(g.x, g.y));',
    '    return mix(c * 0.10, vec3(0.18, 0.83, 0.75), line * 0.55);',
    '  }',
    '  float d = clamp(mix(1.0 - uv.y, l, 0.45), 0.0, 1.0);',        // depth
    '  return vec3(pow(d, 1.5));',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    '  uv += uMouse * 0.014 * (1.0 - uv.y * 0.4);',
    '  vec2 uvP = cover(uv, uPrevAspect);',
    '  vec2 uvN = cover(uv, uNextAspect);',

    // bucket grid, scanline order with jitter
    '  vec2 grid = vec2(22.0, 13.0);',
    '  vec2 cell = floor(uv * grid);',
    '  float order = (cell.y * grid.x + cell.x) / (grid.x * grid.y);',
    '  order = mix(order, hash(cell), 0.30);',
    '  float reveal = smoothstep(order, order + 0.16, uProgress);',

    '  vec3 prev = texture2D(uPrev, clamp(uvP, 0.001, 0.999)).rgb;',
    '  vec3 next = texture2D(uNext, clamp(uvN, 0.001, 0.999)).rgb;',

    // sampling noise while the bucket is still resolving
    '  float n = hash(floor(uv * uRes / 3.0) + floor(uTime * 24.0));',
    '  float active = smoothstep(0.0, 0.35, reveal) * (1.0 - smoothstep(0.55, 1.0, reveal));',
    '  vec3 noisy = mix(next, vec3(n), 0.55) * (0.75 + n * 0.5);',
    '  vec3 col = mix(prev, mix(noisy, next, smoothstep(0.35, 1.0, reveal)), reveal);',

    // unresolved buckets sit on 18% grey
    '  col = mix(vec3(0.42), col, max(reveal, uEnter));',
    '  float edge = step(0.985, max(fract(uv.x * grid.x), fract(uv.y * grid.y)));',
    '  col += edge * active * 0.16;',

    '  col = grade(col, uv);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { fallbackMode(); return; }
  if (!renderer.getContext()) { fallbackMode(); return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  var camera = new THREE.Camera();
  var loader = new THREE.TextureLoader();

  var uniforms = {
    uPrev: { value: null }, uNext: { value: null },
    uPrevAspect: { value: 1.777 }, uNextAspect: { value: 1.777 },
    uProgress: { value: 0 }, uPass: { value: 0 }, uTime: { value: 0 }, uEnter: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0, 0) }
  };

  var mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms })
  );
  scene.add(mesh);

  function loadTex(src, cb) {
    loader.load(src, function (t) {
      if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      cb(t, t.image.width / t.image.height);
    }, undefined, function () { cb(null, 1.777); });
  }

  function size() {
    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w, h);
  }
  window.addEventListener('resize', size);
  size();

  window.addEventListener('mousemove', function (e) {
    uniforms.uMouse.value.set(
      (e.clientX / window.innerWidth - 0.5) * 2,
      (e.clientY / window.innerHeight - 0.5) * -2
    );
  });

  var clock = new THREE.Clock();
  var t0 = performance.now();
  var progress = 0, target = 0, holdUntil = 0, cycling = false;

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    return '00:' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function loop() {
    requestAnimationFrame(loop);
    uniforms.uTime.value = clock.getElapsedTime();

    progress += (target - progress) * 0.045;
    uniforms.uProgress.value = Math.min(1, progress);

    if (started && !reduced && progress > 0.985 && !cycling && performance.now() > holdUntil) {
      cycling = true;
      nextShot();
    }
    writeHud(Math.min(1, progress));
    if (hudTime) hudTime.textContent = fmtTime(performance.now() - t0);
    renderer.render(scene, camera);
  }

  function nextShot() {
    var prevTex = uniforms.uNext.value;
    var prevA = uniforms.uNextAspect.value;
    idx = (idx + 1) % SHOTS.length;
    loadTex(SHOTS[idx].src, function (tex, aspect) {
      if (!tex) { cycling = false; return; }
      uniforms.uPrev.value = prevTex;
      uniforms.uPrevAspect.value = prevA;
      uniforms.uNext.value = tex;
      uniforms.uNextAspect.value = aspect;
      progress = 0; target = 1;
      holdUntil = performance.now() + 7200;
      cycling = false;
    });
  }

  // first frame
  loadTex(SHOTS[0].src, function (tex, aspect) {
    if (!tex) { fallbackMode(); return; }
    uniforms.uPrev.value = tex;
    uniforms.uNext.value = tex;
    uniforms.uPrevAspect.value = aspect;
    uniforms.uNextAspect.value = aspect;
    loop();
  });

  window.HERO = {
    start: function () {
      started = true;
      target = 1;
      holdUntil = performance.now() + 7200;
      if (reduced) { progress = 1; uniforms.uProgress.value = 1; }
    },
    setPass: function (p) {
      uniforms.uPass.value = PASS[p] != null ? PASS[p] : 0;
    }
  };
})();
