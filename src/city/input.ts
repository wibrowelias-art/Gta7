/** Unified keyboard + touch input for the city game. */
export interface InputState {
  /** Steering / movement, -1..1 (x = right, y = forward). */
  x: number;
  y: number;
  throttle: number; // 0..1
  brake: number; // 0..1
  handbrake: boolean;
  run: boolean;
  horn: boolean;
  /** Edge-triggered buttons. */
  action: boolean;
  reset: boolean;
  camera: boolean;
}

export class Input {
  state: InputState = { x: 0, y: 0, throttle: 0, brake: 0, handbrake: false, run: false, horn: false, action: false, reset: false, camera: false };
  private keys = new Set<string>();
  private pressedOnce = new Set<string>();
  touch = { x: 0, y: 0, gas: false, brake: false, hand: false, horn: false };
  touchUsed = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressedOnce.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private key(...names: string[]): boolean {
    return names.some((n) => this.keys.has(n));
  }

  /** Call once per frame. Edge buttons are true for exactly one frame. */
  poll(): InputState {
    const s = this.state;
    const kx = (this.key('d', 'arrowright') ? 1 : 0) - (this.key('a', 'arrowleft') ? 1 : 0);
    const ky = (this.key('w', 'arrowup') ? 1 : 0) - (this.key('s', 'arrowdown') ? 1 : 0);
    s.x = kx !== 0 ? kx : this.touch.x;
    s.y = ky !== 0 ? ky : this.touch.y;
    s.throttle = this.key('w', 'arrowup') || this.touch.gas ? 1 : Math.max(0, this.touch.y);
    s.brake = this.key('s', 'arrowdown') || this.touch.brake ? 1 : Math.max(0, -this.touch.y);
    s.handbrake = this.key(' ') || this.touch.hand;
    s.run = this.key('shift') || this.touch.gas;
    s.horn = this.key('h') || this.touch.horn;
    s.action = this.pressedOnce.has('e') || this.pressedOnce.has('enter') || this.pressedOnce.has('touch:action');
    s.reset = this.pressedOnce.has('r');
    s.camera = this.pressedOnce.has('c') || this.pressedOnce.has('touch:camera');
    this.pressedOnce.clear();
    return s;
  }

  /** Touch buttons call this for edge-triggered actions. */
  press(name: 'touch:action' | 'touch:camera'): void {
    this.pressedOnce.add(name);
  }
}
