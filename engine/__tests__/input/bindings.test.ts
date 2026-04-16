import { beforeEach, describe, expect, test } from "bun:test";
import {
  type BindingsConfig,
  createDefaultBindings,
  DEFAULT_BINDINGS,
  InputBindings,
} from "../../input/bindings";
import { setStoragePrefix } from "../../storage/storage";

// ── Mocks ────────────────────────────────────────────────────────

class MockKeyboard {
  keys = new Set<string>();
  justPressed = new Set<string>();
  justReleased = new Set<string>();

  held(k: string): boolean {
    return this.keys.has(k);
  }
  pressed(k: string): boolean {
    return this.justPressed.has(k);
  }
  released(k: string): boolean {
    return this.justReleased.has(k);
  }

  /** Test helper — simulate pressing a key this frame. */
  press(k: string): void {
    this.keys.add(k);
    this.justPressed.add(k);
  }
  /** Test helper — simulate releasing a key this frame. */
  release(k: string): void {
    this.keys.delete(k);
    this.justReleased.add(k);
  }
  /** Test helper — simulate an already-held key (not pressed this frame). */
  hold(k: string): void {
    this.keys.add(k);
  }
  reset(): void {
    this.keys.clear();
    this.justPressed.clear();
    this.justReleased.clear();
  }
}

class MockGamepad {
  private _held = new Set<number>();
  private _pressed = new Set<number>();
  private _released = new Set<number>();

  held(b: number): boolean {
    return this._held.has(b);
  }
  pressed(b: number): boolean {
    return this._pressed.has(b);
  }
  released(b: number): boolean {
    return this._released.has(b);
  }

  press(b: number): void {
    this._held.add(b);
    this._pressed.add(b);
  }
  release(b: number): void {
    this._held.delete(b);
    this._released.add(b);
  }
  hold(b: number): void {
    this._held.add(b);
  }
  reset(): void {
    this._held.clear();
    this._pressed.clear();
    this._released.clear();
  }
}

class MockMouse {
  down = false;
  justDown = false;
  justUp = false;
  button: number | undefined = 0;

