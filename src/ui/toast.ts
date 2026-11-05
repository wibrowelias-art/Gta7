import { h } from './dom';
import { icon } from './icons';
import type { App } from '../app';
import { productName } from '../game/sim';

interface Toast {
  key: string;
  el: HTMLElement;
  count: number;
  amount: number;
  base: string;
  timer: number;
}

/** Toast stack at the top. Repeated toasts with the same key are grouped ("Bunc sold 3 shirts, +$120"). */
export function mountToasts(app: App, root: HTMLElement): void {
  const live = new Map<string, Toast>();

  const show = (text: string, tone: 'good' | 'bad' | 'info' = 'info', key?: string, amount?: number, unitsText?: (n: number, amt: number) => string, units = 1) => {
    const k = key ?? text;
    const existing = live.get(k);
    if (existing) {
      existing.count += units;
      existing.amount += amount ?? 0;
      existing.el.querySelector('span')!.textContent = unitsText ? unitsText(existing.count, existing.amount) : text;
      clearTimeout(existing.timer);
      existing.timer = window.setTimeout(() => dismiss(existing), 2600);
      existing.el.classList.remove('bump');
      void existing.el.offsetWidth;
      existing.el.classList.add('bump');
      return;
    }
    const el = h(`div.toast.${tone}`, {}, icon(tone === 'good' ? 'check' : tone === 'bad' ? 'alert' : 'info'), h('span', { text }));
    root.appendChild(el);
    while (root.children.length > 4) {
      const first = root.firstElementChild as HTMLElement;
      const t = [...live.values()].find((x) => x.el === first);
      if (t) dismiss(t, true);
      else first.remove();
    }
    const t: Toast = { key: k, el, count: units, amount: amount ?? 0, base: text, timer: 0 };
    t.timer = window.setTimeout(() => dismiss(t), 2600);
    live.set(k, t);
  };

  const dismiss = (t: Toast, now = false) => {
    live.delete(t.key);
    clearTimeout(t.timer);
    if (now || app.reducedMotion) {
      t.el.remove();
      return;
    }
    t.el.classList.add('out');
    setTimeout(() => t.el.remove(), 240);
  };

  app.on('toast', (p: { text: string; tone?: 'good' | 'bad' | 'info' }) => show(p.text, p.tone ?? 'info'));
  app.on('fx', (f) => {
    if (f.type === 'sold') {
      const w = app.state.workers.find((x) => x.id === f.workerId);
      if (!w) return;
      const product = productLabel(app);
      show(`${w.name} sold ${f.units} ${product}${f.units === 1 ? '' : 's'}, +$${f.amount}`, 'good', `sold-${w.id}`, f.amount, (n, amt) => `${w.name} sold ${n} ${product}${n === 1 ? '' : 's'}, +$${Math.round(amt)}`, f.units);
    } else if (f.type === 'toast') show(f.text, f.tone ?? 'info');
    else if (f.type === 'chat') {
      const w = app.state.workers.find((x) => x.id === f.workerId);
      if (w && !document.querySelector(`[data-chat-open="${w.id}"]`)) show(`${w.name} sent you a message`, 'info', `chat-${w.id}`);
    }
  });
}

function productLabel(app: App): string {
  return productName(app.state);
}
