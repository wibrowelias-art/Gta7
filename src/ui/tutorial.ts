import { h } from './dom';
import type { App } from '../app';

interface Step {
  /** CSS selector of the real UI element to point at. */
  target: string;
  text: string;
  /** Optional selector that must exist before the step shows (e.g. an open panel). */
  requires?: string;
  /** Fallback text when the required element is not visible yet. */
  fallbackTarget?: string;
  fallbackText?: string;
}

const STEPS: Record<number, Step> = {
  1: { target: '[data-panel="team"].dock-btn', text: 'This is your team. Bunc makes products, Luke sells them. Tap Team to meet them.' },
  2: {
    target: '[data-tut="bonus"]',
    requires: '[data-tut="bonus"]',
    text: 'Happy workers earn more. Pay Luke a quick bonus.',
    fallbackTarget: '[data-panel="team"].dock-btn',
    fallbackText: 'Open Team and tap a worker to pay a bonus.',
  },
  3: {
    target: '[data-tut="build-bar"]',
    requires: '[data-tut="build-bar"]',
    text: 'Tired workers slow down. Build a Chill Bar so they can recharge.',
    fallbackTarget: '[data-panel="build"].dock-btn',
    fallbackText: 'Open Build and add a Chill Bar on the empty floor slot.',
  },
};

/** Short, skippable tutorial that points arrows at the real UI. Driven by state.tutorialStep. */
export function mountTutorial(app: App, root: HTMLElement): void {
  let tip: HTMLElement | null = null;
  let ring: HTMLElement | null = null;
  let shownFor = -1;
  let shownTarget = '';

  const remove = () => {
    tip?.remove();
    ring?.remove();
    tip = ring = null;
    shownFor = -1;
    shownTarget = '';
  };

  const skip = () => {
    app.state.tutorialStep = 4;
    app.save();
    remove();
  };

  const place = (target: HTMLElement) => {
    if (!tip || !ring) return;
    const r = target.getBoundingClientRect();
    ring.style.left = `${r.left - 6}px`;
    ring.style.top = `${r.top - 6}px`;
    ring.style.width = `${r.width + 12}px`;
    ring.style.height = `${r.height + 12}px`;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const above = r.top > innerHeight / 2;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(12, Math.min(innerWidth - tw - 12, left));
    const top = above ? r.top - th - 18 : r.bottom + 18;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    const arrow = tip.querySelector('.arrow') as HTMLElement;
    arrow.style.left = `${r.left + r.width / 2 - left - 7}px`;
    if (above) {
      arrow.style.bottom = '-7px';
      arrow.style.top = '';
    } else {
      arrow.style.top = '-7px';
      arrow.style.bottom = '';
    }
  };

  app.on('frame', () => {
    const s = app.state;
    const step = STEPS[s.tutorialStep];
    if (!step || s.company === '' || app.modalOpen) {
      if (tip) remove();
      return;
    }
    let targetSel = step.target;
    let text = step.text;
    if (step.requires && !document.querySelector(step.requires)) {
      // The real target is not on screen. Point at the dock button instead, but only when no other panel is open.
      if (document.querySelector('.panel')) {
        if (tip) remove();
        return;
      }
      targetSel = step.fallbackTarget ?? step.target;
      text = step.fallbackText ?? step.text;
    }
    const target = document.querySelector(targetSel) as HTMLElement | null;
    if (!target) {
      if (tip) remove();
      return;
    }
    if (shownFor !== s.tutorialStep || shownTarget !== targetSel) {
      remove();
      shownFor = s.tutorialStep;
      shownTarget = targetSel;
      ring = h('div.tut-ring');
      tip = h(
        'div.tut-tip',
        { role: 'note' },
        h('div.arrow'),
        h('div.row.between', {}, h('span.display.gold.t13', { text: `Step ${s.tutorialStep} of 3` }), h('button.btn.ghost.small', { text: 'Skip', on: { click: skip } })),
        h('div', { text }),
      );
      root.append(ring, tip);
    }
    place(target);
  });
}
