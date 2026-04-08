/**
 * Grid utilities for tile-based games.
 * Roguelikes, autobattlers, puzzle games, strategy — all need grids.
 *
 * Usage:
 *   const grid = new GridMap<string>(20, 15)
 *   grid.set(5, 3, '#')  // wall
 *   grid.set(5, 4, '.')  // floor
 *   const pos = gridToWorld(5, 3, 24, { x: 100, y: 50 })
 */

import type { Vec2 } from "./math";

export class GridMap<T> {
  readonly cols: number;
  readonly rows: number;
  private data: (T | null)[];

  constructor(cols: number, rows: number, fill: T | null = null) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Array(cols * rows).fill(fill);
  }

  private idx(col: number, row: number): number {
    return row * this.cols + col;
  }
  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  get(col: number, row: number): T | null {
    return this.inBounds(col, row) ? this.data[this.idx(col, row)] : null;
  }

  set(col: number, row: number, value: T | null): void {
    if (this.inBounds(col, row)) this.data[this.idx(col, row)] = value;
  }

  fill(value: T | null): void {
    this.data.fill(value);
  }

  clear(): void {
    this.data.fill(null);
  }

  /** Get 4-directional neighbors (N, E, S, W). */
  neighbors4(col: number, row: number): { col: number; row: number; value: T | null }[] {
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    return dirs
      .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
      .filter((p) => this.inBounds(p.col, p.row))
      .map((p) => ({ ...p, value: this.get(p.col, p.row) }));
  }

  /** Get 8-directional neighbors. */
  neighbors8(col: number, row: number): { col: number; row: number; value: T | null }[] {
    const result: { col: number; row: number; value: T | null }[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const c = col + dc,
          r = row + dr;
        if (this.inBounds(c, r)) result.push({ col: c, row: r, value: this.get(c, r) });
      }
    }
    return result;
  }

  /** Iterate all cells. */
  forEach(fn: (col: number, row: number, value: T | null) => void): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        fn(c, r, this.data[this.idx(c, r)]);
      }
    }
  }

  /** Find first cell matching predicate. */
  find(
    fn: (col: number, row: number, value: T | null) => boolean,
  ): { col: number; row: number; value: T | null } | null {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.data[this.idx(c, r)];
        if (fn(c, r, v)) return { col: c, row: r, value: v };
      }
    }
    return null;
  }

  /** Count cells matching predicate. */
  count(fn: (value: T | null) => boolean): number {
    return this.data.filter(fn).length;
  }
}

/** Convert grid coordinates to world (pixel) coordinates. */
export function gridToWorld(
  col: number,
  row: number,
  cellSize: number,
  offset: Vec2 = { x: 0, y: 0 },
): Vec2 {
  return {
    x: offset.x + col * cellSize + cellSize / 2,
    y: offset.y + row * cellSize + cellSize / 2,
  };
}

/** Convert world coordinates to grid coordinates. */
export function worldToGrid(
  x: number,
  y: number,
  cellSize: number,
  offset: Vec2 = { x: 0, y: 0 },
): { col: number; row: number } {
  return {
    col: Math.floor((x - offset.x) / cellSize),
    row: Math.floor((y - offset.y) / cellSize),
  };
}

/** Manhattan distance between two grid positions. */
export function gridDistance(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}
