/**
 * Quest tracker — objectives, progress, and completion for RPGs / adventures.
 *
 * A `QuestTracker` holds a registry of `QuestDefinition`s plus the runtime
 * `QuestState` for each. Games progress quests via `progress()` or
 * `completeObjective()`, and the tracker handles auto-completion when all
 * required objectives are satisfied. Prerequisites gate quests behind other
 * quests — until those are completed, the quest sits in `locked` status.
 *
 * The tracker exposes a minimal event emitter (`on`) for `start`, `progress`,
 * `complete`, and `fail` transitions. This is intentionally self-contained
 * rather than routed through the global mitt events, so multiple independent
 * questlines (or instances) don't cross-talk.
 *
 * Use `serialize()` / `deserialize()` with the engine's `save` / `load`
 * helpers to persist the full state across sessions.
 *
 * @example
 * ```ts
 * import { QuestTracker, save, load } from '@engine';
 *
 * const quests = new QuestTracker();
 * quests.register({
 *   id: 'rats',
 *   name: 'Rat Problem',
 *   description: 'The innkeeper is desperate.',
 *   objectives: [
 *     { id: 'kill', description: 'Slay rats', target: 5 },
 *     { id: 'boss', description: 'Find the rat king', required: false },
 *   ],
 *   rewards: { xp: 100, gold: 50 },
 * });
 *
 * quests.on('complete', (id, state) => {
 *   // game grants rewards here
 * });
 *
 * quests.start('rats');
 * quests.progress('rats', 'kill', 1); // ... each kill
 *
 * save('quests', quests.serialize());
 * const saved = load<any>('quests');
 * if (saved) quests.deserialize(saved);
 * ```
 */

// ── Public types ────────────────────────────────────────────────

/** State of a quest in the tracker. */
export type QuestStatus = "locked" | "available" | "active" | "completed" | "failed";

/** A single objective within a quest. Can be incremental (progress) or boolean. */
export interface QuestObjective {
  /** Unique ID within the quest. */
  id: string;
  /** Display name. */
  description: string;
  /** Progress-type: target amount (e.g., 5 rats killed). Default 1 (boolean). */
  target?: number;
  /** Current progress. Auto-tracked by `progressObjective`. */
  progress?: number;
  /** Hidden from UI until revealed. */
  hidden?: boolean;
  /** Optional: must be completed to finish the quest. Default true. */
  required?: boolean;
}

/** A quest definition. */
export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  objectives: QuestObjective[];
  /** Prerequisite quest IDs (must all be completed before this becomes available). */
  prerequisites?: string[];
  /** Reward data — game-specific (items, xp, etc.). */
  rewards?: Record<string, any>;
}

/** Quest runtime state. */
export interface QuestState {
  id: string;
  status: QuestStatus;
  /** Per-objective progress. */
  objectives: Record<string, { progress: number; done: boolean }>;
  /** Time tracking. */
  startedAt?: number;
  completedAt?: number;
}

/** Event names fired by the tracker. */
export type QuestEvent = "start" | "progress" | "complete" | "fail";

/** Handler signature for tracker events. */
export type QuestEventHandler = (questId: string, data?: any) => void;

// ── Implementation ──────────────────────────────────────────────

/** Quest tracker — manages all quests. */
export class QuestTracker {
  private defs = new Map<string, QuestDefinition>();
  private states = new Map<string, QuestState>();
  private listeners = new Map<QuestEvent, Set<QuestEventHandler>>();

  // ── Registration ──────────────────────────────────────────────

  /** Register a quest definition. */
  register(quest: QuestDefinition): void {
    this.defs.set(quest.id, quest);
    // Re-registering should not wipe existing progress.
    if (this.states.has(quest.id)) return;
    // Seed a fresh state, respecting prerequisites.
    const status: QuestStatus = this.prereqsMet(quest) ? "available" : "locked";
    const objectives: Record<string, { progress: number; done: boolean }> = {};
    for (const obj of quest.objectives) {
      objectives[obj.id] = {
        progress: obj.progress ?? 0,
        done: false,
      };
    }
    this.states.set(quest.id, {
      id: quest.id,
      status,
      objectives,
    });
  }

