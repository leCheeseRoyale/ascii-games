import { describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import { createDamageSystem } from "../../behaviors/damage";
import { mockEngine } from "../helpers";

describe("createDamageSystem", () => {
  test("returns a System with name and update", () => {
    const sys = createDamageSystem();
    expect(sys.name).toBeDefined();
    expect(typeof sys.update).toBe("function");
  });

  test("applies damage to health", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 0 });

    const entity: any = engine.spawn({
      health: { current: 10, max: 10 },
      damage: { amount: 3 },
    });

    sys.update(engine as any, 0.016);
    expect(entity.health.current).toBe(7);
  });

  test("clears damage component after applying", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 0 });

    const entity: any = engine.spawn({
      health: { current: 10, max: 10 },
      damage: { amount: 3 },
    });

    sys.update(engine as any, 0.016);
    expect(entity.damage).toBeUndefined();
  });

  test("clamps health to 0", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 0 });

    const entity: any = engine.spawn({
      health: { current: 5, max: 10 },
      damage: { amount: 100 },
    });

    sys.update(engine as any, 0.016);
    expect(entity.health.current).toBe(0);
  });

  test("invincibility frames prevent back-to-back damage", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 1.0 });

    const entity: any = engine.spawn({
      health: { current: 10, max: 10 },
      damage: { amount: 3 },
    });

    // First damage should apply
    sys.update(engine as any, 0.016);
    expect(entity.health.current).toBe(7);

    // Second damage during i-frames should be ignored
    entity.damage = { amount: 3 };
    sys.update(engine as any, 0.016);
    expect(entity.health.current).toBe(7);
  });

  test("onDamage callback can cancel damage", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({
      invincibilityDuration: 0,
      onDamage: () => false, // cancel
    });

    const entity: any = engine.spawn({
      health: { current: 10, max: 10 },
      damage: { amount: 3 },
    });

    sys.update(engine as any, 0.016);
    expect(entity.health.current).toBe(10);
  });

  test("onDeath callback fires when health reaches 0", () => {
    const engine = mockEngine();
    let died = false;
    const sys = createDamageSystem({
      invincibilityDuration: 0,
      onDeath: () => {
        died = true;
      },
    });

    engine.spawn({
      health: { current: 5, max: 10 },
      damage: { amount: 10 },
    });

    sys.update(engine as any, 0.016);
    expect(died).toBe(true);
  });

  test("emits combat:damage-taken event on damage", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 0 });
    const received: Array<Record<string, unknown>> = [];
    const handler = (e: unknown) => received.push(e as Record<string, unknown>);
    events.on("combat:damage-taken", handler);

    engine.spawn({
      health: { current: 10, max: 10 },
      damage: { amount: 3, type: "fire" },
    });
    sys.update(engine as any, 0.016);
    events.off("combat:damage-taken", handler);

    expect(received.length).toBe(1);
    expect(received[0].amount).toBe(3);
    expect(received[0].type).toBe("fire");
    expect(received[0].remainingHp).toBe(7);
  });

  test("emits combat:entity-defeated event when health hits 0", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 0 });
    const defeated: Array<Record<string, unknown>> = [];
    const handler = (e: unknown) => defeated.push(e as Record<string, unknown>);
    events.on("combat:entity-defeated", handler);

    engine.spawn({
      health: { current: 5, max: 10 },
      damage: { amount: 10 },
    });
    sys.update(engine as any, 0.016);
    events.off("combat:entity-defeated", handler);

    expect(defeated.length).toBe(1);
  });

  test("does not emit damage-taken when invincible", () => {
    const engine = mockEngine();
    const sys = createDamageSystem({ invincibilityDuration: 1.0 });
    const received: unknown[] = [];
    const handler = (e: unknown) => received.push(e);
    events.on("combat:damage-taken", handler);

    const entity: any = engine.spawn({
      health: { current: 10, max: 10 },
      damage: { amount: 3 },
    });
    sys.update(engine as any, 0.016);
    entity.damage = { amount: 3 };
    sys.update(engine as any, 0.016);
    events.off("combat:damage-taken", handler);

    expect(received.length).toBe(1); // only the first hit
  });
});
