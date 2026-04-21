import { describe, expect, test } from "bun:test";
import { defineSystem, SystemPriority, SystemRunner } from "../../ecs/systems";
import { mockEngine } from "../helpers";

describe("SystemRunner ordering by priority", () => {
  test("runs systems in ascending priority", () => {
    const engine = mockEngine();
    const order: string[] = [];
    const runner = new SystemRunner();

    runner.add(
      defineSystem({ name: "late", priority: 80, update: () => order.push("late") }),
      engine,
    );
    runner.add(
      defineSystem({ name: "early", priority: 10, update: () => order.push("early") }),
      engine,
    );
    runner.add(
      defineSystem({ name: "mid", priority: 40, update: () => order.push("mid") }),
      engine,
    );

    runner.update(engine, 0.016);
    expect(order).toEqual(["early", "mid", "late"]);
  });

  test("preserves registration order for same priority", () => {
    const engine = mockEngine();
    const order: string[] = [];
    const runner = new SystemRunner();

    runner.add(defineSystem({ name: "a", priority: 5, update: () => order.push("a") }), engine);
    runner.add(defineSystem({ name: "b", priority: 5, update: () => order.push("b") }), engine);
    runner.add(defineSystem({ name: "c", priority: 5, update: () => order.push("c") }), engine);

    runner.update(engine, 0.016);
    expect(order).toEqual(["a", "b", "c"]);
  });

  test("default priority (0) runs before built-in priorities", () => {
    const engine = mockEngine();
    const order: string[] = [];
    const runner = new SystemRunner();

    runner.add(
      defineSystem({
        name: "_physics",
        priority: SystemPriority.physics,
        update: () => order.push("physics"),
      }),
      engine,
    );
    runner.add(defineSystem({ name: "custom", update: () => order.push("custom") }), engine);

    runner.update(engine, 0.016);
    expect(order).toEqual(["custom", "physics"]);
  });

  test("priority between built-in slots interleaves correctly", () => {
    const engine = mockEngine();
    const order: string[] = [];
    const runner = new SystemRunner();

    runner.add(
      defineSystem({
        name: "_physics",
        priority: SystemPriority.physics,
        update: () => order.push("physics"),
      }),
      engine,
    );
    runner.add(
      defineSystem({
        name: "_tween",
        priority: SystemPriority.tween,
        update: () => order.push("tween"),
      }),
      engine,
    );
    runner.add(
      defineSystem({
        name: "collision",
        priority: SystemPriority.physics + 1,
        update: () => order.push("collision"),
      }),
      engine,
    );

    runner.update(engine, 0.016);
    expect(order).toEqual(["physics", "collision", "tween"]);
  });
});
