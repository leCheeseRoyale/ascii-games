/**
 * Dungeon generation algorithms for roguelikes and procedural maps.
 *
 * Four algorithms:
 *   generateDungeon()     — random room placement + L-shaped corridors
 *   generateBSP()         — binary space partition rooms
 *   generateCave()        — cellular automata cave
 *   generateWalkerCave()  — drunkard's walk cave
 *
 * All return DungeonResult { grid: GridMap<string>, rooms: RoomInfo[] }
 * Use gridMapToTilemapData() to convert to string[] for createTilemap().
 */

import { GridMap } from "./grid";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomInfo {
  bounds: Rect;
  center: { col: number; row: number };
}

export interface DungeonTiles {
  wall: string;
  floor: string;
  corridor: string;
  door: string;
}

export interface DungeonResult {
  grid: GridMap<string>;
  rooms: RoomInfo[];
}

/* ------------------------------------------------------------------ */
/*  Per-algorithm config types                                         */
/* ------------------------------------------------------------------ */

export interface DungeonConfig {
  cols: number;
  rows: number;
  minRoomSize?: number;
  maxRoomSize?: number;
  roomCount?: number;
  corridorWidth?: number;
  tiles?: Partial<DungeonTiles>;
  seed?: number;
}

export interface BSPConfig {
  cols: number;
  rows: number;
  minLeafSize?: number;
  maxDepth?: number;
  corridorWidth?: number;
  tiles?: Partial<DungeonTiles>;
  seed?: number;
}

export interface CaveConfig {
  cols: number;
  rows: number;
  fillChance?: number;
  birthThreshold?: number;
  deathThreshold?: number;
  iterations?: number;
  tiles?: Partial<DungeonTiles>;
  seed?: number;
}

export interface WalkerConfig {
  cols: number;
  rows: number;
  coverage?: number;
  start?: { col: number; row: number };
  tiles?: Partial<DungeonTiles>;
  seed?: number;
}

/* ------------------------------------------------------------------ */
/*  Internal: seeded RNG (xorshift32)                                  */
/* ------------------------------------------------------------------ */

interface SeededRNG {
  random(): number;
  randomInt(min: number, max: number): number;
}

function createSeededRNG(seed?: number): SeededRNG {
  let state = (seed ?? Math.random() * 0xffffffff) >>> 0 || 1;
  function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0;
    return state / 0x100000000;
  }
  return {
    random: next,
    randomInt(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_TILES: DungeonTiles = {
  wall: "#",
  floor: ".",
  corridor: ".",
  door: "+",
};

function mergeTiles(partial?: Partial<DungeonTiles>): DungeonTiles {
  return { ...DEFAULT_TILES, ...partial };
}

function rectsOverlap(a: Rect, b: Rect, padding: number): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

function carveRect(grid: GridMap<string>, rect: Rect, tile: string): void {
  for (let r = rect.y; r < rect.y + rect.height; r++) {
    for (let c = rect.x; c < rect.x + rect.width; c++) {
      grid.set(c, r, tile);
    }
  }
}

function carveCorridor(
  grid: GridMap<string>,
  from: { col: number; row: number },
  to: { col: number; row: number },
  width: number,
  tile: string,
): void {
  const halfW = Math.floor(width / 2);

  // Horizontal leg
  const minC = Math.min(from.col, to.col);
  const maxC = Math.max(from.col, to.col);
  for (let c = minC; c <= maxC; c++) {
    for (let w = -halfW; w <= halfW; w++) {
      grid.set(c, from.row + w, tile);
    }
  }

  // Vertical leg
  const minR = Math.min(from.row, to.row);
  const maxR = Math.max(from.row, to.row);
  for (let r = minR; r <= maxR; r++) {
    for (let w = -halfW; w <= halfW; w++) {
      grid.set(to.col + w, r, tile);
    }
  }
}

function countWallNeighbors8(
  grid: GridMap<string>,
  col: number,
  row: number,
  wallTile: string,
): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) continue;
      const nc = col + dc;
      const nr = row + dr;
      // Out-of-bounds counts as wall
      if (!grid.inBounds(nc, nr) || grid.get(nc, nr) === wallTile) {
        count++;
      }
    }
  }
  return count;
}

function roomCenter(rect: Rect): { col: number; row: number } {
  return {
    col: Math.floor(rect.x + rect.width / 2),
    row: Math.floor(rect.y + rect.height / 2),
  };
}

/* ------------------------------------------------------------------ */
/*  Algorithm 1: Random room placement                                 */
/* ------------------------------------------------------------------ */

