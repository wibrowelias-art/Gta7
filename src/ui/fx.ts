import { h } from './dom';
import type { App } from '../app';

const PALETTE = ['#ff3d8b', '#ff8a3d', '#ffc857', '#2ee6c8', '#3fd0ff', '#8b5cf6', '#3dff8f'];

/** Screen-space effects: coins flying to/from the cash counter, floating numbers, confetti, flashes. */
export function mountFx(app: App, root: HTMLElement): void {
  const flash = h('div.flash');
  root.appendChild(flash);

  const cashTarget = () => {
    const el = document.querySelector('.hud-cash .amount') as HTMLElement | null;
    if (!el) return { x: innerWidth - 60, y: 40 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const floatNum = (x: number, y: number, text: string, good: boolean) => {
    const el = h(`div.float-num.${good ? 'good' : 'bad'}`, { text, style: { left: `${x}px`, top: `${y}px` } });
    root.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  };

  const flyCoins = (from: { x: number; y: number }, to: { x: number; y: number }, n: number, onArrive?: () => void) => {
    if (app.reducedMotion) {
      onArrive?.();
      return;
    }
    const count = Math.min(10, Math.max(2, n));
    for (let i = 0; i < count; i++) {
      const coin = h('div.coin', { style: { left: `${from.x}px`, top: `${from.y}px` } });
      root.appendChild(coin);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const cx = from.x + dx * 0.5 + (Math.random() - 0.5) * 160;
      const cy = Math.min(from.y, to.y) - 80 - Math.random() * 80;
      const dur = 650 + Math.random() * 250;
      const delay = i * 40;
      const anim = coin.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0, offset: 0 },
          { transform: `translate(calc(-50% + ${(cx - from.x) * 0.5}px), calc(-50% + ${(cy - from.y) * 0.9}px)) scale(1.1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 0.9, offset: 1 },
        ],
        { duration: dur, delay, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'forwards' },
      );
      anim.onfinish = () => {
        coin.remove();
        if (i === count - 1) onArrive?.();
      };
    }
  };

  const confetti = () => {
    if (app.reducedMotion) return;
    const n = 70;
    for (let i = 0; i < n; i++) {
      const el = h('div.confetti', {
        style: { left: `${innerWidth / 2}px`, top: `${innerHeight * 0.35}px`, background: PALETTE[i % PALETTE.length], borderRadius: i % 3 ? '2px' : '50%' },
      });
      root.appendChild(el);
      const angle = Math.random() * Math.PI * 2;
      const v = 160 + Math.random() * 360;
      const dx = Math.cos(angle) * v;
      const dy = Math.sin(angle) * v * 0.6 - 200;
      const rot = (Math.random() - 0.5) * 1200;
      el.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy + 500}px) rotate(${rot}deg)`, opacity: 0 },
        ],
        { duration: 1600 + Math.random() * 800, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
      ).onfinish = () => el.remove();
    }
  };

  const doFlash = (red = false) => {
    if (app.reducedMotion) return;
    flash.className = 'flash';
    void flash.offsetWidth;
    flash.className = `flash go${red ? ' red' : ''}`;
  };

  app.on('fx', (f) => {
    switch (f.type) {
      case 'earn': {
        const p = app.scene?.workerScreenPos(f.workerId) ?? { x: innerWidth / 2, y: innerHeight / 2 };
        floatNum(p.x, p.y - 30, `+$${Math.round(f.amount)}`, true);
        flyCoins(p, cashTarget(), Math.ceil(f.amount / 40), () => app.audio?.play('coin'));
        break;
      }
      case 'pay': {
        const p = app.scene?.workerScreenPos(f.workerId) ?? { x: innerWidth / 2, y: innerHeight / 2 };
        floatNum(p.x, p.y - 30, `-$${Math.round(f.amount)}`, false);
        flyCoins(cashTarget(), p, Math.ceil(f.amount / 40));
        app.audio?.play('register');
        break;
      }
      case 'spend': {
        const t = cashTarget();
        floatNum(t.x, t.y + 34, `-$${Math.round(f.amount)}`, false);
        break;
      }
      case 'viral':
        doFlash();
        app.scene?.shake(1);
        app.audio?.play('cheer');
        break;
      case 'outage':
        doFlash(true);
        app.scene?.shake(0.7);
        app.audio?.play('error');
        break;
      case 'milestone':
        confetti();
        app.audio?.play('levelup');
        break;
      case 'highfive':
        app.scene?.animate(f.a, 'highfive');
        app.scene?.animate(f.b, 'highfive');
        break;
      case 'stomp':
        app.scene?.animate(f.workerId, 'stomp');
        break;
      case 'elevator':
        app.audio?.play('ding');
        break;
      case 'chat':
        app.audio?.play('notify');
        break;
    }
  });

  app.on('confetti', confetti);
  app.on('float', (p: { x: number; y: number; text: string; good: boolean }) => floatNum(p.x, p.y, p.text, p.good));
}
