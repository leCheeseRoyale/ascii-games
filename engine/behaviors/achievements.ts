/**
 * Achievement tracker — milestones, unlocks, and persistent progress.
 *
 * An `AchievementTracker` holds a registry of `Achievement` definitions plus
 * the runtime `AchievementState` for each. Games drive the tracker by calling
 * `progress()` (numeric counters toward a target) or `recordEvent()` (named
 * event counters). When a condition is satisfied AND all prerequisites have
 * already been unlocked, the achievement auto-unlocks and fires the `unlock`
 * event. Progress still accumulates while prerequisites are pending so the
 * achievement is ready to fire the moment its gate clears.
 *
 * Custom conditions (`type: "custom"`) let games express ad-hoc predicates
 * that are evaluated on demand via `checkCustom()` — useful for compound
 * conditions (e.g., "reach level 10 without dying").
 *
 * Like `QuestTracker`, the event emitter is self-contained (a small internal
 * Map) rather than routed through the global mitt bus, so multiple trackers
 * in the same game don't cross-talk.
 *
 * Use `serialize()` / `deserialize()` with the engine's `save` / `load`
 * helpers to persist progress across sessions, or call the tracker's own
 * `save()` / `load()` convenience methods.
 *
 * @example
 * ```ts
 * import { AchievementTracker } from '@engine';
 *
 * const achievements = new AchievementTracker();
 * achievements.registerAll([
 *   {
 *     id: 'first-blood',
 *     name: 'First Blood',
 *     description: 'Defeat your first enemy.',
 *     condition: { type: 'progress', target: 1 },
 *     points: 10,
 *   },
 *   {
 *     id: 'slayer',
 *     name: 'Slayer',
 *     description: 'Defeat 1000 enemies.',
 *     condition: { type: 'progress', target: 1000 },
 *     prerequisites: ['first-blood'],
 *     points: 100,
 *   },
 * ]);
 *
 * achievements.on('unlock', (id) => engine.toast.show(`Unlocked: ${id}`));
 *
 * // On each kill:
 * achievements.progress('first-blood', 1);
 * achievements.progress('slayer', 1);
 *
 * achievements.save();          // persists to localStorage
 * achievements.load();          // restores on next session
 * ```
 */

import { load as loadStorage, save as saveStorage } from "../storage/storage";

// ── Public types ────────────────────────────────────────────────

/**
 * Condition under which an achievement unlocks.
 *
 * - `progress`: accumulate a numeric counter via `progress(id, amount)` until
 *   it reaches `target`.
 * - `event`: count occurrences of `eventName` (recorded via `recordEvent`)
 *   until it reaches `count`.
 * - `custom`: evaluated on demand by `checkCustom()`; the predicate decides.
 */
export type AchievementCondition =
  | { type: "progress"; target: number }
  | { type: "event"; eventName: string; count: number }
  | { type: "custom"; check: (tracker: AchievementTracker) => boolean };

/** An achievement definition. */
export interface Achievement {
  /** Unique ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description shown to the player. */
  description: string;
  /** Unlock condition. */
  condition: AchievementCondition;
  /** Hidden from `getAll()` by default until unlocked. */
  hidden?: boolean;
  /** Icon / emoji / sprite indicator. Game-defined rendering. */
  icon?: string;
  /** Game-defined category tag (e.g. "rare", "secret", "story"). */
  category?: string;
  /** Achievement-points / score value. Summed by `totalPoints()`. */
  points?: number;
  /** Prerequisite achievement IDs (must all be unlocked before this can unlock). */
  prerequisites?: string[];
}

/** Runtime state for an achievement. */
export interface AchievementState {
  id: string;
  unlocked: boolean;
  progress: number;
  /** Wall-clock timestamp (ms since epoch) at unlock, if unlocked. */
  unlockedAt?: number;
}

/** Event names fired by the tracker. */
export type AchievementEvent = "unlock" | "progress";

/** Handler signature for tracker events. */
export type AchievementEventHandler = (id: string, state: AchievementState) => void;