  press(button = 0): void {
    this.down = true;
    this.justDown = true;
    this.button = button;
  }
  release(button = 0): void {
    this.down = false;
    this.justUp = true;
    this.button = button;
  }
  reset(): void {
    this.down = false;
    this.justDown = false;
    this.justUp = false;
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("InputBindings", () => {
  let kb: MockKeyboard;
  let gp: MockGamepad;
  let ms: MockMouse;
  let input: InputBindings;

  beforeEach(() => {
    kb = new MockKeyboard();
    gp = new MockGamepad();
    ms = new MockMouse();
    input = new InputBindings(kb, gp, ms);
    setStoragePrefix("ascii-game");
  });

  describe("set / get / clear", () => {
    test("set stores a binding retrievable via get", () => {
      input.set("jump", { keys: ["Space"] });
      expect(input.get("jump")).toEqual({
        keys: ["Space"],
        gamepadButtons: undefined,
        mouseButtons: undefined,
      });
    });

    test("set replaces an existing binding", () => {
      input.set("jump", { keys: ["Space"] });
      input.set("jump", { keys: ["KeyW"] });
      expect(input.get("jump")?.keys).toEqual(["KeyW"]);
    });

    test("clear removes a binding", () => {
      input.set("jump", { keys: ["Space"] });
      input.clear("jump");
      expect(input.get("jump")).toBeUndefined();
    });

    test("get returns undefined for unknown action", () => {
      expect(input.get("nope")).toBeUndefined();
    });

    test("set clones arrays — mutating source does not affect stored binding", () => {
      const src = { keys: ["Space"] };
      input.set("jump", src);
      src.keys.push("Enter");
      expect(input.get("jump")?.keys).toEqual(["Space"]);
    });
  });

  describe("held / pressed / released check all mapped keys", () => {
    beforeEach(() => {
      input.set("move-up", { keys: ["ArrowUp", "KeyW"] });
    });

    test("held returns true when the first bound key is held", () => {
      kb.hold("ArrowUp");
      expect(input.held("move-up")).toBe(true);
    });

    test("held returns true when the second bound key is held", () => {
      kb.hold("KeyW");
      expect(input.held("move-up")).toBe(true);
    });

    test("held returns false when no bound key is held", () => {
      kb.hold("KeyS");
      expect(input.held("move-up")).toBe(false);
    });

    test("pressed returns true when any bound key was pressed this frame", () => {
      kb.press("KeyW");
      expect(input.pressed("move-up")).toBe(true);
    });

    test("pressed returns false when only a non-bound key was pressed", () => {
      kb.press("KeyX");
      expect(input.pressed("move-up")).toBe(false);
    });

    test("released returns true when any bound key was released this frame", () => {
      kb.release("ArrowUp");
      expect(input.released("move-up")).toBe(true);
    });

    test("released returns false for an unbound action", () => {
      kb.release("ArrowUp");
      expect(input.released("nope")).toBe(false);
    });

    test("held returns false for an unbound action", () => {
      expect(input.held("nope")).toBe(false);
    });

    test("pressed returns false for an unbound action", () => {
      kb.press("Space");
      expect(input.pressed("nope")).toBe(false);
    });
  });

  describe("multi-key binding — any match returns true", () => {
    test("three keys bound, pressing the third still triggers", () => {
      input.set("attack", { keys: ["KeyJ", "KeyZ", "Enter"] });
      kb.press("Enter");
      expect(input.pressed("attack")).toBe(true);
    });

    test("two keys — pressing both simultaneously is still true (once)", () => {
      input.set("jump", { keys: ["Space", "KeyW"] });
      kb.press("Space");
      kb.press("KeyW");
      expect(input.pressed("jump")).toBe(true);
    });
  });

  describe("gamepad bindings", () => {
    test("held returns true when any bound gamepad button is held", () => {
      input.set("move-up", { keys: ["ArrowUp"], gamepadButtons: [12] });
      gp.hold(12);
      expect(input.held("move-up")).toBe(true);
    });

    test("pressed returns true on gamepad button press", () => {
      input.set("action-a", { gamepadButtons: [0] });
      gp.press(0);
      expect(input.pressed("action-a")).toBe(true);
    });

    test("released returns true on gamepad button release", () => {
      input.set("action-a", { gamepadButtons: [0] });
      gp.release(0);
      expect(input.released("action-a")).toBe(true);
    });

    test("works without a gamepad passed in", () => {
      const kbOnly = new InputBindings(kb);
      kbOnly.set("foo", { keys: ["Space"], gamepadButtons: [0] });
      kb.press("Space");
      expect(kbOnly.pressed("foo")).toBe(true);
    });
  });

  describe("mouse bindings", () => {
    test("held returns true when bound mouse button is down", () => {
      input.set("fire", { mouseButtons: [0] });
      ms.down = true;
      ms.button = 0;
      expect(input.held("fire")).toBe(true);
    });

    test("pressed returns true on mouse click", () => {
      input.set("fire", { mouseButtons: [0] });
      ms.press(0);
      expect(input.pressed("fire")).toBe(true);
    });

    test("released returns true on mouse release", () => {
      input.set("fire", { mouseButtons: [0] });
      ms.release(0);
      expect(input.released("fire")).toBe(true);
    });
  });

  describe("default bindings provide standard actions", () => {
    beforeEach(() => {
      input.setAll(createDefaultBindings());
    });

    test("DEFAULT_BINDINGS contains move-up/down/left/right", () => {
      expect(DEFAULT_BINDINGS["move-up"]).toBeDefined();
      expect(DEFAULT_BINDINGS["move-down"]).toBeDefined();
      expect(DEFAULT_BINDINGS["move-left"]).toBeDefined();
      expect(DEFAULT_BINDINGS["move-right"]).toBeDefined();
    });

    test("move-up binds to both ArrowUp and KeyW", () => {
      kb.press("ArrowUp");
      expect(input.pressed("move-up")).toBe(true);
      kb.reset();
      kb.press("KeyW");
      expect(input.pressed("move-up")).toBe(true);
    });

    test("move-down binds to both ArrowDown and KeyS", () => {
      kb.press("ArrowDown");
      expect(input.pressed("move-down")).toBe(true);
      kb.reset();
      kb.press("KeyS");
      expect(input.pressed("move-down")).toBe(true);
    });

    test("move-left binds to both ArrowLeft and KeyA", () => {
      kb.press("ArrowLeft");
      expect(input.pressed("move-left")).toBe(true);
      kb.reset();
      kb.press("KeyA");
      expect(input.pressed("move-left")).toBe(true);
    });

    test("move-right binds to both ArrowRight and KeyD", () => {
      kb.press("ArrowRight");
      expect(input.pressed("move-right")).toBe(true);
      kb.reset();
      kb.press("KeyD");
      expect(input.pressed("move-right")).toBe(true);
    });

    test("action-a fires on Space", () => {
      kb.press("Space");
      expect(input.pressed("action-a")).toBe(true);
    });

    test("pause fires on Escape", () => {
      kb.press("Escape");
      expect(input.pressed("pause")).toBe(true);
    });

    test("DPAD gamepad buttons are wired up", () => {
      gp.press(12); // DPAD_UP
      expect(input.pressed("move-up")).toBe(true);
    });

    test("createDefaultBindings returns a deep copy — mutation does not leak", () => {
      const a = createDefaultBindings();
      const b = createDefaultBindings();
      a["move-up"]?.keys?.push("KeyZ");
      expect(b["move-up"]?.keys).toEqual(["ArrowUp", "KeyW"]);
      // Original constant is still untouched too
      expect(DEFAULT_BINDINGS["move-up"]?.keys).toEqual(["ArrowUp", "KeyW"]);
    });
  });

  describe("setAll / getAll round-trip", () => {
    test("setAll replaces all bindings", () => {
      input.set("old", { keys: ["KeyX"] });
      const next: BindingsConfig = {
        fire: { keys: ["Space"] },
        dash: { keys: ["ShiftLeft"] },
      };
      input.setAll(next);
      expect(input.get("old")).toBeUndefined();
      expect(input.get("fire")?.keys).toEqual(["Space"]);
      expect(input.get("dash")?.keys).toEqual(["ShiftLeft"]);
    });

    test("getAll returns all stored bindings", () => {
      input.set("a", { keys: ["KeyA"] });
      input.set("b", { keys: ["KeyB"], gamepadButtons: [1] });
      const all = input.getAll();
      expect(Object.keys(all).sort()).toEqual(["a", "b"]);
      expect(all["a"]?.keys).toEqual(["KeyA"]);
      expect(all["b"]?.gamepadButtons).toEqual([1]);
    });

    test("setAll → getAll round-trips unchanged", () => {
      const original: BindingsConfig = {
        shoot: { keys: ["Space"], gamepadButtons: [7], mouseButtons: [0] },
        reload: { keys: ["KeyR"] },
      };
      input.setAll(original);
      const round = input.getAll();
      expect(round["shoot"]?.keys).toEqual(["Space"]);
      expect(round["shoot"]?.gamepadButtons).toEqual([7]);
      expect(round["shoot"]?.mouseButtons).toEqual([0]);
      expect(round["reload"]?.keys).toEqual(["KeyR"]);
    });

    test("getAll returns a deep copy — mutating result does not affect storage", () => {
      input.set("jump", { keys: ["Space"] });
      const copy = input.getAll();
      copy["jump"]?.keys?.push("KeyW");
      expect(input.get("jump")?.keys).toEqual(["Space"]);
    });

    test("setAll deep-copies input — later mutation to source does not leak", () => {
      const src: BindingsConfig = { jump: { keys: ["Space"] } };
      input.setAll(src);
      src["jump"]?.keys?.push("KeyW");
      expect(input.get("jump")?.keys).toEqual(["Space"]);
    });
  });

  describe("save / load via storage", () => {
    test("save then load restores bindings", () => {
      input.set("jump", { keys: ["Space", "KeyW"] });
      input.set("fire", { mouseButtons: [0] });
      input.save("my-key");

      const fresh = new InputBindings(kb, gp, ms);
      const loaded = fresh.load("my-key");
      expect(loaded).toBe(true);
      expect(fresh.get("jump")?.keys).toEqual(["Space", "KeyW"]);
      expect(fresh.get("fire")?.mouseButtons).toEqual([0]);
    });

    test("save/load with default key", () => {
      input.set("jump", { keys: ["Space"] });
      input.save();
      const fresh = new InputBindings(kb);
      expect(fresh.load()).toBe(true);
      expect(fresh.get("jump")?.keys).toEqual(["Space"]);
    });

    test("load returns false when nothing is saved", () => {
      expect(input.load("no-such-key")).toBe(false);
    });
  });

  describe("findConflicts", () => {
    test("returns empty array when bindings are unique", () => {
      input.set("jump", { keys: ["Space"] });
      input.set("fire", { keys: ["KeyF"] });
      expect(input.findConflicts()).toEqual([]);
    });

    test("flags keys shared across actions", () => {
      input.set("jump", { keys: ["Space"] });
      input.set("confirm", { keys: ["Space", "Enter"] });
      const conflicts = input.findConflicts();
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].input).toBe("key:Space");
      expect(conflicts[0].actions.sort()).toEqual(["confirm", "jump"]);
    });

    test("detects conflicts across channels independently", () => {
      input.set("jump", { keys: ["Space"], gamepadButtons: [0] });
      input.set("confirm", { gamepadButtons: [0] });
      const conflicts = input.findConflicts();
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].input).toBe("pad:0");
    });

    test("returns one conflict per shared input (not per pair)", () => {
      input.set("a", { keys: ["KeyX"] });
      input.set("b", { keys: ["KeyX"] });
      input.set("c", { keys: ["KeyX"] });
      const conflicts = input.findConflicts();
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].actions.sort()).toEqual(["a", "b", "c"]);
    });
  });
});
