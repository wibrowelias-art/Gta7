import { Rng } from './rng';
import { ROOMS, WORKER_LINES } from './data';
import { assignWorker, costTrim, payBonus, productName, roomById, roomName, roomsOf, workerById } from './sim';
import type { GameState, RoomType, SimEffect, Worker } from './types';

export interface ChatReply {
  /** One or more bubbles, delivered with short delays. */
  bubbles: string[];
  /** A system chip describing an action that happened ("Luke moved to Factory"). */
  action?: string;
  fx: SimEffect[];
}

export const QUICK_REPLIES = ['Good job', 'Bonus $100', 'What are you working on?', 'Go to the Shop', 'How are you?'];

const ROOM_WORDS: Record<string, RoomType> = {
  factory: 'factory',
  press: 'factory',
  shop: 'shop',
  store: 'shop',
  counter: 'shop',
  treasury: 'treasury',
  finance: 'treasury',
  bar: 'bar',
  chill: 'bar',
  lounge: 'bar',
  server: 'server',
  servers: 'server',
  studio: 'studio',
  marketing: 'studio',
  lab: 'lab',
  command: 'command',
  office: 'command',
};

/** Deterministic, mood-aware scripted replies. This is the fallback when the AI endpoint is unavailable. */
export function scriptedReply(s: GameState, w: Worker, text: string): ChatReply {
  const rng = new Rng((s.rng ^ w.seed ^ text.length) >>> 0);
  const t = text.toLowerCase();
  const fx: SimEffect[] = [];
  const mood = w.mood < 35 ? 'low' : w.mood > 70 ? 'high' : 'mid';
  const tone = (line: string): string => {
    if (mood === 'low' && rng.chance(0.5)) return line + ' ' + rng.pick(['Could be better, honestly.', 'Still thinking about my pay though.']);
    if (mood === 'high' && rng.chance(0.4)) return line + ' ' + rng.pick(['Loving it here.', 'Good vibes today.']);
    return line;
  };

  // Bonus: "bonus $100", "bonus 50", "$200 bonus"
  const bonus = /bonus\s*\$?(\d+)|\$(\d+)\s*bonus/.exec(t);
  if (bonus) {
    const amount = Number(bonus[1] ?? bonus[2]);
    const r = payBonus(s, w.id, amount);
    if (r.ok) {
      fx.push(...r.fx.filter((f) => f.type !== 'chat'));
      // payBonus already pushed a thank-you into the chat; remove it so we deliver it with timing.
      const list = s.chats[w.id];
      const last = list?.[list.length - 1];
      let thanks = rng.pick(WORKER_LINES.thanksBonus);
      if (last && last.from === 'worker') {
        thanks = last.text;
        list.pop();
        w.unread = Math.max(0, w.unread - 1);
      }
      return { bubbles: [thanks], action: `You paid ${w.name} a $${amount} bonus`, fx };
    }
    return { bubbles: [r.error === 'Not enough cash.' ? 'Ha, I would love that, but the account says no.' : 'Hmm, that did not go through.'], fx };
  }

  // Movement: "go to the shop", "move to factory"
  if (/\b(go|move|head|switch|work)\b/.test(t)) {
    for (const [word, type] of Object.entries(ROOM_WORDS)) {
      if (t.includes(word)) {
        const rooms = roomsOf(s, type);
        if (!rooms.length) return { bubbles: [WORKER_LINES.cantMove[1].replace('{room}', ROOMS[type].name)], fx };
        for (const r of rooms) {
          const res = assignWorker(s, w.id, r.id);
          if (res.ok) {
            fx.push(...res.fx.filter((f) => f.type !== 'toast'));
            return { bubbles: [rng.pick(WORKER_LINES.moved).replace('{room}', roomName(s, r))], action: `${w.name} moved to ${roomName(s, r)}`, fx };
          }
        }
        return { bubbles: [WORKER_LINES.cantMove[0].replace('{room}', ROOMS[type].name)], fx };
      }
    }
  }

  if (/good job|well done|nice work|great work|thank/.test(t)) {
    w.mood = Math.min(100, w.mood + 3);
    return { bubbles: [tone(rng.pick(WORKER_LINES.goodJob))], fx };
  }

  if (/working on|what are you doing|status|update|how is it going|how's it going/.test(t)) {
    const room = roomById(s, w.roomId);
    if (!room) return { bubbles: [rng.pick(WORKER_LINES.idle)], fx };
    const lines = WORKER_LINES.workingOn[room.type] ?? WORKER_LINES.workingOn.command;
    const line = rng
      .pick(lines)
      .replace('{product}', productName(s))
      .replace('{hype}', String(Math.round(s.hype)))
      .replace('{trim}', String(Math.round(costTrim(s) * 100)))
      .replace('{value}', String(Math.round(s.productValue)));
    const extra = w.energy < 30 ? rng.pick(WORKER_LINES.tired) : `Earned $${Math.round(w.earned)} for the company so far.`;
    return { bubbles: [line, extra], fx };
  }

  if (/how are you|you ok|feeling|mood/.test(t)) {
    if (mood === 'low') return { bubbles: [rng.pick(WORKER_LINES.lowMood)], fx };
    if (w.energy < 30) return { bubbles: [rng.pick(WORKER_LINES.tired)], fx };
    return { bubbles: [tone(rng.pick(['Good! Busy day, happy team.', 'All good. Energy at ' + Math.round(w.energy) + '%.']))], fx };
  }

  if (/raise|salary|pay/.test(t)) {
    return { bubbles: [`I am on $${w.salary} a day. ${w.mood < 45 ? 'Feels low for what I bring in.' : 'Fair enough for now.'}`, 'You can change it from my card in the Team panel.'], fx };
  }

  if (/hi|hello|hey|yo\b/.test(t)) return { bubbles: [tone(rng.pick(WORKER_LINES.greeting))], fx };

  if (/gossip|news|rumou?r/.test(t)) {
    const other = s.workers.find((o) => o.id !== w.id);
    return { bubbles: [rng.pick(WORKER_LINES.gossip).replace('{other}', other?.name ?? 'the new hire')], fx };
  }

  return { bubbles: [rng.pick(WORKER_LINES.unknown)], fx };
}

/** Build the prompt context the AI endpoint receives. Keeps the server stateless. */
export function chatContext(s: GameState, w: Worker): Record<string, unknown> {
  const room = roomById(s, w.roomId);
  return {
    company: s.company,
    worker: { name: w.name, role: w.role, trait: w.trait, mood: Math.round(w.mood), energy: Math.round(w.energy), salary: w.salary, room: room ? roomName(s, room) : null },
    game: { day: s.day, cash: Math.round(s.cash), hype: Math.round(s.hype), product: productName(s), inventory: Math.floor(s.inventory) },
    colleagues: s.workers.filter((o) => o.id !== w.id).map((o) => o.name),
    rooms: s.rooms.map((r) => roomName(s, r)),
  };
}

export { workerById };
