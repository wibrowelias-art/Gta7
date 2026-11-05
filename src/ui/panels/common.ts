import { fmtMoney, h } from '../dom';
import { icon } from '../icons';
import { portrait } from '../portrait';
import type { App } from '../../app';
import { ROOMS } from '../../game/data';
import { roomById, roomName } from '../../game/sim';
import type { Worker } from '../../game/types';

export function meter(value: number, color: string, label: string): HTMLElement {
  return h('div.col', { style: { gap: '3px', flex: '1' } }, h('div.row.between.t11.muted', {}, h('span', { text: label }), h('span.num', { text: `${Math.round(value)}` })), h('div.meter', {}, h('i', { style: { width: `${Math.max(0, Math.min(100, value))}%`, background: color } })));
}

export function stat(k: string, v: string, cls = ''): HTMLElement {
  return h('div.stat', {}, h('span.k', { text: k }), h(`span.v.num${cls ? '.' + cls : ''}`, { text: v }));
}

export function moodColor(m: number): string {
  return m < 35 ? 'var(--red)' : m < 60 ? 'var(--orange)' : 'var(--green)';
}

export function workerCard(app: App, w: Worker, onClick: () => void): HTMLElement {
  const room = roomById(app.state, w.roomId);
  const stateText = w.state === 'rest' ? 'Resting' : w.state === 'walk' || w.state === 'elevator' ? 'On the move' : w.state === 'meeting' ? 'In a meeting' : room ? 'Working' : 'Waiting for a desk';
  return h(
    'div.card.clickable',
    { role: 'button', tabIndex: '0', dataset: { worker: w.id }, on: { click: onClick, keydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && onClick() } },
    h(
      'div.row',
      {},
      h('div.avatar', {}, portrait(w, 44)),
      h('div.col.grow', {}, h('div.row.between', {}, h('span.display.t18.ellip', { text: w.name }), h('span.num.gold', { text: `${fmtMoney(w.salary)}/d` })), h('div.row.t13.sec', {}, h('span', { text: w.role }), h('span.muted', { text: '·' }), h('span.ellip', { text: room ? roomName(app.state, room) : stateText }))),
      w.wantsRaise ? h('span.tag.red', {}, icon('alert'), 'Pay') : null,
      w.unread ? h('span.badge', { text: String(w.unread), style: { position: 'static' } }) : null,
    ),
    h('div.row', {}, meter(w.mood, moodColor(w.mood), 'Mood'), meter(w.energy, 'var(--cyan)', 'Energy'), meter(w.skill, 'var(--purple)', 'Skill')),
  );
}

export function roomTag(type: keyof typeof ROOMS): HTMLElement {
  return h('span.tag', { style: { color: ROOMS[type].lightCss, borderColor: ROOMS[type].lightCss + '55' } }, icon(ROOMS[type].icon), ROOMS[type].name);
}

export function empty(ic: string, text: string, action?: { label: string; onClick: () => void }): HTMLElement {
  return h('div.empty', {}, icon(ic), h('div', { text }), action ? h('button.btn.primary', { text: action.label, on: { click: action.onClick } }) : null);
}
