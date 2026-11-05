import { fmtMoney, h, stagger } from '../dom';
import { icon } from '../icons';
import type { PanelApi, PanelModule } from '../panel';
import type { App } from '../../app';
import { buildFloor, buildRoom, FLOOR_COST, roomName, workersIn } from '../../game/sim';
import { BUILDABLE, ROOMS } from '../../game/data';
import type { RoomType } from '../../game/types';

function renderFloors(app: App, api: PanelApi): void {
  const s = app.state;
  api.setTitle('Build', `${s.floors} ${s.floors === 1 ? 'floor' : 'floors'} · ${s.rooms.length} rooms`, 'build');
  const floors: HTMLElement[] = [];
  for (let f = s.floors - 1; f >= 0; f--) {
    const slots = [0, 1, 2].map((slot) => {
      const r = s.rooms.find((x) => x.floor === f && x.slot === slot);
      if (r) {
        const def = ROOMS[r.type];
        return h(
          'button.card.clickable',
          { style: { alignItems: 'center', padding: '10px 6px', borderColor: def.lightCss + '44' }, 'aria-label': `${roomName(s, r)} level ${r.level}`, on: { click: () => app.openPanel('room', { roomId: r.id }) } },
          icon(def.icon, 'room-ic'),
          h('span.display.t13.ellip', { text: roomName(s, r), style: { color: def.lightCss, maxWidth: '100%' } }),
          h('span.t11.muted', { text: `Lv ${r.level} · ${workersIn(s, r.id).length}/${def.capacity}` }),
        );
      }
      return h(
        'button.card.clickable',
        { style: { alignItems: 'center', padding: '10px 6px', borderStyle: 'dashed' }, 'aria-label': `Build on floor ${f + 1} slot ${slot + 1}`, dataset: { slot: `${f}-${slot}` }, on: { click: () => app.openPanel('build', { floor: f, slot }) } },
        icon('plus'),
        h('span.display.t13', { text: 'Build' }),
        h('span.t11.muted', { text: 'Empty slot' }),
      );
    });
    floors.push(h('div.col', {}, h('div.t11.muted.display', { text: `Floor ${f + 1}` }), h('div.grid3', {}, ...slots)));
  }
  api.body.appendChild(stagger(h('div.col', { style: { gap: '16px' } }, ...floors)));
  const cost = FLOOR_COST(s.floors);
  api.foot.appendChild(
    s.floors >= 8
      ? h('button.btn', { disabled: true }, 'Tower at full height')
      : h('button.btn.primary', { disabled: s.cash < cost, dataset: { tut: 'floor' }, on: { click: () => app.act(buildFloor(s), 'levelup') } }, icon('up'), `Add floor ${s.floors + 1} · ${fmtMoney(cost)}`),
  );
}

function renderPicker(app: App, api: PanelApi, floor: number, slot: number): void {
  const s = app.state;
  api.setTitle('Choose a room', `Floor ${floor + 1}, slot ${slot + 1}`, 'build');
  const cards = BUILDABLE.map((type: RoomType) => {
    const def = ROOMS[type];
    const have = s.rooms.filter((r) => r.type === type).length;
    return h(
      'button.card.clickable',
      { style: { textAlign: 'left', borderColor: def.lightCss + '44' }, dataset: { tut: type === 'bar' ? 'build-bar' : `build-${type}` }, disabled: s.cash < def.cost, on: { click: () => { if (app.act(buildRoom(s, floor, slot, type), 'levelup')) app.openPanel('build', { back: true }); } } },
      h('div.row', {}, h('span', { style: { color: def.lightCss, display: 'inline-flex' } }, icon(def.icon)), h('span.display.t18.grow', { text: def.name }), h('span.num.gold', { text: fmtMoney(def.cost) })),
      h('div.t13.sec', { text: def.tagline }),
      h('div.row.t11.muted', {}, h('span', { text: `${def.capacity} desks · ${def.role}s` }), have ? h('span', { text: `· you have ${have}` }) : null),
    );
  });
  api.body.appendChild(stagger(h('div.col', {}, ...cards)));
  api.foot.appendChild(h('button.btn', { on: { click: () => app.openPanel('build', { back: true }) } }, icon('back'), 'Back'));
}

export const buildPanel: PanelModule = {
  title: 'Build',
  icon: 'build',
  render(app, api) {
    if (typeof api.params.floor === 'number') renderPicker(app, api, api.params.floor as number, api.params.slot as number);
    else renderFloors(app, api);
  },
};