export function generateDungeon(config: DungeonConfig): DungeonResult {
  const {
    cols,
    rows,
    minRoomSize = 4,
    maxRoomSize = 10,
    roomCount = 8,
    corridorWidth = 1,
    seed,
  } = config;
  const tiles = mergeTiles(config.tiles);
  const rng = createSeededRNG(seed);
  const grid = new GridMap<string>(cols, rows, tiles.wall);
  const rooms: RoomInfo[] = [];

  const maxAttempts = roomCount * 20;
  let attempts = 0;

  while (rooms.length < roomCount && attempts < maxAttempts) {
    attempts++;
    const w = rng.randomInt(minRoomSize, maxRoomSize);
    const h = rng.randomInt(minRoomSize, maxRoomSize);
    const x = rng.randomInt(1, cols - w - 1);
    const y = rng.randomInt(1, rows - h - 1);
    const candidate: Rect = { x, y, width: w, height: h };

    const overlaps = rooms.some((r) => rectsOverlap(r.bounds, candidate, 1));
    if (overlaps) continue;

    carveRect(grid, candidate, tiles.floor);
    const info: RoomInfo = { bounds: candidate, center: roomCenter(candidate) };
    rooms.push(info);

    // Connect to previous room
    if (rooms.length > 1) {
      const prev = rooms[rooms.length - 2];
      carveCorridor(grid, prev.center, info.center, corridorWidth, tiles.corridor);
    }
  }

  return { grid, rooms };
}

/* ------------------------------------------------------------------ */
/*  Algorithm 2: BSP (Binary Space Partition)                          */
/* ------------------------------------------------------------------ */

interface BSPLeaf {
  x: number;
  y: number;
  width: number;
  height: number;
  left?: BSPLeaf;
  right?: BSPLeaf;
  room?: Rect;
}

export function generateBSP(config: BSPConfig): DungeonResult {
  const { cols, rows, minLeafSize = 6, maxDepth = 5, corridorWidth = 1, seed } = config;
  const tiles = mergeTiles(config.tiles);
  const rng = createSeededRNG(seed);
  const grid = new GridMap<string>(cols, rows, tiles.wall);
  const rooms: RoomInfo[] = [];

  const root: BSPLeaf = { x: 1, y: 1, width: cols - 2, height: rows - 2 };

  function split(leaf: BSPLeaf, depth: number): void {
    if (depth >= maxDepth) return;
    if (leaf.width < minLeafSize * 2 && leaf.height < minLeafSize * 2) return;

    const canSplitH = leaf.height >= minLeafSize * 2;
    const canSplitV = leaf.width >= minLeafSize * 2;
    if (!canSplitH && !canSplitV) return;

    let horizontal: boolean;
    if (canSplitH && canSplitV) {
      horizontal = rng.random() < 0.5;
    } else {
      horizontal = canSplitH;
    }

    if (horizontal) {
      const splitAt = rng.randomInt(leaf.y + minLeafSize, leaf.y + leaf.height - minLeafSize);
      leaf.left = {
        x: leaf.x,
        y: leaf.y,
        width: leaf.width,
        height: splitAt - leaf.y,
      };
      leaf.right = {
        x: leaf.x,
        y: splitAt,
        width: leaf.width,
        height: leaf.y + leaf.height - splitAt,
      };
    } else {
      const splitAt = rng.randomInt(leaf.x + minLeafSize, leaf.x + leaf.width - minLeafSize);
      leaf.left = {
        x: leaf.x,
        y: leaf.y,
        width: splitAt - leaf.x,
        height: leaf.height,
      };
      leaf.right = {
        x: splitAt,
        y: leaf.y,
        width: leaf.x + leaf.width - splitAt,
        height: leaf.height,
      };
    }

    split(leaf.left, depth + 1);
    split(leaf.right, depth + 1);
  }

  function createRooms(leaf: BSPLeaf): void {
    if (leaf.left && leaf.right) {
      createRooms(leaf.left);
      createRooms(leaf.right);
      // Connect the two children
      const leftCenter = getLeafCenter(leaf.left);
      const rightCenter = getLeafCenter(leaf.right);
      if (leftCenter && rightCenter) {
        carveCorridor(grid, leftCenter, rightCenter, corridorWidth, tiles.corridor);
      }
    } else {
      // Leaf node — place a room inside
      const padX = 1;
      const padY = 1;
      const maxW = leaf.width - padX * 2;
      const maxH = leaf.height - padY * 2;
      if (maxW < 3 || maxH < 3) return;
      const w = rng.randomInt(3, maxW);
      const h = rng.randomInt(3, maxH);
      const x = rng.randomInt(leaf.x + padX, leaf.x + leaf.width - w - padX);
      const y = rng.randomInt(leaf.y + padY, leaf.y + leaf.height - h - padY);
      const rect: Rect = { x, y, width: w, height: h };
      leaf.room = rect;
      carveRect(grid, rect, tiles.floor);
      rooms.push({ bounds: rect, center: roomCenter(rect) });
    }
  }

  function getLeafCenter(leaf: BSPLeaf): { col: number; row: number } | null {
    if (leaf.room) return roomCenter(leaf.room);
    if (leaf.left) return getLeafCenter(leaf.left);
    if (leaf.right) return getLeafCenter(leaf.right);
    return null;
  }

  split(root, 0);
  createRooms(root);

  return { grid, rooms };
}

