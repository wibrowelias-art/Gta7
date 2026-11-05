import { Rng } from './rng';
import { BUILDABLE, FIRST_NAMES, FLOOR_COST, FOCUSES, OUTFITS, PRODUCT_NAMES, ROLES, ROLE_FOR_ROOM, ROOMS, TRAITS, WORKER_LINES } from './data';
import type {
  Candidate,
  ChatMessage,
  DayStats,
  GameEvent,
  GameState,
  LogEntry,
  Room,
  RoomType,
  SimEffect,
  Worker,
  WorkerRole,
} from './types';
import { MILESTONES } from './milestones';
import { makeEvent, applyEventChoice } from './events';

export const SAVE_VERSION = 3;
/** Game hours per real second at 1x. One game day lasts two real minutes. */
export const HOURS_PER_SECOND = 24 / 120;

export const ELEVATOR_X = 0.07;
export const SLOT_X: [number, number][] = [
  [0.16, 0.42],
  [0.43, 0.69],
  [0.7, 0.97],
];
export const slotCenter = (slot: number): number => (SLOT_X[slot][0] + SLOT_X[slot][1]) / 2;

const WALK_SPEED = 1.7; // building widths per game hour
const ELEVATOR_SPEED = 0.28; // hours per floor

export function newGame(seed = Date.now() % 2147483647): GameState {
  const rng = new Rng(seed);
  const s: GameState = {
    version: SAVE_VERSION,
    company: '',
    cash: 650,
    clock: 8,
    day: 1,
    speed: 1,
    paused: false,
    floors: 1,
    rooms: [
      { id: 'r1', type: 'command', floor: 0, slot: 0, level: 1 },
      { id: 'r2', type: 'factory', floor: 0, slot: 1, level: 1 },
      { id: 'r3', type: 'shop', floor: 0, slot: 2, level: 1 },
    ],
    workers: [],
    candidates: [],
    candidatesDay: 0,
    inventory: 14,
    productValue: 42,
    hype: 12,
    online: false,
    outageUntil: 0,
    focus: null,
    focusUntil: 0,
    lastMeetingDay: -9,
    events: [],
    eventTimer: 7,
    chats: {},
    log: [],
    stats: {
      revenueTotal: 0,
      spentTotal: 0,
      dayRevenue: 0,
      daySpent: 0,
      dayEarnings: {},
      unitsSold: 0,
      viralHits: 0,
      bonusesPaid: 0,
      days: [],
    },
    milestonesDone: [],
    pendingMilestone: null,
    pendingReport: null,
    tutorialStep: 0,
    settings: { music: 0.5, sfx: 0.8, quality: 'auto', reducedMotion: false },
    rng: rng.state,
    nextId: 10,
    createdAt: Date.now(),
  };
  const w1 = makeWorker(s, rng, 'Bunc', 'Maker', 58, 0);
  const w2 = makeWorker(s, rng, 'Luke', 'Seller', 55, 1);
  w1.friends.push(w2.id);
  w2.friends.push(w1.id);
  s.workers.push(w1, w2);
  assignWorker(s, w1.id, 'r2');
  assignWorker(s, w2.id, 'r3');
  w1.x = slotCenter(1) - 0.04;
  w2.x = slotCenter(2) - 0.04;
  w1.state = 'work';
  w2.state = 'work';
  refreshCandidates(s, rng);
  s.rng = rng.state;
  s.chats[w1.id] = [msg(s, 'worker', 'Hey boss, welcome to the building. I am on the press, Luke is at the counter. Pay us well and we will make you rich.')];
  s.chats[w2.id] = [msg(s, 'worker', 'First customers are already queuing. Tap me any time if you want a sales update.')];
  w1.unread = 1;
  w2.unread = 1;
  return s;
}

function nid(s: GameState, prefix: string): string {
  return `${prefix}${(s.nextId++).toString(36)}`;
}

export function msg(s: GameState, from: ChatMessage['from'], text: string): ChatMessage {
  return { id: nid(s, 'm'), from, text, at: s.clock, read: from === 'you' };
}

function makeWorker(s: GameState, rng: Rng, name: string, role: WorkerRole, skill: number, outfit: number): Worker {
  return {
    id: nid(s, 'w'),
    name,
    role,
    skill,
    mood: 68,
    energy: 90,
    salary: expectedSalary(skill),
    roomId: null,
    floor: 0,
    x: ELEVATOR_X + 0.05,
    state: 'idle',
    targetRoomId: null,
    stateTimer: 0,
    earned: 0,
    outfit,
    seed: rng.int(1, 1e9),
    hiredDay: s.day,
    lastBonusDay: s.day,
    friends: [],
    trait: rng.pick(TRAITS),
    wantsRaise: false,
    unread: 0,
    acc: 0,
  };
}

