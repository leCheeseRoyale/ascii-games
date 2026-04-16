import { describe, expect, test } from "bun:test";
import {
  add,
  chance,
  clamp,
  dist,
  dot,
  len,
  lerp,
  normalize,
  pick,
  rng,
  rngInt,
  scale,
  sub,
  vec2,
} from "../../utils/math";

describe("vec2", () => {
  test("creates a vector with given x and y", () => {
    const v = vec2(3, 4);
    expect(v).toEqual({ x: 3, y: 4 });
  });

  test("defaults to (0, 0)", () => {
    const v = vec2();
    expect(v).toEqual({ x: 0, y: 0 });
  });
});

describe("add", () => {
  test("adds two vectors", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
  });

  test("handles negative values", () => {
    expect(add({ x: -1, y: 5 }, { x: 1, y: -5 })).toEqual({ x: 0, y: 0 });
  });
});

describe("sub", () => {
  test("subtracts two vectors", () => {
    expect(sub({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 });
  });
});

describe("scale", () => {
  test("scales a vector by a scalar", () => {
    expect(scale({ x: 2, y: 3 }, 4)).toEqual({ x: 8, y: 12 });
  });

  test("scales by zero", () => {
    expect(scale({ x: 5, y: 10 }, 0)).toEqual({ x: 0, y: 0 });
  });

  test("scales by negative", () => {
    expect(scale({ x: 1, y: 2 }, -1)).toEqual({ x: -1, y: -2 });
  });
});

describe("len", () => {
  test("returns length of a vector", () => {
    expect(len({ x: 3, y: 4 })).toBe(5);
  });

  test("returns 0 for zero vector", () => {
    expect(len({ x: 0, y: 0 })).toBe(0);
  });
});

describe("normalize", () => {
  test("normalizes a vector to unit length", () => {
    const n = normalize({ x: 3, y: 4 });
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
  });

  test("returns zero vector for zero input", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  test("normalized vector has length 1", () => {
    const n = normalize({ x: 7, y: 11 });
    expect(len(n)).toBeCloseTo(1);
  });
});

describe("dist", () => {
  test("returns distance between two points", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test("distance is zero for same point", () => {
    expect(dist({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  test("distance is symmetric", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(dist(a, b)).toBe(dist(b, a));
  });
});

describe("dot", () => {
  test("computes dot product", () => {
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
  });

  test("perpendicular vectors have dot product 0", () => {
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
  });
});

describe("lerp", () => {
  test("interpolates at t=0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  test("interpolates at t=1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  test("interpolates at t=0.5", () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  test("extrapolates beyond t=1", () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe("clamp", () => {
  test("clamps value below min", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  test("clamps value above max", () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  test("returns value within range unchanged", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  test("handles min == max", () => {
    expect(clamp(50, 10, 10)).toBe(10);
  });
});

describe("rng", () => {
  test("returns value within [min, max)", () => {
    for (let i = 0; i < 100; i++) {
      const val = rng(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThan(10);
    }
  });

  test("returns min when range is zero", () => {
    expect(rng(5, 5)).toBe(5);
  });
});

describe("rngInt", () => {
  test("returns integer within [min, max] inclusive", () => {
    for (let i = 0; i < 100; i++) {
      const val = rngInt(1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  test("returns the only value when min == max", () => {
    expect(rngInt(3, 3)).toBe(3);
  });
});

describe("pick", () => {
  test("returns an element from the array", () => {
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pick(arr));
    }
  });

  test("returns the only element of a single-element array", () => {
    expect(pick([42])).toBe(42);
  });
});

describe("chance", () => {
  test("chance(1) always returns true", () => {
    for (let i = 0; i < 50; i++) {
      expect(chance(1)).toBe(true);
    }
  });

  test("chance(0) always returns false", () => {
    for (let i = 0; i < 50; i++) {
      expect(chance(0)).toBe(false);
    }
  });

  test("chance(0.5) returns a boolean", () => {
    const result = chance(0.5);
    expect(typeof result).toBe("boolean");
  });
});
