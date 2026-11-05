import { describe, expect, it } from 'vitest';
import { assignWorker, buildFloor, buildRoom, callMeeting, dailyCosts, hire, newGame, payBonus, resolveEvent, step, upgradeRoom, setCompany, fire, giveRaise, FLOOR_COST, ROOMS } from '../src/game/sim';
import { makeEvent } from '../src/game/events';
import { Rng } from '../src/game/rng';
import { MILESTONES } from '../src/game/milestones';

const run = (s: ReturnType<typeof newGame>, hours: number) => {
  const fx = [];
  for (let i = 0; i < hours * 6; i++) fx.push(...step(s, 1 / 6));
  return fx;
};

describe('newGame', () => {
  it('starts with a command, factory and shop and two seated workers', () => {
    const s = newGame(1);
    expect(s.rooms.map((r) => r.type)).toEqual(['command', 'factory', 'shop']);
    expect(s.workers).toHaveLength(2);
    expect(s.workers.every((w) => w.roomId)).toBe(true);
    expect(s.cash).toBe(650);
  });
  it('is deterministic for a seed', () => {
    const a = { ...newGame(7), createdAt: 0 };
    const b = { ...newGame(7), createdAt: 0 };
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('economy', () => {
  it('sells products and emits earn effects within the first hours', () => {
    const s = newGame(3);
    setCompany(s, 'Test Co');
    const fx = run(s, 6);
    expect(fx.some((f) => f.type === 'earn')).toBe(true);
    expect(s.stats.revenueTotal).toBeGreaterThan(0);
    expect(s.cash).toBeGreaterThan(650);
  });
  it('reaches $1,000 cash and the first milestone within two game days', () => {
    const s = newGame(3);
    setCompany(s, 'Test Co');
    run(s, 48);
    expect(s.milestonesDone).toContain('first-1k');
  });
  it('charges salaries and rent at midnight and produces a daily report', () => {
    const s = newGame(5);
    setCompany(s, 'X');
    const before = s.cash;
    const fx = run(s, 16.5); // clock starts at 08:00
    const dayEnd = fx.find((f) => f.type === 'dayEnd');
    expect(dayEnd).toBeTruthy();
    expect(s.pendingReport?.day).toBe(1);
    expect(s.stats.days[0].spent).toBeGreaterThan(0);
    expect(s.log.some((l) => l.text.startsWith('Salaries'))).toBe(true);
    expect(s.cash).not.toBe(before);
  });
  it('daily costs scale with floors and workers', () => {
    const s = newGame(1);
    const c1 = dailyCosts(s);
    s.cash = 100000;
    buildFloor(s);
    expect(dailyCosts(s).rent).toBeGreaterThan(c1.rent);
  });
});

describe('actions', () => {
  it('pays a bonus, lifts mood and sends a thank-you message', () => {
    const s = newGame(2);
    const w = s.workers[0];
    const mood = w.mood;
    const r = payBonus(s, w.id, 100);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(550);
    expect(w.mood).toBeGreaterThan(mood);
    expect(s.chats[w.id].at(-1)?.from).toBe('worker');
    expect(s.stats.bonusesPaid).toBe(1);
  });
  it('refuses a bonus you cannot afford', () => {
    const s = newGame(2);
    const r = payBonus(s, s.workers[0].id, 5000);
    expect(r.ok).toBe(false);
  });
  it('hires a candidate, charges the fee and seats them when a desk matches', () => {
    const s = newGame(4);
    s.cash = 5000;
    const c = s.candidates[0];
    const r = hire(s, c.id);
    expect(r.ok).toBe(true);
    expect(s.workers.some((w) => w.name === c.name)).toBe(true);
    expect(s.cash).toBe(5000 - c.hireFee);
  });
  it('builds rooms and floors with cost checks', () => {
    const s = newGame(4);
    expect(buildRoom(s, 0, 0, 'bar').ok).toBe(false); // slot taken
    expect(buildRoom(s, 1, 0, 'bar').ok).toBe(false); // no floor
    s.cash = 100000;
    expect(buildFloor(s).ok).toBe(true);
    expect(s.floors).toBe(2);
    expect(buildRoom(s, 1, 0, 'bar').ok).toBe(true);
    expect(s.rooms.some((r) => r.type === 'bar')).toBe(true);
    expect(FLOOR_COST(2)).toBeGreaterThan(FLOOR_COST(1));
  });
  it('upgrades a room up to level 3', () => {
    const s = newGame(4);
    s.cash = 1e6;
    const f = s.rooms.find((r) => r.type === 'factory')!;
    expect(upgradeRoom(s, f.id).ok).toBe(true);
    expect(upgradeRoom(s, f.id).ok).toBe(true);
    expect(f.level).toBe(3);
    expect(upgradeRoom(s, f.id).ok).toBe(false);
  });
  it('respects room capacity when assigning', () => {
    const s = newGame(4);
    s.cash = 1e6;
    const shop = s.rooms.find((r) => r.type === 'shop')!;
    for (let i = 0; i < 4; i++) hire(s, s.candidates[0].id);
    const results = s.workers.map((w) => assignWorker(s, w.id, shop.id));
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(ROOMS.shop.capacity);
  });
  it('calls one meeting per day and applies a focus', () => {
    const s = newGame(4);
    expect(callMeeting(s, 'sales').ok).toBe(true);
    expect(s.focus).toBe('sales');
    expect(callMeeting(s, 'crunch').ok).toBe(false);
    expect(s.workers.every((w) => w.targetRoomId === 'r1')).toBe(true);
  });
  it('fires a worker with severance and gives raises', () => {
    const s = newGame(4);
    s.cash = 1000;
    const w = s.workers[0];
    const salary = w.salary;
    expect(giveRaise(s, w.id, 10).ok).toBe(true);
    expect(w.salary).toBe(salary + 10);
    expect(fire(s, w.id).ok).toBe(true);
    expect(s.workers).toHaveLength(1);
  });
});

describe('events', () => {
  it('always offers 2-3 choices with details and resolves cleanly', () => {
    const s = newGame(9);
    s.stats.revenueTotal = 20000;
    const rng = new Rng(5);
    for (let i = 0; i < 40; i++) {
      const ev = makeEvent(s, rng)!;
      expect(ev.choices.length).toBeGreaterThanOrEqual(2);
      expect(ev.choices.length).toBeLessThanOrEqual(3);
      for (const c of ev.choices) expect(c.detail.length).toBeGreaterThan(3);
      s.events.push(ev);
      s.cash = 1e6;
      const r = resolveEvent(s, ev.id, ev.choices[0].id);
      expect(r.ok).toBe(true);
      expect(s.events).toHaveLength(0);
    }
  });
  it('fires events over time once the tutorial is done', () => {
    const s = newGame(11);
    setCompany(s, 'Ev');
    s.tutorialStep = 4;
    let saw = false;
    for (let i = 0; i < 24 * 6 * 2 && !saw; i++) {
      const fx = step(s, 1 / 6);
      if (fx.some((f) => f.type === 'event')) saw = true;
      if (s.events.length) resolveEvent(s, s.events[0].id, s.events[0].choices[0].id);
    }
    expect(saw).toBe(true);
  });
});

describe('milestones', () => {
  it('have increasing targets and progress functions', () => {
    const s = newGame(1);
    for (const m of MILESTONES) expect(typeof m.progress(s)).toBe('number');
    expect(MILESTONES.map((m) => m.id)).toContain('revenue-1m');
  });
});
