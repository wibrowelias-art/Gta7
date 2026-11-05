import { describe, expect, it } from 'vitest';
import { fmtMoney, fmtClock } from '../src/ui/dom';
import { atmosphere } from '../src/render/sky';
import { ICON_NAMES } from '../src/ui/icons';

describe('formatting', () => {
  it('formats money compactly', () => {
    expect(fmtMoney(650)).toBe('$650');
    expect(fmtMoney(-80)).toBe('-$80');
    expect(fmtMoney(240, true)).toBe('+$240');
    expect(fmtMoney(12_345)).toBe('$12,345');
    expect(fmtMoney(123_456)).toBe('$123k');
    expect(fmtMoney(2_500_000)).toBe('$2.50M');
  });
  it('formats the clock', () => {
    expect(fmtClock(8)).toBe('08:00');
    expect(fmtClock(24 + 13.5)).toBe('13:30');
  });
});

describe('atmosphere', () => {
  it('is dark at night and bright at noon, with warm sunsets', () => {
    expect(atmosphere(2).daylight).toBe(0);
    expect(atmosphere(12).daylight).toBe(1);
    expect(atmosphere(18.6).warmth).toBeGreaterThan(0.9);
    expect(atmosphere(12).ambient).toBeGreaterThan(atmosphere(2).ambient);
  });
  it('rains on some days only', () => {
    const rainy = Array.from({ length: 30 }, (_, d) => [12, 14, 16, 18, 20].some((h) => atmosphere(d * 24 + h).rain > 0.5)).filter(Boolean).length;
    expect(rainy).toBeGreaterThan(2);
    expect(rainy).toBeLessThan(20);
  });
});

describe('icons', () => {
  it('ships one consistent set with the room and HUD icons', () => {
    for (const n of ['command', 'factory', 'shop', 'treasury', 'bar', 'server', 'studio', 'lab', 'team', 'build', 'chat', 'settings', 'close']) expect(ICON_NAMES).toContain(n);
  });
});