export function expectedSalary(skill: number): number {
  return Math.round(24 + skill * 1.15);
}

export function refreshCandidates(s: GameState, rng: Rng): void {
  const used = new Set(s.workers.map((w) => w.name));
  const names = FIRST_NAMES.filter((n) => !used.has(n));
  s.candidates = [];
  for (let i = 0; i < 3; i++) {
    const name = names.splice(rng.int(0, names.length - 1), 1)[0] ?? `Nova ${rng.int(2, 99)}`;
    const skill = Math.min(96, rng.int(35, 60) + Math.floor(s.day * 1.5) + rng.int(0, 12));
    s.candidates.push({
      id: nid(s, 'c'),
      name,
      role: rng.pick(ROLES),
      skill,
      salary: expectedSalary(skill),
      hireFee: Math.round(120 + skill * 4.5),
      outfit: rng.int(0, OUTFITS.length - 1),
      seed: rng.int(1, 1e9),
      trait: rng.pick(TRAITS),
    });
  }
  s.candidatesDay = s.day;
}

export function roomById(s: GameState, id: string | null): Room | undefined {
  return id ? s.rooms.find((r) => r.id === id) : undefined;
}
export function workerById(s: GameState, id: string | null): Worker | undefined {
  return id ? s.workers.find((w) => w.id === id) : undefined;
}
export function workersIn(s: GameState, roomId: string): Worker[] {
  return s.workers.filter((w) => w.roomId === roomId);
}
export function roomsOf(s: GameState, type: RoomType): Room[] {
  return s.rooms.filter((r) => r.type === type);
}
export function roomName(s: GameState, r: Room): string {
  const same = roomsOf(s, r.type);
  const base = ROOMS[r.type].name;
  return same.length > 1 ? `${base} ${same.indexOf(r) + 1}` : base;
}
export function productName(s: GameState): string {
  return PRODUCT_NAMES[Math.min(PRODUCT_NAMES.length - 1, Math.floor(Math.max(0, s.productValue - 30) / 45))];
}

export function log(s: GameState, text: string, kind: LogEntry['kind'] = 'info', amount?: number): void {
  const e: LogEntry = { id: nid(s, 'l'), at: s.clock, text, kind };
  if (amount !== undefined) e.amount = amount;
  s.log.unshift(e);
  if (s.log.length > 120) s.log.length = 120;
}

function spend(s: GameState, amount: number, label: string, fx: SimEffect[]): void {
  s.cash -= amount;
  s.stats.spentTotal += amount;
  s.stats.daySpent += amount;
  fx.push({ type: 'spend', amount, label });
  log(s, label, 'money', -amount);
}

function earn(s: GameState, amount: number, worker: Worker | null, fx: SimEffect[], label?: string): void {
  s.cash += amount;
  s.stats.revenueTotal += amount;
  s.stats.dayRevenue += amount;
  if (worker) {
    worker.earned += amount;
    s.stats.dayEarnings[worker.id] = (s.stats.dayEarnings[worker.id] ?? 0) + amount;
    fx.push({ type: 'earn', workerId: worker.id, amount });
  }
  if (label) log(s, label, 'money', amount);
}

/* ------------------------------------------------------------------ */
/* Derived numbers                                                    */
/* ------------------------------------------------------------------ */

export function costTrim(s: GameState): number {
  let trim = 0;
  for (const r of roomsOf(s, 'treasury')) {
    for (const w of workersIn(s, r.id)) trim += (w.skill / 100) * 0.06 * r.level;
  }
  return Math.min(0.3, trim);
}

export function priceMultiplier(s: GameState): number {
  let m = 1 + s.hype / 100 * 0.7;
  if (s.focus === 'sales' && s.clock < s.focusUntil) m *= 1.35;
  return m;
}

export function dailyCosts(s: GameState): { salaries: number; rent: number; trim: number } {
  const salaries = s.workers.reduce((a, w) => a + w.salary, 0);
  const rent = 60 + 55 * s.floors + s.rooms.length * 18;
  return { salaries, rent, trim: costTrim(s) };
}

function moodFactor(w: Worker): number {
  return 0.55 + (w.mood / 100) * 0.65;
}
function energyFactor(w: Worker): number {
  return w.energy < 20 ? 0.4 : 0.7 + (w.energy / 100) * 0.4;
}
function roleFit(w: Worker, type: RoomType): number {
  return ROLE_FOR_ROOM[type] === w.role ? 1 : 0.55;
}
function levelMult(level: number): number {
  return [1, 1.45, 2.1][level - 1];
}

