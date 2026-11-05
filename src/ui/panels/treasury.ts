import { fmtClock, fmtMoney, h, stagger } from '../dom';
import { icon } from '../icons';
import type { PanelModule } from '../panel';
import { costTrim, dailyCosts, priceMultiplier } from '../../game/sim';
import { empty, stat } from './common';

function sparkline(values: number[]): SVGElement {
  const w = 300;
  const hgt = 56;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${hgt - ((v - min) / (max - min || 1)) * (hgt - 6) - 3}`);
  const d = `M${pts.join(' L')}`;
  const t = document.createElement('template');
  t.innerHTML = `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc857" stop-opacity=".45"/><stop offset="1" stop-color="#ffc857" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w},${hgt} L0,${hgt}Z" fill="url(#sg)"/><path d="${d}" fill="none" stroke="#ffc857" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  return t.content.firstElementChild as SVGElement;
}

export const treasuryPanel: PanelModule = {
  title: 'Treasury',
  icon: 'treasury',
  render(app, api) {
    const s = app.state;
    api.setTitle('Treasury', `${s.company} · Day ${s.day}`, 'treasury');
    const costs = dailyCosts(s);
    const trim = costTrim(s);
    const daily = Math.round((costs.salaries + costs.rent) * (1 - trim));
    api.body.appendChild(h('div.grid2', {}, stat('Cash', fmtMoney(s.cash), s.cash < 0 ? 'bad' : 'gold'), stat('Today', fmtMoney(s.stats.dayRevenue - s.stats.daySpent, true), s.stats.dayRevenue - s.stats.daySpent >= 0 ? 'good' : 'bad')));
    api.body.appendChild(h('div.grid3', {}, stat('Revenue today', fmtMoney(s.stats.dayRevenue), 'good'), stat('Spent today', fmtMoney(s.stats.daySpent), 'bad'), stat('Due at midnight', fmtMoney(daily), 'bad')));

    const history = s.stats.days.slice(-14).map((d) => d.endCash);
    api.body.appendChild(
      h(
        'div.card',
        {},
        h('div.row.between', {}, h('span.t11.muted.display', { text: 'Closing cash, last 14 days' }), h('span.t11.muted', { text: history.length ? `${history.length} ${history.length === 1 ? 'day' : 'days'}` : '' })),
        history.length > 1 ? sparkline(history) : h('div.t13.sec', { text: 'The chart fills in after your second day.' }),
      ),
    );

    api.body.appendChild(
      h(
        'div.card',
        {},
        h('div.t11.muted.display', { text: 'Daily costs' }),
        h('div.report-row', {}, h('span.sec', { text: `Salaries (${s.workers.length})` }), h('span.num', { text: fmtMoney(costs.salaries) })),
        h('div.report-row', {}, h('span.sec', { text: `Rent (${s.floors} ${s.floors === 1 ? 'floor' : 'floors'}, ${s.rooms.length} rooms)` }), h('span.num', { text: fmtMoney(costs.rent) })),
        h('div.report-row', {}, h('span.sec', { text: 'Treasury trim' }), h('span.num.good', { text: trim ? `-${Math.round(trim * 100)}%` : '0% · staff a Treasury' })),
      ),
    );

    api.body.appendChild(h('div.grid3', {}, stat('Stock', `${Math.floor(s.inventory)}`), stat('Unit price', fmtMoney(s.productValue * priceMultiplier(s))), stat('Hype', `${Math.round(s.hype)}%`, s.hype > 60 ? 'gold' : '')));
    api.body.appendChild(h('div.grid3', {}, stat('Revenue total', fmtMoney(s.stats.revenueTotal), 'good'), stat('Spent total', fmtMoney(s.stats.spentTotal), 'bad'), stat('Units sold', `${Math.round(s.stats.unitsSold)}`)));

    const log = s.log.slice(0, 30);
    api.body.appendChild(
      h(
        'div.col',
        {},
        h('div.t11.muted.display', { text: 'Ledger' }),
        log.length
          ? stagger(
              h(
                'div.col',
                { style: { gap: '4px' } },
                ...log.map((e) =>
                  h(
                    'div.report-row',
                    {},
                    h('span.row', { style: { gap: '8px', minWidth: '0' } }, h('span.t11.muted.num', { text: `D${Math.floor(e.at / 24) + 1} ${fmtClock(e.at)}` }), h('span.t13.ellip', { text: e.text })),
                    e.amount !== undefined ? h('span.num', { class: e.amount >= 0 ? 'good' : 'bad', text: fmtMoney(e.amount, true) }) : h('span.t11.muted', { text: e.kind === 'milestone' ? '★' : '' }),
                  ),
                ),
              ),
              15,
            )
          : empty('report', 'No transactions yet. Sales and salaries will show up here.'),
      ),
    );
    api.foot.appendChild(h('button.btn', { on: { click: () => app.emit('openReport') } }, icon('report'), 'Last daily report'));
    api.foot.appendChild(h('button.btn.primary', { on: { click: () => app.openPanel('build') } }, icon('build'), 'Invest in a room'));
  },
};
