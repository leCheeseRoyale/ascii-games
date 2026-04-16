import { describe, expect, test } from "bun:test";
import { pairsFromHash, SpatialHash } from "../../physics/spatial-hash";

type TestEntity = { position: { x: number; y: number }; id: string };

function ent(id: string, x: number, y: number): TestEntity {
  return { id, position: { x, y } };
}

describe("SpatialHash", () => {
  describe("constructor", () => {
    test("stores cellSize", () => {
      const hash = new SpatialHash<TestEntity>(64);
      expect(hash.cellSize).toBe(64);
    });

    test("throws on non-positive cellSize", () => {
      expect(() => new SpatialHash<TestEntity>(0)).toThrow();
      expect(() => new SpatialHash<TestEntity>(-1)).toThrow();
    });

    test("starts empty", () => {
      const hash = new SpatialHash<TestEntity>(32);
      expect(hash.size()).toBe(0);
      expect(hash.cellCount()).toBe(0);
    });
  });

  describe("insert + queryPoint", () => {
    test("insert + queryPoint returns the entity", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const a = ent("a", 10, 10);
      hash.insert(a);
      const found = hash.queryPoint(10, 10);
      expect(found).toContain(a);
    });

    test("queryPoint returns entities from neighbor cells too", () => {
      const hash = new SpatialHash<TestEntity>(32);
      // a is in cell (0,0); b is in cell (1,0) — a's right neighbor.
      const a = ent("a", 10, 10);
      const b = ent("b", 40, 10);
      hash.insert(a);
      hash.insert(b);
      // Query from a's cell should include b (adjacent cell).
      const found = hash.queryPoint(10, 10);
      expect(found).toContain(a);
      expect(found).toContain(b);
    });

    test("queryPoint excludes entities in far cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const near = ent("near", 10, 10);
      const far = ent("far", 500, 500);
      hash.insert(near);
      hash.insert(far);
      const found = hash.queryPoint(10, 10);
      expect(found).toContain(near);
      expect(found).not.toContain(far);
    });

    test("queryPoint handles negative coordinates", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const a = ent("a", -10, -10);
      hash.insert(a);
      expect(hash.queryPoint(-10, -10)).toContain(a);
    });

    test("queryPoint returns empty array when no entities", () => {
      const hash = new SpatialHash<TestEntity>(32);
      expect(hash.queryPoint(0, 0)).toEqual([]);
    });
  });

  describe("queryRect", () => {
    test("queryRect returns entities in the rectangle", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const inside = ent("inside", 50, 50);
      const outside = ent("outside", 500, 500);
      hash.insert(inside);
      hash.insert(outside);
      const found = hash.queryRect(50, 50, 40, 40);
      expect(found).toContain(inside);
      expect(found).not.toContain(outside);
    });

    test("queryRect covers multiple cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      // These entities are in cells (0,0), (1,0), (2,0).
      const a = ent("a", 10, 10);
      const b = ent("b", 40, 10);
      const c = ent("c", 70, 10);
      hash.insert(a);
      hash.insert(b);
      hash.insert(c);
      // Rect centered at x=40 with width=80 spans from x=0 to x=80 (cells 0..2).
      const found = hash.queryRect(40, 10, 80, 20);
      expect(found).toContain(a);
      expect(found).toContain(b);
      expect(found).toContain(c);
    });

    test("queryRect returns empty when rect is in empty region", () => {
      const hash = new SpatialHash<TestEntity>(32);
      hash.insert(ent("a", 10, 10));
      const found = hash.queryRect(1000, 1000, 10, 10);
      expect(found).toEqual([]);
    });

    test("queryRect dedupes entities that span multiple cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const wide = ent("wide", 32, 32);
      // Entity with 64x64 bounds spans 4+ cells.
      hash.insertWithBounds(wide, 64, 64);
      const found = hash.queryRect(32, 32, 100, 100);
      const occurrences = found.filter((e) => e === wide).length;
      expect(occurrences).toBe(1);
    });
  });

  describe("queryCircle", () => {
    test("queryCircle returns entities within radius", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const inside = ent("inside", 10, 10);
      hash.insert(inside);
      const found = hash.queryCircle(10, 10, 20);
      expect(found).toContain(inside);
    });

    test("queryCircle excludes entities clearly outside radius", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const far = ent("far", 500, 500);
      hash.insert(far);
      const found = hash.queryCircle(10, 10, 20);
      expect(found).not.toContain(far);
    });

    test("queryCircle may include entities at cell boundaries (conservative)", () => {
      // This is a property of the bounding-rect approximation: entity outside
      // the circle but inside its bounding box may be returned. Caller must
      // do a precise distance check.
      const hash = new SpatialHash<TestEntity>(32);
      // Circle center (0,0) radius 10 — bbox is (-10,-10) to (10,10), cells (-1,-1)..(0,0).
      // Entity at (-31, -31) is in cell (-1,-1). It's NOT in the bbox, so we expect it excluded.
      const definitelyOutside = ent("out", -200, -200);
      hash.insert(definitelyOutside);
      const found = hash.queryCircle(0, 0, 10);
      expect(found).not.toContain(definitelyOutside);
    });

    test("queryCircle returns empty when no entities near", () => {
      const hash = new SpatialHash<TestEntity>(32);
      expect(hash.queryCircle(0, 0, 10)).toEqual([]);
    });
  });

  describe("clear", () => {
    test("clear() empties the hash", () => {
      const hash = new SpatialHash<TestEntity>(32);
      hash.insert(ent("a", 10, 10));
      hash.insert(ent("b", 200, 200));
      expect(hash.size()).toBe(2);
      expect(hash.cellCount()).toBe(2);
      hash.clear();
      expect(hash.size()).toBe(0);
      expect(hash.cellCount()).toBe(0);
    });

    test("clear allows fresh inserts afterwards", () => {
      const hash = new SpatialHash<TestEntity>(32);
      hash.insert(ent("a", 10, 10));
      hash.clear();
      const b = ent("b", 50, 50);
      hash.insert(b);
      expect(hash.queryPoint(50, 50)).toContain(b);
      expect(hash.size()).toBe(1);
    });
  });

  describe("remove", () => {
    test("remove() removes a specific entity (query no longer returns it)", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const a = ent("a", 10, 10);
      const b = ent("b", 12, 12);
      hash.insert(a);
      hash.insert(b);
      hash.remove(a);
      const found = hash.queryPoint(10, 10);
      expect(found).not.toContain(a);
      expect(found).toContain(b);
    });

    test("remove() is a no-op for entities not in the hash", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const ghost = ent("ghost", 0, 0);
      expect(() => hash.remove(ghost)).not.toThrow();
      expect(hash.size()).toBe(0);
    });

    test("remove() cleans up empty cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const a = ent("a", 10, 10);
      hash.insert(a);
      expect(hash.cellCount()).toBe(1);
      hash.remove(a);
      expect(hash.cellCount()).toBe(0);
    });

    test("remove() handles entities spanning multiple cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const wide = ent("wide", 32, 32);
      hash.insertWithBounds(wide, 64, 64);
      expect(hash.cellCount()).toBeGreaterThan(1);
      hash.remove(wide);
      expect(hash.cellCount()).toBe(0);
      expect(hash.queryPoint(32, 32)).not.toContain(wide);
    });
  });

  describe("insertWithBounds", () => {
    test("insertWithBounds spans multiple cells (query from each cell returns it)", () => {
      const hash = new SpatialHash<TestEntity>(32);
      // Entity at (48, 48) with bounds 32x32 extends from (32,32) to (64,64).
      // Min cell = floor(32/32)=1, max cell = floor(64/32)=2. Spans 2x2 cells.
      const wide = ent("wide", 48, 48);
      hash.insertWithBounds(wide, 32, 32);
      expect(hash.queryPoint(40, 40)).toContain(wide); // cell (1,1)
      expect(hash.queryPoint(70, 40)).toContain(wide); // cell (2,1)
      expect(hash.queryPoint(40, 70)).toContain(wide); // cell (1,2)
      expect(hash.queryPoint(70, 70)).toContain(wide); // cell (2,2)
    });

    test("insertWithBounds increases size but not unique entity count", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const wide = ent("wide", 48, 48);
      // Bounds 32x32 at (48,48) → spans (32,32)-(64,64) → cells (1..2, 1..2) = 4 cells.
      hash.insertWithBounds(wide, 32, 32);
      expect(hash.size()).toBe(4);
      expect(hash.cellCount()).toBe(4);
    });

    test("insertWithBounds then remove clears all spanning cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const wide = ent("wide", 32, 32);
      hash.insertWithBounds(wide, 64, 64);
      hash.remove(wide);
      expect(hash.size()).toBe(0);
    });

    test("small bounds stay in one cell", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const small = ent("small", 16, 16);
      hash.insertWithBounds(small, 4, 4);
      expect(hash.cellCount()).toBe(1);
      expect(hash.size()).toBe(1);
    });
  });

  describe("cellCount", () => {
    test("cellCount() accurately reflects occupied cells", () => {
      const hash = new SpatialHash<TestEntity>(32);
      // Two entities in the same cell.
      hash.insert(ent("a", 10, 10));
      hash.insert(ent("b", 20, 20));
      expect(hash.cellCount()).toBe(1);
      // One entity in a different cell.
      hash.insert(ent("c", 100, 100));
      expect(hash.cellCount()).toBe(2);
    });
  });

  describe("size", () => {
    test("size() counts entity slots", () => {
      const hash = new SpatialHash<TestEntity>(32);
      hash.insert(ent("a", 10, 10));
      hash.insert(ent("b", 20, 20));
      hash.insert(ent("c", 100, 100));
      expect(hash.size()).toBe(3);
    });
  });

  describe("rebuild", () => {
    test("rebuild from iterable works", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const entities = [ent("a", 10, 10), ent("b", 100, 100), ent("c", 200, 200)];
      hash.rebuild(entities);
      expect(hash.size()).toBe(3);
      expect(hash.queryPoint(10, 10)).toContain(entities[0]);
      expect(hash.queryPoint(100, 100)).toContain(entities[1]);
      expect(hash.queryPoint(200, 200)).toContain(entities[2]);
    });

    test("rebuild clears previous state", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const stale = ent("stale", 10, 10);
      hash.insert(stale);
      hash.insert(ent("also-stale", 50, 50));
      const fresh = [ent("fresh", 500, 500)];
      hash.rebuild(fresh);
      expect(hash.size()).toBe(1);
      expect(hash.queryPoint(10, 10)).not.toContain(stale);
      expect(hash.queryPoint(500, 500)).toContain(fresh[0]);
    });

    test("rebuild works with generator", () => {
      const hash = new SpatialHash<TestEntity>(32);
      function* gen() {
        yield ent("g1", 10, 10);
        yield ent("g2", 100, 100);
      }
      hash.rebuild(gen());
      expect(hash.size()).toBe(2);
    });
  });

  describe("insert after insert updates cell", () => {
    test("re-inserting same entity at new position moves it", () => {
      const hash = new SpatialHash<TestEntity>(32);
      const a = ent("a", 10, 10);
      hash.insert(a);
      // Move entity.
      a.position.x = 100;
      a.position.y = 100;
      hash.insert(a);
      // Should only appear in new cell, not old.
      expect(hash.size()).toBe(1);
      expect(hash.cellCount()).toBe(1);
      expect(hash.queryPoint(100, 100)).toContain(a);
      // Query old location (far enough away to not include neighbors).
      expect(hash.queryPoint(10, 10)).not.toContain(a);
    });
  });
});

