// The mark, drawn live. One full-screen pass: each face is a signed-distance shape filled with a piece of work.
// Because every pixel knows its distance to each face, a face can swell open with a liquid edge until it fills the screen.
(function () {
  const VERT = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

  // cursor wake: a small velocity field that fades, written every frame
  // and, in its third channel, a paint mask: where the cursor has been, healing back slowly
  const FLOW = `#version 300 es
precision highp float; uniform sampler2D uPrev; uniform vec2 uRes, uPos, uVel; uniform float uAspect; out vec4 o;
void main() { vec2 uv = gl_FragCoord.xy / uRes; vec4 pr = texture(uPrev, uv); vec2 v = pr.rg - 0.5; v *= 0.955;
  vec2 d = (uv - uPos) * vec2(uAspect, 1.0); float k = exp(-dot(d, d) / 0.0035); v += uVel * k;
  float m = max(0.0, pr.b * 0.986 - 0.004) + exp(-dot(d, d) / 0.0032) * clamp(length(uVel) * 9.0, 0.0, 1.0) * 0.3;
  o = vec4(clamp(v, -0.5, 0.5) + 0.5, min(m, 1.0), 1.0); }`;

  const MAIN = `#version 300 es
precision highp float;
uniform vec2 uRes, uMouse, uClick; uniform float uTime, uDpr, uInk, uDim, uSwap, uRipple, uGrain;
uniform vec2 uPts[18]; uniform float uGrow[3], uAlpha[3], uSat[3], uEdge[3], uDepth[3], uZoom[3];
uniform vec4 uRect[3]; uniform vec2 uFocal[3], uImg[3]; uniform int uActive, uSwapTo;
uniform sampler2D uT0, uT1, uT2, uB0, uB1, uB2, uFlow; uniform float uMix[3]; uniform vec3 uPaper, uInkCol, uAccent; uniform float uReveal, uTopo; uniform vec2 uPosPx;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return 0.6 * noise(p) + 0.3 * noise(p * 2.1 + 3.7) + 0.1 * noise(p * 4.3 + 9.1); }
float parabola(float x) { return 4.0 * x * (1.0 - x); }
float sdFace(vec2 p, int b) { float d = dot(p - uPts[b], p - uPts[b]), s = 1.0;
  for (int i = 0, j = 5; i < 6; j = i, i++) { vec2 e = uPts[b + j] - uPts[b + i], w = p - uPts[b + i]; vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0); d = min(d, dot(q, q));
    bvec3 c = bvec3(p.y >= uPts[b + i].y, p.y < uPts[b + j].y, e.x * w.y > e.y * w.x); if (all(c) || all(not(c))) s = -s; }
  return s * sqrt(d); }
vec3 texA(int t, vec2 uv) { return t == 0 ? texture(uT0, uv).rgb : t == 1 ? texture(uT1, uv).rgb : texture(uT2, uv).rgb; }
vec3 texB(int t, vec2 uv) { return t == 0 ? texture(uB0, uv).rgb : t == 1 ? texture(uB1, uv).rgb : texture(uB2, uv).rgb; }
vec3 tex(int t, vec2 uv) { uv = clamp(uv, 0.001, 0.999); float m = uMix[t]; if (m <= 0.0) return texA(t, uv); if (m >= 1.0) return texB(t, uv);
  float n = noise(uv * vec2(3.2, 2.4) + float(t) * 7.31) * 0.7 + noise(uv * 9.0 - float(t) * 3.1) * 0.3; float w = smoothstep(n * 0.62, n * 0.62 + 0.38, m);
  return mix(texA(t, uv), texB(t, uv), w); }
// the picture is fitted to cover its box, like object-fit: cover, around a focal point
vec2 cover(vec2 q, vec4 rect, vec2 img, vec2 focal, float zoom) { float ra = rect.z / rect.w, ia = img.x / img.y; vec2 s = (ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0)) / zoom; return (q - 0.5) * s + 0.5 + (focal - 0.5) * (1.0 - s); }
vec3 picture(int t, vec2 uv, vec2 fl) { float m = length(fl); return vec3(tex(t, uv - fl * 0.20).r, tex(t, uv - fl * 0.16).g, tex(t, uv - fl * 0.12).b) + m * 0.25; }
float lum(int t, vec2 uv) { return dot(tex(t, uv), vec3(0.299, 0.587, 0.114)); }
// the same picture as a construction drawing: its edges in ink on paper, over a drafting grid
vec3 drawing(int t, vec2 uv, vec2 p) { vec2 e = 1.1 / uImg[t];
  float tl = lum(t, uv + vec2(-e.x, -e.y)), tc = lum(t, uv + vec2(0.0, -e.y)), tr = lum(t, uv + vec2(e.x, -e.y)), ml = lum(t, uv + vec2(-e.x, 0.0)), mr = lum(t, uv + vec2(e.x, 0.0)), bl = lum(t, uv + vec2(-e.x, e.y)), bc = lum(t, uv + vec2(0.0, e.y)), br = lum(t, uv + vec2(e.x, e.y));
  float g = length(vec2(-tl - 2.0 * ml - bl + tr + 2.0 * mr + br, -tl - 2.0 * tc - tr + bl + 2.0 * bc + br));
  float ln = smoothstep(0.14, 0.5, g);
  vec2 gp = p / (22.0 * uDpr); vec2 gd = abs(fract(gp) - 0.5) / fwidth(gp); float grid = 1.0 - clamp(min(gd.x, gd.y) - 0.5, 0.0, 1.0);
  vec2 gq = p / (110.0 * uDpr); vec2 gq2 = abs(fract(gq) - 0.5) / fwidth(gq); float major = 1.0 - clamp(min(gq2.x, gq2.y) - 0.5, 0.0, 1.0);
  vec3 c = uPaper * 0.985; c = mix(c, uInkCol, grid * 0.07 + major * 0.1); return mix(c, uInkCol, ln * 0.86); }
vec3 face(int i, vec2 p, vec2 fl) {
  vec4 rect = uRect[i]; vec2 q = (p - rect.xy) / rect.zw; bool act = i == uActive;
  vec2 uv = cover(q, rect, uImg[i], uFocal[i], uZoom[i]) - uMouse * uDepth[i];
  // a ring travels out from where you clicked
  if (uRipple > 0.0 && uRipple < 1.0) { vec2 dv = p - uClick; float d = length(dv) / uRes.y, ring = d - uRipple * 1.6; uv += normalize(dv + 0.0001) * sin(ring * 38.0) * exp(-ring * ring * 60.0) * 0.022 * (1.0 - uRipple); }
  vec3 c = picture(i, uv, fl);
  if (act && uSwap > 0.0) { // the next section rises through this one like liquid
    float dt = parabola(uSwap); vec2 uvB = cover(q, rect, uImg[uSwapTo], uFocal[uSwapTo], 1.0 + 0.18 * (1.0 - uSwap));
    float n = fbm(q * vec2(3.0, 2.0) + uTime * 0.15); float w = smoothstep(-0.06, 0.06, uSwap * 1.7 - (1.0 - q.y) - (n - 0.5) * 0.7);
    vec2 warp = vec2(0.0, (n - 0.5) * 0.16 * dt); vec3 a = picture(i, uv + warp, fl + vec2(dt * 0.06, 0.0)); vec3 b = picture(uSwapTo, uvB - warp, fl + vec2(dt * 0.06, 0.0));
    c = mix(a, b, w); c += smoothstep(0.08, 0.0, abs(uSwap * 1.7 - (1.0 - q.y) - (n - 0.5) * 0.7)) * 0.35 * dt; }
  float g = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(mix(vec3(g), uPaper, 0.55), c, uSat[i]);
  // where the cursor has passed, the finished world gives way to its drawing; the boundary is liquid and catches the accent
  if (uReveal > 0.001) { float mk = texture(uFlow, gl_FragCoord.xy / uRes).b; float n = fbm(p / uRes.y * 9.0 + uTime * 0.5) - 0.5; float f = mk + n * 0.22;
    if (f > 0.25) { float r = smoothstep(0.3, 0.36, f) * uReveal; c = mix(c, drawing(i, uv, p), r); float rim = 1.0 - clamp(abs(f - 0.33) / max(fwidth(f), 1e-4) - 0.6, 0.0, 1.0); c = mix(c, uAccent, rim * uReveal); } }
  return c; }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 fl = texture(uFlow, gl_FragCoord.xy / uRes).rg - 0.5; fl *= smoothstep(0.012, 0.06, length(fl)); fl.y = -fl.y;
  vec3 col = vec3(0.0); float al = 0.0;
  for (int k = 0; k < 3; k++) { int i = k < 2 ? (k >= uActive && uActive >= 0 ? k + 1 : k) : (uActive >= 0 ? uActive : 2);
    if (uAlpha[i] <= 0.001) continue;
    float sd = sdFace(p, i * 6) - uGrow[i] + (fbm(p / uRes.y * 5.0 + uTime * 0.35 + float(i) * 7.0) - 0.5) * uEdge[i];
    float m = smoothstep(1.0, -1.0, sd) * uAlpha[i]; if (m <= 0.001 && abs(sd) > 4.0 * uDpr) continue;
    vec3 c = face(i, p, fl);
    c += smoothstep(-26.0 * uDpr, 0.0, sd) * uEdge[i] * 0.004;            // the swelling edge catches light
    float ink = smoothstep(1.7 * uDpr, 0.6 * uDpr, abs(sd)) * uInk * uAlpha[i]; c = mix(c, uInkCol, ink); m = max(m, ink);
    col = col * (1.0 - m) + c * m; al = al + m * (1.0 - al); }
  // the ground: a contour map that drifts, and rises into a hill under the cursor
  if (uTopo > 0.001) { vec2 q = p / uRes.y; vec2 dm = (p - uPosPx) / uRes.y;
    float h = fbm(q * 1.35 + vec2(uTime * 0.012, -uTime * 0.008)) * 1.25 + fbm(q * 3.1 - uTime * 0.01) * 0.18 + 0.22 * exp(-dot(dm, dm) / 0.028);
    float f = h * 16.0; float dd = abs(fract(f + 0.5) - 0.5) / max(fwidth(f), 1e-4); float idx = floor(f + 0.5);
    bool maj = mod(idx, 5.0) < 0.5; float line = 1.0 - clamp(dd - (maj ? 0.7 : 0.35), 0.0, 1.0);
    float a = line * (maj ? 0.14 : 0.065) * uTopo * (1.0 - al);
    col += uInkCol * a; al += a; }
  col *= 1.0 - uDim * al;
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain * al;
  o = vec4(col, al); }`;

  window.makeMarkGL = function (canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true }); if (!gl) return null;
    const sh = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
    const prog = (fs) => { const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, fs); if (!v || !f) return null; const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p); return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null; };
    const pMain = prog(MAIN), pFlow = prog(FLOW); if (!pMain || !pFlow) return null;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = (p, n) => gl.getUniformLocation(p, n);
    // textures for the three covers
    const texs = [0, 1, 2].map(() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 20, 255])); return t; });
    const texB = [0, 1, 2].map(() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 20, 255])); return t; });
    const img = [[1, 1], [1, 1], [1, 1]];
    // the next picture for a face goes into its second slot; once the dissolve is done the two slots trade places
    function setNext(i, im) { gl.bindTexture(gl.TEXTURE_2D, texB[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    function settle(i, im) { const t = texs[i]; texs[i] = texB[i]; texB[i] = t; s.mix[i] = 0; if (im) img[i] = [im.naturalWidth || im.width, im.naturalHeight || im.height]; }
    function setImage(i, im) { gl.bindTexture(gl.TEXTURE_2D, texs[i]); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); img[i] = [im.naturalWidth || im.width, im.naturalHeight || im.height]; }
    // the wake: two small targets, ping-pong
    const FW = 128, FH = 128; const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, (() => { const a = new Uint8Array(FW * FH * 4); for (let i = 0; i < a.length; i += 4) { a[i] = 128; a[i + 1] = 128; a[i + 2] = 255; a[i + 3] = 255; } return a; })()); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f }; };
    let fa = mk(), fb = mk(); gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const s = { pts: new Float32Array(36), grow: [-60, -60, -60], alpha: [1, 1, 1], sat: [1, 1, 1], edge: [0, 0, 0], depth: [0.012, 0.018, 0.024], zoom: [1.12, 1.12, 1.12], rect: new Float32Array(12), focal: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      active: -1, swapTo: 0, swap: 0, ink: 1, dim: 0, ripple: 0, click: [0, 0], mouse: [0, 0], pos: [0.5, 0.5], vel: [0, 0], grain: 0.03, paper: [0.902, 0.89, 0.867], inkCol: [0.05, 0.05, 0.05], accent: [0.76, 0.255, 0.047], reveal: 0, topo: 0, mix: [0, 0, 0] };
    let W = 0, H = 0, dpr = 1;
    function resize() { dpr = Math.min(window.devicePixelRatio || 1, 1.5); const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr); if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; } return dpr; }
    function render(time) {
      resize();
      // wake
      gl.useProgram(pFlow); gl.bindFramebuffer(gl.FRAMEBUFFER, fb.f); gl.viewport(0, 0, FW, FH); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fa.t);
      gl.uniform1i(U(pFlow, 'uPrev'), 0); gl.uniform2f(U(pFlow, 'uRes'), FW, FH); gl.uniform2f(U(pFlow, 'uPos'), s.pos[0], 1 - s.pos[1]); gl.uniform2f(U(pFlow, 'uVel'), s.vel[0], -s.vel[1]); gl.uniform1f(U(pFlow, 'uAspect'), W / H);
      gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3); const t = fa; fa = fb; fb = t; s.vel[0] *= 0.6; s.vel[1] *= 0.6;
      // the mark
      gl.useProgram(pMain); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      texs.forEach((tx, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(U(pMain, 'uT' + i), i); });
      texB.forEach((tx, i) => { gl.activeTexture(gl.TEXTURE4 + i); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(U(pMain, 'uB' + i), 4 + i); }); gl.uniform1fv(U(pMain, 'uMix'), s.mix);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, fa.t); gl.uniform1i(U(pMain, 'uFlow'), 3);
      gl.uniform2f(U(pMain, 'uRes'), W, H); gl.uniform1f(U(pMain, 'uTime'), time); gl.uniform1f(U(pMain, 'uDpr'), dpr); gl.uniform2f(U(pMain, 'uMouse'), s.mouse[0], s.mouse[1]); gl.uniform2f(U(pMain, 'uClick'), s.click[0] * dpr, s.click[1] * dpr);
      gl.uniform2fv(U(pMain, 'uPts'), s.pts.map(v => v * dpr)); gl.uniform1fv(U(pMain, 'uGrow'), s.grow.map(v => v * dpr)); gl.uniform1fv(U(pMain, 'uAlpha'), s.alpha); gl.uniform1fv(U(pMain, 'uSat'), s.sat); gl.uniform1fv(U(pMain, 'uEdge'), s.edge.map(v => v * dpr)); gl.uniform1fv(U(pMain, 'uDepth'), s.depth); gl.uniform1fv(U(pMain, 'uZoom'), s.zoom);
      gl.uniform4fv(U(pMain, 'uRect'), s.rect.map(v => v * dpr)); gl.uniform2fv(U(pMain, 'uFocal'), s.focal); gl.uniform2fv(U(pMain, 'uImg'), img.flat());
      gl.uniform1i(U(pMain, 'uActive'), s.active); gl.uniform1i(U(pMain, 'uSwapTo'), s.swapTo); gl.uniform1f(U(pMain, 'uSwap'), s.swap); gl.uniform1f(U(pMain, 'uInk'), s.ink); gl.uniform1f(U(pMain, 'uDim'), s.dim); gl.uniform1f(U(pMain, 'uRipple'), s.ripple); gl.uniform1f(U(pMain, 'uGrain'), s.grain);
      gl.uniform3fv(U(pMain, 'uPaper'), s.paper); gl.uniform3fv(U(pMain, 'uInkCol'), s.inkCol); gl.uniform3fv(U(pMain, 'uAccent'), s.accent);
      gl.uniform1f(U(pMain, 'uReveal'), s.reveal); gl.uniform1f(U(pMain, 'uTopo'), s.topo); gl.uniform2f(U(pMain, 'uPosPx'), s.pos[0] * W, s.pos[1] * H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return { s, render, setImage, setNext, settle };
  };
})();
