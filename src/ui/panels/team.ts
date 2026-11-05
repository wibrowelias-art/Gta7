import { fmtMoney, h, stagger } from '../dom';
import { icon } from '../icons';
import { portrait } from '../portrait';
import type { App } from '../../app';
import type { PanelApi, PanelModule } from '../panel';
import { assignWorker, expectedSalary, fire, giveRaise, payBonus, roomById, roomName, workerById, workersIn } from '../../game/sim';
import { ROOMS } from '../../game/data';
import { empty, meter, moodColor, roomTag, stat, workerCard } from './common';

function renderList(app: App, api: PanelApi): void {
  const s = app.state;
  api.setTitle('Team', `${s.workers.length} ${s.workers.length === 1 ? 'worker' : 'workers'} · ${fmtMoney(s.workers.reduce((a, w) => a + w.salary, 0))}/day`, 'team');
  if (!s.workers.length) {
    api.body.appendChild(empty('team', 'Nobody on the payroll yet. Hire your first worker to get the floor moving.', { label: 'Hire', onClick: () => app.openPanel('hire') }));
  } else {
    const sorted = [...s.workers].sort((a, b) => (b.wantsRaise ? 1 : 0) - (a.wantsRaise ? 1 : 0) || b.earned - a.earned);
    api.body.appendChild(stagger(h('div.col', {}, ...sorted.map((w) => workerCard(app, w, () => app.openPanel('team', { workerId: w.id }))))));
  }
  api.foot.appendChild(h('button.btn.primary', { dataset: { tut: 'hire' }, on: { click: () => app.openPanel('hire') } }, icon('hire'), `Hire (${s.candidates.length} candidates)`));
}

function renderWorker(app: App, api: PanelApi, workerId: string): void {
  const s = app.state;
  const w = workerById(s, workerId);
  if (!w) return renderList(app, api);
  const room = roomById(s, w.roomId);
  api.setTitle(w.name, `${w.role} · ${w.trait} · hired day ${w.hiredDay}`, 'team');
  api.body.dataset.worker = w.id;

  const head = h(
    'div.row',
    {},
    h('div.avatar.lg', {}, portrait(w, 64)),
    h('div.col.grow', {}, h('div.row.wrap', { style: { gap: '6px' } }, room ? roomTag(room.type) : h('span.tag', {}, 'No desk'), w.wantsRaise ? h('span.tag.red', {}, 'Wants a raise') : null, w.friends.length ? h('span.tag.teal', {}, `${w.friends.length} ${w.friends.length === 1 ? 'friend' : 'friends'}`) : null), h('div.t13.sec', { text: room ? `Working in ${roomName(s, room)}` : 'Waiting for a room assignment' })),
    h('button.icon-btn', { 'aria-label': 'Back to team', on: { click: () => app.openPanel('team', { back: true }) } }, icon('back')),
  );

  const meters = h('div.row', {}, meter(w.mood, moodColor(w.mood), 'Mood'), meter(w.energy, 'var(--cyan)', 'Energy'), meter(w.skill, 'var(--purple)', 'Skill'));
  const fair = expectedSalary(w.skill);
  const stats = h('div.grid3', {}, stat('Salary / day', fmtMoney(w.salary), w.salary < fair ? 'bad' : ''), stat('Earned', fmtMoney(w.earned), 'good'), stat('Fair pay', fmtMoney(fair)));

  const bonusBtn = (amt: number, first = false) =>
    h('button.btn.good', { dataset: first ? { tut: 'bonus' } : {}, disabled: s.cash < amt, on: { click: () => app.act(payBonus(s, w.id, amt), 'register') } }, icon('coin'), `Bonus ${fmtMoney(amt)}`);
  const pay = h('div.col', {}, h('div.t11.muted.display', { text: 'Pay' }), h('div.grid3', {}, bonusBtn(50, true), bonusBtn(100), bonusBtn(250)), h('div.grid2', {}, h('button.btn', { on: { click: () => app.act(giveRaise(s, w.id, 10)) } }, icon('up'), 'Raise +$10/day'), h('button.btn', { on: { click: () => app.act(giveRaise(s, w.id, 25)) } }, icon('up'), 'Raise +$25/day')));

  const rooms = s.rooms.map((r) => {
    const occ = workersIn(s, r.id).length;
    const full = occ >= ROOMS[r.type].capacity && r.id !== w.roomId;
    return h(
      'button.btn.small',
      { class: r.id === w.roomId ? 'primary' : '', disabled: full, on: { click: () => app.act(assignWorker(s, w.id, r.id), 'whoosh') } },
      icon(ROOMS[r.type].icon),
      `${roomName(s, r)} ${occ}/${ROOMS[r.type].capacity}`,
    );
  });
  const assign = h('div.col', {}, h('div.t11.muted.display', { text: 'Assign to room' }), h('div.row.wrap', { style: { gap: '8px' } }, ...rooms));

  api.body.append(head, meters, stats, pay, assign);
  api.foot.append(
    h('button.btn', { on: { click: () => { app.scene?.focusWorker(w.id); app.emit('prompt', { verb: 'Locate', text: `${w.name} is ${room ? 'in ' + roomName(s, room) : 'on floor ' + (w.floor + 1)}` }); app.closePanel(); } } }, icon('locate'), 'Locate'),
    h('button.btn.primary', { on: { click: () => app.openPanel('chat', { workerId: w.id }) } }, icon('chat'), 'Chat'),
    h('button.btn.danger', { 'aria-label': `Let ${w.name} go`, style: { flex: '0 0 44px', padding: '0' }, on: { click: () => app.emit('confirm', { title: `Let ${w.name} go?`, body: `Severance is ${fmtMoney(w.salary * 2)}. Their desk frees up immediately.`, action: 'Let go', danger: true, onYes: () => { if (app.act(fire(s, w.id))) app.openPanel('team', { back: true }); } }) } }, icon('trash')),
  );
}

export const teamPanel: PanelModule = {
  title: 'Team',
  icon: 'team',
  render(app, api) {
    const id = api.params.workerId as string | undefined;
    if (id) renderWorker(app, api, id);
    else renderList(app, api);
  },
};
