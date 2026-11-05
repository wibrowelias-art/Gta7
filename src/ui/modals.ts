import { fmtMoney, h, stagger } from './dom';
import { icon } from './icons';
import { portrait } from './portrait';
import type { App } from '../app';
import { dismissMilestone, dismissReport, resolveEvent, setCompany, workerById } from '../game/sim';
import { milestoneById } from '../game/milestones';
import type { DayStats, GameEvent } from '../game/types';

/** Blocking overlays: company name, events, milestone title cards, daily reports, confirmations. */
export function mountModals(app: App, root: HTMLElement): void {
  let open: HTMLElement | null = null;
  const show = (el: HTMLElement) => {
    open?.remove();
    open = el;
    root.appendChild(el);
    app.modalOpen = true;
  };
  const hide = () => {
    open?.remove();
    open = null;
    app.modalOpen = false;
  };

  const namePrompt = () => {
    const input = h('input', { type: 'text', placeholder: 'Your company name', maxLength: '24', autocomplete: 'off', 'aria-label': 'Company name' }) as HTMLInputElement;
    const err = h('div.t13.bad', { text: '', style: { minHeight: '18px' } });
    const go = () => {
      const r = setCompany(app.state, input.value);
      if (!r.ok) {
        err.textContent = r.error;
        app.audio?.play('error');
        return;
      }
      app.audio?.resume();
      app.audio?.play('levelup');
      hide();
      app.emit('named');
      app.save();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    const el = h(
      'div.modal-scrim',
      {},
      h(
        'div.modal',
        {},
        h(
          'div.panel-body.name-input-wrap',
          {},
          h('div.logo.display', { text: 'NEON HQ' }),
          h('p.sec', { text: 'Run a startup tower in a sunset city. Name your company to open the doors.', style: { textAlign: 'center', margin: '0' } }),
          input,
          err,
          h('button.btn.primary.block', { text: 'Open the doors', on: { click: go } }),
        ),
      ),
    );
    show(el);
    setTimeout(() => input.focus(), 500);
  };

  const eventModal = (ev: GameEvent) => {
    const w = workerById(app.state, ev.workerId ?? null);
    const choices = ev.choices.map((c) => {
      const affordable = !c.cost || app.state.cash >= c.cost;
      return h(
        'button.btn.choice',
        {
          disabled: !affordable,
          on: {
            click: () => {
              if (app.act(resolveEvent(app.state, ev.id, c.id), c.cost ? 'register' : 'tap')) {
                hide();
                app.save();
              }
            },
          },
        },
        h('div.row.between', { style: { width: '100%' } }, h('span', { text: c.label }), c.cost ? h('span.cost.bad', { text: `-${fmtMoney(c.cost)}` }) : h('span.cost.good', { text: 'Free' })),
        h('span.detail', { text: c.detail }),
      );
    });
    const el = h(
      'div.modal-scrim',
      {},
      h(
        'div.modal',
        { role: 'dialog', 'aria-label': ev.title },
        h(`div.event-banner.${ev.severity}`),
        h('div.panel-head', {}, icon(ev.severity === 'good' ? 'sparkle' : ev.severity === 'bad' ? 'alert' : 'flag', 'ph-icon'), h('div.col.grow', {}, h('h2.display', { text: ev.title }))),
        h('div.panel-body', {}, w ? h('div.row', {}, h('div.avatar', {}, portrait(w, 44)), h('p.sec', { text: ev.body, style: { margin: '0' } })) : h('p.sec', { text: ev.body, style: { margin: '0' } }), stagger(h('div.col', { style: { gap: '8px' } }, ...choices))),
      ),
    );
    show(el);
  };

  const milestoneCard = (id: string) => {
    const m = milestoneById(id);
    if (!m) {
      dismissMilestone(app.state);
      return;
    }
    const el = h(
      'div.title-card',
      { on: { click: done } },
      h('div.eyebrow.display', { text: 'Milestone reached' }),
      h('h1.display', { text: m.title }),
      h('div.desc', { text: m.desc }),
      m.reward ? h('div.reward.num', { text: `+${fmtMoney(m.reward)} bonus` }) : null,
      h('button.btn.primary', { text: 'Continue' }),
    );
    function done() {
      dismissMilestone(app.state);
      hide();
      app.save();
    }
    show(el);
    app.emit('confetti');
  };

  const reportCard = (st: DayStats, closable = true) => {
    const best = workerById(app.state, st.bestWorkerId);
    const rows = [
      ['Revenue', fmtMoney(st.revenue), 'good'],
      ['Spent', `-${fmtMoney(st.spent)}`, 'bad'],
      ['Profit', fmtMoney(st.profit, true), st.profit >= 0 ? 'good' : 'bad'],
    ].map(([k, v, cls]) => h('div.report-row', {}, h('span.sec', { text: k }), h('span.num.t24', { class: cls, text: v })));
    const el = h(
      'div.modal-scrim',
      {},
      h(
        'div.modal',
        { role: 'dialog', 'aria-label': `Day ${st.day} report` },
        h('div.event-banner.neutral'),
        h('div.panel-head', {}, icon('report', 'ph-icon'), h('div.col.grow', {}, h('h2.display', { text: `Day ${st.day} report` }), h('div.sub', { text: `${app.state.company} · closing cash ${fmtMoney(st.endCash)}` }))),
        h(
          'div.panel-body',
          {},
          stagger(h('div.col', {}, ...rows)),
          best
            ? h('div.card.row', {}, h('div.avatar', {}, portrait(best, 44)), h('div.col.grow', {}, h('div.t11.muted.display', { text: 'Best worker' }), h('div.t18.display', { text: best.name }), h('div.t13.sec', { text: `${best.role} · ${st.bestEarned ? `brought in ${fmtMoney(st.bestEarned)}` : 'top of the floor'}` })))
            : null,
          h('div.card', {}, h('div.t11.muted.display', { text: 'Highlight' }), h('div.t15', { text: st.highlight })),
        ),
        h('div.panel-foot', {}, h('button.btn.primary', { text: closable ? 'Next day' : 'Close', on: { click: () => { dismissReport(app.state); hide(); app.save(); } } })),
      ),
    );
    show(el);
  };

  app.on('confirm', (p: { title: string; body: string; action: string; danger?: boolean; onYes: () => void }) => {
    const el = h(
      'div.modal-scrim',
      { on: { click: (e: Event) => e.target === el && hide() } },
      h(
        'div.modal',
        { role: 'dialog', 'aria-label': p.title },
        h('div.panel-head', {}, icon(p.danger ? 'alert' : 'info', 'ph-icon'), h('h2.display', { text: p.title })),
        h('div.panel-body', {}, h('p.sec', { text: p.body, style: { margin: '0' } })),
        h('div.panel-foot', {}, h('button.btn', { text: 'Cancel', on: { click: hide } }), h(`button.btn.${p.danger ? 'danger' : 'primary'}`, { text: p.action, on: { click: () => { hide(); p.onYes(); } } })),
      ),
    );
    show(el);
  });

  app.on('openReport', () => {
    const last = app.state.stats.days[app.state.stats.days.length - 1];
    if (last) reportCard(last, false);
    else app.emit('toast', { text: 'Your first daily report arrives at midnight.', tone: 'info' });
  });

  // Drive blocking states from the sim each frame.
  let shownEvent: string | null = null;
  app.on('frame', () => {
    const s = app.state;
    if (open) return;
    if (s.company === '') return namePrompt();
    if (s.pendingMilestone) return milestoneCard(s.pendingMilestone);
    if (s.pendingReport) return reportCard(s.pendingReport);
    if (s.events.length && shownEvent !== s.events[0].id) {
      shownEvent = s.events[0].id;
      return eventModal(s.events[0]);
    }
    if (!s.events.length) shownEvent = null;
  });
  app.on('reset', hide);
}
