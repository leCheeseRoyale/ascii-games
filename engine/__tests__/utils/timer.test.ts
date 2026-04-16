import { describe, expect, test } from "bun:test";
import { Cooldown, easeOut, tween } from "../../utils/timer";

describe("Cooldown", () => {
  test("starts ready", () => {
    const cd = new Cooldown(1.0);
    expect(cd.ready).toBe(true);
  });

  test("fire returns true when ready", () => {
    const cd = new Cooldown(1.0);
    expect(cd.fire()).toBe(true);
  });

  test("fire returns false when not ready", () => {
    const cd = new Cooldown(1.0);
    cd.fire(); // starts cooldown
    expect(cd.fire()).toBe(false);
  });

  test("becomes ready after duration elapses", () => {
    const cd = new Cooldown(0.5);
    cd.fire();
    expect(cd.ready).toBe(false);
    cd.update(0.3);
    expect(cd.ready).toBe(false);
    cd.update(0.3); // total 0.6 > 0.5
    expect(cd.ready).toBe(true);
  });

  test("update decrements remaining time", () => {
    const cd = new Cooldown(1.0);
    cd.fire();
    cd.update(0.4);
    expect(cd.ready).toBe(false);
    cd.update(0.7); // total 1.1 > 1.0
    expect(cd.ready).toBe(true);
  });

  test("reset makes cooldown ready immediately", () => {
    const cd = new Cooldown(1.0);
    cd.fire();
    expect(cd.ready).toBe(false);
    cd.reset();
    expect(cd.ready).toBe(true);
  });

  test("can fire again after reset", () => {
    const cd = new Cooldown(1.0);
    cd.fire();
    cd.reset();
    expect(cd.fire()).toBe(true);
  });

  test("fire-update-fire cycle works correctly", () => {
    const cd = new Cooldown(0.1);
    expect(cd.fire()).toBe(true);
    cd.update(0.05);
    expect(cd.fire()).toBe(false);
    cd.update(0.06); // total 0.11 > 0.1
    expect(cd.fire()).toBe(true);
  });
});

describe("tween", () => {
  test("returns start value at elapsed=0", () => {
    expect(tween(0, 10, 20, 1)).toBe(10);
  });

  test("returns end value at elapsed=duration", () => {
    expect(tween(1, 10, 20, 1)).toBe(20);
  });

  test("returns midpoint at halfway", () => {
    expect(tween(0.5, 0, 100, 1)).toBe(50);
  });

  test("clamps at end value when elapsed exceeds duration", () => {
    expect(tween(2, 0, 100, 1)).toBe(100);
  });

  test("works with negative range", () => {
    expect(tween(0.5, 100, 0, 1)).toBe(50);
  });
});

describe("easeOut", () => {
  test("returns start value at elapsed=0", () => {
    expect(easeOut(0, 10, 20, 1)).toBe(10);
  });

  test("returns end value at elapsed=duration", () => {
    expect(easeOut(1, 10, 20, 1)).toBe(20);
  });

  test("clamps at end value when elapsed exceeds duration", () => {
    expect(easeOut(2, 0, 100, 1)).toBe(100);
  });

  test("progress at midpoint is faster than linear (quadratic ease-out)", () => {
    const easeValue = easeOut(0.5, 0, 100, 1);
    const linearValue = tween(0.5, 0, 100, 1);
    // Ease-out should be ahead of linear at the midpoint
    expect(easeValue).toBeGreaterThan(linearValue);
  });

  test("approaches end value smoothly", () => {
    const v1 = easeOut(0.7, 0, 100, 1);
    const v2 = easeOut(0.9, 0, 100, 1);
    const v3 = easeOut(1.0, 0, 100, 1);
    expect(v1).toBeLessThan(v2);
    expect(v2).toBeLessThan(v3);
  });
});