/** Units per game hour this worker produces or sells at full tilt. */
export function workerRate(_s: GameState, w: Worker, r: Room): number {
  const base = (0.35 + (w.skill / 100) * 0.55) * roleFit(w, r.type) * levelMult(r.level) * moodFactor(w) * energyFactor(w);
  if (w.trait === 'Hustler' && r.type === 'shop') return base * 1.15;
  if (w.trait === 'Perfectionist' && r.type === 'factory') return base * 1.1;
  return base;
}

/* ------------------------------------------------------------------ */
/* Main step                                                          */
/* ------------------------------------------------------------------ */

/** Advance the game by `hours` game hours. Returns transient effects for the presentation layer. */
export function step(s: GameState, hours: number): SimEffect[] {
  const fx: SimEffect[] = [];
  if (hours <= 0) return fx;
  const rng = new Rng(s.rng);
  const prevDay = s.day;
  s.clock += hours;
  s.day = Math.floor(s.clock / 24) + 1;
  const outage = s.clock < s.outageUntil;
  const crunch = s.focus === 'crunch' && s.clock < s.focusUntil;
  const quality = s.focus === 'quality' && s.clock < s.focusUntil;
  const spirit = s.focus === 'spirit' && s.clock < s.focusUntil;

  // Hype decays toward 8.
  s.hype = Math.max(0, s.hype - (s.hype - 8) * 0.03 * hours);

  for (const w of s.workers) stepWorker(s, w, hours, rng, fx, { outage, crunch, quality, spirit });

  // Passive online sales through the server room.
  if (s.online && !outage) {
    const servers = roomsOf(s, 'server');
    let rate = 0;
    for (const r of servers) {
      const staff = workersIn(s, r.id);
      rate += 0.25 * r.level * (0.5 + staff.length * 0.5) * (0.6 + s.hype / 100);
    }
    const sold = Math.min(s.inventory, rate * hours);
    if (sold > 0) {
      s.inventory -= sold;
      s.stats.unitsSold += sold;
      const amount = sold * s.productValue * priceMultiplier(s);
      earn(s, amount, null, fx);
    }
  }

  // Treasury interest.
  const analysts = roomsOf(s, 'treasury').flatMap((r) => workersIn(s, r.id));
  if (analysts.length && s.cash > 0) {
    const ratePerDay = analysts.reduce((a, w) => a + (w.skill / 100) * 0.004, 0);
    const interest = s.cash * ratePerDay * (hours / 24);
    earn(s, interest, null, fx);
  }

  // Events.
  if (s.tutorialStep >= 4 && s.events.length === 0) {
    s.eventTimer -= hours;
    if (s.eventTimer <= 0) {
      const ev = makeEvent(s, rng);
      if (ev) {
        s.events.push(ev);
        fx.push({ type: 'event', eventId: ev.id });
        if (ev.kind === 'viral') fx.push({ type: 'viral' });
        if (ev.kind === 'outage') fx.push({ type: 'outage' });
        log(s, ev.title, 'event');
        // Someone on the team texts about it.
        const commenters = s.workers.filter((w) => w.id !== ev.workerId);
        const lines = WORKER_LINES.eventComment[ev.kind];
        if (commenters.length && lines && rng.chance(0.75)) pushChat(s, rng.pick(commenters), rng.pick(lines), fx);
      }
      s.eventTimer = rng.range(7, 15);
    }
  }

  if (s.day !== prevDay) endDay(s, rng, fx);

  checkMilestones(s, fx);
  s.rng = rng.state;
  return fx;
}

interface Mods {
  outage: boolean;
  crunch: boolean;
  quality: boolean;
  spirit: boolean;
}

