import { describe, expect, test } from "bun:test";
import { GridMap, gridDistance, gridToWorld, worldToGrid } from "../../utils/grid";

describe("GridMap", () => {
  describe("constructor", () => {
    test("creates grid with correct dimensions", () => {
      const grid = new GridMap<string>(10, 8);
      expect(grid.cols).toBe(10);
      expect(grid.rows).toBe(8);
    });

    test("fills with null by default", () => {
      const grid = new GridMap<string>(3, 3);
      expect(grid.get(0, 0)).toBeNull();
      expect(grid.get(2, 2)).toBeNull();
    });

    test("fills with provided default value", () => {
      const grid = new GridMap<string>(3, 3, ".");
      expect(grid.get(0, 0)).toBe(".");
      expect(grid.get(2, 2)).toBe(".");
    });
  });

  describe("get/set", () => {
    test("sets and gets a value", () => {
      const grid = new GridMap<string>(5, 5);
      grid.set(2, 3, "#");
      expect(grid.get(2, 3)).toBe("#");
    });

    test("get returns null for out-of-bounds", () => {
      const grid = new GridMap<string>(5, 5);
      expect(grid.get(-1, 0)).toBeNull();
      expect(grid.get(5, 0)).toBeNull();
      expect(grid.get(0, -1)).toBeNull();
      expect(grid.get(0, 5)).toBeNull();
    });

    test("set ignores out-of-bounds", () => {
      const grid = new GridMap<string>(3, 3);
      grid.set(-1, 0, "x"); // should not throw
      grid.set(3, 0, "x");
      expect(grid.get(0, 0)).toBeNull();
    });

    test("overwrites previous value", () => {
      const grid = new GridMap<string>(5, 5);
      grid.set(1, 1, "a");
      grid.set(1, 1, "b");
      expect(grid.get(1, 1)).toBe("b");
    });
  });

  describe("inBounds", () => {
    test("returns true for valid coordinates", () => {
      const grid = new GridMap<string>(5, 5);
      expect(grid.inBounds(0, 0)).toBe(true);
      expect(grid.inBounds(4, 4)).toBe(true);
      expect(grid.inBounds(2, 3)).toBe(true);
    });

    test("returns false for out-of-bounds coordinates", () => {
      const grid = new GridMap<string>(5, 5);
      expect(grid.inBounds(-1, 0)).toBe(false);
      expect(grid.inBounds(5, 0)).toBe(false);
      expect(grid.inBounds(0, -1)).toBe(false);
      expect(grid.inBounds(0, 5)).toBe(false);
    });
  });

  describe("fill", () => {
    test("fills entire grid with a value", () => {
      const grid = new GridMap<string>(3, 3);
      grid.fill("X");
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          expect(grid.get(c, r)).toBe("X");
        }
      }
    });
  });

  describe("clear", () => {
    test("clears all cells to null", () => {
      const grid = new GridMap<string>(3, 3, "X");
      grid.clear();
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          expect(grid.get(c, r)).toBeNull();
        }
      }
    });
  });

  describe("neighbors4", () => {
    test("returns 4 neighbors for center cell", () => {
      const grid = new GridMap<string>(5, 5, ".");
      const neighbors = grid.neighbors4(2, 2);
      expect(neighbors).toHaveLength(4);
    });

    test("returns 2 neighbors for corner cell", () => {
      const grid = new GridMap<string>(5, 5, ".");
      const neighbors = grid.neighbors4(0, 0);
      expect(neighbors).toHaveLength(2);
      const coords = neighbors.map((n) => [n.col, n.row]);
      expect(coords).toContainEqual([1, 0]);
      expect(coords).toContainEqual([0, 1]);
    });

    test("returns correct values for neighbors", () => {
      const grid = new GridMap<string>(3, 3);
      grid.set(1, 0, "N");
      grid.set(2, 1, "E");
      grid.set(1, 2, "S");
      grid.set(0, 1, "W");
      const neighbors = grid.neighbors4(1, 1);
      const values = neighbors.map((n) => n.value);
      expect(values).toContain("N");
      expect(values).toContain("E");
      expect(values).toContain("S");
      expect(values).toContain("W");
    });
  });

  describe("neighbors8", () => {
    test("returns 8 neighbors for center cell", () => {
      const grid = new GridMap<string>(5, 5, ".");
      const neighbors = grid.neighbors8(2, 2);
      expect(neighbors).toHaveLength(8);
    });

    test("returns 3 neighbors for corner cell", () => {
      const grid = new GridMap<string>(5, 5, ".");
      const neighbors = grid.neighbors8(0, 0);
      expect(neighbors).toHaveLength(3);
    });

    test("includes diagonal neighbors", () => {
      const grid = new GridMap<string>(3, 3, ".");
      grid.set(0, 0, "NW");
      grid.set(2, 0, "NE");
      grid.set(0, 2, "SW");
      grid.set(2, 2, "SE");
      const neighbors = grid.neighbors8(1, 1);
      const values = neighbors.map((n) => n.value);
      expect(values).toContain("NW");
      expect(values).toContain("NE");
      expect(values).toContain("SW");
      expect(values).toContain("SE");
    });
  });

  describe("forEach", () => {
    test("iterates all cells", () => {
      const grid = new GridMap<string>(3, 2, ".");
      let count = 0;
      grid.forEach(() => {
        count++;
      });
      expect(count).toBe(6);
    });

    test("provides correct col, row, value", () => {
      const grid = new GridMap<string>(2, 2);
      grid.set(1, 0, "A");
      const cells: [number, number, string | null][] = [];
      grid.forEach((col, row, val) => {
        cells.push([col, row, val]);
      });
      expect(cells).toContainEqual([1, 0, "A"]);
      expect(cells).toContainEqual([0, 0, null]);
    });
  });

  describe("find", () => {
    test("finds first matching cell", () => {
      const grid = new GridMap<string>(5, 5, ".");
      grid.set(3, 2, "#");
      const found = grid.find((_c, _r, v) => v === "#");
      expect(found).toEqual({ col: 3, row: 2, value: "#" });
    });

    test("returns null when not found", () => {
      const grid = new GridMap<string>(3, 3, ".");
      const found = grid.find((_c, _r, v) => v === "#");
      expect(found).toBeNull();
    });
  });

  describe("count", () => {
    test("counts cells matching predicate", () => {
      const grid = new GridMap<string>(3, 3, ".");
      grid.set(0, 0, "#");
      grid.set(1, 1, "#");
      grid.set(2, 2, "#");
      expect(grid.count((v) => v === "#")).toBe(3);
      expect(grid.count((v) => v === ".")).toBe(6);
    });

    test("returns 0 when none match", () => {
      const grid = new GridMap<string>(3, 3, ".");
      expect(grid.count((v) => v === "#")).toBe(0);
    });
  });
});