  /** Register multiple quests at once. */
  registerAll(quests: QuestDefinition[]): void {
    // Register each quest first so prerequisite lookups during reconciliation
    // can see the full set.
    for (const q of quests) {
      this.register(q);
    }
    // Re-evaluate lock state now that every quest is registered.
    for (const q of quests) {
      const state = this.states.get(q.id);
      if (!state) continue;
      if (state.status === "locked" && this.prereqsMet(q)) {
        state.status = "available";
      } else if (state.status === "available" && !this.prereqsMet(q)) {
        state.status = "locked";
      }
    }
  }

  // ── Queries ────────────────────────────────────────────────────

  /** Get a quest's current state. */
  getState(questId: string): QuestState | undefined {
    return this.states.get(questId);
  }

  /** Get the definition for a quest. */
  getDefinition(questId: string): QuestDefinition | undefined {
    return this.defs.get(questId);
  }

  /** Get all quests matching a status (or all if omitted). */
  getAll(status?: QuestStatus): QuestState[] {
    const out: QuestState[] = [];
    for (const state of this.states.values()) {
      if (status === undefined || state.status === status) {
        out.push(state);
      }
    }
    return out;
  }

  // ── Transitions ────────────────────────────────────────────────

  /** Start a quest. Fails if prerequisites aren't met. */
  start(questId: string): boolean {
    const def = this.defs.get(questId);
    const state = this.states.get(questId);
    if (!def || !state) return false;

    // Strict status gate — can't restart completed/failed or re-start active.
    if (state.status !== "available") return false;
    if (!this.prereqsMet(def)) return false;

    state.status = "active";
    state.startedAt = Date.now();
    this.emit("start", questId, state);
    return true;
  }

  /** Make progress on an objective (adds to current progress). */
  progress(questId: string, objectiveId: string, amount = 1): void {
    const def = this.defs.get(questId);
    const state = this.states.get(questId);
    if (!def || !state) return;
    if (state.status !== "active") return;

    const objDef = def.objectives.find((o) => o.id === objectiveId);
    const objState = state.objectives[objectiveId];
    if (!objDef || !objState) return;
    if (objState.done) return;

    const target = objDef.target ?? 1;
    objState.progress = Math.min(target, objState.progress + amount);

    this.emit("progress", questId, {
      objectiveId,
      progress: objState.progress,
      target,
      state,
    });

    if (objState.progress >= target) {
      objState.done = true;
      // Re-emit progress as a completion beat for the objective — but the
      // primary signal for "objective done" is the quest-complete check.
      this.checkCompletion(questId);
    }
  }

  /** Mark an objective as complete. */
  completeObjective(questId: string, objectiveId: string): void {
    const def = this.defs.get(questId);
    const state = this.states.get(questId);
    if (!def || !state) return;
    if (state.status !== "active") return;

    const objDef = def.objectives.find((o) => o.id === objectiveId);
    const objState = state.objectives[objectiveId];
    if (!objDef || !objState) return;
    if (objState.done) return;

    const target = objDef.target ?? 1;
    objState.progress = target;
    objState.done = true;

    this.emit("progress", questId, {
      objectiveId,
      progress: objState.progress,
      target,
      state,
    });

    this.checkCompletion(questId);
  }

  /** Fail a quest. */
  fail(questId: string): void {
    const state = this.states.get(questId);
    if (!state) return;
    // Only fail quests that are not already terminally resolved.
    if (state.status === "completed" || state.status === "failed") return;

    state.status = "failed";
    state.completedAt = Date.now();
    this.emit("fail", questId, state);
  }

  /** Check if a quest is complete (all required objectives done). */
  isComplete(questId: string): boolean {
    const def = this.defs.get(questId);
    const state = this.states.get(questId);
    if (!def || !state) return false;
    for (const obj of def.objectives) {
      const required = obj.required ?? true;
      if (!required) continue;
      const os = state.objectives[obj.id];
      if (!os?.done) return false;
    }
    return true;
  }