describe("pairsFromHash", () => {
  test("yields within-cell pairs", () => {
    const hash = new SpatialHash<TestEntity>(32);
    const a = ent("a", 10, 10);
    const b = ent("b", 12, 12);
    const c = ent("c", 14, 14);
    hash.insert(a);
    hash.insert(b);
    hash.insert(c);
    const pairs = [...pairsFromHash(hash)];
    expect(pairs).toHaveLength(3); // C(3,2) = 3
    expect(containsPair(pairs, a, b)).toBe(true);
    expect(containsPair(pairs, a, c)).toBe(true);
    expect(containsPair(pairs, b, c)).toBe(true);
  });

  test("yields cross-cell pairs between neighbors", () => {
    const hash = new SpatialHash<TestEntity>(32);
    // a in cell (0,0), b in cell (1,0) — adjacent.
    const a = ent("a", 10, 10);
    const b = ent("b", 40, 10);
    hash.insert(a);
    hash.insert(b);
    const pairs = [...pairsFromHash(hash)];
    expect(pairs).toHaveLength(1);
    expect(containsPair(pairs, a, b)).toBe(true);
  });

  test("yields each pair exactly once (no duplicates) for single-cell inserts", () => {
    const hash = new SpatialHash<TestEntity>(32);
    const entities: TestEntity[] = [];
    // Place entities across a 3x3 grid of cells, two per cell.
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        entities.push(ent(`${cx},${cy}-a`, cx * 32 + 5, cy * 32 + 5));
        entities.push(ent(`${cx},${cy}-b`, cx * 32 + 10, cy * 32 + 10));
      }
    }
    for (const e of entities) hash.insert(e);

    const pairs = [...pairsFromHash(hash)];
    // Each pair should be emitted exactly once.
    const seen = new Set<string>();
    for (const [x, y] of pairs) {
      const key = pairKey(x, y);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("does not yield cross-cell pairs between non-neighboring cells", () => {
    const hash = new SpatialHash<TestEntity>(32);
    // a in cell (0,0), b in cell (5,5) — far apart.
    const a = ent("a", 10, 10);
    const b = ent("b", 32 * 5 + 10, 32 * 5 + 10);
    hash.insert(a);
    hash.insert(b);
    const pairs = [...pairsFromHash(hash)];
    expect(pairs).toHaveLength(0);
  });

  test("yields diagonal neighbor pairs", () => {
    const hash = new SpatialHash<TestEntity>(32);
    // a in cell (0,0), b in cell (1,1) — diagonal neighbor.
    const a = ent("a", 10, 10);
    const b = ent("b", 40, 40);
    hash.insert(a);
    hash.insert(b);
    const pairs = [...pairsFromHash(hash)];
    expect(pairs).toHaveLength(1);
    expect(containsPair(pairs, a, b)).toBe(true);
  });

  test("covers all 8 neighbor directions exactly once", () => {
    const hash = new SpatialHash<TestEntity>(32);
    // Center entity at cell (1,1), plus one entity in each of the 8 neighbor cells.
    const center = ent("center", 32 + 16, 32 + 16);
    hash.insert(center);
    const neighbors: TestEntity[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const e = ent(`n${dx}_${dy}`, (1 + dx) * 32 + 16, (1 + dy) * 32 + 16);
        neighbors.push(e);
        hash.insert(e);
      }
    }
    const pairs = [...pairsFromHash(hash)];
    // Expect: 8 pairs (center <-> each neighbor) + pairs between neighbors that
    // happen to be adjacent. We just verify all center<->neighbor pairs appear
    // exactly once.
    let centerPairCount = 0;
    for (const [a, b] of pairs) {
      if (a === center || b === center) centerPairCount++;
    }
    expect(centerPairCount).toBe(8);
  });

  test("yields nothing for empty hash", () => {
    const hash = new SpatialHash<TestEntity>(32);
    const pairs = [...pairsFromHash(hash)];
    expect(pairs).toHaveLength(0);
  });

  test("yields nothing for single entity", () => {
    const hash = new SpatialHash<TestEntity>(32);
    hash.insert(ent("lone", 10, 10));
    const pairs = [...pairsFromHash(hash)];
    expect(pairs).toHaveLength(0);
  });
});

/** Test helper: checks if a pair [a,b] exists in the list (order-independent). */
function containsPair(
  pairs: Array<[TestEntity, TestEntity]>,
  a: TestEntity,
  b: TestEntity,
): boolean {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Stable key for a pair (sorted by id). */
function pairKey(a: TestEntity, b: TestEntity): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}
