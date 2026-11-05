import type { Rng } from './rng';
import type { EventChoice, GameEvent, GameState } from './types';
import { productName, pushChat, roomsOf, workersIn } from './sim';

interface Outcome {
  cash: number;
  text: string;
}

function id(s: GameState): string {
  return `e${(s.nextId++).toString(36)}`;
}

/** Event money scales with the business but is capped so late-game swings stay sane. */
export function eventScale(s: GameState): number {
  return Math.min(14, Math.max(1, Math.sqrt(s.stats.revenueTotal / 2500)));
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function makeEvent(s: GameState, rng: Rng): GameEvent | null {
  const pool: Array<() => GameEvent | null> = [];
  const scale = eventScale(s);
  const product = productName(s);
  const sellers = s.workers.filter((w) => roomsOf(s, 'shop').some((r) => r.id === w.roomId));
  const anyWorker = s.workers.length ? rng.pick(s.workers) : null;

  pool.push(() => {
    const boost = Math.round(900 * scale);
    return {
      id: id(s),
      kind: 'viral',
      severity: 'good',
      at: s.clock,
      title: 'Your clip went viral',
      body: `A customer posted a video wearing your ${product}. It is everywhere. Hype is spiking and orders are flooding in.`,
      choices: [
        { id: 'ride', label: 'Ride the wave', detail: `+${money(boost)} in orders and +25 hype.` },
        { id: 'ads', label: 'Boost it with ads', cost: Math.round(300 * scale), detail: `Spend to push it further: +${money(boost * 1.8)} and +45 hype.` },
        { id: 'humble', label: 'Stay humble', detail: '+10 hype and the whole team gets +8 mood.' },
      ],
    };
  });

  if (roomsOf(s, 'server').length) {
    pool.push(() => ({
      id: id(s),
      kind: 'outage',
      severity: 'bad',
      at: s.clock,
      title: 'Store outage',
      body: 'The online store is down. Every minute offline is lost sales.',
      choices: [
        { id: 'fix', label: 'Pay for emergency fix', cost: Math.round(250 * scale), detail: 'Back online in 1 hour.' },
        { id: 'wait', label: 'Let the engineers handle it', detail: 'Back online in 6 hours. Engineers gain +5 skill.' },
      ],
    }));
  }

  if (sellers.length) {
    pool.push(() => {
      const w = rng.pick(sellers);
      return {
        id: id(s),
        kind: 'complaint',
        severity: 'bad',
        at: s.clock,
        title: 'Client complaint',
        workerId: w.id,
        body: `A big client says their ${product} order arrived late. ${w.name} took the call and is waiting on your decision.`,
        choices: [
          { id: 'refund', label: 'Refund them', cost: Math.round(180 * scale), detail: '+8 hype. The client stays loyal.' },
          { id: 'gift', label: 'Send free products', detail: `Lose 6 units of stock, +12 hype.` },
          { id: 'ignore', label: 'Ignore it', detail: '-15 hype. Nothing else happens today.' },
        ],
      };
    });
  }

  pool.push(() => {
    const offer = Math.round(1500 * scale);
    return {
      id: id(s),
      kind: 'investor',
      severity: 'neutral',
      at: s.clock,
      title: 'Investor in the lobby',
      body: `An investor loves the ${product} line and wants in.`,
      choices: [
        { id: 'take', label: 'Take the money', detail: `+${money(offer)} now. Rent rises for a while (+${money(60 * scale)}/day for 5 days).` },
        { id: 'decline', label: 'Politely decline', detail: '+6 mood for the team. Stay independent.' },
      ],
    };
  });

  pool.push(() => {
    const deal = Math.round(220 * scale);
    return {
      id: id(s),
      kind: 'supplier',
      severity: 'good',
      at: s.clock,
      title: 'Supplier deal',
      body: 'A fabric supplier offers a bulk discount if you pay today.',
      choices: [
        { id: 'buy', label: 'Buy the bulk order', cost: deal, detail: `+${Math.round(14 + 6 * scale)} units in stock immediately.` },
        { id: 'pass', label: 'Pass', detail: 'Nothing changes.' },
      ],
    };
  });

  if (anyWorker) {
    pool.push(() => {
      const w = anyWorker;
      const raise = Math.round(w.salary * 0.2);
      return {
        id: id(s),
        kind: 'raise',
        severity: 'neutral',
        at: s.clock,
        workerId: w.id,
        title: `${w.name} asks for a raise`,
        body: `${w.name} (${w.role}, skill ${w.skill}) wants ${money(raise)} more per day.`,
        choices: [
          { id: 'yes', label: 'Give the raise', detail: `Salary +${money(raise)}/day. ${w.name}: +20 mood.` },
          { id: 'bonus', label: 'One-off bonus instead', cost: raise * 3, detail: `${w.name}: +12 mood. Salary unchanged.` },
          { id: 'no', label: 'Not now', detail: `${w.name}: -18 mood.` },
        ],
      };
    });
  }

  pool.push(() => ({
    id: id(s),
    kind: 'press',
    severity: 'good',
    at: s.clock,
    title: 'Press wants a feature',
    body: `A city magazine wants to shoot your ${product} studio.`,
    choices: [
      { id: 'host', label: 'Host the shoot', cost: Math.round(120 * scale), detail: '+30 hype.' },
      { id: 'interview', label: 'Phone interview only', detail: '+12 hype.' },
    ],
  }));

  pool.push(() => ({
    id: id(s),
    kind: 'rent',
    severity: 'bad',
    at: s.clock,
    title: 'Landlord raises the rent',
    body: 'The building owner wants more. You can push back.',
    choices: [
      { id: 'pay', label: 'Pay the increase', cost: Math.round(200 * scale), detail: 'One-off payment. Nothing else changes.' },
      { id: 'negotiate', label: 'Negotiate', detail: '60% chance of no change, 40% chance of paying double.' },
    ],
  }));

  if (s.workers.length >= 3) {
    pool.push(() => ({
      id: id(s),
      kind: 'party',
      severity: 'good',
      at: s.clock,
      title: 'The team wants a night out',
      body: 'Friday energy. A party would lift everyone.',
      choices: [
        { id: 'throw', label: 'Throw the party', cost: Math.round(90 * s.workers.length), detail: 'Everyone: +18 mood, +20 energy.' },
        { id: 'pizza', label: 'Order pizza instead', cost: Math.round(30 * s.workers.length), detail: 'Everyone: +8 mood.' },
        { id: 'no', label: 'Not tonight', detail: 'Everyone: -5 mood.' },
      ],
    }));
  }

  const make = rng.pick(pool);
  return make();
}

export function applyEventChoice(s: GameState, ev: GameEvent, c: EventChoice, rng: Rng): Outcome {
  const scale = eventScale(s);
  const w = ev.workerId ? s.workers.find((x) => x.id === ev.workerId) : undefined;
  const all = (dMood: number, dEnergy = 0) => {
    for (const x of s.workers) {
      x.mood = Math.max(0, Math.min(100, x.mood + dMood));
      x.energy = Math.max(0, Math.min(100, x.energy + dEnergy));
    }
  };
  switch (ev.kind) {
    case 'viral': {
      s.stats.viralHits++;
      const boost = Math.round(900 * scale);
      if (c.id === 'ride') {
        s.hype = Math.min(100, s.hype + 25);
        return { cash: boost, text: `Viral: +${money(boost)}` };
      }
      if (c.id === 'ads') {
        s.hype = Math.min(100, s.hype + 45);
        return { cash: Math.round(boost * 1.8), text: `Viral with ads: +${money(boost * 1.8)}` };
      }
      s.hype = Math.min(100, s.hype + 10);
      all(8);
      return { cash: 0, text: 'The team loved the humility. +8 mood.' };
    }
    case 'outage': {
      if (c.id === 'fix') {
        s.outageUntil = s.clock + 1;
        return { cash: 0, text: 'Engineers are on it. Online in an hour.' };
      }
      s.outageUntil = s.clock + 6;
      for (const r of roomsOf(s, 'server')) for (const e of workersIn(s, r.id)) e.skill = Math.min(100, e.skill + 5);
      return { cash: 0, text: 'The engineers are learning the hard way. Back in 6 hours.' };
    }
    case 'complaint': {
      if (c.id === 'refund') {
        s.hype = Math.min(100, s.hype + 8);
        if (w) pushChat(s, w, 'Client is happy with the refund. Crisis averted.');
        return { cash: 0, text: 'Refund sent. The client stays.' };
      }
      if (c.id === 'gift') {
        s.inventory = Math.max(0, s.inventory - 6);
        s.hype = Math.min(100, s.hype + 12);
        if (w) pushChat(s, w, 'Sent them a box of freebies. They posted about it. Nice save.');
        return { cash: 0, text: 'Free products shipped. +12 hype.' };
      }
      s.hype = Math.max(0, s.hype - 15);
      if (w) pushChat(s, w, 'We ignored that complaint... they left a rough review.');
      return { cash: 0, text: 'The review stings. -15 hype.' };
    }
    case 'investor': {
      if (c.id === 'take') {
        const offer = Math.round(1500 * scale);
        // Simple model: pre-pay the five days of extra rent now.
        const extra = Math.round(60 * scale * 5);
        s.cash -= extra;
        s.stats.spentTotal += extra;
        s.stats.daySpent += extra;
        return { cash: offer, text: `Investment: +${money(offer)} (rent prepaid ${money(extra)})` };
      }
      all(6);
      return { cash: 0, text: 'Independent and proud. +6 mood.' };
    }
    case 'supplier': {
      if (c.id === 'buy') {
        const units = Math.round(14 + 6 * scale);
        s.inventory += units;
        return { cash: 0, text: `+${units} units in stock.` };
      }
      return { cash: 0, text: 'Passed on the deal.' };
    }
    case 'raise': {
      if (!w) return { cash: 0, text: 'That worker already left.' };
      const raise = Math.round(w.salary * 0.2);
      if (c.id === 'yes') {
        w.salary += raise;
        w.mood = Math.min(100, w.mood + 20);
        w.wantsRaise = false;
        pushChat(s, w, 'Thank you for the raise. You will not regret it.');
        return { cash: 0, text: `${w.name} now earns $${w.salary}/day.` };
      }
      if (c.id === 'bonus') {
        w.mood = Math.min(100, w.mood + 12);
        w.lastBonusDay = s.day;
        s.stats.bonusesPaid++;
        pushChat(s, w, 'A bonus works too. Thanks boss.');
        return { cash: 0, text: `${w.name} took the bonus.` };
      }
      w.mood = Math.max(0, w.mood - 18);
      pushChat(s, w, 'Okay. I hear you. Let us talk again soon.');
      return { cash: 0, text: `${w.name} is disappointed.` };
    }
    case 'press': {
      s.hype = Math.min(100, s.hype + (c.id === 'host' ? 30 : 12));
      return { cash: 0, text: c.id === 'host' ? 'The shoot looked incredible. +30 hype.' : 'Nice interview. +12 hype.' };
    }
    case 'rent': {
      if (c.id === 'pay') return { cash: 0, text: 'Paid. The landlord is quiet again.' };
      if (rng.chance(0.6)) return { cash: 0, text: 'You talked them down. No change.' };
      const dbl = Math.round(400 * scale);
      s.cash -= dbl;
      s.stats.spentTotal += dbl;
      s.stats.daySpent += dbl;
      return { cash: -dbl, text: `Negotiation failed. Paid ${money(dbl)}.` };
    }
    case 'party': {
      if (c.id === 'throw') {
        all(18, 20);
        return { cash: 0, text: 'Best night of the quarter. +18 mood.' };
      }
      if (c.id === 'pizza') {
        all(8);
        return { cash: 0, text: 'Pizza night. +8 mood.' };
      }
      all(-5);
      return { cash: 0, text: 'The team shrugged. -5 mood.' };
    }
  }
  return { cash: 0, text: 'Done.' };
}
