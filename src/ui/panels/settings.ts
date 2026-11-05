import { h } from '../dom';
import { icon } from '../icons';
import type { PanelModule } from '../panel';
import { MILESTONES } from '../../game/sim';

export const settingsPanel: PanelModule = {
  title: 'More',
  icon: 'settings',
  render(app, api) {
    const s = app.state;
    api.setTitle('More', s.company, 'settings');

    api.body.appendChild(
      h(
        'div.grid2',
        {},
        h('button.btn', { on: { click: () => app.openPanel('treasury') } }, icon('treasury'), 'Treasury'),
        h('button.btn', { on: { click: () => app.emit('openReport') } }, icon('report'), 'Daily report'),
        h('button.btn', { on: { click: () => { const c = s.rooms.find((r) => r.type === 'command'); if (c) app.openPanel('room', { roomId: c.id }); } } }, icon('flag'), `Milestones ${s.milestonesDone.length}/${MILESTONES.length}`),
        h('button.btn', { on: { click: () => { app.scene?.establishingShot(); app.closePanel(); } } }, icon('radar'), 'City view'),
      ),
    );

    const slider = (label: string, ic: string, value: number, onChange: (v: number) => void) => {
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': label }) as HTMLInputElement;
      input.value = String(value);
      const val = h('span.num.t13.muted', { text: `${Math.round(value * 100)}%` });
      input.addEventListener('input', () => {
        onChange(Number(input.value));
        val.textContent = `${Math.round(Number(input.value) * 100)}%`;
      });
      input.addEventListener('change', () => app.save());
      return h('div.card', { style: { gap: '4px' } }, h('div.row.between', {}, h('span.row.t13', { style: { gap: '8px' } }, icon(ic), label), val), input);
    };
    api.body.appendChild(
      h(
        'div.col',
        {},
        h('div.t11.muted.display', { text: 'Sound' }),
        slider('Music', 'music', s.settings.music, (v) => { s.settings.music = v; app.audio?.setMusic(v); }),
        slider('Effects', 'sound', s.settings.sfx, (v) => { s.settings.sfx = v; app.audio?.setSfx(v); if (v > 0) app.audio?.play('tap'); }),
      ),
    );

    const tiers: Array<[string, typeof s.settings.quality]> = [['Auto', 'auto'], ['High', 'high'], ['Balanced', 'balanced'], ['Battery', 'battery']];
    const seg = h(
      'div.segment',
      { role: 'radiogroup', 'aria-label': 'Graphics quality' },
      ...tiers.map(([label, v]) =>
        h('button', {
          class: s.settings.quality === v ? 'on' : '',
          role: 'radio',
          'aria-checked': String(s.settings.quality === v),
          text: label,
          on: {
            click: () => {
              s.settings.quality = v;
              const tier = v === 'auto' ? app.quality : v;
              app.quality = tier;
              app.scene?.setQuality(tier);
              app.save();
              api.refresh();
            },
          },
        }),
      ),
    );
    api.body.appendChild(h('div.col', {}, h('div.t11.muted.display', { text: `Graphics · running ${app.quality}` }), seg));

    const rm = h('button.btn', { 'aria-pressed': String(s.settings.reducedMotion), on: { click: () => { s.settings.reducedMotion = !s.settings.reducedMotion; app.reducedMotion = s.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; document.documentElement.classList.toggle('reduced-motion', app.reducedMotion); app.save(); api.refresh(); } } }, icon(s.settings.reducedMotion ? 'check' : 'minus'), `Reduced motion ${s.settings.reducedMotion ? 'on' : 'off'}`);
    api.body.appendChild(h('div.col', {}, h('div.t11.muted.display', { text: 'Accessibility' }), rm));

    api.body.appendChild(
      h(
        'div.card',
        {},
        h('div.t11.muted.display', { text: 'About' }),
        h('div.t13', { text: 'NEON HQ is a game. All money and workers are fictional.' }),
        h('div.t11.muted', { text: `Version 1.0 · Day ${s.day} · save ${new Date(s.createdAt).toLocaleDateString()}` }),
      ),
    );

    api.foot.appendChild(
      h('button.btn.danger', { on: { click: () => app.emit('confirm', { title: 'Start over?', body: 'This deletes your company, workers and tower. There is no undo.', action: 'Delete and restart', danger: true, onYes: () => { app.reset(); app.closePanel(); location.reload(); } }) } }, icon('trash'), 'Reset game'),
    );
  },
};
