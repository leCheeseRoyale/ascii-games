import { beforeEach, describe, expect, test } from "bun:test";
import { defineSystem, SystemRunner } from "../../ecs/systems";
import { mockEngine } from "../helpers";

describe("SystemRunner", () => {
  let engine: ReturnType<typeof mockEngine>;
  let runner: SystemRunner;

  beforeEach(() => {
    engine = mockEngine();
    runner = new SystemRunner();
  });

  describe("add", () => {
    test("adds a system", () => {
      const sys = defineSystem({
        name: "test-sys",
        update: () => {},
      });
      runner.add(sys, engine as any);
      expect(runner.list()).toContain("test-sys");
    });

    test("calls init on add", () => {
      let inited = false;
      const sys = defineSystem({
        name: "test-sys",
        init: () => {
          inited = true;
        },
        update: () => {},
      });
      runner.add(sys, engine as any);
      expect(inited).toBe(true);
    });

    test("duplicate name is silently ignored", () => {
      let initCount = 0;
      const sys1 = defineSystem({
        name: "dupe",
        init: () => {
          initCount++;
        },
        update: () => {},
      });
      const sys2 = defineSystem({
        name: "dupe",
        init: () => {
          initCount++;
        },
        update: () => {},
      });

      runner.add(sys1, engine as any);
      runner.add(sys2, engine as any);
      expect(initCount).toBe(1);
      expect(runner.list()).toHaveLength(1);
    });
  });

  describe("remove", () => {
    test("removes a system by name", () => {
      const sys = defineSystem({ name: "removable", update: () => {} });
      runner.add(sys, engine as any);
      runner.remove("removable", engine as any);
      expect(runner.list()).not.toContain("removable");
    });

    test("calls cleanup on remove", () => {
      let cleaned = false;
      const sys = defineSystem({
        name: "removable",
        update: () => {},
        cleanup: () => {
          cleaned = true;
        },
      });
      runner.add(sys, engine as any);
      runner.remove("removable", engine as any);
      expect(cleaned).toBe(true);
    });

    test("removing non-existent name does not throw", () => {
      expect(() => runner.remove("nope", engine as any)).not.toThrow();
    });
  });

  describe("update", () => {
    test("calls update on all systems", () => {
      const log: string[] = [];
      runner.add(defineSystem({ name: "a", update: () => log.push("a") }), engine as any);
      runner.add(defineSystem({ name: "b", update: () => log.push("b") }), engine as any);

      runner.update(engine as any, 0.016);
      expect(log).toEqual(["a", "b"]);
    });

    test("passes engine and dt to update", () => {
      let receivedDt = 0;
      let receivedEngine: any = null;
      runner.add(
        defineSystem({
          name: "test",
          update: (e, dt) => {
            receivedEngine = e;
            receivedDt = dt;
          },
        }),
        engine as any,
      );

      runner.update(engine as any, 0.033);
      expect(receivedEngine).toBe(engine);
      expect(receivedDt).toBe(0.033);
    });
  });

  describe("phase gating", () => {
    test("skips system with wrong phase when turns are active", () => {
      engine.turns.active = true;
      engine.turns.currentPhase = "play";

      let ran = false;
      runner.add(
        defineSystem({
          name: "attack-only",
          phase: "attack",
          update: () => {
            ran = true;
          },
        }),
        engine as any,
      );

      runner.update(engine as any, 0.016);
      expect(ran).toBe(false);
    });

    test("runs system with matching phase when turns are active", () => {
      engine.turns.active = true;
      engine.turns.currentPhase = "play";

      let ran = false;
      runner.add(
        defineSystem({
          name: "play-sys",
          phase: "play",
          update: () => {
            ran = true;
          },
        }),
        engine as any,
      );

      runner.update(engine as any, 0.016);
      expect(ran).toBe(true);
    });

    test("always runs systems without a phase (even when turns are active)", () => {
      engine.turns.active = true;
      engine.turns.currentPhase = "play";

      let ran = false;
      runner.add(
        defineSystem({
          name: "always",
          update: () => {
            ran = true;
          },
        }),
        engine as any,
      );

      runner.update(engine as any, 0.016);
      expect(ran).toBe(true);
    });

    test("all systems run when turns are not active (phase ignored)", () => {
      engine.turns.active = false;

      let phasedRan = false;
      let normalRan = false;
      runner.add(
        defineSystem({
          name: "phased",
          phase: "attack",
          update: () => {
            phasedRan = true;
          },
        }),
        engine as any,
      );
      runner.add(
        defineSystem({
          name: "normal",
          update: () => {
            normalRan = true;
          },
        }),
        engine as any,
      );

      runner.update(engine as any, 0.016);
      expect(phasedRan).toBe(true);
      expect(normalRan).toBe(true);
    });
  });

  describe("clear", () => {
    test("removes all systems", () => {
      runner.add(defineSystem({ name: "a", update: () => {} }), engine as any);
      runner.add(defineSystem({ name: "b", update: () => {} }), engine as any);
      runner.clear(engine as any);
      expect(runner.list()).toHaveLength(0);
    });

    test("calls cleanup on all systems", () => {
      const log: string[] = [];
      runner.add(
        defineSystem({ name: "a", update: () => {}, cleanup: () => log.push("a") }),
        engine as any,
      );
      runner.add(
        defineSystem({ name: "b", update: () => {}, cleanup: () => log.push("b") }),
        engine as any,
      );
      runner.clear(engine as any);
      expect(log).toContain("a");
      expect(log).toContain("b");
    });
  });

  describe("list", () => {
    test("returns names in add order", () => {
      runner.add(defineSystem({ name: "first", update: () => {} }), engine as any);
      runner.add(defineSystem({ name: "second", update: () => {} }), engine as any);
      runner.add(defineSystem({ name: "third", update: () => {} }), engine as any);
      expect(runner.list()).toEqual(["first", "second", "third"]);
    });

    test("returns empty array when no systems", () => {
      expect(runner.list()).toEqual([]);
    });
  });
});

describe("defineSystem", () => {
  test("returns the same system object", () => {
    const sys = { name: "test", update: () => {} };
    expect(defineSystem(sys)).toBe(sys);
  });
});
