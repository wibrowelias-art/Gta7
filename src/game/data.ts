import type { MeetingFocus, RoomType, WorkerRole, WorkerTrait } from './types';

export interface RoomDef {
  type: RoomType;
  name: string;
  tagline: string;
  /** Hex colour of the room light. */
  light: number;
  lightCss: string;
  cost: number;
  upgradeCost: [number, number]; // to level 2, to level 3
  role: WorkerRole;
  capacity: number;
  icon: string;
  levelNames: [string, string, string];
}

export const ROOMS: Record<RoomType, RoomDef> = {
  command: {
    type: 'command',
    name: 'Command',
    tagline: 'Milestones, meetings and the big picture.',
    light: 0xffc857,
    lightCss: '#ffc857',
    cost: 0,
    upgradeCost: [2400, 9000],
    role: 'Generalist',
    capacity: 6,
    icon: 'command',
    levelNames: ['Founder desk', 'Glass boardroom', 'Penthouse command'],
  },
  factory: {
    type: 'factory',
    name: 'Factory',
    tagline: 'Makers turn hours into products.',
    light: 0xff8a3d,
    lightCss: '#ff8a3d',
    cost: 900,
    upgradeCost: [1800, 6500],
    role: 'Maker',
    capacity: 3,
    icon: 'factory',
    levelNames: ['Print bench', 'Robotic line', 'Automated plant'],
  },
  shop: {
    type: 'shop',
    name: 'Shop',
    tagline: 'Sellers turn products into cash.',
    light: 0xff3d8b,
    lightCss: '#ff3d8b',
    cost: 900,
    upgradeCost: [1800, 6500],
    role: 'Seller',
    capacity: 3,
    icon: 'shop',
    levelNames: ['Pop-up counter', 'Neon storefront', 'Flagship store'],
  },
  treasury: {
    type: 'treasury',
    name: 'Treasury',
    tagline: 'Analysts trim costs and grow the float.',
    light: 0x3dff8f,
    lightCss: '#3dff8f',
    cost: 1600,
    upgradeCost: [3200, 9000],
    role: 'Analyst',
    capacity: 2,
    icon: 'treasury',
    levelNames: ['Ledger desk', 'Vault', 'Trading floor'],
  },
  bar: {
    type: 'bar',
    name: 'Chill Bar',
    tagline: 'Pool, drinks and gossip. Energy and mood recover here.',
    light: 0x8b5cf6,
    lightCss: '#8b5cf6',
    cost: 1200,
    upgradeCost: [2200, 7000],
    role: 'Generalist',
    capacity: 5,
    icon: 'bar',
    levelNames: ['Corner bar', 'Lounge with pool', 'Rooftop lounge'],
  },
  server: {
    type: 'server',
    name: 'Server Room',
    tagline: 'Engineers keep the online store up and fast.',
    light: 0x3fd0ff,
    lightCss: '#3fd0ff',
    cost: 2200,
    upgradeCost: [3600, 10000],
    role: 'Engineer',
    capacity: 2,
    icon: 'server',
    levelNames: ['Rack closet', 'Blade cluster', 'Liquid-cooled farm'],
  },
  studio: {
    type: 'studio',
    name: 'Studio',
    tagline: 'Marketers build hype. Hype sells.',
    light: 0x2ee6c8,
    lightCss: '#2ee6c8',
    cost: 1800,
    upgradeCost: [3200, 9000],
    role: 'Marketer',
    capacity: 3,
    icon: 'studio',
    levelNames: ['Ring-light corner', 'Content studio', 'Broadcast stage'],
  },
  lab: {
    type: 'lab',
    name: 'Lab',
    tagline: 'Scientists raise the value of every product.',
    light: 0xffc857,
    lightCss: '#ffc857',
    cost: 2600,
    upgradeCost: [4200, 12000],
    role: 'Scientist',
    capacity: 2,
    icon: 'lab',
    levelNames: ['Workbench', 'Clean room', 'Research wing'],
  },
};

export const BUILDABLE: RoomType[] = ['factory', 'shop', 'studio', 'bar', 'treasury', 'server', 'lab'];

export const FLOOR_COST = (floors: number): number => Math.round(2500 * Math.pow(1.6, floors - 1));

export const FIRST_NAMES = [
  'Bunc', 'Luke', 'Mara', 'Zed', 'Ivy', 'Rook', 'Nia', 'Dex', 'Sol', 'Kai', 'Vera', 'Juno', 'Rex', 'Lola',
  'Milo', 'Sade', 'Theo', 'Ria', 'Cash', 'Nova', 'Otis', 'Pia', 'Ras', 'Tam', 'Yuki', 'Bo', 'Esme', 'Flyn',
];

export const ROLES: WorkerRole[] = ['Maker', 'Seller', 'Marketer', 'Engineer', 'Analyst', 'Scientist'];
export const TRAITS: WorkerTrait[] = ['Night owl', 'Perfectionist', 'Social', 'Hustler', 'Chill', 'Tinkerer'];

