import { describe, expect, test } from "bun:test";
import {
  createChaseBehavior,
  createFleeBehavior,
  createPatrolBehavior,
  createWanderBehavior,
} from "../../behaviors/ai";

describe("createPatrolBehavior", () => {
  test("returns a StateMachineState with enter/update/exit", () => {
    const state = createPatrolBehavior(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { speed: 50 },
    );
    expect(typeof state.enter).toBe("function");
    expect(typeof state.update).toBe("function");
    expect(typeof state.exit).toBe("function");
  });

  test("enter initializes internal state", () => {
    const state = createPatrolBehavior([{ x: 0, y: 0 }], { speed: 50 });
    const entity: any = { position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 } };
    state.enter?.(entity, {} as any);
    expect(entity._patrol).toBeDefined();
  });

  test("exit zeros velocity and cleans up state", () => {
    const state = createPatrolBehavior([{ x: 0, y: 0 }], { speed: 50 });
    const entity: any = {
      position: { x: 0, y: 0 },
      velocity: { vx: 50, vy: 50 },
      _patrol: { waypointIndex: 0, waitTimer: 0 },
    };
    state.exit?.(entity, {} as any);
    expect(entity.velocity.vx).toBe(0);
    expect(entity.velocity.vy).toBe(0);
  });
});

describe("createChaseBehavior", () => {
  test("returns a StateMachineState", () => {
    const state = createChaseBehavior({ targetTag: "player", speed: 100, range: 200 });
    expect(typeof state.update).toBe("function");
  });

  test("update sets velocity toward target when in range", () => {
    const state = createChaseBehavior({ targetTag: "player", speed: 100, range: 500 });
    const entity: any = { position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 } };
    const mockEngine: any = {
      findByTag: () => ({ position: { x: 100, y: 0 } }),
    };
    state.update?.(entity, mockEngine, 0.016);
    // Velocity should point toward target (positive x direction)
    expect(entity.velocity.vx).toBeGreaterThan(0);
  });

  test("update handles missing target gracefully", () => {
    const state = createChaseBehavior({ targetTag: "player", speed: 100, range: 200 });
    const entity: any = { position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 } };
    const mockEngine: any = {
      findByTag: () => undefined,
    };
    expect(() => state.update?.(entity, mockEngine, 0.016)).not.toThrow();
  });
});

describe("createFleeBehavior", () => {
  test("update sets velocity away from target when in range", () => {
    const state = createFleeBehavior({ targetTag: "player", speed: 100, range: 500 });
    const entity: any = { position: { x: 100, y: 0 }, velocity: { vx: 0, vy: 0 } };
    const mockEngine: any = {
      findByTag: () => ({ position: { x: 0, y: 0 } }),
    };
    state.update?.(entity, mockEngine, 0.016);
    // Velocity should point away from target (positive x)
    expect(entity.velocity.vx).toBeGreaterThan(0);
  });
});

describe("createWanderBehavior", () => {
  test("returns a StateMachineState", () => {
    const state = createWanderBehavior();
    expect(typeof state.enter).toBe("function");
    expect(typeof state.update).toBe("function");
  });

  test("enter sets initial wander state", () => {
    const state = createWanderBehavior({ speed: 40 });
    const entity: any = { position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 } };
    state.enter?.(entity, {} as any);
    expect(entity._wander).toBeDefined();
  });

  test("update produces non-zero velocity", () => {
    const state = createWanderBehavior({ speed: 40 });
    const entity: any = { position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 } };
    state.enter?.(entity, {} as any);
    state.update?.(entity, {} as any, 0.016);
    // Velocity should be non-zero after enter sets initial direction
    const mag = Math.sqrt(entity.velocity.vx ** 2 + entity.velocity.vy ** 2);
    expect(mag).toBeGreaterThan(0);
  });
});
