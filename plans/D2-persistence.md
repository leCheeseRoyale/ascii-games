# Plan D2: Save & Persistence

## Problem
High scores reset on page reload. There's no save/load system. Every game that wants persistence has to roll its own localStorage wrapper.

## Items addressed
- #36: Save/load API
- #37: Persistent high scores

## New directory: `engine/storage/`

### New file: `engine/storage/storage.ts`

A simple, typed localStorage wrapper with a game-scoped key prefix to avoid collisions when multiple games run on the same domain.

```ts
/**
 * Persistent storage for game data.
 * Uses localStorage with a game-scoped key prefix.
 */

let prefix = 'ascii-game';

/** Set the storage key prefix. Call once at game init with your game name. */
export function setStoragePrefix(gameId: string): void {
  prefix = gameId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function key(name: string): string {
  return `${prefix}:${name}`;
}

/** Save a value to persistent storage. */
export function save(name: string, data: unknown): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

/** Load a value from persistent storage. Returns undefined if not found. */
export function load<T = unknown>(name: string): T | undefined {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Remove a value from persistent storage. */
export function remove(name: string): void {
  try {
    localStorage.removeItem(key(name));
  } catch {
    // fail silently
  }
}

/** Clear all storage for this game (only keys with matching prefix). */
export function clearAll(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${prefix}:`)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // fail silently
  }
}

/** Check if a key exists in persistent storage. */
export function has(name: string): boolean {
  try {
    return localStorage.getItem(key(name)) !== null;
  } catch {
    return false;
  }
}
```

### New file: `engine/storage/high-scores.ts`

A purpose-built high score manager:

```ts
/**
 * Persistent high score tracking.
 * Stores a sorted leaderboard per game.
 */

import { load, save } from './storage';

export interface ScoreEntry {
  score: number;
  name: string;
  date: string;
}

const SCORES_KEY = 'highscores';

/** Get the high score leaderboard, sorted descending. */
export function getHighScores(max = 10): ScoreEntry[] {
  const scores = load<ScoreEntry[]>(SCORES_KEY) ?? [];
  return scores.slice(0, max);
}

/** Get the top high score, or 0 if none. */
export function getTopScore(): number {
  const scores = getHighScores(1);
  return scores.length > 0 ? scores[0].score : 0;
}

/** Submit a score. Returns true if it made the leaderboard. */
export function submitScore(score: number, name = 'Player', max = 10): boolean {
  const scores = load<ScoreEntry[]>(SCORES_KEY) ?? [];
  const entry: ScoreEntry = {
    score,
    name,
    date: new Date().toISOString().split('T')[0],
  };

  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, max);
  save(SCORES_KEY, trimmed);

  return trimmed.some(e => e === entry);
}

/** Check if a score would make the leaderboard. */
export function isHighScore(score: number, max = 10): boolean {
  const scores = getHighScores(max);
  if (scores.length < max) return true;
  return score > scores[scores.length - 1].score;
}

/** Clear all high scores. */
export function clearHighScores(): void {
  save(SCORES_KEY, []);
}
```

### New file: `engine/storage/index.ts`

Barrel export for clean imports:

```ts
export { clearAll, has, load, remove, save, setStoragePrefix } from './storage';
export {
  clearHighScores,
  getHighScores,
  getTopScore,
  isHighScore,
  type ScoreEntry,
  submitScore,
} from './high-scores';
```

## Rules
- ONLY create files in `engine/storage/`
- Do NOT touch `engine/index.ts` — integration agent handles re-exports
- Do NOT touch `engine/core/engine.ts`
- Do NOT touch `ui/store.ts` — the store's `highScore` field is ephemeral (per-session). The new system is a separate persistence layer. Games can wire them together in their own code.
- All localStorage operations must be wrapped in try/catch (private browsing, storage full, etc.)
- Run `bun run check` and `bun run build` to verify

## Verification
- `bun run check` passes
- `bun run build` succeeds
- New files compile: `save('key', data)`, `load<T>('key')`, `submitScore(500)`, `getHighScores()`
- Functions handle missing/corrupt localStorage gracefully
