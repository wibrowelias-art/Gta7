import { Application, Container } from 'pixi.js';
import type { App, SceneApi } from '../app';
import type { GameState, Room } from '../game/types';
import { ELEVATOR_X, SLOT_X, roomName } from '../game/sim';
import { ROOMS } from '../game/data';
import { atmosphere } from './sky';
import { Sky } from './sky';
import { City } from './city';
import { Building, FH, WB, ELEV_W, roomRect } from './building';
import { WorkerView, WORKER_H } from './workers';
import { Camera } from './camera';
import { createPost } from './post';
import { TIERS, type Tier, type TierConfig } from './quality';
import { TextureBudget } from './textures';

type Hit = { kind: 'room'; id: string; room: Room } | { kind: 'worker'; id: string } | { kind: 'slot'; id: string; floor: number; slot: number } | { kind: 'elevator'; id: string } | null;

const PARALLAX = { far: 0.14, mid: 0.38, air: 0.5, near: 0.82, building: 1 };

export async function createScene(container: HTMLElement, app: App, tierIn: Tier): Promise<SceneApi> {
  await (document.fonts?.load('700 20px "Barlow Condensed"').catch(() => undefined) ?? Promise.resolve());

  let cfg: TierConfig = TIERS[tierIn];
  const pixi = new Application();
  const dpr = () => Math.min(window.devicePixelRatio || 1, cfg.dpr);
  await pixi.init({
    resizeTo: container,
    antialias: cfg.antialias,
    resolution: dpr(),
    autoDensity: true,
    backgroundAlpha: 0,
    preference: 'webgl',
    autoStart: false,
    sharedTicker: false,
    powerPreference: cfg.tier === 'battery' ? 'low-power' : 'high-performance',
  });
  pixi.ticker.stop();
  container.appendChild(pixi.canvas);
  pixi.canvas.setAttribute('aria-hidden', 'true');

  const reduced = app.reducedMotion;
  const viewW = () => container.clientWidth || 1;
  const viewH = () => container.clientHeight || 1;
  const camera = new Camera(viewW(), viewH());
  camera.reduced = reduced;

  // Layers.
  const budget = new TextureBudget(cfg.textureBudgetMP);
  const sky = new Sky(reduced);
  const world = new Container(); // post-processed
  const city = new City(pixi.renderer, budget, cfg, WB);
  const building = new Building(pixi.renderer, budget, cfg, dpr());
  building.workersLayer.sortableChildren = true;
  const layers = { far: city.far, mid: city.mid, air: city.air, near: city.near, building: building.view };
  world.addChild(sky.view, city.far, city.mid, city.air, city.near, building.view);
  pixi.stage.addChild(world);
  const post = createPost();
  await post.apply(world, cfg);

  const workerViews = new Map<string, WorkerView>();
  let t = 0;
  let hovered: Hit = null;
  let lastSig = '';
  let paused = false;
  let hoverPromptKey = '';

  const defaultZoom = () => {
    const w = viewW();
    const h = viewH();
    if (w < 700) return Math.max(0.5, Math.min(0.85, w / (WB * 1.02)));
    return Math.max(0.6, Math.min(1.25, Math.min(w / (WB + 160), h / (FH * 3.4))));
  };
  const homeY = () => -FH * 0.62;

  const syncBounds = (s: GameState) => {
    camera.bounds.minY = -s.floors * FH - 260;
    camera.bounds.maxY = 40;
  };

  const hitTest = (sx: number, sy: number, s: GameState): Hit => {
    const p = camera.screenToWorld(sx, sy);
    // Workers first (generous touch target).
    let best: WorkerView | null = null;
    let bestD = 1e9;
    for (const wv of workerViews.values()) {
      const dx = Math.abs(p.x - wv.x);
      const dy = p.y - (wv.y - WORKER_H / 2);
      const pad = Math.max(22, 24 / camera.zoom);
      if (dx < pad && Math.abs(dy) < WORKER_H / 2 + pad * 0.5) {
        const d = dx + Math.abs(dy);
        if (d < bestD) {
          bestD = d;
          best = wv;
        }
      }
    }
    if (best) return { kind: 'worker', id: best.worker.id };
    if (p.x < -16 || p.x > WB + 16 || p.y > 0) return null;
    const floor = Math.floor(-p.y / FH);
    if (floor < 0 || floor >= s.floors) return null;
    const fx = p.x / WB;
    if (Math.abs(fx - ELEVATOR_X) < (ELEV_W / 2) / WB) return { kind: 'elevator', id: `elev-${floor}` };
    for (let slot = 0; slot < 3; slot++) {
      const [a, b] = SLOT_X[slot];
      if (fx >= a && fx <= b) {
        const room = s.rooms.find((r) => r.floor === floor && r.slot === slot);
        if (room) return { kind: 'room', id: room.id, room };
        return { kind: 'slot', id: `slot-${floor}-${slot}`, floor, slot };
      }
    }
    return null;
  };

  const promptFor = (hit: Hit, s: GameState): { verb: string; text: string } | null => {
    if (!hit) return null;
    if (hit.kind === 'room') return { verb: 'Tap', text: `to enter ${roomName(s, hit.room)}` };
    if (hit.kind === 'worker') {
      const w = s.workers.find((x) => x.id === hit.id);
      return w ? { verb: 'Tap', text: `to talk to ${w.name}` } : null;
    }
    if (hit.kind === 'slot') return { verb: 'Tap', text: `to build on floor ${hit.floor + 1}` };
    return { verb: 'Elevator', text: 'carries your team between floors' };
  };

  const onTap = (sx: number, sy: number) => {
    const s = app.state;
    const hit = hitTest(sx, sy, s);
    if (!hit) {
      app.closePanel();
      return;
    }
    app.audio?.play('tap');
    if (hit.kind === 'room') app.openPanel('room', { roomId: hit.id });
    else if (hit.kind === 'worker') app.openPanel('team', { workerId: hit.id });
    else if (hit.kind === 'slot') app.openPanel('build', { floor: hit.floor, slot: hit.slot });
    else app.emit('prompt', promptFor(hit, s));
  };

  const onDoubleTap = (sx: number, sy: number) => {
    const s = app.state;
    const hit = hitTest(sx, sy, s);
    if (hit && hit.kind === 'room') focusRoom(hit.id, true);
    else {
      const p = camera.screenToWorld(sx, sy);
      camera.flyTo(p.x, p.y, camera.zoom > defaultZoom() * 1.3 ? defaultZoom() : defaultZoom() * 1.8, 0.8);
    }
  };

  // Pointer handling: pan, fling, pinch, tap, double tap, hover.
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt = 0;
  let downPos = { x: 0, y: 0 };
  let moved = false;
  let lastTap = 0;
  let lastMove = { x: 0, y: 0, t: 0 };
  let vel = { x: 0, y: 0 };
  let pinchDist = 0;
  const canvas = pixi.canvas;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
      lastMove = { x: e.clientX, y: e.clientY, t: downAt };
      vel = { x: 0, y: 0 };
      moved = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      // Hover (mouse only).
      if (e.pointerType === 'mouse') {
        const hit = hitTest(e.clientX, e.clientY, app.state);
        const key = hit ? `${hit.kind}:${hit.id}` : '';
        hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        if (key !== hoverPromptKey) {
          hoverPromptKey = key;
          app.emit('prompt', promptFor(hit, app.state));
        }
      }
      return;
    }
    const now = performance.now();
    if (pointers.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (!moved && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) moved = true;
      if (moved) camera.dragBy(dx, dy);
      const dt = Math.max(1, now - lastMove.t);
      vel = { x: ((e.clientX - lastMove.x) / dt) * 1000, y: ((e.clientY - lastMove.y) / dt) * 1000 };
      lastMove = { x: e.clientX, y: e.clientY, t: now };
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) camera.zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
      moved = true;
    }
  });
  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      const now = performance.now();
      if (!moved && now - downAt < 400) {
        if (now - lastTap < 320) {
          onDoubleTap(e.clientX, e.clientY);
          lastTap = 0;
        } else {
          lastTap = now;
          onTap(e.clientX, e.clientY);
        }
      } else if (moved && now - lastMove.t < 60) camera.fling(vel.x * 0.9, vel.y * 0.9);
    }
    pinchDist = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
  canvas.addEventListener('pointerleave', () => {
    if (hovered) {
      hovered = null;
      hoverPromptKey = '';
      app.emit('prompt', null);
    }
  });

  const focusRoom = (roomId: string, zoom = false) => {
    const r = app.state.rooms.find((x) => x.id === roomId);
    if (!r) return;
    const rr = roomRect(r);
    const z = zoom ? Math.max(camera.zoom, Math.min(1.6, viewW() / (rr.w * 1.35))) : camera.zoom;
    camera.flyTo(rr.x + rr.w / 2, rr.y + rr.h * 0.55, z, 0.9);
    app.emit('prompt', { verb: roomName(app.state, r), text: `· ${ROOMS[r.type].levelNames[r.level - 1]}` });
  };
  const focusWorker = (workerId: string) => {
    const wv = workerViews.get(workerId);
    if (!wv) return;
    camera.flyTo(wv.x, wv.y - WORKER_H * 0.6, Math.max(camera.zoom, Math.min(1.5, defaultZoom() * 1.6)), 1);
  };

  const establishingShot = () => {
    const s = app.state;
    syncBounds(s);
    const towerH = s.floors * FH;
    camera.x = WB / 2 + 120;
    camera.y = -towerH * 0.5 - 420;
    camera.zoom = Math.max(0.22, Math.min(0.5, viewW() / 3200));
    camera.flyTo(WB / 2, homeY(), defaultZoom(), reduced ? 0.01 : 3.2);
    setTimeout(() => app.emit('prompt', { verb: 'Tap', text: 'a room to enter it, drag to look around' }), reduced ? 100 : 2600);
  };

  const applyLayerTransforms = () => {
    const w = viewW();
    const h = viewH();
    for (const [name, layer] of Object.entries(layers)) {
      const p = PARALLAX[name as keyof typeof PARALLAX];
      layer.scale.set(camera.zoom);
      layer.position.set(w / 2 - camera.x * p * camera.zoom + camera.offX, h / 2 - camera.y * p * camera.zoom + camera.offY);
    }
  };

  const resize = () => {
    camera.viewW = viewW();
    camera.viewH = viewH();
    sky.resize(viewW(), viewH());
    pixi.renderer.resize(viewW(), viewH());
  };
  resize();
  window.addEventListener('resize', resize);
  let lastW = viewW();
  let lastH = viewH();

  const update = (dt: number, s: GameState) => {
    if (paused || document.hidden) return;
    if (viewW() !== lastW || viewH() !== lastH) {
      lastW = viewW();
      lastH = viewH();
      resize();
    }
    t += dt;
    const atm = atmosphere(s.clock);
    // Structural sync when rooms/floors/company change.
    const sig = `${s.floors}|${s.company}|${s.rooms.map((r) => r.id + r.level).join(',')}`;
    if (sig !== lastSig) {
      lastSig = sig;
      building.sync(s);
      syncBounds(s);
    }
    // Workers.
    const seen = new Set<string>();
    for (const w of s.workers) {
      seen.add(w.id);
      let wv = workerViews.get(w.id);
      if (!wv) {
        wv = new WorkerView(w, dpr());
        workerViews.set(w.id, wv);
        building.workersLayer.addChild(wv.view);
      }
      const room = w.state === 'rest' || w.state === 'meeting' ? s.rooms.find((r) => r.floor === w.floor && w.x >= SLOT_X[r.slot][0] && w.x <= SLOT_X[r.slot][1]) : s.rooms.find((r) => r.id === w.roomId);
      wv.update(dt, t, w, s, room, camera.zoom, reduced);
    }
    for (const [id, wv] of workerViews) {
      if (!seen.has(id)) {
        wv.view.destroy({ children: true });
        workerViews.delete(id);
      }
    }
    camera.update(dt);
    applyLayerTransforms();
    const horizon = camera.worldToScreen(0, 0, PARALLAX.far).y;
    sky.update(dt, atm, horizon);
    city.update(dt, t, atm, camera.x, reduced);
    building.update(t, s, atm, hovered?.kind === 'room' ? hovered.id : null);
    post.update(t, atm.warmth, atm.rain, camera.speed);
    app.audio?.setTimeOfDay(atm.hour, atm.rain > 0.3);
    app.audio?.setCameraFloor(-camera.y / FH - 0.5);
    pixi.renderer.render(pixi.stage);
  };

  const api: SceneApi = {
    update,
    resize,
    focusRoom,
    focusWorker,
    workerScreenPos(id) {
      const wv = workerViews.get(id);
      if (!wv) return null;
      const p = camera.worldToScreen(wv.x, wv.y - WORKER_H * 0.6);
      const r = canvas.getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top };
    },
    roomScreenPos(id) {
      const r = app.state.rooms.find((x) => x.id === id);
      if (!r) return null;
      const rr = roomRect(r);
      return camera.worldToScreen(rr.x + rr.w / 2, rr.y + rr.h / 2);
    },
    shake: (strength = 1) => camera.shake(strength),
    async setQuality(tier) {
      cfg = TIERS[tier];
      pixi.renderer.resolution = dpr();
      building.setQuality(cfg, dpr());
      await post.apply(world, cfg);
      resize();
    },
    establishingShot,
    setPaused: (p) => (paused = p),
    cameraFocus: () => ({ floor: -camera.y / FH - 0.5, x: camera.x / WB, zoom: camera.zoom }),
    animate(workerId, anim) {
      workerViews.get(workerId)?.play(anim);
    },
    destroy() {
      window.removeEventListener('resize', resize);
      post.destroy();
      pixi.destroy(true, { children: true });
    },
  };
  app.on('radarTap', () => camera.flyTo(WB / 2, homeY(), defaultZoom(), 0.9));
  app.on('reset', () => {
    lastSig = '';
    for (const wv of workerViews.values()) wv.view.destroy({ children: true });
    workerViews.clear();
  });
  return api;
}
