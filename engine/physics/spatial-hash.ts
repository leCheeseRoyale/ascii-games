/**
 * Spatial hash grid. Bucket entities by grid cell for O(1) neighbor queries.
 *
 * Replaces O(n^2) brute-force collision with O(1) bucket lookups for performance
 * at scale. For most games, rebuild-each-frame is fine (O(n) clear + insert beats
 * O(n^2) overlap checks once you have >~50 colliders).
 *
 * Usage:
 *   const hash = new SpatialHash<Entity>(64); // 64px cells
 *   hash.rebuild(engine.world.with('position', 'collider'));
 *   const nearby = hash.queryRect(player.position.x, player.position.y, 32, 32);
 *   const collisions = hash.queryCircle(x, y, radius);
 *
 * For N-body collision (bullets vs enemies, etc.), use pairsFromHash() to
 * iterate candidate pairs without duplicates.
 */

type Positioned = { position: { x: number; y: number } };

export class SpatialHash<T extends Positioned> {
  readonly cellSize: number;
  private cells: Map<string, Set<T>> = new Map();
  private entityCells: Map<T, string[]> = new Map();

  constructor(cellSize: number) {
    if (cellSize <= 0) throw new Error("SpatialHash cellSize must be > 0");
    this.cellSize = cellSize;
  }

  /** Clear all entities from the hash. Call before rebuilding. */
  clear(): void {
    this.cells.clear();
    this.entityCells.clear();
  }

  /** Insert an entity into the hash based on its position (single cell). */
  insert(entity: T): void {
    // If already present, remove first so we don't leave stale cell refs.
    if (this.entityCells.has(entity)) this.remove(entity);
    const cx = Math.floor(entity.position.x / this.cellSize);
    const cy = Math.floor(entity.position.y / this.cellSize);
    const key = `${cx},${cy}`;
    this.addToCell(key, entity);
    this.entityCells.set(entity, [key]);
  }

  /**
   * Insert an entity with a bounding box — adds it to every cell it overlaps.
   * Use this for wider colliders (>= cellSize) so queries don't miss them.
   * `width`/`height` are full extents, centered on `entity.position`.
   */
  insertWithBounds(entity: T, width: number, height: number): void {
    if (this.entityCells.has(entity)) this.remove(entity);
    const hw = width / 2;
    const hh = height / 2;
    const minCx = Math.floor((entity.position.x - hw) / this.cellSize);
    const maxCx = Math.floor((entity.position.x + hw) / this.cellSize);
    const minCy = Math.floor((entity.position.y - hh) / this.cellSize);
    const maxCy = Math.floor((entity.position.y + hh) / this.cellSize);
    const keys: string[] = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        this.addToCell(key, entity);
        keys.push(key);
      }
    }
    this.entityCells.set(entity, keys);
  }

  /** Remove a specific entity from the hash. */
  remove(entity: T): void {
    const keys = this.entityCells.get(entity);
    if (!keys) return;
    for (const key of keys) {
      const set = this.cells.get(key);
      if (!set) continue;
      set.delete(entity);
      if (set.size === 0) this.cells.delete(key);
    }
    this.entityCells.delete(entity);
  }

  /** Get all entities near a point (same cell + 8 neighbors). */
  queryPoint(x: number, y: number): T[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result = new Set<T>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const set = this.cells.get(`${cx + dx},${cy + dy}`);
        if (!set) continue;
        for (const e of set) result.add(e);
      }
    }
    return [...result];
  }

  /**
   * Get all entities that could overlap a rectangle (centered on x,y).
   * May include false positives at cell boundaries — caller should do a
   * precise overlap test (e.g. `overlaps()`) on the candidates.
   */
  queryRect(x: number, y: number, width: number, height: number): T[] {
    const hw = width / 2;
    const hh = height / 2;
    const minCx = Math.floor((x - hw) / this.cellSize);
    const maxCx = Math.floor((x + hw) / this.cellSize);
    const minCy = Math.floor((y - hh) / this.cellSize);
    const maxCy = Math.floor((y + hh) / this.cellSize);
    const result = new Set<T>();
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const set = this.cells.get(`${cx},${cy}`);
        if (!set) continue;
        for (const e of set) result.add(e);
      }
    }
    return [...result];
  }

  /**
   * Get all entities that could overlap a circle (center x,y, radius).
   * Conservative — may include candidates outside the true circle but within
   * its bounding cells. Caller should do a precise distance check on results.
   */
  queryCircle(x: number, y: number, radius: number): T[] {
    return this.queryRect(x, y, radius * 2, radius * 2);
  }

  /**
   * Total number of entity slots across all cells.
   * May exceed unique entity count when an entity spans multiple cells
   * (via `insertWithBounds`).
   */
  size(): number {
    let total = 0;
    for (const set of this.cells.values()) total += set.size;
    return total;
  }

  /** Number of distinct cells with entities. */
  cellCount(): number {
    return this.cells.size;
  }

  /** Rebuild hash from an iterable of entities. Convenience wrapper. */
  rebuild(entities: Iterable<T>): void {
    this.clear();
    for (const e of entities) this.insert(e);
  }

  private addToCell(key: string, entity: T): void {
    let set = this.cells.get(key);
    if (!set) {
      set = new Set();
      this.cells.set(key, set);
    }
    set.add(entity);
  }

  /** Internal: iterate [key, entities] pairs. Used by pairsFromHash. */
  *_cells(): Iterable<[string, Set<T>]> {
    yield* this.cells.entries();
  }

  /** Internal: direct cell lookup by key. Used by pairsFromHash. */
  _getCell(key: string): Set<T> | undefined {
    return this.cells.get(key);
  }
}

/**
 * Iterate unique entity pairs that might collide.
 *
 * For each cell, yields:
 *  - all within-cell pairs
 *  - all cross-cell pairs with neighbors that have a "greater" coordinate
 *    (to avoid emitting the same pair twice).
 *
 * If an entity spans multiple cells (via `insertWithBounds`), the same pair
 * may be yielded more than once across those cells. Use a Set or equivalent
 * to dedupe when that matters.
 */
export function* pairsFromHash<T extends Positioned>(hash: SpatialHash<T>): Iterable<[T, T]> {
  // Neighbor offsets that are "forward-only" to avoid emitting pair (a,b)
  // from cell A and pair (b,a) from cell B. We cover:
  //   right, down-left, down, down-right
  // Combined with within-cell pairs, this spans all 8 neighbors exactly once.
  const forwardNeighbors: Array<[number, number]> = [
    [1, 0], // right
    [-1, 1], // down-left
    [0, 1], // down
    [1, 1], // down-right
  ];

  for (const [key, cellEntities] of hash._cells()) {
    const entities = [...cellEntities];

    // Within-cell pairs
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < entities.length; j++) {
        const b = entities[j];
        if (b === undefined) continue;
        yield [a, b];
      }
    }

    // Cross-cell pairs with forward-only neighbors
    const commaIdx = key.indexOf(",");
    const cx = Number.parseInt(key.slice(0, commaIdx), 10);
    const cy = Number.parseInt(key.slice(commaIdx + 1), 10);
    for (const [dx, dy] of forwardNeighbors) {
      const neighborKey = `${cx + dx},${cy + dy}`;
      const neighborSet = hash._getCell(neighborKey);
      if (!neighborSet) continue;
      for (const a of entities) {
        for (const b of neighborSet) {
          yield [a, b];
        }
      }
    }
  }
}
