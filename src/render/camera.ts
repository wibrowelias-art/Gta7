import { lerp } from './textures';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Cinematic camera: inertia, bounds, handheld sway, shake, tweened focus moves. */
export class Camera {
  x = 480;
  y = -140;
  zoom = 0.6;
  private vx = 0;
  private vy = 0;
  private target: CameraState | null = null;
  private targetT = 0;
  private targetDur = 1;
  private from: CameraState = { x: 0, y: 0, zoom: 1 };
  private shakeAmt = 0;
  private swayT = Math.random() * 100;
  private idleT = 0;
  bounds = { minX: 0, maxX: 960, minY: -2000, maxY: 60, minZoom: 0.3, maxZoom: 2.2 };
  /** Screen-space offsets applied this frame (sway + shake). */
  offX = 0;
  offY = 0;
  /** Pixels per second the camera moved this frame (for motion blur). */
  speed = 0;
  reduced = false;

  constructor(public viewW: number, public viewH: number) {}

  dragBy(dx: number, dy: number): void {
    this.target = null;
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.vx = (-dx / this.zoom) * 60;
    this.vy = (-dy / this.zoom) * 60;
    this.idleT = 0;
  }
  fling(vx: number, vy: number): void {
    this.vx = -vx / this.zoom;
    this.vy = -vy / this.zoom;
  }
  zoomAt(factor: number, sx: number, sy: number): void {
    this.target = null;
    const nz = Math.max(this.bounds.minZoom, Math.min(this.bounds.maxZoom, this.zoom * factor));
    // Keep the world point under the pointer fixed.
    const wx = this.x + (sx - this.viewW / 2) / this.zoom;
    const wy = this.y + (sy - this.viewH / 2) / this.zoom;
    this.zoom = nz;
    this.x = wx - (sx - this.viewW / 2) / nz;
    this.y = wy - (sy - this.viewH / 2) / nz;
    this.idleT = 0;
  }
  flyTo(x: number, y: number, zoom: number, dur = 1.1): void {
    this.from = { x: this.x, y: this.y, zoom: this.zoom };
    this.target = { x, y, zoom: Math.max(this.bounds.minZoom, Math.min(this.bounds.maxZoom, zoom)) };
    this.targetT = 0;
    this.targetDur = this.reduced ? 0.01 : dur;
    this.vx = this.vy = 0;
  }
  shake(strength: number): void {
    if (!this.reduced) this.shakeAmt = Math.max(this.shakeAmt, strength);
  }
  get moving(): boolean {
    return !!this.target || Math.abs(this.vx) + Math.abs(this.vy) > 2;
  }

  update(dt: number): void {
    const px = this.x;
    const py = this.y;
    if (this.target) {
      this.targetT += dt;
      const t = Math.min(1, this.targetT / this.targetDur);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      this.x = lerp(this.from.x, this.target.x, e);
      this.y = lerp(this.from.y, this.target.y, e);
      this.zoom = lerp(this.from.zoom, this.target.zoom, e);
      if (t >= 1) this.target = null;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const damp = Math.pow(0.08, dt);
      this.vx *= damp;
      this.vy *= damp;
    }
    // Soft bounds with a rubber band.
    const b = this.bounds;
    const halfW = this.viewW / 2 / this.zoom;
    const minX = Math.min(b.minX + halfW * 0.6, b.maxX - halfW * 0.6);
    const maxX = Math.max(b.maxX - halfW * 0.6, b.minX + halfW * 0.6);
    this.x = lerp(this.x, Math.max(minX, Math.min(maxX, this.x)), Math.min(1, dt * 8));
    this.y = lerp(this.y, Math.max(b.minY, Math.min(b.maxY, this.y)), Math.min(1, dt * 8));
    this.zoom = Math.max(b.minZoom, Math.min(b.maxZoom, this.zoom));
    // Idle handheld sway.
    this.idleT += dt;
    this.swayT += dt;
    const idle = Math.min(1, Math.max(0, (this.idleT - 1.5) / 2));
    const amp = this.reduced ? 0 : 2.2 * idle;
    this.offX = Math.sin(this.swayT * 0.6) * amp + Math.sin(this.swayT * 1.7) * amp * 0.4;
    this.offY = Math.cos(this.swayT * 0.45) * amp * 0.8 + Math.sin(this.swayT * 2.3) * amp * 0.3;
    if (this.shakeAmt > 0.01) {
      const s = this.shakeAmt * 14;
      this.offX += (Math.random() - 0.5) * s;
      this.offY += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.pow(0.02, dt);
    } else this.shakeAmt = 0;
    this.speed = Math.hypot(this.x - px, this.y - py) * this.zoom / Math.max(dt, 1e-3);
  }

  worldToScreen(wx: number, wy: number, parallax = 1): { x: number; y: number } {
    return {
      x: this.viewW / 2 + (wx - this.x * parallax) * this.zoom + this.offX,
      y: this.viewH / 2 + (wy - this.y * parallax) * this.zoom + this.offY,
    };
  }
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + (sx - this.viewW / 2 - this.offX) / this.zoom, y: this.y + (sy - this.viewH / 2 - this.offY) / this.zoom };
  }
}
