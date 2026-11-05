type Child = Node | string | number | null | undefined | false | Child[];

type Props = Record<string, unknown> & {
  class?: string;
  text?: string | number;
  html?: string;
  on?: Record<string, (e: Event) => void>;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
};

/** Tiny DOM builder: h('div.card', { on: { click } }, children...). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | string, props?: Props | Child, ...children: Child[]): HTMLElement {
  const [name, ...classes] = String(tag).split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    const p = props as Props;
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'type' && k !== 'value') (el as any)[k] = v;
      else el.setAttribute(k, String(v));
    }
  } else if (props !== undefined) {
    children.unshift(props as Child);
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function svg(markup: string, cls?: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild as SVGElement;
  if (cls) el.classList.add(cls);
  return el;
}

export const fmtMoney = (n: number, signed = false): string => {
  const abs = Math.abs(n);
  const str =
    abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M` : abs >= 100_000 ? `$${Math.round(abs / 1000)}k` : `$${Math.round(abs).toLocaleString('en-US')}`;
  if (n < 0) return `-${str}`;
  return signed ? `+${str}` : str;
};

export const fmtClock = (hours: number): string => {
  const h = Math.floor(hours % 24);
  const m = Math.floor(((hours % 24) - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const dayLabel = (clock: number): string => `Day ${Math.floor(clock / 24) + 1}`;

/** Stagger children of a `.stagger` container by 30 ms each. */
export function stagger(el: HTMLElement, ms = 30): HTMLElement {
  el.classList.add('stagger');
  Array.from(el.children).forEach((c, i) => ((c as HTMLElement).style.animationDelay = `${i * ms}ms`));
  return el;
}

export const prefersReducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Smoothly animate a numeric display. Returns a function to call with the new target. */
export function counter(el: HTMLElement, format: (n: number) => string, initial: number): (target: number) => void {
  let shown = initial;
  let target = initial;
  let raf = 0;
  el.textContent = format(shown);
  const tick = () => {
    const diff = target - shown;
    if (Math.abs(diff) < 0.5) {
      shown = target;
      el.textContent = format(shown);
      raf = 0;
      return;
    }
    shown += diff * 0.18;
    el.textContent = format(shown);
    raf = requestAnimationFrame(tick);
  };
  return (t: number) => {
    target = t;
    if (!raf) raf = requestAnimationFrame(tick);
  };
}
