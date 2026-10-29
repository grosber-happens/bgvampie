/** Keyboard + pointer-lock mouse input for a third-person shooter. */
export class Input {
  keys = new Set<string>();
  firing = false;
  yaw = 0;
  /** Positive pitch looks up. */
  pitch = -0.12;
  locked = false;
  private dashQueued = false;
  private sensitivity = 0.0022;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.dashQueued = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.firing = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw += e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-0.9, Math.min(0.6, this.pitch));
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
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

  consumeDash(): boolean {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }
}
