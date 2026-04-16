import { describe, expect, test } from "bun:test";
import type { Collidable } from "../../physics/collision";
import { overlapAll, overlaps } from "../../physics/collision";

function circle(x: number, y: number, radius: number): Collidable {
  return {
    position: { x, y },
    collider: { type: "circle", width: radius * 2, height: radius * 2 },
  };
}

function rect(x: number, y: number, w: number, h: number): Collidable {
  return {
    position: { x, y },
    collider: { type: "rect", width: w, height: h },
  };
}

describe("overlaps", () => {
  describe("circle-circle", () => {
    test("overlapping circles return true", () => {
      expect(overlaps(circle(0, 0, 10), circle(15, 0, 10))).toBe(true);
    });

    test("non-overlapping circles return false", () => {
      expect(overlaps(circle(0, 0, 10), circle(25, 0, 10))).toBe(false);
    });

    test("identical circles overlap", () => {
      expect(overlaps(circle(5, 5, 10), circle(5, 5, 10))).toBe(true);
    });

    test("barely touching circles do not overlap (strict less-than)", () => {
      // Distance = 20, combined radius = 20 => not < 20
      expect(overlaps(circle(0, 0, 10), circle(20, 0, 10))).toBe(false);
    });

    test("almost touching circles overlap", () => {
      expect(overlaps(circle(0, 0, 10), circle(19, 0, 10))).toBe(true);
    });
  });

  describe("rect-rect", () => {
    test("overlapping rects return true", () => {
      expect(overlaps(rect(0, 0, 20, 20), rect(10, 10, 20, 20))).toBe(true);
    });

    test("non-overlapping rects return false", () => {
      expect(overlaps(rect(0, 0, 20, 20), rect(30, 30, 20, 20))).toBe(false);
    });

    test("identical rects overlap", () => {
      expect(overlaps(rect(5, 5, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    });

    test("adjacent rects do not overlap (no edge sharing)", () => {
      // Rect A: center 0,0 w=20 h=20 => extends from -10 to 10
      // Rect B: center 20,0 w=20 h=20 => extends from 10 to 30
      // Edge at x=10: A's right < B's left => 10 < 10 is false
      expect(overlaps(rect(0, 0, 20, 20), rect(20, 0, 20, 20))).toBe(false);
    });

    test("rects overlapping in y but not x", () => {
      expect(overlaps(rect(0, 0, 10, 10), rect(100, 0, 10, 10))).toBe(false);
    });

    test("rects overlapping in x but not y", () => {
      expect(overlaps(rect(0, 0, 10, 10), rect(0, 100, 10, 10))).toBe(false);
    });
  });

  describe("circle-rect", () => {
    test("overlapping circle and rect return true", () => {
      expect(overlaps(circle(0, 0, 10), rect(8, 0, 10, 10))).toBe(true);
    });

    test("non-overlapping circle and rect return false", () => {
      expect(overlaps(circle(0, 0, 5), rect(50, 50, 10, 10))).toBe(false);
    });

    test("circle inside rect overlaps", () => {
      expect(overlaps(circle(5, 5, 2), rect(5, 5, 20, 20))).toBe(true);
    });

    test("circle touching rect corner", () => {
      // Rect at (20,0) w=10 h=10 => extends from 15 to 25, -5 to 5
      // Circle at (0,0) r=10 => 10 away from corner at (15, 0)
      // Closest point on rect to circle center: (15, 0)
      // Distance = 15, r = 10. 15*15=225 > 10*10=100 => no overlap
      expect(overlaps(circle(0, 0, 10), rect(20, 0, 10, 10))).toBe(false);
    });
  });

  describe("order independence", () => {
    test("circle-rect and rect-circle give same result", () => {
      const c = circle(5, 5, 10);
      const r = rect(12, 5, 10, 10);
      expect(overlaps(c, r)).toBe(overlaps(r, c));
    });

    test("non-overlapping mixed order is consistent", () => {
      const c = circle(0, 0, 5);
      const r = rect(100, 100, 10, 10);
      expect(overlaps(c, r)).toBe(false);
      expect(overlaps(r, c)).toBe(false);
    });
  });
});

describe("overlapAll", () => {
  test("returns all overlapping entities", () => {
    const main = circle(0, 0, 10);
    const hit1 = circle(5, 0, 10);
    const hit2 = circle(0, 5, 10);
    const miss = circle(100, 100, 10);

    const hits = overlapAll(main, [hit1, hit2, miss]);
    expect(hits).toHaveLength(2);
    expect(hits).toContain(hit1);
    expect(hits).toContain(hit2);
  });

  test("excludes self from results", () => {
    const main = circle(0, 0, 10);
    const other = circle(5, 0, 10);

    const hits = overlapAll(main, [main, other]);
    expect(hits).toHaveLength(1);
    expect(hits).toContain(other);
  });

  test("returns empty array when no overlaps", () => {
    const main = circle(0, 0, 5);
    const far1 = circle(100, 0, 5);
    const far2 = circle(0, 100, 5);

    const hits = overlapAll(main, [far1, far2]);
    expect(hits).toHaveLength(0);
  });

  test("works with empty iterable", () => {
    const main = circle(0, 0, 10);
    const hits = overlapAll(main, []);
    expect(hits).toHaveLength(0);
  });

  test("works with mixed collider types", () => {
    const main = circle(0, 0, 10);
    const hitRect = rect(5, 0, 10, 10);
    const missRect = rect(100, 100, 10, 10);

    const hits = overlapAll(main, [hitRect, missRect]);
    expect(hits).toHaveLength(1);
    expect(hits).toContain(hitRect);
  });
});
