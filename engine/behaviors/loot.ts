/**
 * Loot table behavior — weighted random drops for RPGs, roguelikes, and action games.
 *
 * A `LootTable` is an array of `LootEntry` objects. Each entry can drop a
 * concrete `item`, recurse into a nested `table`, or be filtered by a
 * `condition` / `chance` callback. Rolling a table returns a flat list of
 * `LootDrop`s with identical items aggregated.
 *
 * All randomness uses a deterministic seeded RNG (xorshift32), so passing the
 * same `seed` to `rollLoot` always produces the same drops. Omit the seed to
 * get fresh randomness each call.
 *
 * @example
 * ```ts
 * import { rollLoot, type LootTable } from '@engine';
 *
 * const chestTable: LootTable = {
 *   rolls: [1, 3],
 *   entries: [
 *     { item: 'gold',   weight: 50, count: [1, 10] },
 *     { item: 'potion', weight: 20, count: [1, 2] },
 *     { item: 'sword',  weight: 1,  condition: (ctx) => ctx.flags.level >= 5 },
 *   ],
 *   guaranteed: [{ item: 'xp', count: [5, 15] }],
 * };
 *
 * const drops = rollLoot(chestTable, { seed: 42, flags: { level: 7 } });
 * // → [{ item: 'xp', count: 11 }, { item: 'gold', count: 4 }, ...]
 * ```
 */

// ── Public types ────────────────────────────────────────────────

/**
 * Runtime context for `condition` callbacks. Passed into every evaluated
 * entry so games can filter drops based on player level, difficulty, luck,
 * or any other flag.
 */
export interface LootContext {
  /** Game-supplied flags (difficulty, luck, player level, etc.). */
  flags: Record<string, any>;
  /** Seeded RNG (0-1). Use this instead of `Math.random()` for reproducibility. */
  random: () => number;
}

/**
 * A single loot entry. Exactly one of `item` or `table` should be set.
 */
export interface LootEntry<T = any> {
  /** Relative weight (higher = more likely). Default 1. */
  weight?: number;
  /** Drop this item/value. Mutually exclusive with `table`. */
  item?: T;
  /** Drop from this nested table. Mutually exclusive with `item`. */
  table?: LootTable<T>;
  /** Quantity range `[min, max]` inclusive. Default `[1, 1]`. */
  count?: [number, number];
  /** Condition — if returns false, entry is ignored (and not counted in weights). */
  condition?: (ctx: LootContext) => boolean;
  /** Probability (0-1) this entry actually drops once selected. Default 1. */
  chance?: number;
}

/**
 * A weighted list of loot entries. Roll it with `rollLoot()`.
 */
export interface LootTable<T = any> {
  /** Entries subject to weighted selection. */
  entries: LootEntry<T>[];
  /** How many rolls to make on this table. Default 1. Pass `[min, max]` for a random count. */
  rolls?: number | [number, number];
  /** If `false`, each roll removes the selected entry from the pool. Default `true`. */
  withReplacement?: boolean;
  /** Guaranteed drops that always roll (still subject to their own `condition`/`chance`). */
  guaranteed?: LootEntry<T>[];
}

/** A single drop from rolling a loot table. */
export interface LootDrop<T = any> {
  item: T;
  count: number;
}

// ── Seeded RNG (xorshift32) ─────────────────────────────────────

/**
 * Create a deterministic seeded RNG. Uses xorshift32 with a splitmix32
 * seed-mixing step — the same seed always produces the same sequence of
 * values in `[0, 1)`. Small sequential seeds (1, 2, 3, ...) still produce
 * well-distributed outputs thanks to the mixing step. Omit the seed to
 * derive one from `Math.random()`.
 */
export function createSeededRandom(seed?: number): () => number {
  // Mix the seed so neighbouring values (1, 2, 3) produce very different
  // streams. This is splitmix32 — one round is enough to decorrelate small
  // seeds without meaningfully changing the state space.
  let state = (seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
  state = (state + 0x9e3779b9) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x85ebca6b) >>> 0;
  state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35) >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  if (state === 0) state = 1; // xorshift32 can't be seeded with zero.

  return function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0;
    return state / 0x100000000;
  };
}

// ── Internal helpers ────────────────────────────────────────────

/** Inclusive integer in `[min, max]` using a supplied RNG. */
function randomIntWith(random: () => number, min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  return Math.floor(random() * (max - min + 1)) + min;
}

/** Resolve `count` (default `[1, 1]`) to a concrete quantity. */
function resolveCount(random: () => number, count?: [number, number]): number {
  if (!count) return 1;
  return randomIntWith(random, count[0], count[1]);
}

/** Resolve `rolls` (number | [min, max] | undefined) to a concrete roll count. */
function resolveRolls(random: () => number, rolls?: number | [number, number]): number {
  if (rolls === undefined) return 1;
  if (typeof rolls === "number") return Math.max(0, Math.floor(rolls));
  return Math.max(0, randomIntWith(random, rolls[0], rolls[1]));
}

/** Weight of an entry, defaulting to 1 and clamped to non-negative. */
function weightOf(entry: LootEntry): number {
  const w = entry.weight ?? 1;
  return w > 0 ? w : 0;
}

/**
 * Pick an index into `pool` using weighted selection. Returns -1 if all
 * weights are zero (nothing to pick).
 */
function weightedPick(random: () => number, pool: LootEntry[]): number {
  let total = 0;
  for (const entry of pool) total += weightOf(entry);
  if (total <= 0) return -1;

  const target = random() * total;
  let cumulative = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += weightOf(pool[i]);
    if (cumulative >= target) return i;
  }
  // Floating-point fallback — return the last non-zero entry.
  for (let i = pool.length - 1; i >= 0; i--) {
    if (weightOf(pool[i]) > 0) return i;
  }
  return -1;
}

