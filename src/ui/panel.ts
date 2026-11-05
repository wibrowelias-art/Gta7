import { h } from './dom';
import { icon } from './icons';
import type { App, PanelName } from '../app';

export interface PanelApi {
  body: HTMLElement;
  foot: HTMLElement;
  setTitle(title: string, sub?: string, ic?: string): void;
  close(): void;
  /** Re-run the panel's render function (keeps scroll position). */
  refresh(): void;
  params: Record<string, unknown>;
  onDispose(fn: () => void): void;
}

export type PanelRenderer = (app: App, api: PanelApi) => void;

export interface PanelModule {
  title: string;
  icon: string;
  wide?: boolean;
  render: PanelRenderer;
}

let current: { name: PanelName; el: HTMLElement; dispose: (() => void)[] } | null = null;
let loading: Promise<Record<string, PanelModule>> | null = null;

function loadPanels(): Promise<Record<string, PanelModule>> {
  return (loading ??= import('./panels/index').then((m) => m.PANELS));
}

export function mountPanelHost(app: App, root: HTMLElement): void {
  const scrim = h('div.panel-scrim', { on: { click: () => app.closePanel() } });
  root.appendChild(scrim);

  app.on('panel', async (p: { name: PanelName | null; params?: Record<string, unknown> }) => {
    document.body.classList.toggle('panel-open', !!p.name && !(current && current.name === p.name && !p.params));
    if (current) {
      const same = current.name === p.name;
      closeCurrent(app, !p.name);
      if (same && !p.params) {
        scrim.classList.remove('show');
        return;
      }
    }
    if (!p.name) {
      scrim.classList.remove('show');
      app.emit('panelClosed');
      return;
    }
    const mods = await loadPanels();
    const mod = mods[p.name];
    if (!mod) return;
    scrim.classList.add('show');
    app.audio?.play('open');
    const title = h('h2.display', { text: mod.title });
    const sub = h('div.sub');
    const headIcon = icon(mod.icon, 'ph-icon');
    const closeBtn = h('button.icon-btn', { 'aria-label': 'Close', on: { click: () => app.closePanel() } }, icon('close'));
    const head = h('div.panel-head', {}, headIcon, h('div.col.grow', {}, title, sub), closeBtn);
    const body = h('div.panel-body');
    const foot = h('div.panel-foot');
    const el = h(`section.panel${mod.wide ? '.wide' : ''}`, { role: 'dialog', 'aria-label': mod.title, dataset: { panel: p.name } }, head, body, foot);
    root.appendChild(el);
    const dispose: (() => void)[] = [];
    const api: PanelApi = {
      body,
      foot,
      params: p.params ?? {},
      setTitle(t, s, ic) {
        title.textContent = t;
        sub.textContent = s ?? '';
        sub.classList.toggle('hidden', !s);
        if (ic) headIcon.replaceWith(icon(ic, 'ph-icon'));
      },
      close: () => app.closePanel(),
      refresh() {
        const scroll = body.scrollTop;
        body.replaceChildren();
        foot.replaceChildren();
        mod.render(app, api);
        body.scrollTop = scroll;
        foot.classList.toggle('hidden', foot.children.length === 0);
      },
      onDispose: (fn) => dispose.push(fn),
    };
    current = { name: p.name, el, dispose };
    if (p.name === 'team' && app.state.tutorialStep === 1) app.state.tutorialStep = 2;
    mod.render(app, api);
    foot.classList.toggle('hidden', foot.children.length === 0);
    // Spring in on the next frame so the transition runs.
    requestAnimationFrame(() => {
      el.classList.add('anim');
      requestAnimationFrame(() => el.classList.add('open'));
    });
    dispose.push(app.on('change', () => api.refresh()));
  });

  // Escape closes.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) app.closePanel();
  });
}

function closeCurrent(app: App, playSound: boolean): void {
  if (!current) return;
  const { el, dispose } = current;
  current = null;
  dispose.forEach((d) => d());
  if (playSound) app.audio?.play('close');
  el.classList.remove('open');
  const remove = () => el.remove();
  if (app.reducedMotion) remove();
  else setTimeout(remove, 440);
}

export function currentPanel(): PanelName | null {
  return current?.name ?? null;
}
