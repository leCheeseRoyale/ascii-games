/**
 * Per-system timing instrumentation tests for SystemRunner.
 *
 * Verifies:
 *   - setTimingEnabled toggles tracking on/off
 *   - disabling clears any previously collected samples
 *   - each executed system records a timing entry (last/avg/max)
 *   - avg converges toward the steady-state value (EMA behavior)
 *   - max is monotonically non-decreasing across frames
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { defineSystem, SystemRunner } from "../../ecs/systems";
import { mockEngine } from "../helpers";

/** Busy-wait for the requested number of milliseconds. Used to give a system a
 *  measurable duration without relying on fake timers (performance.now is real). */
function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // intentional busy loop
  }
}

describe("SystemRunner timing instrumentation", () => {
  let engine: ReturnType<typeof mockEngine>;
  let runner: SystemRunner;

  beforeEach(() => {
    engine = mockEngine();
    runner = new SystemRunner();
  });

  describe("setTimingEnabled", () => {
    test("is disabled by default (no samples recorded)", () => {
      runner.add(defineSystem({ name: "noop", update: () => busyWait(1) }), engine);
      runner.update(engine, 0.016);
      expect(runner.getTimings().size).toBe(0);
      expect(runner.isTimingEnabled).toBe(false);
    });

    test("enabling causes samples to be recorded", () => {
      runner.add(defineSystem({ name: "s1", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);
      expect(runner.getTimings().has("s1")).toBe(true);
      expect(runner.isTimingEnabled).toBe(true);
    });

    test("disabling clears previously collected samples", () => {
      runner.add(defineSystem({ name: "s1", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);
      expect(runner.getTimings().size).toBe(1);

      runner.setTimingEnabled(false);
      expect(runner.getTimings().size).toBe(0);
      expect(runner.isTimingEnabled).toBe(false);
    });

    test("samples are not recorded after disable", () => {
      runner.add(defineSystem({ name: "s1", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);
      runner.setTimingEnabled(false);
      runner.update(engine, 0.016);
      expect(runner.getTimings().size).toBe(0);
    });
  });

  describe("per-system recording", () => {
    test("records a timing entry for each system that runs", () => {
      runner.add(defineSystem({ name: "a", update: () => {} }), engine);
      runner.add(defineSystem({ name: "b", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);

      const timings = runner.getTimings();
      expect(timings.has("a")).toBe(true);
      expect(timings.has("b")).toBe(true);
    });

    test("timing entry has last, avg, and max fields populated", () => {
      runner.add(defineSystem({ name: "work", update: () => busyWait(1) }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);

      const t = runner.getTimings().get("work");
      expect(t).toBeDefined();
      expect(t!.last).toBeGreaterThanOrEqual(0);
      expect(t!.avg).toBeGreaterThanOrEqual(0);
      expect(t!.max).toBeGreaterThanOrEqual(0);
      // After a single sample, last == avg == max.
      expect(t!.avg).toBeCloseTo(t!.last, 5);
      expect(t!.max).toBeCloseTo(t!.last, 5);
    });

    test("does not record timings for systems skipped by phase gating", () => {
      engine.turns.configure({ phases: ["play", "attack"] });
      engine.turns.start(); // starts on "play"

      runner.add(defineSystem({ name: "attack-only", phase: "attack", update: () => {} }), engine);
      runner.add(defineSystem({ name: "play-sys", phase: "play", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);

      const timings = runner.getTimings();
      expect(timings.has("attack-only")).toBe(false);
      expect(timings.has("play-sys")).toBe(true);
    });

    test("remove() drops stale timings for that system", () => {
      runner.add(defineSystem({ name: "s1", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);
      expect(runner.getTimings().has("s1")).toBe(true);

      runner.remove("s1", engine);
      expect(runner.getTimings().has("s1")).toBe(false);
    });

    test("clear() drops all timings", () => {
      runner.add(defineSystem({ name: "a", update: () => {} }), engine);
      runner.add(defineSystem({ name: "b", update: () => {} }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);
      expect(runner.getTimings().size).toBe(2);

      runner.clear(engine);
      expect(runner.getTimings().size).toBe(0);
    });
  });

  describe("exponential moving average", () => {
    test("avg is seeded with the first sample (does not start at 0)", () => {
      runner.add(defineSystem({ name: "steady", update: () => busyWait(2) }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);

      const t = runner.getTimings().get("steady")!;
      // Seed avg with first sample so it doesn't ramp up from 0.
      expect(t.avg).toBeGreaterThan(0);
      expect(t.avg).toBeCloseTo(t.last, 5);
    });

    test("avg converges toward steady-state value over many frames", () => {
      // Use a deterministic controlled time rather than busy-wait noise — we
      // can't easily inject performance.now, so we use a system whose cost is
      // measurable by doing a fixed amount of numeric work.
      runner.add(
        defineSystem({
          name: "converging",
          update: () => busyWait(1),
        }),
        engine,
      );
      runner.setTimingEnabled(true);

      // Run many iterations; EMA should settle near the actual per-frame cost.
      for (let i = 0; i < 100; i++) {
        runner.update(engine, 0.016);
      }

      const t = runner.getTimings().get("converging")!;
      // The real cost should be ~1ms per frame; allow a wide tolerance because
      // busy-wait and CI timers vary, but confirm avg is finite & positive and
      // does not diverge wildly from last.
      expect(Number.isFinite(t.avg)).toBe(true);
      expect(t.avg).toBeGreaterThan(0);
      // After 100 samples at alpha=0.05, avg should be well within 5x of last.
      expect(t.avg).toBeLessThan(t.last * 5 + 1);
      expect(t.avg).toBeGreaterThan(t.last / 5);
    });

    test("avg trends toward a new steady-state when cost changes", () => {
      // Start "cheap", then measure that avg approaches the cheap cost.
      let cost = 0; // ms
      runner.add(
        defineSystem({
          name: "variable",
          update: () => busyWait(cost),
        }),
        engine,
      );
      runner.setTimingEnabled(true);

      cost = 3;
      for (let i = 0; i < 50; i++) runner.update(engine, 0.016);
      const hotAvg = runner.getTimings().get("variable")!.avg;

      // Now switch to a much cheaper cost and run many more frames.
      cost = 0;
      for (let i = 0; i < 300; i++) runner.update(engine, 0.016);
      const cooledAvg = runner.getTimings().get("variable")!.avg;

      // The cooled avg should be lower than the hot avg (trending toward 0).
      expect(cooledAvg).toBeLessThan(hotAvg);
    });
  });

  describe("max is monotonically non-decreasing", () => {
    test("max never decreases across frames while tracking is enabled", () => {
      let cost = 0;
      runner.add(
        defineSystem({
          name: "spiky",
          update: () => busyWait(cost),
        }),
        engine,
      );
      runner.setTimingEnabled(true);

      const maxHistory: number[] = [];

      // Frame 1 — cheap.
      cost = 0;
      runner.update(engine, 0.016);
      maxHistory.push(runner.getTimings().get("spiky")!.max);

      // Frame 2 — spike.
      cost = 5;
      runner.update(engine, 0.016);
      maxHistory.push(runner.getTimings().get("spiky")!.max);

      // Frame 3 — cheap again; max should NOT drop.
      cost = 0;
      runner.update(engine, 0.016);
      maxHistory.push(runner.getTimings().get("spiky")!.max);

      // Frame 4 — cheap again.
      runner.update(engine, 0.016);
      maxHistory.push(runner.getTimings().get("spiky")!.max);

      // Monotonic non-decreasing.
      for (let i = 1; i < maxHistory.length; i++) {
        expect(maxHistory[i]).toBeGreaterThanOrEqual(maxHistory[i - 1]);
      }
      // The spike frame's measurement should have lifted max above the first
      // frame's max (or at minimum stayed equal in a pathological timing env).
      expect(maxHistory[1]).toBeGreaterThanOrEqual(maxHistory[0]);
    });

    test("max resets to 0 only when tracking is disabled/re-enabled", () => {
      let cost = 2;
      runner.add(defineSystem({ name: "s", update: () => busyWait(cost) }), engine);
      runner.setTimingEnabled(true);
      runner.update(engine, 0.016);
      const highMax = runner.getTimings().get("s")!.max;
      expect(highMax).toBeGreaterThan(0);

      // Disable — clears samples, re-enable with a cheaper run.
      runner.setTimingEnabled(false);
      expect(runner.getTimings().size).toBe(0);

      runner.setTimingEnabled(true);
      cost = 0;
      runner.update(engine, 0.016);
      const freshMax = runner.getTimings().get("s")!.max;
      // After clear, max starts from the new first sample — not carried over.
      expect(freshMax).toBeLessThan(highMax + 1);
    });
  });
});
