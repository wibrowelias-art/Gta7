import { describe, expect, it } from 'vitest';
import { newGame, resolveEvent, setCompany, step, hire, buildFloor, buildRoom, payBonus, callMeeting } from '../src/game/sim';
import { scriptedReply, QUICK_REPLIES } from '../src/game/chat';
import { MILESTONES } from '../src/game/milestones';
import { ROOMS, FOCUSES, WORKER_LINES } from '../src/game/data';

const FORBIDDEN = /\b(todo|placeholder|coming soon|lorem|mock|simulat\w*|dummy|fake|tbd|wip|demo|test|grand theft auto|gta|vice city|leonida|rockstar)\b/i;

describe('generated text', () => {
  it('ten game days at 5x produce no placeholder or forbidden words anywhere', () => {
    const s = newGame(2024);
    setCompany(s, 'Palm & Pixel');
    s.tutorialStep = 4;
    const texts: string[] = [];
    for (let i = 0; i < 10 * 24 * 6; i++) {
      const fx = step(s, 1 / 6);
      for (const f of fx) if (f.type === 'toast') texts.push(f.text);
      if (s.events.length) {
        const ev = s.events[0];
        texts.push(ev.title, ev.body, ...ev.choices.flatMap((c) => [c.label, c.detail]));
        s.cash = Math.max(s.cash, 5000);
        resolveEvent(s, ev.id, ev.choices[i % ev.choices.length].id);
      }
      if (s.pendingReport) {
        texts.push(s.pendingReport.highlight);
        s.pendingReport = null;
      }
      s.pendingMilestone = null;
      if (i % 200 === 0) {
        s.cash += 4000;
        if (s.candidates[0]) hire(s, s.candidates[0].id);
        buildFloor(s);
        buildRoom(s, s.floors - 1, 0, (['bar', 'studio', 'lab', 'server', 'treasury'] as const)[(i / 200) % 5]);
        payBonus(s, s.workers[0].id, 50);
        callMeeting(s, FOCUSES[(i / 200) % 4].id);
        for (const w of s.workers) for (const q of QUICK_REPLIES) texts.push(...scriptedReply(s, w, q).bubbles);
      }
    }
    for (const list of Object.values(s.chats)) for (const m of list) texts.push(m.text);
    for (const l of s.log) texts.push(l.text);
    for (const m of MILESTONES) texts.push(m.title, m.desc);
    for (const r of Object.values(ROOMS)) texts.push(r.name, r.tagline, ...r.levelNames);
    for (const v of Object.values(WORKER_LINES)) texts.push(...(Array.isArray(v) ? v : Object.values(v).flat()));
    expect(texts.length).toBeGreaterThan(200);
    const bad = texts.filter((t) => FORBIDDEN.test(t));
    expect(bad, bad.join('\n')).toEqual([]);
    expect(s.day).toBeGreaterThanOrEqual(10);
  });
});
