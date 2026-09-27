// Labels that decode from half-width katakana, like a signal locking on.
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ0123456789';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const running = new WeakMap<HTMLElement, number>();

export function decode(el: HTMLElement | null, text: string, per = 22, hold = 180) {
  if (!el) return;
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  el.setAttribute('aria-label', text);
  if (reduced) { el.textContent = text; return; }
  const chars = Array.from(text);
  const t0 = performance.now();
  let last = 0;
  const step = (now: number) => {
    if (now - last > 42) {
      last = now;
      const e = now - t0;
      let out = '';
      let done = true;
      chars.forEach((c, i) => {
        if (c === ' ' || c === '·' || e >= i * per + hold) out += c;
        else { done = false; out += GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
      });
      el.textContent = out;
      if (done) { el.textContent = text; running.delete(el); return; }
    }
    running.set(el, requestAnimationFrame(step));
  };
  running.set(el, requestAnimationFrame(step));
}
