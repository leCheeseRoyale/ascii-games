import { beforeEach, describe, expect, test } from "bun:test";
import { screenBoundsSystem } from "../../ecs/screen-bounds-system";
import { mockEngine } from "../helpers";

describe("screenBoundsSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine({ width: 800, height: 600 });
  });

  describe("screenWrap", () => {
    test("wraps entity going off right edge", () => {
      const e = engine.spawn({
        position: { x: 801, y: 300 },
        screenWrap: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBeCloseTo(0);
    });

    test("wraps entity going off left edge", () => {
      const e = engine.spawn({
        position: { x: -1, y: 300 },
        screenWrap: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(800);
    });

    test("wraps entity going off bottom edge", () => {
      const e = engine.spawn({
        position: { x: 400, y: 601 },
        screenWrap: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.y).toBeCloseTo(0);
    });

    test("wraps entity going off top edge", () => {
      const e = engine.spawn({
        position: { x: 400, y: -1 },
        screenWrap: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.y).toBe(600);
    });

    test("respects margin", () => {
      const e = engine.spawn({
        position: { x: 810, y: 300 },
        screenWrap: { margin: 20 },
      });

      // x=810 > 800+20=820? No (810 < 820), so no wrap
      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(810);

      // Now move past margin
      e.position.x = 821;
      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(-20);
    });

    test("does not wrap entity inside screen", () => {
      const e = engine.spawn({
        position: { x: 400, y: 300 },
        screenWrap: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(400);
      expect(e.position.y).toBe(300);
    });
  });

  describe("screenClamp", () => {
    test("clamps entity at left boundary", () => {
      const e = engine.spawn({
        position: { x: -10, y: 300 },
        screenClamp: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBeCloseTo(0);
    });

    test("clamps entity at right boundary", () => {
      const e = engine.spawn({
        position: { x: 850, y: 300 },
        screenClamp: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(800);
    });

    test("clamps entity at top boundary", () => {
      const e = engine.spawn({
        position: { x: 400, y: -10 },
        screenClamp: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.y).toBeCloseTo(0);
    });

    test("clamps entity at bottom boundary", () => {
      const e = engine.spawn({
        position: { x: 400, y: 650 },
        screenClamp: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.y).toBe(600);
    });

    test("respects padding", () => {
      const e = engine.spawn({
        position: { x: 3, y: 3 },
        screenClamp: { padding: 10 },
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(10);
      expect(e.position.y).toBe(10);
    });

    test("clamps right/bottom with padding", () => {
      const e = engine.spawn({
        position: { x: 798, y: 598 },
        screenClamp: { padding: 10 },
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(790); // 800 - 10
      expect(e.position.y).toBe(590); // 600 - 10
    });

    test("does not clamp entity inside bounds", () => {
      const e = engine.spawn({
        position: { x: 400, y: 300 },
        screenClamp: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(e.position.x).toBe(400);
      expect(e.position.y).toBe(300);
    });
  });

  describe("offScreenDestroy", () => {
    test("destroys entity off the right edge", () => {
      const e = engine.spawn({
        position: { x: 860, y: 300 },
        offScreenDestroy: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).toContain(e);
    });

    test("destroys entity off the left edge", () => {
      const e = engine.spawn({
        position: { x: -60, y: 300 },
        offScreenDestroy: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).toContain(e);
    });

    test("destroys entity off the top edge", () => {
      const e = engine.spawn({
        position: { x: 400, y: -60 },
        offScreenDestroy: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).toContain(e);
    });

    test("destroys entity off the bottom edge", () => {
      const e = engine.spawn({
        position: { x: 400, y: 660 },
        offScreenDestroy: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).toContain(e);
    });

    test("respects custom margin", () => {
      const e = engine.spawn({
        position: { x: 820, y: 300 },
        offScreenDestroy: { margin: 10 },
      });

      // 820 > 800 + 10 = 810 => destroyed
      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).toContain(e);
    });

    test("does not destroy entity within margin", () => {
      const e = engine.spawn({
        position: { x: 830, y: 300 },
        offScreenDestroy: { margin: 50 },
      });

      // 830 > 800 + 50 = 850? No => not destroyed
      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).not.toContain(e);
    });

    test("default margin is 50", () => {
      const e = engine.spawn({
        position: { x: 845, y: 300 },
        offScreenDestroy: {},
      });

      // 845 > 800 + 50 = 850? No => not destroyed
      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).not.toContain(e);
    });

    test("does not destroy entity on screen", () => {
      engine.spawn({
        position: { x: 400, y: 300 },
        offScreenDestroy: {},
      });

      screenBoundsSystem.update(engine as any, 0.016);
      expect(engine._destroyed).toHaveLength(0);
    });
  });

  test("has correct system name", () => {
    expect(screenBoundsSystem.name).toBe("_screenBounds");
  });
});
