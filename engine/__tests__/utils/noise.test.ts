import { describe, expect, test } from "bun:test";
import { createNoise2D, generateNoiseGrid } from "../../utils/noise";

describe("createNoise2D", () => {
  test("returns a function", () => {
    const noise = createNoise2D();
    expect(typeof noise).toBe("function");
  });

  test("produces values in [0, 1]", () => {
    const noise = createNoise2D({ seed: 42 });
    for (let i = 0; i < 100; i++) {
      const v = noise(i * 1.3, i * 2.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("same seed produces same output (deterministic)", () => {
    const a = createNoise2D({ seed: 123 });
    const b = createNoise2D({ seed: 123 });
    for (let i = 0; i < 10; i++) {
      expect(a(i, i * 2)).toBe(b(i, i * 2));
    }
  });

  test("different seeds produce different output", () => {
    const a = createNoise2D({ seed: 1 });
    const b = createNoise2D({ seed: 999 });
    let differences = 0;
    for (let i = 0; i < 20; i++) {
      if (a(i, i) !== b(i, i)) differences++;
    }
    expect(differences).toBeGreaterThan(10);
  });

  test("smooth — nearby samples are close", () => {
    const noise = createNoise2D({ seed: 42, scale: 0.01 });
    for (let i = 0; i < 10; i++) {
      const a = noise(i, i);
      const b = noise(i + 0.01, i);
      // At very low scale (high zoom), adjacent values should be very close
      expect(Math.abs(a - b)).toBeLessThan(0.1);
    }
  });
});

describe("generateNoiseGrid", () => {
  test("returns a GridMap of the requested size", () => {
    const grid = generateNoiseGrid(20, 15, {
      seed: 42,
      classify: (v) => (v > 0.5 ? "#" : "."),
    });
    expect(grid.cols).toBe(20);
    expect(grid.rows).toBe(15);
  });

  test("applies classify function correctly", () => {
    const grid = generateNoiseGrid(10, 10, {
      seed: 42,
      classify: (v) => (v > 0.5 ? "#" : "."),
    });
    grid.forEach((_c, _r, v) => {
      expect(["#", "."]).toContain(v as string);
    });
  });

  test("is deterministic with same seed", () => {
    const a = generateNoiseGrid(10, 10, { seed: 99, classify: (v) => String(Math.floor(v * 10)) });
    const b = generateNoiseGrid(10, 10, { seed: 99, classify: (v) => String(Math.floor(v * 10)) });
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const av = a.get(c, r);
        const bv = b.get(c, r);
        expect(av).toBe(bv as any);
      }
    }
  });
});
