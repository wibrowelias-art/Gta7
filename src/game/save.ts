import { SAVE_VERSION, newGame } from './sim';
import type { GameState } from './types';

export const SAVE_KEY = 'neonhq.save.v1';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): GameState | null {
  try {
    const raw = JSON.parse(json) as Partial<GameState>;
    if (!raw || typeof raw !== 'object' || typeof raw.cash !== 'number') return null;
    const fresh = newGame(1);
    const merged: GameState = { ...fresh, ...raw, version: SAVE_VERSION } as GameState;
    merged.settings = { ...fresh.settings, ...(raw.settings ?? {}) };
    merged.stats = { ...fresh.stats, ...(raw.stats ?? {}) };
    merged.workers = (raw.workers ?? []).map((w) => ({ ...fresh.workers[0], ...w, acc: w.acc ?? 0, friends: w.friends ?? [] }));
    merged.paused = false;
    return merged;
  } catch {
    return null;
  }
}

export function saveToStorage(s: GameState, storage: Storage = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, serialize(s));
  } catch {
    /* quota or private mode: nothing we can do, the game stays playable */
  }
}

export function loadFromStorage(storage: Storage = localStorage): GameState | null {
  try {
    const json = storage.getItem(SAVE_KEY);
    return json ? deserialize(json) : null;
  } catch {
    return null;
  }
}

export function clearStorage(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