/** Options for `getAll`. */
export interface AchievementGetAllOptions {
  /** Only include achievements whose `unlocked` matches this value. */
  unlocked?: boolean;
  /** Only include achievements with this category. */
  category?: string;
  /** Include hidden achievements (omitted by default). */
  includeHidden?: boolean;
}

// ── Implementation ──────────────────────────────────────────────

const DEFAULT_STORAGE_KEY = "achievements";

/** Achievement tracker — manages all achievements. */
export class AchievementTracker {
  private defs = new Map<string, Achievement>();
  private states = new Map<string, AchievementState>();
  private listeners = new Map<AchievementEvent, Set<AchievementEventHandler>>();

  // ── Registration ──────────────────────────────────────────────

  /** Register a single achievement definition. */
  register(achievement: Achievement): void {
    this.defs.set(achievement.id, achievement);
    // Seed a fresh state if we don't have one yet. Re-registering should not
    // wipe existing progress.
    if (!this.states.has(achievement.id)) {
      this.states.set(achievement.id, {
        id: achievement.id,
        unlocked: false,
        progress: 0,
      });
    }
  }

  /** Register multiple achievements at once. */
  registerAll(achievements: Achievement[]): void {
    for (const a of achievements) {
      this.register(a);
    }
  }

  // ── Queries ────────────────────────────────────────────────────

  /** Get an achievement's current runtime state. */
  getState(id: string): AchievementState | undefined {
    return this.states.get(id);
  }

  /** Get an achievement's definition. */
  getDefinition(id: string): Achievement | undefined {
    return this.defs.get(id);
  }

  /** Get all achievement states, optionally filtered. */
  getAll(opts: AchievementGetAllOptions = {}): AchievementState[] {
    const { unlocked, category, includeHidden = false } = opts;
    const out: AchievementState[] = [];
    for (const state of this.states.values()) {
      const def = this.defs.get(state.id);
      if (!def) continue;

      // Hidden filter — hidden achievements are omitted unless explicitly
      // requested, UNLESS they are already unlocked (revealed by unlock).
      if (def.hidden && !includeHidden && !state.unlocked) continue;

      if (unlocked !== undefined && state.unlocked !== unlocked) continue;
      if (category !== undefined && def.category !== category) continue;

      out.push(state);
    }
    return out;
  }

  // ── Progress / events ──────────────────────────────────────────

  /**
   * Add progress toward a "progress"-type achievement. Accumulates even when
   * prerequisites are not yet met — but won't unlock until they are.
   * No-op for "event" / "custom" / unknown IDs.
   */
  progress(id: string, amount = 1): void {
    const def = this.defs.get(id);
    const state = this.states.get(id);
    if (!def || !state) return;
    if (state.unlocked) return;
    if (def.condition.type !== "progress") return;

    const target = def.condition.target;
    const prev = state.progress;
    state.progress = Math.min(target, prev + amount);

    if (state.progress !== prev) {
      this.emit("progress", id, state);
    }

    this.tryUnlock(id);
  }

  /**
   * Record an occurrence of a named event. Advances every "event"-type
   * achievement whose `eventName` matches. Advances progress even when
   * prerequisites aren't met (will auto-unlock when they clear).
   */
  recordEvent(eventName: string): void {
    for (const def of this.defs.values()) {
      if (def.condition.type !== "event") continue;
      if (def.condition.eventName !== eventName) continue;

      const state = this.states.get(def.id);
      if (!state || state.unlocked) continue;

      const target = def.condition.count;
      const prev = state.progress;
      state.progress = Math.min(target, prev + 1);

      if (state.progress !== prev) {
        this.emit("progress", def.id, state);
      }

      this.tryUnlock(def.id);
    }
  }

  /**
   * Evaluate every "custom"-type achievement's predicate and unlock any
   * whose predicate returns true (and whose prereqs are met). Returns the
   * list of newly-unlocked achievement IDs.
   */
  checkCustom(): string[] {
    const unlocked: string[] = [];
    for (const def of this.defs.values()) {
      if (def.condition.type !== "custom") continue;
      const state = this.states.get(def.id);
      if (!state || state.unlocked) continue;
      if (!this.prereqsMet(def)) continue;

      let passed = false;
      try {
        passed = def.condition.check(this);
      } catch {
        // Predicate threw — treat as not satisfied.
        passed = false;
      }
      if (passed) {
        this.unlock(def.id);
        unlocked.push(def.id);
      }
    }
    return unlocked;
  }

