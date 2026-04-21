/**
 * InputBindings — abstraction layer that maps semantic action names
 * (e.g. "move-up", "pause") to physical inputs (keyboard keys, gamepad
 * buttons, mouse buttons).
 *
 * Games call `input.pressed("move-up")` instead of `kb.pressed("ArrowUp")`,
 * which lets users (or games) remap bindings at runtime and persist the
 * result to localStorage.
 */

import { load, save } from "../storage/storage";

/** A binding maps a semantic action to multiple physical inputs. */
export interface BindingEntry {
  /** Keyboard keys (e.g. "ArrowUp", "KeyW", "Space"). */
  keys?: string[];
  /** Gamepad button indices (use GAMEPAD_BUTTONS constants). */
  gamepadButtons?: number[];
  /** Mouse buttons (0=left, 1=middle, 2=right). */
  mouseButtons?: number[];
}

/** Default bindings for common action names. */
export type BindingsConfig = Record<string, BindingEntry>;

/** Minimal keyboard interface the bindings layer relies on. */
interface KeyboardLike {
  held(k: string): boolean;
  pressed(k: string): boolean;
  released(k: string): boolean;
  /** Optional — used by capture() to enumerate keys pressed this frame. */
  justPressed?: Set<string>;
  keys?: Set<string>;
}

/** Minimal gamepad interface the bindings layer relies on. */
interface GamepadLike {
  held(b: number): boolean;
  pressed(b: number): boolean;
  released(b: number): boolean;
}

/** Minimal mouse interface the bindings layer relies on. */
interface MouseLike {
  down: boolean;
  justDown: boolean;
  justUp: boolean;
  /** Optional — the index of the button that is down (0=left, 1=middle, 2=right). */
  button?: number;
}

/** Default bindings sensible for most games. */
export const DEFAULT_BINDINGS: BindingsConfig = {
  "move-up": { keys: ["ArrowUp", "KeyW"], gamepadButtons: [12] },
  "move-down": { keys: ["ArrowDown", "KeyS"], gamepadButtons: [13] },
  "move-left": { keys: ["ArrowLeft", "KeyA"], gamepadButtons: [14] },
  "move-right": { keys: ["ArrowRight", "KeyD"], gamepadButtons: [15] },
  "action-a": { keys: ["Space", "Enter"], gamepadButtons: [0] },
  "action-b": { keys: ["Escape"], gamepadButtons: [1] },
  "action-x": { keys: ["KeyQ"], gamepadButtons: [2] },
  "action-y": { keys: ["KeyE"], gamepadButtons: [3] },
  pause: { keys: ["Escape"], gamepadButtons: [9] },
};

/** Deep-copy the default bindings so games can mutate freely. */
export function createDefaultBindings(): BindingsConfig {
  return cloneBindings(DEFAULT_BINDINGS);
}

function cloneBindings(src: BindingsConfig): BindingsConfig {
  const out: BindingsConfig = {};
  for (const [action, entry] of Object.entries(src)) {
    out[action] = {
      keys: entry.keys ? [...entry.keys] : undefined,
      gamepadButtons: entry.gamepadButtons ? [...entry.gamepadButtons] : undefined,
      mouseButtons: entry.mouseButtons ? [...entry.mouseButtons] : undefined,
    };
  }
  return out;
}

/** Candidate list of gamepad button indices we will probe during capture. */
const GAMEPAD_BUTTON_CANDIDATES = Array.from({ length: 17 }, (_v, i) => i);

const DEFAULT_STORAGE_KEY = "input-bindings";

export class InputBindings {
  private bindings: BindingsConfig = {};
  private keyboard: KeyboardLike;
  private gamepad?: GamepadLike;
  private mouse?: MouseLike;

  constructor(keyboard: KeyboardLike, gamepad?: GamepadLike, mouse?: MouseLike) {
    this.keyboard = keyboard;
    this.gamepad = gamepad;
    this.mouse = mouse;
  }

  /** Set or replace a binding. */
  set(action: string, binding: BindingEntry): void {
    this.bindings[action] = {
      keys: binding.keys ? [...binding.keys] : undefined,
      gamepadButtons: binding.gamepadButtons ? [...binding.gamepadButtons] : undefined,
      mouseButtons: binding.mouseButtons ? [...binding.mouseButtons] : undefined,
    };
  }

  /** Get the current binding for an action. */
  get(action: string): BindingEntry | undefined {
    return this.bindings[action];
  }

  /** Clear a binding. */
  clear(action: string): void {
    delete this.bindings[action];
  }

  /** Replace all bindings (e.g. load from saved config). */
  setAll(bindings: BindingsConfig): void {
    this.bindings = cloneBindings(bindings);
  }

  /** Get all bindings (e.g. save to disk). */
  getAll(): BindingsConfig {
    return cloneBindings(this.bindings);
  }

  /** True while any bound input is held. */
  held(action: string): boolean {
    const entry = this.bindings[action];
    if (!entry) return false;
    if (entry.keys) {
      for (const k of entry.keys) {
        if (this.keyboard.held(k)) return true;
      }
    }
    if (entry.gamepadButtons && this.gamepad) {
      for (const b of entry.gamepadButtons) {
        if (this.gamepad.held(b)) return true;
      }
    }
    if (entry.mouseButtons && this.mouse) {
      for (const b of entry.mouseButtons) {
        if (this.checkMouseButton(this.mouse!.down, b)) return true;
      }
    }
    return false;
  }

