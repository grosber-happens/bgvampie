/** Keyboard + pointer-lock mouse input for a third-person shooter. */
export class Input {
  keys = new Set<string>();
  firing = false;
  /** Right mouse held: aim down sights. */
  aiming = false;
  yaw = 0;
  /** Positive pitch looks up. */
  pitch = -0.12;
  locked = false;
  /** Keys pressed since the last frame (one entry per press, key repeat ignored). */
  private presses = new Set<string>();
  private sensitivity = 0.0022;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.presses.add(e.code);
      this.keys.add(e.code);
      // Stop the page from scrolling or toggling things while playing.
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
      this.aiming = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.firing = false;
        this.aiming = false;
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const sens = this.sensitivity * (this.aiming ? 0.55 : 1);
      this.yaw += e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = Math.max(-1.1, Math.min(0.9, this.pitch));
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.firing = true;
      if (e.button === 2 && this.locked) this.aiming = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aiming = false;
    });
  }

  lock() {
    // Some browsers return a promise, some do not.
    const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    r?.catch?.(() => undefined);
  }

  axis(neg: string, pos: string): number {
    return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0);
  }

  /** True once per key press. */
  consume(...codes: string[]): boolean {
    let hit = false;
    for (const c of codes) {
      if (this.presses.delete(c)) hit = true;
    }
    return hit;
  }

  /** Drop presses nobody used this frame so they do not fire later. */
  endFrame() {
    this.presses.clear();
  }

  /** Test hook: simulate a key press. */
  press(code: string) {
    this.presses.add(code);
  }
}
