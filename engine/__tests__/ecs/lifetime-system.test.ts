import { beforeEach, describe, expect, test } from "bun:test";
import { lifetimeSystem } from "../../ecs/lifetime-system";
import { mockEngine } from "../helpers";

describe("lifetimeSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine();
  });

  test("decrements remaining each frame", () => {
    const entity = engine.spawn({
      lifetime: { remaining: 2.0 },
    });

    lifetimeSystem.update(engine, 0.5);
    expect(entity.lifetime!.remaining).toBeCloseTo(1.5);
  });

  test("destroys entity when remaining reaches 0", () => {
    const entity = engine.spawn({
      lifetime: { remaining: 0.5 },
    });

    lifetimeSystem.update(engine, 0.6);
    expect(engine.world.entities).not.toContain(entity as any);
  });

  test("destroys entity when remaining goes below 0", () => {
    const entity = engine.spawn({
      lifetime: { remaining: 0.1 },
    });

    lifetimeSystem.update(engine, 1.0);
    expect(engine.world.entities).not.toContain(entity as any);
  });

  test("does not destroy entity with remaining > 0", () => {
    const entity = engine.spawn({
      lifetime: { remaining: 5.0 },
    });

    lifetimeSystem.update(engine, 1.0);
    expect(engine.world.entities).toContain(entity as any);
    expect(entity.lifetime!.remaining).toBeCloseTo(4.0);
  });

  test("handles multiple entities", () => {
    const dying = engine.spawn({ lifetime: { remaining: 0.1 } });
    const alive = engine.spawn({ lifetime: { remaining: 5.0 } });

    lifetimeSystem.update(engine, 0.5);
    expect(engine.world.entities).not.toContain(dying as any);
    expect(engine.world.entities).toContain(alive as any);
  });

  test("does not affect entities without lifetime component", () => {
    const entity = engine.spawn({ position: { x: 0, y: 0 } });

    lifetimeSystem.update(engine, 1.0);
    expect(engine.world.entities).toContain(entity as any);
  });

  test("has correct system name", () => {
    expect(lifetimeSystem.name).toBe("_lifetime");
  });
});
