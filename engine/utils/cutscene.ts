/**
 * Cutscene — chainable builder for scripted sequences.
 *
 * Usage:
 *   import { cutscene } from '@engine'
 *
 *   await cutscene()
 *     .wait(1)
 *     .call(() => engine.spawn(createNPC(100, 200)))
 *     .shake(8)
 *     .wait(0.5)
 *     .waitForInput('Space')
 *     .play(engine)
 */

import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";

type CutsceneStep =
  | { type: "wait"; seconds: number }
  | { type: "call"; fn: (engine: Engine) => void | Promise<void> }
  | { type: "shake"; magnitude: number }
  | { type: "waitForInput"; key: string }
  | {
      type: "tween";
      target: () => Partial<Entity>;
      property: string;
      from: number;
      to: number;
      duration: number;
      ease?: "linear" | "easeOut" | "easeIn" | "easeInOut";
    };

export class Cutscene {
  private steps: CutsceneStep[] = [];
  private _cancelled = false;

  /** Cancel the cutscene. Pending waitForInput/wait promises will reject. */
  cancel(): void {
    this._cancelled = true;
  }

  /** Wait for a number of seconds. */
  wait(seconds: number): this {
    this.steps.push({ type: "wait", seconds });
    return this;
  }

  /** Run a function. Can be async. */
  call(fn: (engine: Engine) => void | Promise<void>): this {
    this.steps.push({ type: "call", fn });
    return this;
  }

  /** Shake the camera. */
  shake(magnitude = 8): this {
    this.steps.push({ type: "shake", magnitude });
    return this;
  }

  /** Wait for a key press. */
  waitForInput(key = "Space"): this {
    this.steps.push({ type: "waitForInput", key });
    return this;
  }

  /** Tween an entity's property and wait for completion. */
  tween(
    target: () => Partial<Entity>,
    property: string,
    from: number,
    to: number,
    duration: number,
    ease?: "linear" | "easeOut" | "easeIn" | "easeInOut",
  ): this {
    this.steps.push({ type: "tween", target, property, from, to, duration, ease });
    return this;
  }

  /** Execute all steps sequentially. Returns a promise that resolves when complete. */
  async play(engine: Engine): Promise<void> {
    this._cancelled = false;
    for (const step of this.steps) {
      if (this._cancelled) return;
      switch (step.type) {
        case "wait":
          await waitSeconds(engine, step.seconds);
          break;

        case "call":
          await step.fn(engine);
          break;

        case "shake":
          engine.camera.shake(step.magnitude);
          break;

        case "waitForInput":
          await waitForKey(engine, step.key, () => this._cancelled);
          break;

        case "tween": {
          const entity = step.target();
          engine.tweenEntity(entity, step.property, step.from, step.to, step.duration, step.ease);
          await waitSeconds(engine, step.duration);
          break;
        }
      }
    }
  }
}

/** Create a new cutscene builder. */
export function cutscene(): Cutscene {
  return new Cutscene();
}

// ── Internal helpers ────────────────────────────────────────────

function waitSeconds(engine: Engine, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    engine.after(seconds, resolve);
  });
}

function waitForKey(engine: Engine, key: string, isCancelled?: () => boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (isCancelled?.()) {
        resolve();
        return;
      }
      if (engine.keyboard.pressed(key)) {
        resolve();
      } else {
        engine.after(0, check);
      }
    };
    engine.after(0, check);
  });
}
