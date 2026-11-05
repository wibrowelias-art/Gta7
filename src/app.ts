import { HOURS_PER_SECOND, newGame, step, type ActionResult } from './game/sim';
import { loadFromStorage, saveToStorage, clearStorage } from './game/save';
import type { GameState, SimEffect } from './game/types';
import { prefersReducedMotion } from './ui/dom';

export type PanelName = 'team' | 'hire' | 'build' | 'room' | 'treasury' | 'chat' | 'settings' | 'menu';

export interface SceneApi {
  update(dt: number, s: GameState): void;
  resize(): void;
  focusRoom(roomId: string, zoom?: boolean): void;
  focusWorker(workerId: string): void;
  workerScreenPos(workerId: string): { x: number; y: number } | null;
  roomScreenPos(roomId: string): { x: number; y: number } | null;
  shake(strength?: number): void;
  setQuality(tier: 'high' | 'balanced' | 'battery'): void;
  establishingShot(): void;
  setPaused(p: boolean): void;
  destroy(): void;
  /** Normalised camera centre for the radar (floor index as float, x 0..1). */
  cameraFocus(): { floor: number; x: number; zoom: number };
  animate(workerId: string, anim: 'highfive' | 'stomp' | 'celebrate' | 'stretch'): void;
}

export interface AudioApi {
  play(name: 'tap' | 'open' | 'close' | 'coin' | 'register' | 'ding' | 'notify' | 'cheer' | 'error' | 'levelup' | 'whoosh' | 'pop'): void;
  setMusic(v: number): void;
  setSfx(v: number): void;
  setTimeOfDay(hour: number, rain: boolean): void;
  setCameraFloor(floor: number): void;
  resume(): void;
}

type Listener = (payload: any) => void;

export class App {
  state: GameState;
  scene: SceneApi | null = null;
  audio: AudioApi | null = null;
  hover: { kind: 'room' | 'worker' | 'slot' | 'elevator'; id: string; label: string } | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private last = 0;
  private saveTimer = 0;
  private raf = 0;
  reducedMotion = false;
  quality: 'high' | 'balanced' | 'battery' = 'balanced';
  readonly isNew: boolean;

  constructor() {
    const loaded = loadFromStorage();
    this.state = loaded ?? newGame();
    this.isNew = !loaded;
    this.reducedMotion = this.state.settings.reducedMotion || prefersReducedMotion();
    document.documentElement.classList.toggle('reduced-motion', this.reducedMotion);
  }

  on(event: string, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  emit(event: string, payload?: unknown): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  start(): void {
    this.last = performance.now();
    const loop = (t: number) => {
      const dtMs = Math.min(100, t - this.last);
      this.last = t;
      const dt = dtMs / 1000;
      const s = this.state;
      const blocked = s.paused || s.company === '' || !!s.pendingMilestone || !!s.pendingReport || s.events.length > 0 || this.modalOpen;
      if (!blocked) {
        const fx = step(s, dt * HOURS_PER_SECOND * s.speed);
        if (fx.length) this.dispatch(fx);
      }
      this.scene?.update(dt, s);
      this.emit('frame', dt);
      this.saveTimer += dt;
      if (this.saveTimer > 4) {
        this.saveTimer = 0;
        this.save();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
      else this.last = performance.now();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  modalOpen = false;

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  save(): void {
    saveToStorage(this.state);
  }

  reset(): void {
    clearStorage();
    this.state = newGame();
    this.emit('reset');
    this.save();
  }

  /** Run a sim action, surface errors as toasts, dispatch effects. Returns success. */
  act(result: ActionResult, sfx: Parameters<AudioApi['play']>[0] | null = 'tap'): boolean {
    if (!result.ok) {
      this.emit('toast', { text: result.error, tone: 'bad' });
      this.audio?.play('error');
      return false;
    }
    if (sfx) this.audio?.play(sfx);
    this.dispatch(result.fx);
    this.emit('change');
    return true;
  }

  dispatch(fx: SimEffect[]): void {
    for (const f of fx) this.emit('fx', f);
  }

  openPanel(name: PanelName, params?: Record<string, unknown>): void {
    this.emit('panel', { name, params });
  }
  closePanel(): void {
    this.emit('panel', { name: null });
  }
}
