import type { Input } from './input';
import { CITY_HALF } from './world';

export interface HudRefs {
  setCash(n: number): void;
  setSpeed(kmh: number, visible: boolean): void;
  setMission(title: string | null, detail: string, timeLeft: number, total: number): void;
  prompt(text: string | null): void;
  toast(text: string, tone?: 'good' | 'bad' | 'info'): void;
  drawMap(px: number, pz: number, heading: number, target: { x: number; z: number } | null, cars: { x: number; z: number }[], roadsX: number[], roadsZ: number[]): void;
  flash(): void;
  setWanted(stars: number, max: number): void;
}

export function mountHud(root: HTMLElement, input: Input): HudRefs {
  root.innerHTML = `
    <div class="c-top">
      <div class="c-cash"><span class="c-label">CASH</span><span class="c-cash-v num">$0</span></div>
      <div class="c-speed"><span class="c-speed-v num">0</span><span class="c-label">KM/H</span></div>
    </div>
    <div class="c-wanted" aria-label="Wanted level"></div>
    <div class="c-mission hidden"><div class="c-mission-title display"></div><div class="c-mission-detail"></div><div class="c-timer"><i></i></div></div>
    <div class="c-prompt"></div>
    <div class="c-toasts"></div>
    <div class="c-flash"></div>
    <div class="c-map"><canvas></canvas></div>
    <div class="c-touch">
      <div class="c-stick" aria-label="Move"><div class="c-knob"></div></div>
      <div class="c-buttons">
        <button class="c-btn c-gas" aria-label="Accelerate">GAS</button>
        <button class="c-btn c-brake" aria-label="Brake">BRAKE</button>
        <button class="c-btn c-hand" aria-label="Handbrake">DRIFT</button>
        <button class="c-btn c-act" aria-label="Enter or leave the car">ENTER</button>
        <button class="c-btn c-horn" aria-label="Horn">HORN</button>
      </div>
    </div>
    <div class="c-keys">WASD / arrows drive · Space drift · E enter car · H horn · C camera · R reset</div>
  `;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const cashV = $('.c-cash-v');
  const speedV = $('.c-speed-v');
  const speedBox = $('.c-speed');
  const mission = $('.c-mission');
  const mTitle = $('.c-mission-title');
  const mDetail = $('.c-mission-detail');
  const timerBar = $('.c-timer i');
  const prompt = $('.c-prompt');
  const toasts = $('.c-toasts');
  const flash = $('.c-flash');
  const wanted = $('.c-wanted');
  const canvas = $('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  // Touch controls.
  const stick = $('.c-stick');
  const knob = $('.c-knob');
  let stickId: number | null = null;
  const stickR = 44;
  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    input.touchUsed = true;
    root.classList.add('touch');
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > stickR) {
      dx = (dx / len) * stickR;
      dy = (dy / len) * stickR;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.touch.x = dx / stickR;
    input.touch.y = -dy / stickR;
  });
  const stickUp = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    input.touch.x = 0;
    input.touch.y = 0;
  };
  stick.addEventListener('pointerup', stickUp);
  stick.addEventListener('pointercancel', stickUp);
  const hold = (sel: string, key: 'gas' | 'brake' | 'hand' | 'horn') => {
    const b = $(sel);
    const on = (e: Event) => {
      e.preventDefault();
      input.touch[key] = true;
      input.touchUsed = true;
      root.classList.add('touch');
      b.classList.add('on');
    };
    const off = () => {
      input.touch[key] = false;
      b.classList.remove('on');
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  };
  hold('.c-gas', 'gas');
  hold('.c-brake', 'brake');
  hold('.c-hand', 'hand');
  hold('.c-horn', 'horn');
  $('.c-act').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.press('touch:action');
    input.touchUsed = true;
    root.classList.add('touch');
  });
  if (matchMedia('(pointer: coarse)').matches) root.classList.add('touch');

  const seen = new Map<string, HTMLElement>();
  return {
    setCash(n) {
      cashV.textContent = `$${Math.round(n).toLocaleString('en-US')}`;
    },
    setSpeed(kmh, visible) {
      speedV.textContent = String(Math.round(kmh));
      speedBox.classList.toggle('hidden', !visible);
    },
    setMission(title, detail, timeLeft, total) {
      mission.classList.toggle('hidden', !title);
      if (!title) return;
      mTitle.textContent = `${title} · ${Math.max(0, Math.ceil(timeLeft))}s`;
      mDetail.textContent = detail;
      timerBar.style.width = `${Math.max(0, Math.min(100, (timeLeft / total) * 100))}%`;
      timerBar.style.background = timeLeft / total < 0.25 ? 'var(--red)' : 'var(--gold)';
    },
    prompt(text) {
      prompt.textContent = text ?? '';
      prompt.classList.toggle('show', !!text);
    },
    toast(text, tone = 'info') {
      const el = document.createElement('div');
      el.className = `c-toast ${tone}`;
      el.textContent = text;
      toasts.appendChild(el);
      seen.set(text, el);
      while (toasts.children.length > 3) toasts.firstElementChild?.remove();
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 300);
      }, 3200);
    },
    setWanted(stars, max) {
      const key = `${stars}/${max}`;
      if (wanted.dataset.k === key) return;
      wanted.dataset.k = key;
      wanted.innerHTML = '';
      wanted.classList.toggle('show', stars > 0);
      for (let i = 0; i < max; i++) {
        const s = document.createElement('span');
        s.className = 'c-star' + (i < stars ? ' on' : '');
        s.textContent = '★';
        wanted.appendChild(s);
      }
    },
    flash() {
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
    },
    drawMap(px, pz, heading, target, cars, roadsX, roadsZ) {
      const size = canvas.clientWidth;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const R = size / 2;
      const scale = R / 140; // 140 m radius
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(20,15,28,0.85)';
      ctx.fillRect(0, 0, size, size);
      ctx.translate(R, R);
      ctx.rotate(-heading + Math.PI);
      ctx.translate(-px * scale, -pz * scale);
      // Roads.
      ctx.strokeStyle = 'rgba(255,244,236,0.25)';
      ctx.lineWidth = 18 * scale;
      ctx.lineCap = 'butt';
      for (const z of roadsZ) {
        ctx.beginPath();
        ctx.moveTo(-CITY_HALF * scale - 20, z * scale);
        ctx.lineTo(CITY_HALF * scale + 20, z * scale);
        ctx.stroke();
      }
      for (const x of roadsX) {
        ctx.beginPath();
        ctx.moveTo(x * scale, -CITY_HALF * scale - 20);
        ctx.lineTo(x * scale, CITY_HALF * scale + 20);
        ctx.stroke();
      }
      // Cars.
      ctx.fillStyle = '#3fd0ff';
      for (const c of cars) {
        ctx.beginPath();
        ctx.arc(c.x * scale, c.z * scale, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Target.
      if (target) {
        ctx.fillStyle = '#ffc857';
        ctx.beginPath();
        ctx.arc(target.x * scale, target.z * scale, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Player arrow (always centred, pointing up).
      ctx.save();
      ctx.translate(R, R);
      ctx.fillStyle = '#fff4ec';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      // Off-map target indicator on the rim.
      if (target) {
        const dx = target.x - px;
        const dz = target.z - pz;
        const dist = Math.hypot(dx, dz);
        if (dist * scale > R - 6) {
          const a = Math.atan2(dx, dz) - heading + Math.PI;
          ctx.fillStyle = '#ffc857';
          ctx.beginPath();
          ctx.arc(Math.sin(a) * (R - 8), Math.cos(a) * (R - 8), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  };
}