/**
 * Merge `drop` into `out`. If an existing drop shares the same item, their
 * counts are summed; otherwise a new drop is appended.
 */
function mergeDrop<T>(out: LootDrop<T>[], drop: LootDrop<T>): void {
  if (drop.count <= 0) return;
  for (const existing of out) {
    if (existing.item === drop.item) {
      existing.count += drop.count;
      return;
    }
  }
  out.push(drop);
}

/** Merge a list of drops into `out`, aggregating duplicates. */
function mergeAll<T>(out: LootDrop<T>[], incoming: LootDrop<T>[]): void {
  for (const drop of incoming) mergeDrop(out, drop);
}

/**
 * Evaluate a single entry into zero or more drops. Handles conditions,
 * chance rolls, nested tables, and count ranges.
 */
function evaluateEntry<T>(entry: LootEntry<T>, ctx: LootContext, out: LootDrop<T>[]): void {
  if (entry.condition && !entry.condition(ctx)) return;

  const chance = entry.chance ?? 1;
  if (chance < 1 && ctx.random() >= chance) return;

  const count = resolveCount(ctx.random, entry.count);
  if (count <= 0) return;

  if (entry.table) {
    // Roll the nested table `count` times (count acts as a multiplier).
    for (let i = 0; i < count; i++) {
      const nested = rollTableInternal(entry.table, ctx);
      mergeAll(out, nested);
    }
    return;
  }

  if (entry.item !== undefined) {
    mergeDrop(out, { item: entry.item, count });
  }
}

/** Core rolling logic — operates on an existing `LootContext`. */
function rollTableInternal<T>(table: LootTable<T>, ctx: LootContext): LootDrop<T>[] {
  const drops: LootDrop<T>[] = [];

  // 1) Guaranteed entries always fire (subject to their own condition/chance).
  if (table.guaranteed) {
    for (const entry of table.guaranteed) {
      evaluateEntry(entry, ctx, drops);
    }
  }

  // 2) Weighted rolls over the entries list.
  const rollCount = resolveRolls(ctx.random, table.rolls);
  if (rollCount <= 0 || !table.entries || table.entries.length === 0) {
    return drops;
  }

  const withReplacement = table.withReplacement !== false; // default true

  // Pre-filter entries that fail their condition — they don't count toward the
  // weight pool. `chance` is still evaluated *per roll* inside `evaluateEntry`.
  const initialPool: LootEntry<T>[] = [];
  for (const entry of table.entries) {
    if (entry.condition && !entry.condition(ctx)) continue;
    if (weightOf(entry) <= 0) continue;
    initialPool.push(entry);
  }

  if (withReplacement) {
    for (let i = 0; i < rollCount; i++) {
      const idx = weightedPick(ctx.random, initialPool);
      if (idx < 0) break;
      evaluateEntryWithoutCondition(initialPool[idx], ctx, drops);
    }
  } else {
    const pool = initialPool.slice();
    for (let i = 0; i < rollCount; i++) {
      if (pool.length === 0) break;
      const idx = weightedPick(ctx.random, pool);
      if (idx < 0) break;
      const picked = pool[idx];
      pool.splice(idx, 1);
      evaluateEntryWithoutCondition(picked, ctx, drops);
    }
  }

  return drops;
}

/**
 * Variant of `evaluateEntry` used after the weight pool has already been
 * filtered by `condition`. Skips the redundant condition check but still
 * applies `chance` and handles nested tables / count ranges.
 */
function evaluateEntryWithoutCondition<T>(
  entry: LootEntry<T>,
  ctx: LootContext,
  out: LootDrop<T>[],
): void {
  const chance = entry.chance ?? 1;
  if (chance < 1 && ctx.random() >= chance) return;

  const count = resolveCount(ctx.random, entry.count);
  if (count <= 0) return;

  if (entry.table) {
    for (let i = 0; i < count; i++) {
      const nested = rollTableInternal(entry.table, ctx);
      mergeAll(out, nested);
    }
    return;
  }

  if (entry.item !== undefined) {
    mergeDrop(out, { item: entry.item, count });
  }
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Roll a loot table and return the aggregated drops.
 *
 * The algorithm:
 *   1. Evaluate `guaranteed` entries (each subject to their own condition/chance).
 *   2. Filter out entries whose `condition` returns false — they don't count
 *      toward the weight pool.
 *   3. Roll `rolls` times (default 1). Each roll does weighted selection:
 *      pick entry where `cumulativeWeight >= random * totalWeight`.
 *   4. Apply the selected entry's `chance` — if it fails, the roll produces nothing.
 *   5. If the entry has a nested `table`, recurse; otherwise drop `item` with
 *      a count from `count: [min, max]` (default `[1, 1]`).
 *   6. Identical items across all drops are merged into one `LootDrop` with
 *      a summed count.
 *
 * With `withReplacement: false`, each selection removes the entry from the
 * pool — useful for "one of each" loot chests.
 *
 * @param table   The loot table to roll.
 * @param options Optional seed (for reproducibility) and game flags (passed
 *                to `condition` callbacks via `ctx.flags`).
 * @returns       A flat array of aggregated `LootDrop`s.
 */
export function rollLoot<T = any>(
  table: LootTable<T>,
  options?: {
    seed?: number;
    flags?: Record<string, any>;
  },
): LootDrop<T>[] {
  const random = createSeededRandom(options?.seed);
  const ctx: LootContext = {
    flags: options?.flags ?? {},
    random,
  };
  return rollTableInternal(table, ctx);
}