/* ------------------------------------------------------------------ */
/*  Algorithm 3: Cellular Automata Cave                                */
/* ------------------------------------------------------------------ */

export function generateCave(config: CaveConfig): DungeonResult {
  const {
    cols,
    rows,
    fillChance = 0.45,
    birthThreshold = 5,
    deathThreshold = 4,
    iterations = 4,
    seed,
  } = config;
  const tiles = mergeTiles(config.tiles);
  const rng = createSeededRNG(seed);
  const grid = new GridMap<string>(cols, rows, tiles.wall);

  // Initial random fill
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      grid.set(c, r, rng.random() < fillChance ? tiles.wall : tiles.floor);
    }
  }

  // Cellular automata iterations
  for (let i = 0; i < iterations; i++) {
    const snapshot = new GridMap<string>(cols, rows, tiles.wall);
    grid.forEach((c, r, v) => {
      snapshot.set(c, r, v);
    });

    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const walls = countWallNeighbors8(snapshot, c, r, tiles.wall);
        if (snapshot.get(c, r) === tiles.wall) {
          // Wall stays wall if enough neighbors are walls
          grid.set(c, r, walls >= deathThreshold ? tiles.wall : tiles.floor);
        } else {
          // Floor becomes wall if too many neighbors are walls
          grid.set(c, r, walls >= birthThreshold ? tiles.wall : tiles.floor);
        }
      }
    }
  }

  // Identify open regions as "rooms" via flood-fill
  const rooms = floodFillRooms(grid, cols, rows, tiles.floor);

  return { grid, rooms };
}

/** Flood-fill to find connected open regions and return bounding rects. */
function floodFillRooms(
  grid: GridMap<string>,
  cols: number,
  rows: number,
  floorTile: string,
): RoomInfo[] {
  const visited = new GridMap<boolean>(cols, rows, false);
  const rooms: RoomInfo[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited.get(c, r) || grid.get(c, r) !== floorTile) continue;

      // BFS flood fill
      let minC = c,
        maxC = c,
        minR = r,
        maxR = r;
      const queue: { col: number; row: number }[] = [{ col: c, row: r }];
      visited.set(c, r, true);

      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur.col < minC) minC = cur.col;
        if (cur.col > maxC) maxC = cur.col;
        if (cur.row < minR) minR = cur.row;
        if (cur.row > maxR) maxR = cur.row;

        const dirs = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ];
        for (const [dc, dr] of dirs) {
          const nc = cur.col + dc;
          const nr = cur.row + dr;
          if (grid.inBounds(nc, nr) && !visited.get(nc, nr) && grid.get(nc, nr) === floorTile) {
            visited.set(nc, nr, true);
            queue.push({ col: nc, row: nr });
          }
        }
      }

      const bounds: Rect = {
        x: minC,
        y: minR,
        width: maxC - minC + 1,
        height: maxR - minR + 1,
      };
      rooms.push({ bounds, center: roomCenter(bounds) });
    }
  }

  return rooms;
}

/* ------------------------------------------------------------------ */
/*  Algorithm 4: Drunkard's Walk                                       */
/* ------------------------------------------------------------------ */

export function generateWalkerCave(config: WalkerConfig): DungeonResult {
  const { cols, rows, coverage = 0.35, seed } = config;
  const tiles = mergeTiles(config.tiles);
  const rng = createSeededRNG(seed);
  const grid = new GridMap<string>(cols, rows, tiles.wall);

  const startCol = config.start?.col ?? Math.floor(cols / 2);
  const startRow = config.start?.row ?? Math.floor(rows / 2);

  const totalCells = (cols - 2) * (rows - 2); // exclude border
  const target = Math.floor(totalCells * coverage);
  let carved = 0;

  let col = startCol;
  let row = startRow;
  grid.set(col, row, tiles.floor);
  carved++;

  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  const maxSteps = target * 20; // safety limit
  let steps = 0;

  while (carved < target && steps < maxSteps) {
    steps++;
    const dir = dirs[Math.floor(rng.random() * 4)];
    const nc = col + dir[0];
    const nr = row + dir[1];

    // Stay within borders
    if (nc <= 0 || nc >= cols - 1 || nr <= 0 || nr >= rows - 1) continue;

    col = nc;
    row = nr;

    if (grid.get(col, row) !== tiles.floor) {
      grid.set(col, row, tiles.floor);
      carved++;
    }
  }

  const rooms = floodFillRooms(grid, cols, rows, tiles.floor);

  return { grid, rooms };
}

/* ------------------------------------------------------------------ */
/*  Conversion helper                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a GridMap<string> to a string[] suitable for createTilemap().
 * Null cells become the wall character '#'.
 */
export function gridMapToTilemapData(grid: GridMap<string>): string[] {
  const lines: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    let line = "";
    for (let c = 0; c < grid.cols; c++) {
      line += grid.get(c, r) ?? "#";
    }
    lines.push(line);
  }
  return lines;
}