  /**
   * Force-unlock an achievement. Safe to call on an already-unlocked
   * achievement (no-op). Bypasses prerequisites (intended for admin/debug).
   */
  unlock(id: string): void {
    const def = this.defs.get(id);
    const state = this.states.get(id);
    if (!def || !state) return;
    if (state.unlocked) return;

    // Snap progress up to target/count so UI reflects a "full" bar.
    if (def.condition.type === "progress") {
      state.progress = def.condition.target;
    } else if (def.condition.type === "event") {
      state.progress = def.condition.count;
    }

    state.unlocked = true;
    state.unlockedAt = Date.now();
    this.emit("unlock", id, state);
  }

  // ── Aggregates ────────────────────────────────────────────────

  /** Count of unlocked achievements. */
  unlockedCount(): number {
    let n = 0;
    for (const s of this.states.values()) {
      if (s.unlocked) n++;
    }
    return n;
  }

  /** Sum of `points` across unlocked achievements. */
  totalPoints(): number {
    let sum = 0;
    for (const s of this.states.values()) {
      if (!s.unlocked) continue;
      const def = this.defs.get(s.id);
      if (def?.points) sum += def.points;
    }
    return sum;
  }

  // ── Events ─────────────────────────────────────────────────────

  /** Subscribe to tracker events. Returns an unsubscribe function. */
  on(event: AchievementEvent, handler: AchievementEventHandler): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  // ── Persistence ────────────────────────────────────────────────

  /** Serialize the state of every registered achievement. */
  serialize(): Record<string, AchievementState> {
    const out: Record<string, AchievementState> = {};
    for (const [id, state] of this.states) {
      out[id] = {
        id: state.id,
        unlocked: state.unlocked,
        progress: state.progress,
        unlockedAt: state.unlockedAt,
      };
    }
    return out;
  }

  /**
   * Restore from serialized state. Saved entries without a matching
   * registered definition are ignored silently.
   */
  deserialize(data: Record<string, AchievementState>): void {
    for (const [id, saved] of Object.entries(data)) {
      const existing = this.states.get(id);
      if (!existing) continue; // unknown id — skip
      existing.unlocked = !!saved.unlocked;
      existing.progress = saved.progress ?? 0;
      existing.unlockedAt = saved.unlockedAt;
    }
  }

  /** Save serialized state to persistent storage. */
  save(storageKey: string = DEFAULT_STORAGE_KEY): void {
    saveStorage(storageKey, this.serialize());
  }

  /** Load serialized state from persistent storage. Returns true if data was loaded. */
  load(storageKey: string = DEFAULT_STORAGE_KEY): boolean {
    const data = loadStorage<Record<string, AchievementState>>(storageKey);
    if (!data) return false;
    this.deserialize(data);
    return true;
  }

  // ── Internals ──────────────────────────────────────────────────

  private emit(event: AchievementEvent, id: string, state: AchievementState): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(id, state);
    }
  }

  /** True iff every prerequisite achievement is unlocked. */
  private prereqsMet(def: Achievement): boolean {
    if (!def.prerequisites || def.prerequisites.length === 0) return true;
    for (const prereqId of def.prerequisites) {
      const prereq = this.states.get(prereqId);
      if (!prereq || !prereq.unlocked) return false;
    }
    return true;
  }

  /**
   * If the achievement's numeric condition is satisfied AND prereqs are met,
   * fire the unlock. Safe no-op otherwise. Used by `progress` and
   * `recordEvent`; `checkCustom` handles its own evaluation.
   */
  private tryUnlock(id: string): void {
    const def = this.defs.get(id);
    const state = this.states.get(id);
    if (!def || !state || state.unlocked) return;
    if (!this.prereqsMet(def)) return;

    const satisfied =
      (def.condition.type === "progress" && state.progress >= def.condition.target) ||
      (def.condition.type === "event" && state.progress >= def.condition.count);

    if (satisfied) this.unlock(id);
  }
}
