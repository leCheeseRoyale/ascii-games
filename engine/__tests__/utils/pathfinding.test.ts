import { describe, expect, test } from "bun:test";
import { GridMap } from "../../utils/grid";
import { findPath } from "../../utils/pathfinding";

describe("findPath", () => {
  test("finds path on open grid", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 4 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ col: 0, row: 0 });
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 4 });
  });

  test("path starts at start and ends at goal", () => {
    const grid = new GridMap<string>(10, 10, ".");
    const path = findPath(grid, { col: 1, row: 1 }, { col: 8, row: 8 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ col: 1, row: 1 });
    expect(path![path!.length - 1]).toEqual({ col: 8, row: 8 });
  });

  test("navigates around walls", () => {
    const grid = new GridMap<string>(5, 5, ".");
    // Wall across the middle
    grid.set(0, 2, "#");
    grid.set(1, 2, "#");
    grid.set(2, 2, "#");
    grid.set(3, 2, "#");
    // Leave opening at col 4
    const path = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 0, row: 4 },
      {
        isWalkable: (_c, _r, v) => v !== "#",
      },
    );
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ col: 0, row: 0 });
    expect(path![path!.length - 1]).toEqual({ col: 0, row: 4 });
    // Path should not go through any wall cell
    for (const step of path!) {
      expect(grid.get(step.col, step.row)).not.toBe("#");
    }
  });

  test("finds L-shape corridor path", () => {
    // Create a simple L-shaped corridor
    const grid = new GridMap<string>(5, 5, "#");
    // Horizontal corridor at row 0
    grid.set(0, 0, ".");
    grid.set(1, 0, ".");
    grid.set(2, 0, ".");
    // Vertical corridor at col 2
    grid.set(2, 1, ".");
    grid.set(2, 2, ".");
    grid.set(2, 3, ".");
    grid.set(2, 4, ".");

    const path = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 2, row: 4 },
      {
        isWalkable: (_c, _r, v) => v !== "#",
      },
    );
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ col: 0, row: 0 });
    expect(path![path!.length - 1]).toEqual({ col: 2, row: 4 });
  });

  test("returns null when goal is enclosed", () => {
    const grid = new GridMap<string>(5, 5, ".");
    // Surround center cell with walls
    grid.set(1, 1, "#");
    grid.set(2, 1, "#");
    grid.set(3, 1, "#");
    grid.set(1, 2, "#");
    grid.set(3, 2, "#");
    grid.set(1, 3, "#");
    grid.set(2, 3, "#");
    grid.set(3, 3, "#");

    const path = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 2, row: 2 },
      {
        isWalkable: (_c, _r, v) => v !== "#",
      },
    );
    expect(path).toBeNull();
  });

  test("returns null when goal is unwalkable", () => {
    const grid = new GridMap<string>(5, 5, ".");
    grid.set(4, 4, "#");
    const path = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 4, row: 4 },
      {
        isWalkable: (_c, _r, v) => v !== "#",
      },
    );
    expect(path).toBeNull();
  });

  test("returns null for out-of-bounds start", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const path = findPath(grid, { col: -1, row: 0 }, { col: 4, row: 4 });
    expect(path).toBeNull();
  });

  test("returns null for out-of-bounds goal", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const path = findPath(grid, { col: 0, row: 0 }, { col: 10, row: 10 });
    expect(path).toBeNull();
  });

  test("diagonal mode finds shorter paths", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const pathNoDiag = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 4, row: 4 },
      {
        diagonal: false,
      },
    );
    const pathDiag = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 4, row: 4 },
      {
        diagonal: true,
      },
    );
    expect(pathNoDiag).not.toBeNull();
    expect(pathDiag).not.toBeNull();
    // Diagonal path should have fewer steps
    expect(pathDiag!.length).toBeLessThan(pathNoDiag!.length);
  });

  test("diagonal path only moves one step per node", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const path = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 4, row: 4 },
      {
        diagonal: true,
      },
    );
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      const dc = Math.abs(path![i].col - path![i - 1].col);
      const dr = Math.abs(path![i].row - path![i - 1].row);
      expect(dc).toBeLessThanOrEqual(1);
      expect(dr).toBeLessThanOrEqual(1);
    }
  });

  test("custom isWalkable predicate is respected", () => {
    const grid = new GridMap<number>(5, 5, 1);
    grid.set(2, 0, 0);
    grid.set(2, 1, 0);
    grid.set(2, 2, 0);
    grid.set(2, 3, 0);
    // Leave opening at (2,4)

    const path = findPath(
      grid,
      { col: 0, row: 0 },
      { col: 4, row: 0 },
      {
        isWalkable: (_c, _r, v) => v !== 0,
      },
    );
    expect(path).not.toBeNull();
    // Path must go around the column of 0s
    for (const step of path!) {
      if (step.col === 2) {
        expect(step.row).toBe(4); // only walkable cell in col 2
      }
    }
  });

  test("path of length 1 when start equals goal", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const path = findPath(grid, { col: 2, row: 2 }, { col: 2, row: 2 });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(1);
    expect(path![0]).toEqual({ col: 2, row: 2 });
  });

  test("adjacent path has length 2", () => {
    const grid = new GridMap<string>(5, 5, ".");
    const path = findPath(grid, { col: 0, row: 0 }, { col: 1, row: 0 });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(2);
  });
});
