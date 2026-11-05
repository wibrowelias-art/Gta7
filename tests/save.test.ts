import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/game/sim';
import { deserialize, serialize } from '../src/game/save';

describe('save', () => {
  it('round-trips a game state', () => {
    const s = newGame(8);
    s.company = 'Round Trip';
    for (let i = 0; i < 60; i++) step(s, 0.2);
    const copy = deserialize(serialize(s))!;
    expect(copy.company).toBe('Round Trip');
    expect(copy.cash).toBeCloseTo(s.cash, 5);
    expect(copy.workers.map((w) => w.id)).toEqual(s.workers.map((w) => w.id));
    expect(copy.paused).toBe(false);
  });
  it('rejects garbage', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"foo":1}')).toBeNull();
  });
  it('fills in fields missing from older saves', () => {
    const s = newGame(8);
    const raw = JSON.parse(serialize(s));
    delete raw.settings;
    delete raw.workers[0].acc;
    const copy = deserialize(JSON.stringify(raw))!;
    expect(copy.settings.quality).toBe('auto');
    expect(copy.workers[0].acc).toBe(0);
  });
});