/** Outfit palettes: [top, bottom, accent, skin, hair]. */
export const OUTFITS: [number, number, number, number, number][] = [
  [0xff3d8b, 0x1e1729, 0xffc857, 0xf1c6a7, 0x2b1a12],
  [0x2ee6c8, 0x241c2e, 0xff8a3d, 0xc98a5a, 0x120d0f],
  [0xffc857, 0x3a2b52, 0x3fd0ff, 0x8d5a3c, 0x0f0a0a],
  [0x3fd0ff, 0x1a1420, 0xff3d8b, 0xf5d7c3, 0xd9a066],
  [0x8b5cf6, 0x221a2b, 0x3dff8f, 0x6b4229, 0x1b1416],
  [0xff8a3d, 0x2a2135, 0x2ee6c8, 0xe9b58e, 0x5a2a1a],
  [0xfff4ec, 0x1e1729, 0xff3d8b, 0xb87a56, 0x2d1b14],
  [0x3dff8f, 0x171120, 0xffc857, 0xf7cdb3, 0x8f4a2b],
  [0xff4458, 0x201828, 0xfff4ec, 0xd29a74, 0x16100f],
  [0x1e1729, 0x34283f, 0xff8a3d, 0xa36d4a, 0x0b0808],
];

export const FOCUSES: MeetingFocus[] = [
  { id: 'sales', label: 'Sales push', detail: '+35% sale price today. Sellers burn energy faster.' },
  { id: 'quality', label: 'Quality week', detail: '+25% product value growth. Output -10% today.' },
  { id: 'crunch', label: 'Crunch', detail: '+40% output today. Mood -12 for everyone.' },
  { id: 'spirit', label: 'Team spirit', detail: '+15 mood for everyone and friendships form faster.' },
];

export const ROLE_FOR_ROOM: Record<RoomType, WorkerRole> = {
  command: 'Generalist',
  factory: 'Maker',
  shop: 'Seller',
  treasury: 'Analyst',
  bar: 'Generalist',
  server: 'Engineer',
  studio: 'Marketer',
  lab: 'Scientist',
};

export const PRODUCT_NAMES = ['shirt', 'hoodie', 'cap', 'poster', 'sticker pack', 'tote'];

export const WORKER_LINES = {
  greeting: [
    "Hey boss. What's up?",
    'Yo. Busy, but talk to me.',
    'Boss! Perfect timing.',
    'Hi. Coffee first, questions second.',
  ],
  workingOn: {
    factory: ['Printing {product}s. The press is warm and the line is humming.', 'Running a batch of {product}s. Quality looks clean today.'],
    shop: ['Selling {product}s to the lunch crowd. Floor is busy.', 'Working the counter. A regular bought three {product}s.'],
    studio: ['Cutting a clip for the {product} drop. Hype is at {hype}%.', 'Shooting content. Hype is {hype}% and climbing.'],
    server: ['Watching the store latency. Everything is green.', 'Patching the checkout service before the evening rush.'],
    treasury: ['Reconciling the day. Costs are trimmed by {trim}%.', 'Chasing a late invoice. Found some savings too.'],
    lab: ['Testing a new fabric blend. Product value is ${value} now.', 'Prototyping. Every unit is worth a bit more each day.'],
    bar: ['Honestly? Taking a break. Pool game, then back at it.', 'Recharging at the bar. I will be back in a minute.'],
    command: ['Prepping notes for the next meeting.', 'Looking at the milestone board. We are close.'],
  } as Record<string, string[]>,
  idle: ['Waiting for a desk. Put me in a room and I will get going.', 'Nothing assigned yet. Where do you want me?'],
  thanksBonus: ['Oh nice, thank you! That goes straight into the savings jar.', 'Appreciate it, boss. Back to it with a smile.', 'Legend. Drinks are on me tonight.'],
  goodJob: ['Thanks! That means a lot.', 'Ha, I try. Tell the others too.', 'Cheers boss. More where that came from.'],
  moved: ['On my way to {room}.', 'Heading to {room} now.', 'Got it, {room}.'],
  cantMove: ['{room} is full right now. Want me to wait?', 'There is no {room} in the building yet.'],
  lowMood: ['Honestly I could use a raise. The pay is below what I bring in.', 'Not my best week. A little bonus would help.'],
  tired: ['I am wiped. Is there a Chill Bar I can hit?', 'Running on fumes. Going to rest soon.'],
  gossip: [
    'Heard {other} beat the sales record yesterday.',
    '{other} keeps humming the same song. It is catchy, I admit.',
    'Rumour is the rooftop lounge is next. Please say yes.',
    '{other} and I have a pool rematch tonight.',
  ],
  sold: ['Just sold {n} {product}s. +${amount}!', 'Customer loved the {product}. +${amount} in the till.'],
  complaint: ['A client complained about delivery time. I smoothed it over.', 'Rough call with a client. We should look at shipping speed.'],
  raise: ['Can we talk about my salary? I think I have earned more.', 'Quick one: a raise would keep me here long term.'],
  eventComment: {
    viral: ['Boss, have you seen the numbers? We are everywhere right now!', 'My phone will not stop buzzing. We went viral!'],
    outage: ['Store is down. Customers are messaging me. Please fix it fast.', 'Checkout is dead. Every minute hurts.'],
    complaint: ['Rough call with a client today. Hope we do right by them.', 'That late order is on all of us. What do we do?'],
    investor: ['Did you see the investor in the lobby? Fancy shoes.', 'Taking the money would be huge. Or risky. Your call.'],
    supplier: ['Supplier deal looks good from where I sit. Stock is thin.', 'Bulk fabric at that price? I would take it.'],
    raise: ['Heard someone asked for a raise. Fair, honestly.', 'If raises are on the table, I am listening.'],
    press: ['Press shoot! Please let them film my desk.', 'A magazine feature would be wild. Say yes?'],
    rent: ['Landlord again? That building owner never stops.', 'Rent going up would sting. Push back.'],
    party: ['A night out would fix a lot of tired faces.', 'Party? I am already picking the playlist.'],
  } as Record<string, string[]>,
  unknown: ['Not sure I follow. Ask me what I am working on, or tell me where to go.', 'Say that again? I can move rooms, or talk about work.'],
};
