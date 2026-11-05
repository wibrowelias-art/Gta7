import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/sim';
import { scriptedReply, chatContext, QUICK_REPLIES } from '../src/game/chat';

describe('scripted chat', () => {
  it('pays a bonus from a chat command and reports the action', () => {
    const s = newGame(3);
    const w = s.workers[1];
    const r = scriptedReply(s, w, 'Bonus $100');
    expect(r.action).toMatch(/paid Luke a \$100 bonus/);
    expect(s.cash).toBe(550);
    expect(r.bubbles[0].length).toBeGreaterThan(3);
  });
  it('moves a worker to a room from a chat command', () => {
    const s = newGame(3);
    const w = s.workers[0];
    const r = scriptedReply(s, w, 'Go to the Shop');
    expect(r.action).toBe('Bunc moved to Shop');
    expect(w.roomId).toBe('r3');
  });
  it('explains when a room does not exist', () => {
    const s = newGame(3);
    const r = scriptedReply(s, s.workers[0], 'go to the bar');
    expect(r.action).toBeUndefined();
    expect(r.bubbles[0]).toMatch(/no Chill Bar/);
  });
  it('answers status questions with real data', () => {
    const s = newGame(3);
    const r = scriptedReply(s, s.workers[0], 'What are you working on?');
    expect(r.bubbles.length).toBeGreaterThanOrEqual(1);
    expect(r.bubbles.join(' ')).toMatch(/shirt|press|batch/i);
  });
  it('never returns an empty reply and never leaks error words', () => {
    const s = newGame(3);
    for (const q of [...QUICK_REPLIES, 'asdfgh', '', 'raise?']) {
      const r = scriptedReply(s, s.workers[0], q);
      expect(r.bubbles.length).toBeGreaterThan(0);
      expect(r.bubbles.join(' ')).not.toMatch(/error|undefined|null|AI/);
    }
  });
  it('builds a stateless context for the AI endpoint', () => {
    const s = newGame(3);
    const ctx = chatContext(s, s.workers[0]);
    expect(ctx.worker).toMatchObject({ name: 'Bunc', role: 'Maker' });
  });
});
