import type { Milestone } from './types';

export const MILESTONES: Milestone[] = [
  {
    id: 'first-1k',
    title: 'First $1,000',
    desc: 'Hold $1,000 in cash.',
    reward: 250,
    target: 1000,
    progress: (s) => s.cash,
  },
  {
    id: 'first-bonus',
    title: 'Generous Boss',
    desc: 'Pay your first bonus.',
    reward: 150,
    target: 1,
    progress: (s) => s.stats.bonusesPaid,
  },
  {
    id: 'cash-10k',
    title: 'Ten Grand',
    desc: 'Hold $10,000 in cash.',
    reward: 1500,
    target: 10_000,
    progress: (s) => s.cash,
  },
  {
    id: 'workers-10',
    title: 'Full House',
    desc: 'Employ 10 workers.',
    reward: 3000,
    target: 10,
    progress: (s) => s.workers.length,
  },
  {
    id: 'viral',
    title: 'Viral Hit',
    desc: 'Land your first viral moment.',
    reward: 2000,
    target: 1,
    progress: (s) => s.stats.viralHits,
  },
  {
    id: 'floors-5',
    title: 'Skyline',
    desc: 'Build a 5-floor tower.',
    reward: 8000,
    target: 5,
    progress: (s) => s.floors,
  },
  {
    id: 'revenue-100k',
    title: 'Six Figures',
    desc: 'Earn $100,000 in total revenue.',
    reward: 10_000,
    target: 100_000,
    progress: (s) => s.stats.revenueTotal,
  },
  {
    id: 'revenue-1m',
    title: 'Millionaire',
    desc: 'Earn $1,000,000 in total revenue.',
    reward: 50_000,
    target: 1_000_000,
    progress: (s) => s.stats.revenueTotal,
  },
];

export const milestoneById = (id: string): Milestone | undefined => MILESTONES.find((m) => m.id === id);
