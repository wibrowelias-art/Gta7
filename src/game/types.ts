export type RoomType =
  | 'command'
  | 'factory'
  | 'shop'
  | 'treasury'
  | 'bar'
  | 'server'
  | 'studio'
  | 'lab';

export type WorkerState = 'idle' | 'walk' | 'work' | 'rest' | 'elevator' | 'meeting' | 'celebrate' | 'stomp';

export type WorkerRole = 'Maker' | 'Seller' | 'Marketer' | 'Engineer' | 'Analyst' | 'Scientist' | 'Generalist';

export interface Room {
  id: string;
  type: RoomType;
  floor: number;
  /** 0..2, slot index on the floor (elevator is left of slot 0). */
  slot: number;
  level: 1 | 2 | 3;
}

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  skill: number; // 0..100
  mood: number; // 0..100
  energy: number; // 0..100
  salary: number; // per game day
  roomId: string | null;
  /** Current floor & horizontal position in building units (0..1 across the floor). */
  floor: number;
  x: number;
  state: WorkerState;
  /** Where the worker is heading (room id) when walking. */
  targetRoomId: string | null;
  /** Time left in the current state, in game hours. */
  stateTimer: number;
  earned: number;
  outfit: number;
  seed: number;
  hiredDay: number;
  lastBonusDay: number;
  friends: string[];
  trait: WorkerTrait;
  /** Pending gripe about pay (shows angry stomp + raise request). */
  wantsRaise: boolean;
  unread: number;
  /** Fractional sales carried between steps. */
  acc: number;
}

export type WorkerTrait = 'Night owl' | 'Perfectionist' | 'Social' | 'Hustler' | 'Chill' | 'Tinkerer';

export interface Candidate {
  id: string;
  name: string;
  role: WorkerRole;
  skill: number;
  salary: number;
  hireFee: number;
  outfit: number;
  seed: number;
  trait: WorkerTrait;
}

export interface EventChoice {
  id: string;
  label: string;
  cost?: number;
  detail: string;
}

export interface GameEvent {
  id: string;
  kind: string;
  title: string;
  body: string;
  workerId?: string;
  choices: EventChoice[];
  /** Game-hour timestamp when it fired. */
  at: number;
  severity: 'good' | 'bad' | 'neutral';
}

export interface ChatMessage {
  id: string;
  from: 'you' | 'worker' | 'system';
  text: string;
  at: number; // game hours
  read: boolean;
}

export interface DayStats {
  day: number;
  revenue: number;
  spent: number;
  profit: number;
  bestWorkerId: string | null;
  bestEarned: number;
  highlight: string;
  endCash: number;
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  amount?: number;
  kind: 'money' | 'info' | 'event' | 'milestone';
}

export interface Milestone {
  id: string;
  title: string;
  desc: string;
  reward: number;
  target: number;
  progress: (s: GameState) => number;
}

export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  quality: 'auto' | 'high' | 'balanced' | 'battery';
  reducedMotion: boolean;
}

export interface MeetingFocus {
  id: 'sales' | 'quality' | 'crunch' | 'spirit';
  label: string;
  detail: string;
}

export interface GameState {
  version: number;
  company: string;
  cash: number;
  /** Total game hours elapsed. */
  clock: number;
  day: number;
  speed: 1 | 2 | 5;
  paused: boolean;
  floors: number;
  rooms: Room[];
  workers: Worker[];
  candidates: Candidate[];
  candidatesDay: number;
  inventory: number;
  productValue: number; // sale price per unit
  hype: number; // 0..100
  online: boolean;
  outageUntil: number;
  focus: MeetingFocus['id'] | null;
  focusUntil: number;
  lastMeetingDay: number;
  events: GameEvent[];
  eventTimer: number;
  chats: Record<string, ChatMessage[]>;
  log: LogEntry[];
  stats: {
    revenueTotal: number;
    spentTotal: number;
    dayRevenue: number;
    daySpent: number;
    dayEarnings: Record<string, number>;
    unitsSold: number;
    viralHits: number;
    bonusesPaid: number;
    days: DayStats[];
  };
  milestonesDone: string[];
  pendingMilestone: string | null;
  pendingReport: DayStats | null;
  tutorialStep: number;
  settings: Settings;
  rng: number;
  nextId: number;
  createdAt: number;
}

/** Transient effects the UI/renderer should react to. Produced by the sim each step. */
export type SimEffect =
  | { type: 'earn'; workerId: string; amount: number }
  | { type: 'pay'; workerId: string; amount: number }
  | { type: 'spend'; amount: number; label: string }
  | { type: 'sold'; workerId: string; units: number; amount: number }
  | { type: 'elevator'; workerId: string; from: number; to: number }
  | { type: 'event'; eventId: string }
  | { type: 'milestone'; id: string }
  | { type: 'viral' }
  | { type: 'outage' }
  | { type: 'dayEnd'; stats: DayStats }
  | { type: 'highfive'; a: string; b: string }
  | { type: 'stomp'; workerId: string }
  | { type: 'chat'; workerId: string }
  | { type: 'toast'; text: string; tone?: 'good' | 'bad' | 'info' };
