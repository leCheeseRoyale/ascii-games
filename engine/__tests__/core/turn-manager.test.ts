import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import { TurnManager } from "../../core/turn-manager";

describe("TurnManager", () => {
  let tm: TurnManager;
  const handlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  function on(event: string, handler: (...args: any[]) => void) {
    events.on(event as any, handler);
    handlers.push({ event, handler });
  }

  beforeEach(() => {
    tm = new TurnManager();
  });

  afterEach(() => {
    // Clean up all event handlers
    for (const { event, handler } of handlers) {
      events.off(event as any, handler);
    }
    handlers.length = 0;
  });

  describe("configure", () => {
    test("sets phases", () => {
      tm.configure({ phases: ["draw", "play", "end"] });
      expect(tm.phases).toEqual(["draw", "play", "end"]);
    });

    test("throws on empty phases", () => {
      expect(() => tm.configure({ phases: [] })).toThrow();
    });

    test("resets turn count and active state", () => {
      tm.configure({ phases: ["a", "b"] });
      tm.start();
      expect(tm.active).toBe(true);

      tm.configure({ phases: ["x", "y"] });
      expect(tm.active).toBe(false);
      expect(tm.turnCount).toBe(0);
    });
  });

  describe("start", () => {
    test("activates turn management", () => {
      tm.configure({ phases: ["play"] });
      tm.start();
      expect(tm.active).toBe(true);
    });

    test("sets turn count to 1", () => {
      tm.configure({ phases: ["play"] });
      tm.start();
      expect(tm.turnCount).toBe(1);
    });

    test("sets current phase to first phase", () => {
      tm.configure({ phases: ["draw", "play", "end"] });
      tm.start();
      expect(tm.currentPhase).toBe("draw");
    });

    test("throws if configure not called", () => {
      expect(() => tm.start()).toThrow();
    });

    test("emits turn:start and phase:enter", () => {
      const log: string[] = [];
      on("turn:start", (n: number) => log.push(`turn:start:${n}`));
      on("phase:enter", (p: string) => log.push(`phase:enter:${p}`));

      tm.configure({ phases: ["draw", "play"] });
      tm.start();

      expect(log).toEqual(["turn:start:1", "phase:enter:draw"]);
    });
  });

  describe("currentPhase", () => {
    test("returns null when inactive", () => {
      expect(tm.currentPhase).toBeNull();
    });

    test("returns current phase name when active", () => {
      tm.configure({ phases: ["a", "b", "c"] });
      tm.start();
      expect(tm.currentPhase).toBe("a");
    });
  });

  describe("endPhase", () => {
    test("advances to next phase", () => {
      tm.configure({ phases: ["draw", "play", "end"] });
      tm.start();
      expect(tm.currentPhase).toBe("draw");

      tm.endPhase();
      expect(tm.currentPhase).toBe("play");
    });

    test("wraps to new turn at end of phases", () => {
      tm.configure({ phases: ["a", "b"] });
      tm.start();
      expect(tm.turnCount).toBe(1);

      tm.endPhase(); // a -> b
      expect(tm.currentPhase).toBe("b");
      expect(tm.turnCount).toBe(1);

      tm.endPhase(); // b -> wraps to a, turn 2
      expect(tm.currentPhase).toBe("a");
      expect(tm.turnCount).toBe(2);
    });

    test("emits phase:exit and phase:enter", () => {
      const log: string[] = [];
      tm.configure({ phases: ["a", "b"] });
      tm.start();

      on("phase:exit", (p: string) => log.push(`exit:${p}`));
      on("phase:enter", (p: string) => log.push(`enter:${p}`));

      tm.endPhase();
      expect(log).toEqual(["exit:a", "enter:b"]);
    });

    test("emits turn:end and turn:start when wrapping", () => {
      const log: string[] = [];
      tm.configure({ phases: ["a"] });
      tm.start();

      on("turn:end", (n: number) => log.push(`turn:end:${n}`));
      on("turn:start", (n: number) => log.push(`turn:start:${n}`));
      on("phase:exit", (p: string) => log.push(`phase:exit:${p}`));
      on("phase:enter", (p: string) => log.push(`phase:enter:${p}`));

      tm.endPhase(); // wraps since only 1 phase
      expect(log).toEqual(["phase:exit:a", "turn:end:1", "turn:start:2", "phase:enter:a"]);
    });

    test("does nothing when inactive", () => {
      // Should not throw
      tm.endPhase();
    });
  });

  describe("endTurn", () => {
    test("skips remaining phases and starts next turn", () => {
      tm.configure({ phases: ["draw", "play", "end"] });
      tm.start();
      expect(tm.currentPhase).toBe("draw");

      tm.endTurn();
      expect(tm.currentPhase).toBe("draw");
      expect(tm.turnCount).toBe(2);
    });

    test("emits correct events", () => {
      const log: string[] = [];
      tm.configure({ phases: ["a", "b", "c"] });
      tm.start();

      on("phase:exit", (p: string) => log.push(`phase:exit:${p}`));
      on("turn:end", (n: number) => log.push(`turn:end:${n}`));
      on("turn:start", (n: number) => log.push(`turn:start:${n}`));
      on("phase:enter", (p: string) => log.push(`phase:enter:${p}`));

      tm.endTurn();
      expect(log).toEqual(["phase:exit:a", "turn:end:1", "turn:start:2", "phase:enter:a"]);
    });

    test("does nothing when inactive", () => {
      tm.endTurn(); // should not throw
    });
  });

  describe("goToPhase", () => {
    test("jumps to a specific phase", () => {
      tm.configure({ phases: ["draw", "play", "attack", "end"] });
      tm.start();

      tm.goToPhase("attack");
      expect(tm.currentPhase).toBe("attack");
    });

    test("emits phase:exit and phase:enter", () => {
      const log: string[] = [];
      tm.configure({ phases: ["a", "b", "c"] });
      tm.start();

      on("phase:exit", (p: string) => log.push(`exit:${p}`));
      on("phase:enter", (p: string) => log.push(`enter:${p}`));

      tm.goToPhase("c");
      expect(log).toEqual(["exit:a", "enter:c"]);
    });

    test("throws for unknown phase", () => {
      tm.configure({ phases: ["a", "b"] });
      tm.start();
      expect(() => tm.goToPhase("unknown")).toThrow();
    });

    test("does nothing when inactive", () => {
      tm.configure({ phases: ["a", "b"] });
      // Not started — goToPhase should be a no-op
      tm.goToPhase("b"); // should not throw
    });

    test("does not change turn count", () => {
      tm.configure({ phases: ["a", "b", "c"] });
      tm.start();
      expect(tm.turnCount).toBe(1);

      tm.goToPhase("c");
      expect(tm.turnCount).toBe(1);
    });
  });

  describe("stop", () => {
    test("deactivates turn management", () => {
      tm.configure({ phases: ["a", "b"] });
      tm.start();
      tm.stop();
      expect(tm.active).toBe(false);
    });

    test("resets turn count", () => {
      tm.configure({ phases: ["a"] });
      tm.start();
      tm.endPhase();
      tm.endPhase();
      tm.stop();
      expect(tm.turnCount).toBe(0);
    });

    test("currentPhase returns null after stop", () => {
      tm.configure({ phases: ["a"] });
      tm.start();
      tm.stop();
      expect(tm.currentPhase).toBeNull();
    });

    test("emits phase:exit on stop", () => {
      const log: string[] = [];
      tm.configure({ phases: ["a", "b"] });
      tm.start();

      on("phase:exit", (p: string) => log.push(`exit:${p}`));
      tm.stop();
      expect(log).toEqual(["exit:a"]);
    });

    test("stop when already inactive is a no-op", () => {
      tm.stop(); // should not throw
    });
  });

  describe("reset", () => {
    test("deactivates and resets counts", () => {
      tm.configure({ phases: ["a", "b"] });
      tm.start();
      tm.endPhase();
      tm.reset();

      expect(tm.active).toBe(false);
      expect(tm.turnCount).toBe(0);
    });

    test("preserves phase configuration", () => {
      tm.configure({ phases: ["x", "y", "z"] });
      tm.start();
      tm.reset();

      expect(tm.phases).toEqual(["x", "y", "z"]);
    });
  });
});
