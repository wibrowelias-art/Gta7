import { describe, expect, it } from 'vitest';
import { run } from '../scripts/balance';

describe('balance (30 game days)', () => {
  it('a greedy-but-sane player never goes bankrupt and cash never stays flat for more than 2 days', () => {
    for (const seed of [1, 42, 99]) {
      const r = run(seed, 'greedy');
      expect(r.bankrupt).toBe(false);
      expect(r.flat).toBeLessThanOrEqual(2);
      expect(r.s.stats.revenueTotal).toBeGreaterThan(50_000);
    }
  });
  it('a cautious player grows steadily', () => {
    const r = run(42, 'cautious');
    expect(r.bankrupt).toBe(false);
    expect(r.flat).toBeLessThanOrEqual(2);
    expect(r.s.cash).toBeGreaterThan(5000);
  });
  it('only very bad choices lead to bankruptcy', () => {
    const r = run(42, 'bad');
    expect(r.bankrupt).toBe(true);
  });
});
