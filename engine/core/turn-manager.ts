/**
 * TurnManager — opt-in turn-based / phase-based game flow.
 *
 * Real-time games ignore this entirely. Turn-based games configure phases
 * and advance through them. Systems can declare a `phase` to only run
 * during that phase — systems without a phase always run (preserving
 * real-time behavior for animations, tweens, particles).
 *
 * Usage:
 *   engine.turns.configure({ phases: ['draw', 'play', 'attack', 'end'] })
 *   engine.turns.start()
 *   engine.turns.endPhase()   // advance to next phase
 *   engine.turns.endTurn()    // jump to first phase of next turn
 */

import { events } from "@shared/events";

export interface TurnConfig {
  /** Ordered list of phase names within a turn. */
  phases: string[];
}

export class TurnManager {
  private _phases: string[] = [];
  private _phaseIndex = 0;
  private _turnCount = 0;
  private _active = false;

  /** Whether turn management is active. */
  get active(): boolean {
    return this._active;
  }

  /** Current phase name, or null if turn management is inactive. */
  get currentPhase(): string | null {
    if (!this._active) return null;
    return this._phases[this._phaseIndex] ?? null;
  }

  /** Current turn number (1-based). */
  get turnCount(): number {
    return this._turnCount;
  }

  /** Ordered list of configured phases. */
  get phases(): readonly string[] {
    return this._phases;
  }

  /** Index of the current phase within the phases array. */
  get phaseIndex(): number {
    return this._phaseIndex;
  }

  /** Configure the turn structure. Call before start(). */
  configure(config: TurnConfig): void {
    if (config.phases.length === 0) {
      throw new Error("TurnManager: phases array must not be empty");
    }
    this._phases = [...config.phases];
    this._phaseIndex = 0;
    this._turnCount = 0;
    this._active = false;
  }

  /** Start turn management. Begins turn 1, phase 0. */
  start(): void {
    if (this._phases.length === 0) {
      throw new Error("TurnManager: call configure() before start()");
    }
    this._active = true;
    this._phaseIndex = 0;
    this._turnCount = 1;
    events.emit("turn:start", this._turnCount);
    events.emit("phase:enter", this._phases[0]);
  }

  /** Advance to the next phase. If at the last phase, starts the next turn. */
  endPhase(): void {
    if (!this._active) return;

    const oldPhase = this._phases[this._phaseIndex];
    events.emit("phase:exit", oldPhase);

    this._phaseIndex++;

    if (this._phaseIndex >= this._phases.length) {
      // End of turn — wrap to next turn
      events.emit("turn:end", this._turnCount);
      this._turnCount++;
      this._phaseIndex = 0;
      events.emit("turn:start", this._turnCount);
    }

    events.emit("phase:enter", this._phases[this._phaseIndex]);
  }

  /** Skip remaining phases and start the next turn. */
  endTurn(): void {
    if (!this._active) return;

    const oldPhase = this._phases[this._phaseIndex];
    events.emit("phase:exit", oldPhase);
    events.emit("turn:end", this._turnCount);

    this._turnCount++;
    this._phaseIndex = 0;

    events.emit("turn:start", this._turnCount);
    events.emit("phase:enter", this._phases[this._phaseIndex]);
  }

  /** Jump to a specific phase by name within the current turn. */
  goToPhase(phaseName: string): void {
    if (!this._active) return;

    const idx = this._phases.indexOf(phaseName);
    if (idx < 0) {
      throw new Error(`TurnManager: unknown phase "${phaseName}"`);
    }

    const oldPhase = this._phases[this._phaseIndex];
    events.emit("phase:exit", oldPhase);
    this._phaseIndex = idx;
    events.emit("phase:enter", this._phases[this._phaseIndex]);
  }

  /** Stop turn management. Systems with a phase will stop being gated. */
  stop(): void {
    if (!this._active) return;
    const oldPhase = this._phases[this._phaseIndex];
    events.emit("phase:exit", oldPhase);
    this._active = false;
    this._phaseIndex = 0;
    this._turnCount = 0;
  }

  /** Reset state (called on scene change). Does not clear config. */
  reset(): void {
    if (this._active) {
      this._active = false;
    }
    this._phaseIndex = 0;
    this._turnCount = 0;
  }
}
