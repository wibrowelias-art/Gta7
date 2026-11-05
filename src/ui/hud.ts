import { counter, fmtClock, fmtMoney, h } from './dom';
import { icon } from './icons';
import type { App } from '../app';
import { ROOMS } from '../game/data';
import { SLOT_X, ELEVATOR_X } from '../game/sim';

export function mountHud(app: App, root: HTMLElement): void {
  // Cash counter, top-right.
  const amount = h('div.amount.num', { text: fmtMoney(app.state.cash) });
  const sub = h('div.sub.display', { text: 'CASH' });
  const cash = h('button.hud-cash', { 'aria-label': 'Cash. Open Treasury', on: { click: () => app.openPanel('treasury') } }, amount, sub);
  const setCash = counter(amount, (n) => fmtMoney(n), app.state.cash);
  let lastCash = app.state.cash;

  // Top-left: day/time chip and speed.
  const dayEl = h('span.val.num', { text: `Day ${app.state.day}` });
  const timeEl = h('span.label.num', { text: fmtClock(app.state.clock) });
  const dayChip = h('button.chip', { 'aria-label': 'Day and time. Open daily report', on: { click: () => app.emit('openReport') } }, icon('sun', 'tod'), dayEl, timeEl);
  const speedLabel = h('span.val.num', { text: `${app.state.speed}×` });
  const speedChip = h('button.chip', {
    'aria-label': 'Game speed',
    on: {
      click: () => {
        const order = [1, 2, 5] as const;
        const next = order[(order.indexOf(app.state.speed) + 1) % order.length];
        app.state.speed = next;
        speedLabel.textContent = `${next}×`;
        app.audio?.play('tap');
      },
    },
  }, icon('fast'), speedLabel);
  const topLeft = h('div.hud-top-left', {}, dayChip, speedChip);

  // Contextual prompt.
  const prompt = h('div.hud-prompt');

  // Dock.
  const badgeChat = h('span.badge.hidden');
  const badgeTeam = h('span.badge.hidden');
  const dockBtn = (name: string, ic: string, label: string, badge?: HTMLElement) =>
    h('button.dock-btn', { dataset: { panel: name }, 'aria-label': label, on: { click: () => app.openPanel(name as any) } }, icon(ic), h('span', { text: label }), badge);
  const dock = h(
    'nav.hud-dock',
    { 'aria-label': 'Main menu' },
    dockBtn('team', 'team', 'Team', badgeTeam),
    dockBtn('build', 'build', 'Build'),
    dockBtn('chat', 'chat', 'Chat', badgeChat),
    dockBtn('settings', 'settings', 'More'),
  );

  // Radar.
  const radarCanvas = document.createElement('canvas');
  const radar = h('button.hud-radar', { 'aria-label': 'Radar. Tap to return to the building', on: { click: () => app.emit('radarTap') } }, radarCanvas);

  root.append(topLeft, cash, prompt, dock, radar);

  app.on('panel', (p: { name: string | null }) => {
    dock.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.panel === p.name));
  });

  let promptTimer = 0;
  app.on('prompt', (p: { text: string; verb?: string } | null) => {
    clearTimeout(promptTimer);
    if (!p) {
      prompt.classList.remove('show');
      return;
    }
    prompt.replaceChildren(h('kbd', { text: p.verb ?? 'Tap' }), document.createTextNode(p.text));
    prompt.classList.add('show');
    promptTimer = window.setTimeout(() => prompt.classList.remove('show'), 2800);
  });

  // Radar drawing.
  const ctx = radarCanvas.getContext('2d')!;
  let radarAcc = 0;
  const drawRadar = () => {
    const size = radar.clientWidth;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (radarCanvas.width !== size * dpr) {
      radarCanvas.width = size * dpr;
      radarCanvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const s = app.state;
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 4;
    // Grid rings.
    ctx.strokeStyle = 'rgba(46,230,200,0.18)';
    ctx.lineWidth = 1;
    for (const r of [R * 0.33, R * 0.66, R]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Sweep.
    radarAcc += 0.02;
    const sweep = ctx.createConicGradient(radarAcc, cx, cy);
    sweep.addColorStop(0, 'rgba(46,230,200,0.35)');
    sweep.addColorStop(0.15, 'rgba(46,230,200,0)');
    sweep.addColorStop(1, 'rgba(46,230,200,0)');
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    // Building: floors stacked, rooms as blocks, camera focus centred.
    const cam = app.scene?.cameraFocus() ?? { floor: 0, x: 0.5, zoom: 1 };
    const floorH = Math.max(10, (R * 1.4) / Math.max(3, s.floors));
    const bw = R * 1.3;
    const left = cx - bw / 2;
    const yOf = (floor: number) => cy + (cam.floor - floor) * floorH;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
    ctx.clip();
    for (let f = 0; f < s.floors; f++) {
      const y = yOf(f);
      ctx.fillStyle = 'rgba(255,244,236,0.06)';
      ctx.fillRect(left, y - floorH / 2 + 1, bw, floorH - 2);
      ctx.fillStyle = 'rgba(255,200,87,0.35)';
      ctx.fillRect(left + ELEVATOR_X * bw - 2, y - floorH / 2 + 1, 4, floorH - 2);
    }
    for (const r of s.rooms) {
      const [a, b] = SLOT_X[r.slot];
      const y = yOf(r.floor);
      ctx.fillStyle = ROOMS[r.type].lightCss + '66';
      ctx.fillRect(left + a * bw, y - floorH / 2 + 2, (b - a) * bw, floorH - 4);
    }
    for (const w of s.workers) {
      const y = yOf(w.floor);
      ctx.fillStyle = w.mood < 35 ? '#ff4458' : '#fff4ec';
      ctx.beginPath();
      ctx.arc(left + w.x * bw, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Centre marker.
    ctx.strokeStyle = 'rgba(255,200,87,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
  };

  let acc = 0;
  app.on('frame', (dt: number) => {
    const s = app.state;
    if (s.cash !== lastCash) {
      setCash(s.cash);
      amount.classList.remove('pulse-up', 'pulse-down');
      void amount.offsetWidth;
      amount.classList.add(s.cash > lastCash ? 'pulse-up' : 'pulse-down');
      lastCash = s.cash;
    }
    acc += dt;
    if (acc > 0.25) {
      acc = 0;
      dayEl.textContent = `Day ${s.day}`;
      timeEl.textContent = fmtClock(s.clock);
      speedLabel.textContent = `${s.speed}×`;
      const hour = s.clock % 24;
      const tod = dayChip.querySelector('.tod') as SVGElement;
      const want = hour >= 6 && hour < 19 ? 'sun' : 'moon';
      if (tod.dataset.n !== want) {
        const next = icon(want, 'tod');
        next.dataset.n = want;
        tod.replaceWith(next);
      }
      const unread = s.workers.reduce((a, w) => a + w.unread, 0);
      badgeChat.textContent = String(unread);
      badgeChat.classList.toggle('hidden', unread === 0);
      const unhappy = s.workers.filter((w) => w.wantsRaise).length;
      badgeTeam.textContent = String(unhappy);
      badgeTeam.classList.toggle('hidden', unhappy === 0);
    }
    drawRadar();
  });
}
