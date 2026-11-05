import { fmtMoney, h, stagger } from '../dom';
import { icon } from '../icons';
import { portrait } from '../portrait';
import type { PanelModule } from '../panel';
import { assignWorker, callMeeting, roomById, roomName, upgradeRoom, workersIn, FOCUSES, MILESTONES, workerRate } from '../../game/sim';
import { ROOMS } from '../../game/data';
import { empty, meter, moodColor, stat } from './common';

export const roomPanel: PanelModule = {
  title: 'Room',
  icon: 'command',
  render(app, api) {
    const s = app.state;
    const r = roomById(s, api.params.roomId as string);
    if (!r) {
      api.setTitle('Room', 'This room no longer exists', 'build');
      api.body.appendChild(empty('build', 'The room is gone. Head back to the build view.', { label: 'Build', onClick: () => app.openPanel('build') }));
      return;
    }
    const def = ROOMS[r.type];
    api.setTitle(roomName(s, r), `${def.levelNames[r.level - 1]} · floor ${r.floor + 1}`, def.icon);
    const staff = workersIn(s, r.id);
    api.body.appendChild(h('p.sec', { text: def.tagline, style: { margin: '0' } }));

    const output = staff.reduce((a, w) => a + workerRate(s, w, r), 0);
    const outputLabel = r.type === 'factory' ? `${(output * 24).toFixed(0)} units/day` : r.type === 'shop' ? `${(output * 24 * 1.15).toFixed(0)} sales/day` : r.type === 'studio' ? `+${(output * 2.4 * 24).toFixed(0)} hype/day` : r.type === 'lab' ? `+$${(output * 0.9 * 24).toFixed(0)} value/day` : r.type === 'treasury' ? `${Math.round(staff.reduce((a, w) => a + (w.skill / 100) * 0.06 * r.level, 0) * 100)}% cost trim` : r.type === 'server' ? (s.online ? (s.clock < s.outageUntil ? 'Outage' : 'Online') : 'Offline') : r.type === 'bar' ? `${Math.round(22 * [1, 1.45, 2.1][r.level - 1])} energy/hr` : `${s.milestonesDone.length}/${MILESTONES.length} goals`;
    api.body.appendChild(h('div.grid3', {}, stat('Level', `${r.level}/3`), stat('Desks', `${staff.length}/${def.capacity}`), stat(r.type === 'command' ? 'Milestones' : 'Output', outputLabel, r.type === 'server' && s.clock < s.outageUntil ? 'bad' : '')));

    if (r.type === 'command') {
      const next = MILESTONES.find((m) => !s.milestonesDone.includes(m.id));
      const track = MILESTONES.map((m) => {
        const done = s.milestonesDone.includes(m.id);
        const p = Math.min(1, m.progress(s) / m.target);
        return h(
          'div.card',
          { style: { gap: '6px', opacity: done ? '0.75' : '1', borderColor: m === next ? 'rgba(255,200,87,0.5)' : '' } },
          h('div.row.between', {}, h('span.display.t15', { text: m.title }), done ? h('span.tag.green', {}, icon('check'), 'Done') : h('span.num.gold', { text: `+${fmtMoney(m.reward)}` })),
          h('div.t13.sec', { text: m.desc }),
          h('div.meter', {}, h('i', { style: { width: `${p * 100}%`, background: done ? 'var(--green)' : 'linear-gradient(90deg,var(--orange),var(--gold))' } })),
        );
      });
      api.body.appendChild(h('div.col', {}, h('div.t11.muted.display', { text: 'Milestone track' }), stagger(h('div.col', {}, ...track))));

      const canMeet = s.day - s.lastMeetingDay >= 1;
      const active = s.focus && s.clock < s.focusUntil ? FOCUSES.find((f) => f.id === s.focus) : null;
      const focusBtns = FOCUSES.map((f) =>
        h('button.btn.choice', { dataset: { focus: f.id }, disabled: !canMeet, on: { click: () => { if (app.act(callMeeting(s, f.id), 'cheer')) { app.scene?.focusRoom(r.id, true); app.closePanel(); } } } }, h('span.display.t18', { text: f.label }), h('span.detail', { text: f.detail })),
      );
      api.body.appendChild(h('div.col', {}, h('div.t11.muted.display', { text: active ? `Meeting focus today: ${active.label}` : canMeet ? 'Call a meeting (once per day)' : 'Next meeting tomorrow' }), h('div.col', { style: { gap: '8px' } }, ...focusBtns)));
    }

    const seats = staff.length
      ? stagger(
          h(
            'div.col',
            {},
            ...staff.map((w) =>
              h('div.card.row', { style: { flexDirection: 'row', alignItems: 'center' } }, h('div.avatar', {}, portrait(w, 44)), h('div.col.grow', {}, h('div.row.between', {}, h('span.display.t15', { text: w.name }), h('span.t13.muted', { text: w.role })), h('div.row', {}, meter(w.mood, moodColor(w.mood), 'Mood'), meter(w.energy, 'var(--cyan)', 'Energy'))), h('button.icon-btn', { 'aria-label': `Open ${w.name}`, on: { click: () => app.openPanel('team', { workerId: w.id }) } }, icon('back', 'flip'))),
            ),
          ),
        )
      : empty('team', r.type === 'bar' ? 'Workers come here on their own when tired.' : 'No one works here yet. Assign a worker below or hire one.', r.type === 'bar' ? undefined : { label: 'Hire', onClick: () => app.openPanel('hire') });
    api.body.appendChild(h('div.col', {}, h('div.t11.muted.display', { text: `In this room (${staff.length}/${def.capacity})` }), seats));

    const others = s.workers.filter((w) => w.roomId !== r.id);
    if (others.length && staff.length < def.capacity && r.type !== 'bar') {
      api.body.appendChild(
        h(
          'div.col',
          {},
          h('div.t11.muted.display', { text: 'Move someone here' }),
          h('div.row.wrap', { style: { gap: '8px' } }, ...others.map((w) => h('button.btn.small', { class: w.role === def.role ? 'good' : '', on: { click: () => app.act(assignWorker(s, w.id, r.id), 'whoosh') } }, `${w.name} · ${w.role}`))),
        ),
      );
    }

    api.foot.appendChild(h('button.btn', { on: { click: () => { app.scene?.focusRoom(r.id, true); app.closePanel(); } } }, icon('locate'), 'View'));
    if (r.level < 3) {
      const cost = def.upgradeCost[r.level - 1];
      api.foot.appendChild(h('button.btn.primary', { disabled: s.cash < cost, dataset: { tut: 'upgrade' }, on: { click: () => app.act(upgradeRoom(s, r.id), 'levelup') } }, icon('up'), `Upgrade to ${def.levelNames[r.level as 1 | 2]} · ${fmtMoney(cost)}`));
    } else api.foot.appendChild(h('button.btn', { disabled: true }, icon('star'), 'Fully upgraded'));
  },
};