  /** Force-complete a quest and fire rewards. */
  complete(questId: string): void {
    const def = this.defs.get(questId);
    const state = this.states.get(questId);
    if (!def || !state) return;
    if (state.status === "completed" || state.status === "failed") return;

    // Mark every required objective as done, in case this is a manual
    // short-circuit (game decides the quest is over regardless of progress).
    for (const obj of def.objectives) {
      const required = obj.required ?? true;
      if (!required) continue;
      const os = state.objectives[obj.id];
      if (!os) continue;
      os.progress = obj.target ?? 1;
      os.done = true;
    }

    state.status = "completed";
    state.completedAt = Date.now();
    this.emit("complete", questId, { state, rewards: def.rewards });

    // Unlock any dependent quests that were gated on this completion.
    this.refreshLocks();
  }

  // ── Persistence ────────────────────────────────────────────────

  /** Serialize for save/load. */
  serialize(): Record<string, QuestState> {
    const out: Record<string, QuestState> = {};
    for (const [id, state] of this.states) {
      // Deep-ish clone so callers can mutate freely.
      out[id] = {
        id: state.id,
        status: state.status,
        objectives: cloneObjectives(state.objectives),
        startedAt: state.startedAt,
        completedAt: state.completedAt,
      };
    }
    return out;
  }

  /** Restore from serialized state. */
  deserialize(data: Record<string, QuestState>): void {
    for (const [id, saved] of Object.entries(data)) {
      const existing = this.states.get(id);
      if (!existing) {
        // No matching definition — skip silently so stale saves don't crash.
        continue;
      }
      existing.status = saved.status;
      existing.startedAt = saved.startedAt;
      existing.completedAt = saved.completedAt;
      existing.objectives = cloneObjectives(saved.objectives ?? {});

      // Ensure every defined objective has an entry (new objective added
      // after the save was written shouldn't vanish).
      const def = this.defs.get(id);
      if (def) {
        for (const obj of def.objectives) {
          if (!existing.objectives[obj.id]) {
            existing.objectives[obj.id] = {
              progress: obj.progress ?? 0,
              done: false,
            };
          }
        }
      }
    }
    // After restoring, reconcile lock state so newly-registered quests that
    // became available via completed prerequisites reflect that.
    this.refreshLocks();
  }

  // ── Events ─────────────────────────────────────────────────────

  /** Event listener — fires when quest status changes. */
  on(event: QuestEvent, handler: QuestEventHandler): () => void {
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

  // ── Internals ──────────────────────────────────────────────────

  private emit(event: QuestEvent, questId: string, data?: any): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(questId, data);
    }
  }

  private prereqsMet(def: QuestDefinition): boolean {
    if (!def.prerequisites || def.prerequisites.length === 0) return true;
    for (const prereqId of def.prerequisites) {
      const prereq = this.states.get(prereqId);
      if (!prereq || prereq.status !== "completed") return false;
    }
    return true;
  }

  /**
   * Re-scan every quest and promote `locked` → `available` when prereqs are
   * satisfied. Used after a completion or `deserialize` to catch any quests
   * that are newly unlocked. Does not demote active/completed/failed quests.
   */
  private refreshLocks(): void {
    for (const def of this.defs.values()) {
      const state = this.states.get(def.id);
      if (!state) continue;
      if (state.status !== "locked") continue;
      if (this.prereqsMet(def)) {
        state.status = "available";
      }
    }
  }

  /**
   * Auto-complete the quest if every required objective is done.
   * Called from `progress` and `completeObjective`.
   */
  private checkCompletion(questId: string): void {
    const state = this.states.get(questId);
    if (!state || state.status !== "active") return;
    if (!this.isComplete(questId)) return;

    const def = this.defs.get(questId);
    state.status = "completed";
    state.completedAt = Date.now();
    this.emit("complete", questId, { state, rewards: def?.rewards });

    this.refreshLocks();
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function cloneObjectives(
  src: Record<string, { progress: number; done: boolean }>,
): Record<string, { progress: number; done: boolean }> {
  const out: Record<string, { progress: number; done: boolean }> = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = { progress: v.progress, done: v.done };
  }
  return out;
}