describe("gridToWorld", () => {
  test("converts grid coords to world center of cell", () => {
    const pos = gridToWorld(2, 3, 24);
    // x = 0 + 2*24 + 12 = 60, y = 0 + 3*24 + 12 = 84
    expect(pos).toEqual({ x: 60, y: 84 });
  });

  test("respects offset", () => {
    const pos = gridToWorld(0, 0, 24, { x: 100, y: 50 });
    expect(pos).toEqual({ x: 112, y: 62 });
  });

  test("cell (0,0) with no offset is at half cell size", () => {
    const pos = gridToWorld(0, 0, 10);
    expect(pos).toEqual({ x: 5, y: 5 });
  });
});

describe("worldToGrid", () => {
  test("converts world coords to grid coords", () => {
    const cell = worldToGrid(60, 84, 24);
    expect(cell).toEqual({ col: 2, row: 3 });
  });

  test("respects offset", () => {
    const cell = worldToGrid(112, 62, 24, { x: 100, y: 50 });
    expect(cell).toEqual({ col: 0, row: 0 });
  });

  test("floors to nearest cell", () => {
    const cell = worldToGrid(25, 25, 24);
    // 25/24 = 1.04 -> floor = 1
    expect(cell).toEqual({ col: 1, row: 1 });
  });
});

describe("gridDistance", () => {
  test("returns Manhattan distance", () => {
    expect(gridDistance({ col: 0, row: 0 }, { col: 3, row: 4 })).toBe(7);
  });

  test("returns 0 for same position", () => {
    expect(gridDistance({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe(0);
  });

  test("is symmetric", () => {
    const a = { col: 1, row: 2 };
    const b = { col: 4, row: 6 };
    expect(gridDistance(a, b)).toBe(gridDistance(b, a));
  });

  test("handles negative coordinates", () => {
    expect(gridDistance({ col: -2, row: -3 }, { col: 2, row: 3 })).toBe(10);
  });
});
