import { fmtMoney, h, stagger } from '../dom';
import { icon } from '../icons';
import { portrait } from '../portrait';
import type { PanelModule } from '../panel';
import { hire } from '../../game/sim';
import { ROOMS } from '../../game/data';
import { empty, meter } from './common';

export const hirePanel: PanelModule = {
  title: 'Hire',
  icon: 'hire',
  render(app, api) {
    const s = app.state;
    api.setTitle('Hire', 'New candidates walk in every morning', 'hire');
    if (!s.candidates.length) {
      api.body.appendChild(empty('hire', 'The lobby is empty right now. New candidates arrive tomorrow morning.', { label: 'Back to Team', onClick: () => app.openPanel('team') }));
      return;
    }
    const cards = s.candidates.map((c) => {
      const seat = s.rooms.find((r) => ROOMS[r.type].role === c.role && s.workers.filter((w) => w.roomId === r.id).length < ROOMS[r.type].capacity);
      return h(
        'div.card',
        {},
        h(
          'div.row',
          {},
          h('div.avatar', {}, portrait(c, 44)),
          h('div.col.grow', {}, h('div.row.between', {}, h('span.display.t18', { text: c.name }), h('span.num.gold', { text: `${fmtMoney(c.salary)}/d` })), h('div.t13.sec', { text: `${c.role} · ${c.trait}` })),
        ),
        h('div.row', {}, meter(c.skill, 'var(--purple)', 'Skill')),
        h('div.row.between', {}, h('span.t13.muted', { text: seat ? `Seat ready in ${ROOMS[seat.type].name}` : `Needs a ${Object.values(ROOMS).find((r) => r.role === c.role)?.name ?? 'room'} desk` }), h('button.btn.primary.small', { disabled: s.cash < c.hireFee, on: { click: () => { if (app.act(hire(s, c.id), 'cheer')) app.openPanel('team', { back: true }); } } }, icon('hire'), `Hire ${fmtMoney(c.hireFee)}`)),
      );
    });
    api.body.appendChild(stagger(h('div.col', {}, ...cards)));
    api.foot.appendChild(h('button.btn', { on: { click: () => app.openPanel('team', { back: true }) } }, icon('back'), 'Back to Team'));
  },
};
