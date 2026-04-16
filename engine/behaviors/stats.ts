/**
 * Stats & modifier system — the numeric backbone for RPG-style games.
 *
 * A `Stats` object holds named base values (`strength`, `maxHp`, `speed`, ...)
 * plus a list of active `StatModifier`s. The final computed value for any
 * stat is derived by layering three modifier types on top of the base:
 *
 *   final = (base + sum(flat)) * (1 + sum(percent)) * product(multipliers)
 *
 * - **flat**    — raw additive (e.g., `+5 strength` from a belt).
 * - **percent** — additive within its group (e.g., `+0.20` → +20%); multiple
 *                 percent mods sum together before being applied.
 * - **multiplier** — multiplicative (e.g., `2.0` for double damage); each
 *                    multiplier stacks via product.
 *
 * Modifiers can be permanent or timed. Timed modifiers count down via
 * `tickModifiers(dt)` and return the expired ones so callers can react
 * (e.g., fading a buff icon). Permanent modifiers (no `duration`) never
 * expire on their own.
 *
 * ### Stacking rules (per `source`)
 * - `"stack"`   (default) — multiple modifiers with the same source coexist
 *                            and each contribute to the total.
 * - `"refresh"` — reusing the same source resets the existing modifier's
 *                  duration and replaces its value (good for DoT ticks).
 * - `"replace"` — reusing the same source overwrites the existing modifier
 *                  outright, keeping only the newest.
 *
 * @example
 * ```ts
 * import { createStats, addModifier, getStat, tickModifiers } from '@engine';
 *
 * const stats = createStats({ strength: 10, maxHp: 100 });
 *
 * addModifier(stats, {
 *   id: 'belt-of-giant-strength',
 *   stat: 'strength',
 *   type: 'flat',
 *   value: 5,
 *   source: 'equipment:belt',
 * });
 *
 * addModifier(stats, {
 *   id: 'berserk',
 *   stat: 'strength',
 *   type: 'percent',
 *   value: 0.5, // +50%
 *   duration: 8,
 *   source: 'buff:berserk',
 *   stacking: 'refresh',
 * });
 *
 * getStat(stats, 'strength'); // (10 + 5) * (1 + 0.5) = 22.5
 *
 * // Each frame:
 * const expired = tickModifiers(stats, dt);
 * for (const mod of expired) {
 *   console.log(`${mod.source} wore off`);
 * }
 * ```
 */

// ── Public types ────────────────────────────────────────────────

/** How a modifier contributes to the final stat value. */
export type ModifierType = "flat" | "percent" | "multiplier";

/** A single modifier applied to one stat. */
export interface StatModifier {
  /** Unique ID — used for removal and identity checks. */
  id: string;
  /** The stat this modifier targets. */
  stat: string;
  /** Modifier type — flat / percent / multiplier. */
  type: ModifierType;
  /** Magnitude. flat = raw number; percent = fraction (0.2 = +20%); multiplier = scalar (2 = double). */
  value: number;
  /** Optional duration in seconds. Undefined = permanent. */
  duration?: number;
  /** Optional source tag (e.g., "poison", "equipment:ring"). Drives stacking rules. */
  source?: string;
  /** Stacking rule applied when another modifier shares the same source. */
  stacking?: "stack" | "refresh" | "replace";
  /** Internal: remaining time for timed modifiers. Ignored if no duration. */
  _remaining?: number;
}