function stepWorker(s: GameState, w: Worker, hours: number, rng: Rng, fx: SimEffect[], mods: Mods): void {
  const room = roomById(s, w.roomId);
  const hourOfDay = s.clock % 24;
  const night = hourOfDay < 7 || hourOfDay > 23;

  // Mood drifts toward a baseline set by pay fairness and recent bonuses.
  const fair = (w.salary - expectedSalary(w.skill) * (1 + (s.day - w.hiredDay) * 0.012)) / 40;
  const recentBonus = Math.max(0, 1 - (s.day - w.lastBonusDay) / 6) * 14;
  let baseline = 56 + fair * 22 + recentBonus + (w.trait === 'Chill' ? 8 : 0) + (mods.spirit ? 15 : 0) - (mods.crunch ? 12 : 0);
  if (room?.type === 'bar') baseline += 10;
  if (w.friends.length) baseline += 4;
  baseline = Math.max(8, Math.min(100, baseline));
  w.mood += (baseline - w.mood) * Math.min(1, 0.12 * hours);

  if (w.mood < 30 && !w.wantsRaise && s.day - w.hiredDay >= 1) {
    w.wantsRaise = true;
    fx.push({ type: 'stomp', workerId: w.id });
    pushChat(s, w, rng.pick(WORKER_LINES.raise), fx);
  }
  if (w.mood > 45) w.wantsRaise = false;

  switch (w.state) {
    case 'idle': {
      w.energy = Math.min(100, w.energy + 6 * hours);
      if (w.roomId && room) {
        w.state = 'walk';
        w.targetRoomId = w.roomId;
      } else {
        w.stateTimer -= hours;
        if (w.stateTimer <= 0) {
          w.stateTimer = rng.range(1.5, 4);
          w.x = clamp(w.x + rng.range(-0.08, 0.08), 0.12, 0.95);
        }
      }
      break;
    }
    case 'walk': {
      const target = roomById(s, w.targetRoomId);
      if (!target) {
        w.state = 'idle';
        break;
      }
      if (target.floor !== w.floor) {
        // Walk to elevator first.
        if (Math.abs(w.x - ELEVATOR_X) > 0.01) {
          w.x = approach(w.x, ELEVATOR_X, WALK_SPEED * hours);
        } else {
          w.state = 'elevator';
          w.stateTimer = ELEVATOR_SPEED * Math.abs(target.floor - w.floor) + 0.1;
          fx.push({ type: 'elevator', workerId: w.id, from: w.floor, to: target.floor });
        }
        break;
      }
      const dest = deskX(s, w, target);
      w.x = approach(w.x, dest, WALK_SPEED * hours);
      if (Math.abs(w.x - dest) < 0.004) {
        w.x = dest;
        if (target.type === 'bar' && w.roomId !== target.id) {
          w.state = 'rest';
          w.stateTimer = rng.range(1.5, 3);
        } else if (target.type === 'command' && w.roomId !== target.id) {
          w.state = 'meeting';
          w.stateTimer = 2;
        } else {
          w.state = 'work';
          w.stateTimer = rng.range(2, 5);
        }
      }
      // Friends crossing paths high-five.
      for (const o of s.workers) {
        if (o === w || o.floor !== w.floor || o.state !== 'walk') continue;
        if (Math.abs(o.x - w.x) < 0.02 && w.friends.includes(o.id) && rng.chance(0.4 * hours)) {
          fx.push({ type: 'highfive', a: w.id, b: o.id });
          w.mood = Math.min(100, w.mood + 2);
          o.mood = Math.min(100, o.mood + 2);
        }
      }
      break;
    }
    case 'elevator': {
      w.stateTimer -= hours;
      if (w.stateTimer <= 0) {
        const target = roomById(s, w.targetRoomId);
        if (target) w.floor = target.floor;
        w.state = 'walk';
      }
      break;
    }
    case 'work': {
      if (!room || w.roomId !== room.id) {
        w.state = 'idle';
        break;
      }
      let drain = 3.2 * hours * (w.trait === 'Chill' ? 0.75 : 1) * (night && w.trait !== 'Night owl' ? 1.4 : 1);
      if (mods.crunch) drain *= 1.3;
      if (room.type === 'shop' && s.focus === 'sales' && s.clock < s.focusUntil) drain *= 1.3;
      w.energy = Math.max(0, w.energy - drain);
      produce(s, w, room, hours, fx, mods);
      w.stateTimer -= hours;
      if (w.energy < 18) {
        const bar = nearestRoom(s, w, 'bar');
        if (bar) {
          w.state = 'walk';
          w.targetRoomId = bar.id;
        } else {
          w.state = 'rest';
          w.stateTimer = rng.range(1, 2);
        }
      } else if (w.stateTimer <= 0) {
        // Occasionally take a stretch / look-around; the renderer plays a micro-animation.
        w.stateTimer = rng.range(2, 5);
      }
      break;
    }
    case 'rest': {
      const here = s.rooms.find((r) => r.floor === w.floor && w.x >= SLOT_X[r.slot][0] && w.x <= SLOT_X[r.slot][1]);
      const atBar = here?.type === 'bar';
      w.energy = Math.min(100, w.energy + (atBar ? 22 * levelMult(here!.level) : 9) * hours);
      if (atBar) {
        w.mood = Math.min(100, w.mood + 3 * hours);
        // Make friends with other bar-goers.
        for (const o of s.workers) {
          if (o === w || o.floor !== w.floor || o.state !== 'rest') continue;
          if (!w.friends.includes(o.id) && rng.chance((mods.spirit ? 0.6 : 0.25) * hours)) {
            w.friends.push(o.id);
            o.friends.push(w.id);
            pushChat(s, w, rng.pick(WORKER_LINES.gossip).replace('{other}', o.name), fx);
          }
        }
      }
      w.stateTimer -= hours;
      if (w.energy > 82 || (w.stateTimer <= 0 && w.energy > 55)) {
        if (w.roomId) {
          w.state = 'walk';
          w.targetRoomId = w.roomId;
        } else {
          w.state = 'idle';
        }
      }
      break;
    }
    case 'meeting': {
      w.stateTimer -= hours;
      if (w.stateTimer <= 0) {
        w.state = w.roomId ? 'walk' : 'idle';
        w.targetRoomId = w.roomId;
      }
      break;
    }
    case 'celebrate':
    case 'stomp': {
      w.stateTimer -= hours;
      if (w.stateTimer <= 0) {
        w.state = w.roomId ? 'walk' : 'idle';
        w.targetRoomId = w.roomId;
      }
      break;
    }
  }
}

