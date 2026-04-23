/**
 * A* Pathfinding — grid-based pathfinding using GridMap.
 *
 * Usage:
 *   import { findPath, GridMap } from '@engine'
 *   const grid = new GridMap<string>(10, 10, '.')
 *   grid.set(3, 3, '#') // wall
 *   const path = findPath(grid, { col: 0, row: 0 }, { col: 9, row: 9 }, {
 *     isWalkable: (_col, _row, val) => val !== '#',
 *   })
 */

import type { GridMap } from "./grid";

/** Binary min-heap for O(log n) insert/extract-min. */
class MinHeap<T> {
  private data: T[] = [];
  private compare: (a: T, b: T) => number;
  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(item: T): void {
    this.data.push(item);
    this.siftUp(this.data.length - 1);
  }

  pop(): T | undefined {
    const { data } = this;
    if (data.length === 0) return undefined;
    const top = data[0];
    const last = data.pop();
    if (last !== undefined && data.length > 0) {
      data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  get size(): number {
    return this.data.length;
  }

  private siftUp(i: number): void {
    const { data } = this;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(data[i], data[parent]) >= 0) break;
      const tmp = data[i];
      data[i] = data[parent];
      data[parent] = tmp;
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const { data } = this;
    const n = data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compare(data[left], data[smallest]) < 0) smallest = left;
      if (right < n && this.compare(data[right], data[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      const tmp = data[i];
      data[i] = data[smallest];
      data[smallest] = tmp;
      i = smallest;
    }
  }
}

export interface PathOptions<T = unknown> {
  /** Allow diagonal movement. Default false. */
  diagonal?: boolean;
  /** Return true if the cell is walkable. Default: () => true. */
  isWalkable?: (col: number, row: number, value: T | null) => boolean;
  /** Maximum iterations before giving up. Default: cols * rows * 2. */
  maxIterations?: number;
}

interface PathNode {
  col: number;
  row: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

/**
 * Find a path between two grid positions using A*.
 * Returns an array of {col, row} from start to goal (inclusive), or null if no path exists.
 */
export function findPath<T>(
  grid: GridMap<T>,
  start: { col: number; row: number },
  goal: { col: number; row: number },
  options?: PathOptions<T>,
): { col: number; row: number }[] | null {
  const diagonal = options?.diagonal ?? false;
  const isWalkable = options?.isWalkable ?? (() => true);
  const maxIter = options?.maxIterations ?? grid.cols * grid.rows * 2;

  if (!grid.inBounds(start.col, start.row) || !grid.inBounds(goal.col, goal.row)) {
    return null;
  }
  if (!isWalkable(goal.col, goal.row, grid.get(goal.col, goal.row))) {
    return null;
  }

  const key = (col: number, row: number) => col + row * grid.cols;
  const heuristic = diagonal
    ? (a: { col: number; row: number }, b: { col: number; row: number }) =>
        Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))
    : (a: { col: number; row: number }, b: { col: number; row: number }) =>
        Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

  const startNode: PathNode = {
    col: start.col,
    row: start.row,
    g: 0,
    h: heuristic(start, goal),
    f: heuristic(start, goal),
    parent: null,
  };

  const openHeap = new MinHeap<PathNode>((a, b) => a.f - b.f);
  openHeap.push(startNode);
  const closed = new Set<number>();
  const gScores = new Map<number, number>();
  gScores.set(key(start.col, start.row), 0);

  const dirs4 = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const dirs8 = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  const dirs = diagonal ? dirs8 : dirs4;

  let iterations = 0;

  while (openHeap.size > 0 && iterations < maxIter) {
    iterations++;

    const current = openHeap.pop();
    if (!current) continue;

    if (current.col === goal.col && current.row === goal.row) {
      // Reconstruct path
      const path: { col: number; row: number }[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.push({ col: node.col, row: node.row });
        node = node.parent;
      }
      path.reverse();
      return path;
    }

    const ck = key(current.col, current.row);
    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const [dx, dy] of dirs) {
      const nc = current.col + dx;
      const nr = current.row + dy;

      if (!grid.inBounds(nc, nr)) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;
      if (!isWalkable(nc, nr, grid.get(nc, nr))) continue;

      // Diagonal movement costs sqrt(2) ≈ 1.41
      const moveCost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const tentativeG = current.g + moveCost;

      const existingG = gScores.get(nk);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScores.set(nk, tentativeG);
      const h = heuristic({ col: nc, row: nr }, goal);
      openHeap.push({
        col: nc,
        row: nr,
        g: tentativeG,
        h,
        f: tentativeG + h,
        parent: current,
      });
    }
  }

  return null; // No path found
}
