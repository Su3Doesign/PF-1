// A small reticle that grows over anything you can open, with a label.
export class Cursor {
  private el = document.getElementById('cursor');
  private label = document.getElementById('cursor-label');
  private x = -100; private y = -100; private cx = -100; private cy = -100;
  private hotDom = false;
  private hot3d: string | null = null;

  constructor() {
    if (!this.el || matchMedia('(hover: none), (pointer: coarse)').matches) return;
    addEventListener('pointermove', (e) => { this.x = e.clientX; this.y = e.clientY; }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const t = (e.target as HTMLElement).closest('a, button, [data-cursor]') as HTMLElement | null;
      this.hotDom = !!t;
      this.render();
    });
    const loop = () => {
      this.cx += (this.x - this.cx) * 0.24;
      this.cy += (this.y - this.cy) * 0.24;
      this.el!.style.transform = `translate3d(${this.cx.toFixed(1)}px, ${this.cy.toFixed(1)}px, 0)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  set3d(label: string | null) { this.hot3d = label; this.render(); }
  setDrag(on: boolean) { this.el?.classList.toggle('is-drag', on); }

  private render() {
    if (!this.el || !this.label) return;
    const label = this.hot3d;
    this.el.classList.toggle('is-hot', this.hotDom || !!label);
    this.el.classList.toggle('has-label', !!label);
    if (label) this.label.textContent = label;
  }
}