/** A bag of named numeric stats plus any active modifiers. */
export interface Stats {
  /** Base values — the starting point before modifiers. */
  base: Record<string, number>;
  /** Currently active modifiers. */
  modifiers: StatModifier[];
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Create a new `Stats` object from a map of base values.
 *
 * @example
 * const stats = createStats({ strength: 10, maxHp: 100, speed: 5 });
 */
export function createStats(base: Record<string, number>): Stats {
  return {
    base: { ...base },
    modifiers: [],
  };
}

// ── Queries ─────────────────────────────────────────────────────

/**
 * Compute the final value for a stat:
 *   `(base + sum(flat)) * (1 + sum(percent)) * product(multipliers)`
 *
 * Returns 0 when the stat has neither a base value nor any modifiers.
 */
export function getStat(stats: Stats, name: string): number {
  const base = stats.base[name] ?? 0;

  let flat = 0;
  let percent = 0;
  let multiplier = 1;

  for (const mod of stats.modifiers) {
    if (mod.stat !== name) continue;
    switch (mod.type) {
      case "flat":
        flat += mod.value;
        break;
      case "percent":
        percent += mod.value;
        break;
      case "multiplier":
        multiplier *= mod.value;
        break;
    }
  }

  return (base + flat) * (1 + percent) * multiplier;
}

/** Return every active modifier targeting the given stat. */
export function getModifiersFor(stats: Stats, statName: string): StatModifier[] {
  return stats.modifiers.filter((m) => m.stat === statName);
}

/** Whether a modifier with the given id is active. */
export function hasModifier(stats: Stats, id: string): boolean {
  for (const mod of stats.modifiers) {
    if (mod.id === id) return true;
  }
  return false;
}

// ── Mutations ───────────────────────────────────────────────────

/**
 * Set the base value of a stat. Does not affect active modifiers — the
 * next `getStat` call recomputes with the new base.
 */
export function setBaseStat(stats: Stats, name: string, value: number): void {
  stats.base[name] = value;
}

/**
 * Add a modifier. Handles stacking rules by `source`:
 *
 * - `"stack"` (default) — appended alongside any existing mods.
 * - `"refresh"` — if a modifier with the same `source` + `stat` exists, its
 *                  value and duration are overwritten in place.
 * - `"replace"` — same as `refresh` semantically (existing mod is overwritten),
 *                  but left as a distinct rule for callers that want to signal
 *                  intent clearly.
 *
 * Returns `true` when a new modifier was inserted, `false` when an existing
 * modifier was refreshed/replaced in place.
 */
export function addModifier(stats: Stats, mod: StatModifier): boolean {
  // Normalize timing state upfront so both the inserted and the
  // refresh/replace paths use the same logic.
  const remaining = mod.duration !== undefined ? mod.duration : undefined;
  const stacking = mod.stacking ?? "stack";

  if ((stacking === "refresh" || stacking === "replace") && mod.source !== undefined) {
    const existing = stats.modifiers.find((m) => m.source === mod.source && m.stat === mod.stat);
    if (existing) {
      existing.id = mod.id;
      existing.type = mod.type;
      existing.value = mod.value;
      existing.duration = mod.duration;
      existing.stacking = mod.stacking;
      existing._remaining = remaining;
      return false;
    }
  }

  stats.modifiers.push({
    ...mod,
    _remaining: remaining,
  });
  return true;
}

/** Remove a modifier by id. Returns `true` if a matching mod was removed. */
export function removeModifier(stats: Stats, id: string): boolean {
  const before = stats.modifiers.length;
  stats.modifiers = stats.modifiers.filter((m) => m.id !== id);
  return stats.modifiers.length < before;
}

/** Remove every modifier whose `source` matches. Returns the count removed. */
export function removeModifiersBySource(stats: Stats, source: string): number {
  const before = stats.modifiers.length;
  stats.modifiers = stats.modifiers.filter((m) => m.source !== source);
  return before - stats.modifiers.length;
}

/** Remove all modifiers. Base values are untouched. */
export function clearModifiers(stats: Stats): void {
  stats.modifiers.length = 0;
}

// ── Timing ──────────────────────────────────────────────────────

/**
 * Decrement remaining time on every timed modifier. Permanent modifiers
 * (no `duration`) are ignored. Any modifier whose timer hits zero is
 * removed from the list and returned so callers can react (toast, sfx, ...).
 *
 * @param dt Elapsed seconds since the last call.
 * @returns The modifiers that expired this tick. Empty if none did.
 */
export function tickModifiers(stats: Stats, dt: number): StatModifier[] {
  if (dt <= 0 || stats.modifiers.length === 0) return [];

  const expired: StatModifier[] = [];
  const survivors: StatModifier[] = [];

  for (const mod of stats.modifiers) {
    if (mod.duration === undefined) {
      // Permanent — never expires via ticking.
      survivors.push(mod);
      continue;
    }
    const next = (mod._remaining ?? mod.duration) - dt;
    if (next <= 0) {
      expired.push(mod);
      continue;
    }
    mod._remaining = next;
    survivors.push(mod);
  }

  if (expired.length > 0) {
    stats.modifiers = survivors;
  }
  return expired;
}

// ── Persistence ─────────────────────────────────────────────────

/** Serialize a `Stats` object to a plain JSON-safe structure. */
export function serializeStats(stats: Stats): Record<string, any> {
  return {
    base: { ...stats.base },
    modifiers: stats.modifiers.map((m) => ({
      id: m.id,
      stat: m.stat,
      type: m.type,
      value: m.value,
      duration: m.duration,
      source: m.source,
      stacking: m.stacking,
      _remaining: m._remaining,
    })),
  };
}

/** Rehydrate a previously serialized `Stats` object. */
export function deserializeStats(data: Record<string, any>): Stats {
  const base: Record<string, number> = { ...(data?.base ?? {}) };
  const rawMods: any[] = Array.isArray(data?.modifiers) ? data.modifiers : [];
  const modifiers: StatModifier[] = rawMods.map((m) => ({
    id: m.id,
    stat: m.stat,
    type: m.type,
    value: m.value,
    duration: m.duration,
    source: m.source,
    stacking: m.stacking,
    _remaining: m._remaining,
  }));
  return { base, modifiers };
}