  /** True only on the frame any bound input was pressed. */
  pressed(action: string): boolean {
    const entry = this.bindings[action];
    if (!entry) return false;
    if (entry.keys) {
      for (const k of entry.keys) {
        if (this.keyboard.pressed(k)) return true;
      }
    }
    if (entry.gamepadButtons && this.gamepad) {
      for (const b of entry.gamepadButtons) {
        if (this.gamepad.pressed(b)) return true;
      }
    }
    if (entry.mouseButtons && this.mouse) {
      for (const b of entry.mouseButtons) {
        if (this.checkMouseButton(this.mouse!.justDown, b)) return true;
      }
    }
    return false;
  }

  /** True only on the frame any bound input was released. */
  released(action: string): boolean {
    const entry = this.bindings[action];
    if (!entry) return false;
    if (entry.keys) {
      for (const k of entry.keys) {
        if (this.keyboard.released(k)) return true;
      }
    }
    if (entry.gamepadButtons && this.gamepad) {
      for (const b of entry.gamepadButtons) {
        if (this.gamepad.released(b)) return true;
      }
    }
    if (entry.mouseButtons && this.mouse) {
      for (const b of entry.mouseButtons) {
        if (this.checkMouseButton(this.mouse!.justUp, b)) return true;
      }
    }
    return false;
  }

  /**
   * Wait for the next input (any key/button/mouse) and assign it to an action.
   * Resolves with the captured BindingEntry. Used by settings UIs for rebinding.
   * Cancel by pressing Escape (returns null). Times out after `timeoutSec`.
   */
  capture(
    action: string,
    timeoutSec = 10,
    signal?: AbortSignal,
  ): Promise<BindingEntry | null> {
    return new Promise((resolve) => {
      // Already aborted before we even start.
      if (signal?.aborted) {
        resolve(null);
        return;
      }

      const start = typeof performance !== "undefined" ? performance.now() : Date.now();
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let finished = false;

      const finish = (result: BindingEntry | null) => {
        if (finished) return;
        finished = true;
        if (intervalId !== null) clearInterval(intervalId);
        // Remove the abort listener to avoid leaks if capture completed normally.
        if (signal && onAbort) {
          signal.removeEventListener("abort", onAbort);
        }
        if (result) {
          this.set(action, result);
        }
        resolve(result);
      };

      // Wire up external cancellation via AbortSignal.
      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => finish(null);
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const poll = () => {
        // Cancel on Escape.
        if (this.keyboard.pressed("Escape")) {
          finish(null);
          return;
        }

        // Check keyboard — prefer justPressed set if available, fall back to
        // scanning a reasonable set of known keys via pressed().
        const key = this.detectKeyPressed();
        if (key) {
          finish({ keys: [key] });
          return;
        }

        // Gamepad buttons
        if (this.gamepad) {
          for (const b of GAMEPAD_BUTTON_CANDIDATES) {
            if (this.gamepad.pressed(b)) {
              finish({ gamepadButtons: [b] });
              return;
            }
          }
        }

        // Mouse
        if (this.mouse?.justDown) {
          const btn = this.mouse.button ?? 0;
          finish({ mouseButtons: [btn] });
          return;
        }

        // Timeout
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if ((now - start) / 1000 >= timeoutSec) {
          finish(null);
        }
      };

      intervalId = setInterval(poll, 16);
    });
  }

  /** Save bindings to storage under the given key. */
  save(storageKey: string = DEFAULT_STORAGE_KEY): void {
    save(storageKey, this.getAll());
  }

  /** Load bindings from storage. Returns true if loaded. */
  load(storageKey: string = DEFAULT_STORAGE_KEY): boolean {
    const data = load<BindingsConfig>(storageKey);
    if (!data || typeof data !== "object") return false;
    this.setAll(data);
    return true;
  }

  /**
   * Find actions that share the same physical input. Returns one conflict
   * entry per collision, grouping all actions that are bound to the same
   * key / gamepad button / mouse button. Use this in settings UIs to warn
   * before saving ambiguous bindings.
   *
   * Each conflict uses a channel-prefixed input name: `"key:Space"`,
   * `"pad:0"`, or `"mouse:0"`.
   */
  findConflicts(): Array<{ input: string; actions: string[] }> {
    const map = new Map<string, Set<string>>();
    for (const [action, entry] of Object.entries(this.bindings)) {
      for (const k of entry.keys ?? []) addToMap(map, `key:${k}`, action);
      for (const b of entry.gamepadButtons ?? []) addToMap(map, `pad:${b}`, action);
      for (const b of entry.mouseButtons ?? []) addToMap(map, `mouse:${b}`, action);
    }
    const conflicts: Array<{ input: string; actions: string[] }> = [];
    for (const [input, actions] of map) {
      if (actions.size > 1) conflicts.push({ input, actions: [...actions] });
    }
    return conflicts;
  }

  // ── Internals ────────────────────────────────────────────────────

  private detectKeyPressed(): string | undefined {
    const kb = this.keyboard;
    // Fast path: if the keyboard exposes a justPressed Set, scan it.
    if (kb.justPressed && kb.justPressed.size > 0) {
      for (const k of kb.justPressed) {
        if (k !== "Escape") return k;
      }
    }
    return undefined;
  }

  private checkMouseButton(flag: boolean, button: number): boolean {
    if (!this.mouse) return false;
    const matchBtn = this.mouse.button !== undefined ? this.mouse.button === button : button === 0;
    return flag && matchBtn;
  }
}

function addToMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}
