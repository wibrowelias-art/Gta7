/* eslint-disable no-console */
/**
 * Plays 30 game days with simple player policies and prints a table.
 * Run with: npm run balance [-- --seed=7 --policy=greedy|cautious|bad]
 */
import { newGame, step, hire, buildRoom, buildFloor, upgradeRoom, payBonus, resolveEvent, callMeeting, setCompany, FLOOR_COST, ROOMS } from '../src/game/sim';
import type { GameState, RoomType } from '../src/game/types';

type Policy = 'greedy' | 'cautious' | 'bad';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const seed = Number(args.seed ?? 42);
const policy = (args.policy ?? 'greedy') as Policy;
const quiet = 'quiet' in args;

function freeSlot(s: GameState): { floor: number; slot: number } | null {
  for (let f = 0; f < s.floors; f++) for (let sl = 0; sl < 3; sl++) if (!s.rooms.some((r) => r.floor === f && r.slot === sl)) return { floor: f, slot: sl };
  return null;
}

const BUILD_ORDER: RoomType[] = ['bar', 'studio', 'factory', 'shop', 'server', 'treasury', 'lab', 'factory', 'shop', 'studio', 'factory', 'shop'];

function act(s: GameState, p: Policy): void {
  // Always answer events: greedy takes the first paid option it can afford, cautious the free one, bad the worst.
  for (const ev of [...s.events]) {
    const choice = p === 'bad' ? ev.choices[ev.choices.length - 1] : p === 'cautious' ? ev.choices.find((c) => !c.cost) ?? ev.choices[0] : ev.choices.find((c) => !c.cost || c.cost < s.cash * 0.3) ?? ev.choices[0];
    resolveEvent(s, ev.id, choice.id);
  }
  if (p === 'bad') {
    // Hires everyone, never builds, never pays bonuses.
    for (const c of [...s.candidates]) hire(s, c.id);
    return;
  }
  const reserve = p === 'cautious' ? 800 : 300;
  // Keep morale: bonus anyone unhappy.
  for (const w of s.workers) if (w.mood < 40 && s.cash - reserve > 80) payBonus(s, w.id, 80);
  // Hire when there is a seat with a matching role.
  for (const c of [...s.candidates]) {
    const seat = s.rooms.find((r) => ROOMS[r.type].role === c.role && s.workers.filter((w) => w.roomId === r.id).length < ROOMS[r.type].capacity);
    if (seat && s.cash - c.hireFee > reserve && s.workers.length < 3 + s.rooms.length) hire(s, c.id);
  }
  // Build.
  const slot = freeSlot(s);
  if (slot) {
    const counts = (t: RoomType) => s.rooms.filter((r) => r.type === t).length;
    const next = BUILD_ORDER.find((t, i) => counts(t) < BUILD_ORDER.slice(0, i + 1).filter((x) => x === t).length) ?? 'shop';
    if (s.cash - ROOMS[next].cost > reserve) buildRoom(s, slot.floor, slot.slot, next);
  } else if (s.cash - FLOOR_COST(s.floors) > reserve) buildFloor(s);
  // Upgrade cheapest room.
  const up = [...s.rooms].filter((r) => r.level < 3).sort((a, b) => ROOMS[a.type].upgradeCost[a.level - 1] - ROOMS[b.type].upgradeCost[b.level - 1])[0];
  if (up && s.cash - ROOMS[up.type].upgradeCost[up.level - 1] > reserve * 2) upgradeRoom(s, up.id);
  // Daily meeting.
  if (s.day - s.lastMeetingDay >= 1) callMeeting(s, p === 'cautious' ? 'spirit' : 'sales');
}

export function run(seedIn: number, p: Policy, days = 30): { rows: string[]; flat: number; bankrupt: boolean; s: GameState } {
  const s = newGame(seedIn);
  setCompany(s, 'Balance Co');
  s.tutorialStep = 4;
  const rows: string[] = [];
  let flat = 0;
  let maxFlat = 0;
  let lastCash = s.cash;
  let bankrupt = false;
  for (let d = 1; d <= days; d++) {
    for (let h = 0; h < 24 * 6; h++) {
      step(s, 1 / 6);
      if (h % 36 === 0) act(s, p);
      s.pendingMilestone = null;
      s.pendingReport = null;
    }
    const st = s.stats.days[s.stats.days.length - 1];
    const delta = Math.abs(s.cash - lastCash);
    if (delta < Math.max(50, lastCash * 0.02)) flat++;
    else flat = 0;
    maxFlat = Math.max(maxFlat, flat);
    lastCash = s.cash;
    if (s.cash < -500) bankrupt = true;
    rows.push(
      `${String(d).padStart(3)} | cash ${Math.round(s.cash).toString().padStart(8)} | rev ${String(st?.revenue ?? 0).padStart(6)} | spent ${String(st?.spent ?? 0).padStart(6)} | workers ${String(s.workers.length).padStart(2)} | rooms ${String(s.rooms.length).padStart(2)} | floors ${s.floors} | hype ${Math.round(s.hype).toString().padStart(3)} | stock ${Math.round(s.inventory).toString().padStart(4)} | value ${Math.round(s.productValue)}`,
    );
  }
  return { rows, flat: maxFlat, bankrupt, s };
}

if (!process.env.VITEST) {
  const r = run(seed, policy);
  if (!quiet) console.log(r.rows.join('\n'));
  console.log(`\npolicy=${policy} seed=${seed} longestFlatStreak=${r.flat} days bankrupt=${r.bankrupt} revenue=${Math.round(r.s.stats.revenueTotal)} milestones=${r.s.milestonesDone.join(',')}`);
}
