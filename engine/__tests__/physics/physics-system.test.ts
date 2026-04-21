import { beforeEach, describe, expect, test } from "bun:test";
import { physicsSystem } from "../../physics/physics-system";
import { mockEngine } from "../helpers";

describe("physicsSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine({ width: 800, height: 600 });
  });

  describe("grounded reset for bouncing entities", () => {
    test("grounded is true when entity touches bottom wall", () => {
      // Position entity so bottom edge (y + height/2 = 596) is just inside,
      // and velocity pushes it past the bottom wall (600) after integration.
      const e = engine.spawn({
        position: { x: 400, y: 594 },
        velocity: { vx: 0, vy: 500 },
        physics: { bounce: 0.5 },
        collider: { type: "rect", width: 10, height: 10 },
      });

      // Tick to integrate velocity and bounce off bottom
      physicsSystem.update(engine, 0.016);

      expect(e.physics!.grounded).toBe(true);
    });

    test("grounded resets to false when entity moves away from bottom wall", () => {
      const e = engine.spawn({
        position: { x: 400, y: 594 },
        velocity: { vx: 0, vy: 500 },
        physics: { bounce: 0.5 },
        collider: { type: "rect", width: 10, height: 10 },
      });

      // First tick — entity hits bottom wall, grounded becomes true
      physicsSystem.update(engine, 0.016);
      expect(e.physics!.grounded).toBe(true);

      // Move entity away from bottom wall
      e.position!.y = 300;
      e.velocity!.vy = -50;

      // Second tick — entity is airborne, grounded should reset to false
      physicsSystem.update(engine, 0.016);
      expect(e.physics!.grounded).toBe(false);
    });

    test("grounded stays false for non-bouncing entities", () => {
      const e = engine.spawn({
        position: { x: 400, y: 300 },
        velocity: { vx: 0, vy: 0 },
        physics: { bounce: 0 },
        collider: { type: "rect", width: 10, height: 10 },
      });

      physicsSystem.update(engine, 0.016);

      // bounce <= 0, so grounded is not managed by the physics system
      expect(e.physics!.grounded).toBeUndefined();
    });

    test("grounded is re-set each frame for entity remaining on bottom wall", () => {
      const e = engine.spawn({
        position: { x: 400, y: 595 },
        velocity: { vx: 0, vy: 10 },
        physics: { bounce: 0.5 },
        collider: { type: "rect", width: 10, height: 10 },
      });

      // First tick — hits bottom
      physicsSystem.update(engine, 0.016);
      expect(e.physics!.grounded).toBe(true);

      // Keep entity at the bottom wall with small downward velocity
      e.velocity!.vy = 5;

      // Second tick — still at bottom, grounded should still be true
      physicsSystem.update(engine, 0.016);
      expect(e.physics!.grounded).toBe(true);
    });
  });
});