function produce(s: GameState, w: Worker, room: Room, hours: number, fx: SimEffect[], mods: Mods): void {
  let rate = workerRate(s, w, room) * hours;
  if (mods.crunch) rate *= 1.4;
  if (mods.quality && room.type === 'factory') rate *= 0.9;
  switch (room.type) {
    case 'factory': {
      s.inventory += rate * 1.0;
      break;
    }
    case 'shop': {
      if (s.inventory <= 0.5) break;
      const acc = w.acc + rate * 1.15;
      const units = Math.floor(acc);
      w.acc = acc - units;
      if (units > 0) {
        const sold = Math.min(units, Math.floor(s.inventory));
        if (sold > 0) {
          s.inventory -= sold;
          s.stats.unitsSold += sold;
          const amount = Math.round(sold * s.productValue * priceMultiplier(s));
          earn(s, amount, w, fx);
          fx.push({ type: 'sold', workerId: w.id, units: sold, amount });
          s.hype = Math.min(100, s.hype + 0.15 * sold);
        }
      }
      break;
    }
    case 'studio': {
      s.hype = Math.min(100, s.hype + rate * 2.4);
      break;
    }
    case 'lab': {
      const growth = rate * 0.9 * (mods.quality ? 1.25 : 1);
      s.productValue += growth;
      break;
    }
    case 'server': {
      s.online = true;
      break;
    }
    case 'treasury':
    case 'command':
    case 'bar':
      break;
  }
}

function deskX(s: GameState, w: Worker, room: Room): number {
  const [a, b] = SLOT_X[room.slot];
  const occupants = s.workers.filter((o) => o.roomId === room.id || o.targetRoomId === room.id);
  const idx = Math.max(0, occupants.indexOf(w));
  const n = Math.max(2, occupants.length);
  const pad = 0.035;
  return a + pad + ((b - a - pad * 2) * (idx + 0.5)) / n;
}

function nearestRoom(s: GameState, w: Worker, type: RoomType): Room | undefined {
  const list = roomsOf(s, type);
  if (!list.length) return undefined;
  return list.sort((p, q) => Math.abs(p.floor - w.floor) - Math.abs(q.floor - w.floor))[0];
}

function approach(x: number, target: number, maxDelta: number): number {
  const d = target - x;
  if (Math.abs(d) <= maxDelta) return target;
  return x + Math.sign(d) * maxDelta;
}
function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function pushChat(s: GameState, w: Worker, text: string, fx?: SimEffect[]): void {
  const list = (s.chats[w.id] ??= []);
  list.push(msg(s, 'worker', text));
  if (list.length > 80) list.splice(0, list.length - 80);
  w.unread++;
  fx?.push({ type: 'chat', workerId: w.id });
}

/* ------------------------------------------------------------------ */
/* Day end                                                            */
/* ------------------------------------------------------------------ */

