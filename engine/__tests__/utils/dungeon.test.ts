import { describe, expect, test } from "bun:test";
import {
  generateBSP,
  generateCave,
  generateDungeon,
  generateWalkerCave,
  gridMapToTilemapData,
} from "../../utils/dungeon";

describe("generateDungeon (room-and-corridor)", () => {
  test("produces a grid of the requested size", () => {
    const { grid } = generateDungeon({ cols: 40, rows: 20, seed: 42 });
    expect(grid.cols).toBe(40);
    expect(grid.rows).toBe(20);
  });

  test("produces rooms with valid bounds", () => {
    const { rooms } = generateDungeon({ cols: 60, rows: 40, seed: 42 });
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(room.bounds.x).toBeGreaterThanOrEqual(0);
      expect(room.bounds.y).toBeGreaterThanOrEqual(0);
      expect(room.bounds.width).toBeGreaterThan(0);
      expect(room.bounds.height).toBeGreaterThan(0);
    }
  });

  test("rooms have correct center coordinates", () => {
    const { rooms } = generateDungeon({ cols: 60, rows: 40, seed: 42 });
    for (const room of rooms) {
      const expectedCol = Math.floor(room.bounds.x + room.bounds.width / 2);
      const expectedRow = Math.floor(room.bounds.y + room.bounds.height / 2);
      expect(room.center.col).toBe(expectedCol);
      expect(room.center.row).toBe(expectedRow);
    }
  });

  test("same seed produces same output (deterministic)", () => {
    const a = generateDungeon({ cols: 50, rows: 30, seed: 123 });
    const b = generateDungeon({ cols: 50, rows: 30, seed: 123 });
    expect(a.grid.get(10, 10)).toBe(b.grid.get(10, 10));
    expect(a.rooms.length).toBe(b.rooms.length);
  });

  test("different seeds produce different output", () => {
    const a = generateDungeon({ cols: 50, rows: 30, seed: 1 });
    const b = generateDungeon({ cols: 50, rows: 30, seed: 2 });
    // Very unlikely to be identical
    const aData = gridMapToTilemapData(a.grid).join("");
    const bData = gridMapToTilemapData(b.grid).join("");
    expect(aData).not.toBe(bData);
  });

  test("respects custom tile characters", () => {
    const { grid } = generateDungeon({
      cols: 20,
      rows: 20,
      seed: 42,
      tiles: { wall: "X", floor: " ", corridor: " ", door: "+" },
    });
    // Collect all unique characters in the grid
    const chars = new Set<string>();
    grid.forEach((_c, _r, v) => {
      if (v) chars.add(v);
    });
    // Should only contain wall and floor chars
    for (const c of chars) {
      expect(["X", " ", "+"]).toContain(c);
    }
  });
});

describe("generateBSP", () => {
  test("produces a grid with rooms", () => {
    const { grid, rooms } = generateBSP({ cols: 60, rows: 40, seed: 7 });
    expect(grid.cols).toBe(60);
    expect(grid.rows).toBe(40);
    expect(rooms.length).toBeGreaterThan(0);
  });

  test("is deterministic with same seed", () => {
    const a = generateBSP({ cols: 40, rows: 30, seed: 99 });
    const b = generateBSP({ cols: 40, rows: 30, seed: 99 });
    expect(a.rooms.length).toBe(b.rooms.length);
  });
});

describe("generateCave (cellular automata)", () => {
  test("produces a grid of the correct size", () => {
    const { grid } = generateCave({ cols: 40, rows: 30, seed: 5 });
    expect(grid.cols).toBe(40);
    expect(grid.rows).toBe(30);
  });

  test("is deterministic with same seed", () => {
    const a = generateCave({ cols: 40, rows: 30, seed: 10 });
    const b = generateCave({ cols: 40, rows: 30, seed: 10 });
    expect(gridMapToTilemapData(a.grid)).toEqual(gridMapToTilemapData(b.grid));
  });

  test("has borders of wall cells", () => {
    const { grid } = generateCave({ cols: 20, rows: 20, seed: 5 });
    // Borders should be walls (default "#")
    for (let c = 0; c < grid.cols; c++) {
      expect(grid.get(c, 0)).toBe("#");
      expect(grid.get(c, grid.rows - 1)).toBe("#");
    }
  });
});

describe("generateWalkerCave (drunkard's walk)", () => {
  test("produces a grid of the correct size", () => {
    const { grid } = generateWalkerCave({ cols: 30, rows: 30, seed: 1 });
    expect(grid.cols).toBe(30);
    expect(grid.rows).toBe(30);
  });

  test("produces at least some floor tiles", () => {
    const { grid } = generateWalkerCave({ cols: 40, rows: 40, seed: 2, coverage: 0.3 });
    let floorCount = 0;
    grid.forEach((_c, _r, v) => {
      if (v === ".") floorCount++;
    });
    expect(floorCount).toBeGreaterThan(0);
  });

  test("is deterministic with same seed", () => {
    const a = generateWalkerCave({ cols: 30, rows: 30, seed: 20 });
    const b = generateWalkerCave({ cols: 30, rows: 30, seed: 20 });
    expect(gridMapToTilemapData(a.grid)).toEqual(gridMapToTilemapData(b.grid));
  });
});

describe("gridMapToTilemapData", () => {
  test("converts GridMap to string[]", () => {
    const { grid } = generateDungeon({ cols: 20, rows: 10, seed: 42 });
    const data = gridMapToTilemapData(grid);
    expect(data.length).toBe(10);
    for (const row of data) {
      expect(row.length).toBe(20);
    }
  });
});