function endDay(s: GameState, rng: Rng, fx: SimEffect[]): void {
  const dayNo = s.day - 1;
  const costs = dailyCosts(s);
  const salaries = Math.round(costs.salaries * (1 - costs.trim));
  const rent = Math.round(costs.rent * (1 - costs.trim));
  if (salaries) spend(s, salaries, `Salaries for day ${dayNo}`, fx);
  spend(s, rent, `Rent and utilities for day ${dayNo}`, fx);

  let bestId: string | null = null;
  let best = 0;
  for (const [id, amt] of Object.entries(s.stats.dayEarnings)) {
    if (amt > best) {
      best = amt;
      bestId = id;
    }
  }
  const bestWorker = workerById(s, bestId);
  const highlight = pickHighlight(s, rng, bestWorker, best);
  const stats: DayStats = {
    day: dayNo,
    revenue: Math.round(s.stats.dayRevenue),
    spent: Math.round(s.stats.daySpent),
    profit: Math.round(s.stats.dayRevenue - s.stats.daySpent),
    bestWorkerId: bestId,
    bestEarned: Math.round(best),
    highlight,
    endCash: Math.round(s.cash),
  };
  s.stats.days.push(stats);
  if (s.stats.days.length > 60) s.stats.days.shift();
  s.stats.dayRevenue = 0;
  s.stats.daySpent = 0;
  s.stats.dayEarnings = {};
  s.pendingReport = stats;
  fx.push({ type: 'dayEnd', stats });
  if (bestWorker) {
    bestWorker.mood = Math.min(100, bestWorker.mood + 4);
    pushChat(s, bestWorker, `Top earner today with $${Math.round(best)}. Not bad, right?`, fx);
  }
  if (s.day - s.candidatesDay >= 1) refreshCandidates(s, rng);

  // A quiet salesperson texts about a real thing that happened.
  const sellers = s.workers.filter((w) => roomById(s, w.roomId)?.type === 'shop');
  if (sellers.length && rng.chance(0.6)) {
    const w = rng.pick(sellers);
    pushChat(s, w, rng.pick(WORKER_LINES.sold).replace('{n}', String(rng.int(2, 6))).replace('{product}', productName(s)).replace('{amount}', String(Math.round(s.productValue * rng.int(2, 6)))), fx);
  }
}

function pickHighlight(s: GameState, rng: Rng, best: Worker | undefined, amount: number): string {
  const opts: string[] = [];
  if (best) opts.push(`${best.name} brought in $${Math.round(amount)} alone.`);
  if (s.stats.unitsSold > 0) opts.push(`${Math.round(s.stats.unitsSold)} ${productName(s)}s sold so far.`);
  if (s.hype > 50) opts.push(`Hype is at ${Math.round(s.hype)}%. The city is talking.`);
  if (s.inventory > 40) opts.push(`${Math.floor(s.inventory)} units waiting in stock. Hire a Seller.`);
  if (s.inventory < 3) opts.push('Stock ran dry. The Factory needs hands.');
  if (s.workers.some((w) => w.mood < 35)) opts.push('Someone is unhappy with their pay.');
  if (!opts.length) opts.push('A steady day. Build something new.');
  return rng.pick(opts);
}

/* ------------------------------------------------------------------ */
/* Milestones                                                         */
/* ------------------------------------------------------------------ */

function checkMilestones(s: GameState, fx: SimEffect[]): void {
  if (s.pendingMilestone) return;
  for (const m of MILESTONES) {
    if (s.milestonesDone.includes(m.id)) continue;
    if (m.progress(s) >= m.target) {
      s.milestonesDone.push(m.id);
      s.pendingMilestone = m.id;
      if (m.reward) {
        s.cash += m.reward;
        s.stats.revenueTotal += m.reward;
        log(s, `Milestone: ${m.title}`, 'milestone', m.reward);
      } else log(s, `Milestone: ${m.title}`, 'milestone');
      for (const w of s.workers) {
        w.mood = Math.min(100, w.mood + 6);
        if (w.state === 'work' || w.state === 'idle') {
          w.state = 'celebrate';
          w.stateTimer = 0.6;
        }
      }
      fx.push({ type: 'milestone', id: m.id });
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Player actions. Each returns a string error or null.                */
/* ------------------------------------------------------------------ */

export type ActionResult = { ok: true; fx: SimEffect[] } | { ok: false; error: string };

const ok = (fx: SimEffect[] = []): ActionResult => ({ ok: true, fx });
const fail = (error: string): ActionResult => ({ ok: false, error });

export function setCompany(s: GameState, name: string): ActionResult {
  const n = name.trim().slice(0, 24);
  if (n.length < 2) return fail('Name needs at least 2 characters.');
  s.company = n;
  if (s.tutorialStep === 0) s.tutorialStep = 1;
  return ok();
}

export function payBonus(s: GameState, workerId: string, amount: number): ActionResult {
  const w = workerById(s, workerId);
  if (!w) return fail('Worker not found.');
  if (amount <= 0) return fail('Pick an amount.');
  if (s.cash < amount) return fail('Not enough cash.');
  const fx: SimEffect[] = [];
  spend(s, amount, `Bonus for ${w.name}`, fx);
  fx.push({ type: 'pay', workerId: w.id, amount });
  w.mood = Math.min(100, w.mood + 10 + amount / 20);
  w.lastBonusDay = s.day;
  w.wantsRaise = false;
  s.stats.bonusesPaid++;
  if (w.state === 'work' || w.state === 'idle') {
    w.state = 'celebrate';
    w.stateTimer = 0.5;
  }
  const rng = new Rng(s.rng);
  pushChat(s, w, rng.pick(WORKER_LINES.thanksBonus), fx);
  s.rng = rng.state;
  if (s.tutorialStep === 2) s.tutorialStep = 3;
  return ok(fx);
}

export function giveRaise(s: GameState, workerId: string, amount: number): ActionResult {
  const w = workerById(s, workerId);
  if (!w) return fail('Worker not found.');
  if (amount <= 0) return fail('Pick an amount.');
  w.salary += amount;
  w.mood = Math.min(100, w.mood + 14);
  w.wantsRaise = false;
  log(s, `${w.name}'s salary is now $${w.salary}/day`);
  return ok([{ type: 'toast', text: `${w.name} now earns $${w.salary}/day`, tone: 'info' }]);
}

export function assignWorker(s: GameState, workerId: string, roomId: string | null): ActionResult {
  const w = workerById(s, workerId);
  if (!w) return fail('Worker not found.');
  if (roomId) {
    const r = roomById(s, roomId);
    if (!r) return fail('Room not found.');
    const occ = workersIn(s, r.id).filter((o) => o.id !== w.id).length;
    if (occ >= ROOMS[r.type].capacity) return fail(`${roomName(s, r)} is full (${ROOMS[r.type].capacity} desks).`);
    w.roomId = r.id;
    w.targetRoomId = r.id;
    if (w.state !== 'elevator') w.state = 'walk';
    return ok([{ type: 'toast', text: `${w.name} → ${roomName(s, r)}`, tone: 'info' }]);
  }
  w.roomId = null;
  w.targetRoomId = null;
  w.state = 'idle';
  return ok();
}

export function hire(s: GameState, candidateId: string): ActionResult {
  const i = s.candidates.findIndex((c) => c.id === candidateId);
  if (i < 0) return fail('Candidate is gone.');
  const c = s.candidates[i];
  if (s.cash < c.hireFee) return fail(`Need $${c.hireFee} to hire ${c.name}.`);
  const fx: SimEffect[] = [];
  spend(s, c.hireFee, `Hired ${c.name}`, fx);
  s.candidates.splice(i, 1);
  const rng = new Rng(s.rng);
  const w = makeWorker(s, rng, c.name, c.role, c.skill, c.outfit);
  w.trait = c.trait;
  w.seed = c.seed;
  w.salary = c.salary;
  s.workers.push(w);
  // Auto-seat in a matching room with space.
  const target = s.rooms.find((r) => ROLE_FOR_ROOM[r.type] === c.role && workersIn(s, r.id).length < ROOMS[r.type].capacity);
  if (target) assignWorker(s, w.id, target.id);
  s.chats[w.id] = [msg(s, 'worker', `Hi! ${c.name} here, your new ${c.role}. ${target ? `Heading to ${roomName(s, target)} now.` : 'Where should I sit?'}`)];
  w.unread = 1;
  fx.push({ type: 'chat', workerId: w.id });
  if (s.candidates.length === 0) refreshCandidates(s, rng);
  s.rng = rng.state;
  fx.push({ type: 'toast', text: `${c.name} joined as ${c.role}`, tone: 'good' });
  return ok(fx);
}

export function fire(s: GameState, workerId: string): ActionResult {
  const w = workerById(s, workerId);
  if (!w) return fail('Worker not found.');
  if (s.workers.length <= 1) return fail('You need at least one worker.');
  const fx: SimEffect[] = [];
  const severance = w.salary * 2;
  if (s.cash < severance) return fail(`Severance is $${severance}. Not enough cash.`);
  spend(s, severance, `Severance for ${w.name}`, fx);
  s.workers = s.workers.filter((o) => o.id !== w.id);
  for (const o of s.workers) o.friends = o.friends.filter((f) => f !== w.id);
  delete s.chats[w.id];
  fx.push({ type: 'toast', text: `${w.name} left the company`, tone: 'bad' });
  return ok(fx);
}

export function buildRoom(s: GameState, floor: number, slot: number, type: RoomType): ActionResult {
  if (!BUILDABLE.includes(type)) return fail('That room cannot be built.');
  if (floor < 0 || floor >= s.floors) return fail('Build a floor first.');
  if (s.rooms.some((r) => r.floor === floor && r.slot === slot)) return fail('That slot is taken.');
  const def = ROOMS[type];
  if (s.cash < def.cost) return fail(`Need $${def.cost} for a ${def.name}.`);
  const fx: SimEffect[] = [];
  spend(s, def.cost, `Built ${def.name}`, fx);
  const r: Room = { id: nid(s, 'r'), type, floor, slot, level: 1 };
  s.rooms.push(r);
  if (type === 'server') s.online = true;
  fx.push({ type: 'toast', text: `${def.name} built on floor ${floor + 1}`, tone: 'good' });
  if (s.tutorialStep === 3) s.tutorialStep = 4;
  return ok(fx);
}

export function buildFloor(s: GameState): ActionResult {
  if (s.floors >= 8) return fail('The tower is at its maximum height.');
  const cost = FLOOR_COST(s.floors);
  if (s.cash < cost) return fail(`Need $${cost} for floor ${s.floors + 1}.`);
  const fx: SimEffect[] = [];
  spend(s, cost, `Built floor ${s.floors + 1}`, fx);
  s.floors++;
  fx.push({ type: 'toast', text: `Floor ${s.floors} is open`, tone: 'good' });
  return ok(fx);
}

export function upgradeRoom(s: GameState, roomId: string): ActionResult {
  const r = roomById(s, roomId);
  if (!r) return fail('Room not found.');
  if (r.level >= 3) return fail('Already at the top level.');
  const cost = ROOMS[r.type].upgradeCost[r.level - 1];
  if (s.cash < cost) return fail(`Need $${cost} to upgrade.`);
  const fx: SimEffect[] = [];
  spend(s, cost, `Upgraded ${roomName(s, r)} to level ${r.level + 1}`, fx);
  r.level = (r.level + 1) as Room['level'];
  for (const w of workersIn(s, r.id)) w.mood = Math.min(100, w.mood + 5);
  fx.push({ type: 'toast', text: `${roomName(s, r)} → ${ROOMS[r.type].levelNames[r.level - 1]}`, tone: 'good' });
  return ok(fx);
}

export function resolveEvent(s: GameState, eventId: string, choiceId: string): ActionResult {
  const i = s.events.findIndex((e) => e.id === eventId);
  if (i < 0) return fail('Event already handled.');
  const ev = s.events[i];
  const choice = ev.choices.find((c) => c.id === choiceId);
  if (!choice) return fail('Unknown choice.');
  if (choice.cost && s.cash < choice.cost) return fail(`Need $${choice.cost}.`);
  const fx: SimEffect[] = [];
  if (choice.cost) spend(s, choice.cost, `${ev.title}: ${choice.label}`, fx);
  const rng = new Rng(s.rng);
  const result = applyEventChoice(s, ev, choice, rng);
  s.rng = rng.state;
  if (result.cash > 0) earn(s, result.cash, null, fx, `${ev.title}: ${choice.label}`);
  s.events.splice(i, 1);
  fx.push({ type: 'toast', text: result.text, tone: result.cash >= 0 ? 'good' : 'bad' });
  return ok(fx);
}

export function callMeeting(s: GameState, focusId: (typeof FOCUSES)[number]['id']): ActionResult {
  if (s.day - s.lastMeetingDay < 1) return fail('One meeting per day. The team needs to work too.');
  const command = roomsOf(s, 'command')[0];
  if (!command) return fail('No Command room.');
  const focus = FOCUSES.find((f) => f.id === focusId);
  if (!focus) return fail('Unknown focus.');
  s.focus = focus.id;
  s.focusUntil = s.clock + 24;
  s.lastMeetingDay = s.day;
  for (const w of s.workers) {
    w.targetRoomId = command.id;
    if (w.state !== 'elevator') w.state = 'walk';
    if (focus.id === 'spirit') w.mood = Math.min(100, w.mood + 15);
    if (focus.id === 'crunch') w.mood = Math.max(0, w.mood - 12);
  }
  log(s, `Meeting: ${focus.label}`, 'event');
  return ok([{ type: 'toast', text: `Meeting called: ${focus.label}`, tone: 'info' }]);
}

export function setSpeed(s: GameState, speed: GameState['speed']): void {
  s.speed = speed;
}

export function dismissMilestone(s: GameState): void {
  s.pendingMilestone = null;
}
export function dismissReport(s: GameState): void {
  s.pendingReport = null;
}

/** Candidate list shown in the Hire panel. Exposed for tests. */
export function candidates(s: GameState): Candidate[] {
  return s.candidates;
}

export { FOCUSES, MILESTONES, ROOMS, FLOOR_COST };
export type { GameEvent };
