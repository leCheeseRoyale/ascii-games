/**
 * BSP Dungeon Generator
 *
 * Fills a grid with walls, recursively splits into leaves via BSP,
 * carves rooms in each leaf, and connects siblings with L-shaped corridors.
 */

import { rng, rngInt } from "@engine";
import { GAME } from "../config";

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DungeonResult {
  grid: string[][];
  rooms: Room[];
  stairs: { col: number; row: number };
  playerStart: { col: number; row: number };
}

interface Leaf {
  x: number;
  y: number;
  w: number;
  h: number;
  left?: Leaf;
  right?: Leaf;
  room?: Room;
}

function splitLeaf(leaf: Leaf, minSize: number): boolean {
  if (leaf.left || leaf.right) return false;

  // Decide split direction
  let splitH = rng(0, 1) > 0.5;
  if (leaf.w > leaf.h && leaf.w / leaf.h >= 1.25) splitH = false;
  if (leaf.h > leaf.w && leaf.h / leaf.w >= 1.25) splitH = true;

  const max = (splitH ? leaf.h : leaf.w) - minSize;
  if (max < minSize) return false;

  const split = rngInt(minSize, max);

  if (splitH) {
    leaf.left = { x: leaf.x, y: leaf.y, w: leaf.w, h: split };
    leaf.right = { x: leaf.x, y: leaf.y + split, w: leaf.w, h: leaf.h - split };
  } else {
    leaf.left = { x: leaf.x, y: leaf.y, w: split, h: leaf.h };
    leaf.right = { x: leaf.x + split, y: leaf.y, w: leaf.w - split, h: leaf.h };
  }

  return true;
}

function createRooms(leaf: Leaf, rooms: Room[]): void {
  if (leaf.left || leaf.right) {
    if (leaf.left) createRooms(leaf.left, rooms);
    if (leaf.right) createRooms(leaf.right, rooms);
    return;
  }

  const minRoom = GAME.dungeon.minRoomSize;
  const maxRoom = GAME.dungeon.maxRoomSize;

  const w = rngInt(minRoom, Math.min(maxRoom, leaf.w - 2));
  const h = rngInt(minRoom, Math.min(maxRoom, leaf.h - 2));
  const x = rngInt(leaf.x + 1, leaf.x + leaf.w - w - 1);
  const y = rngInt(leaf.y + 1, leaf.y + leaf.h - h - 1);

  leaf.room = { x, y, w, h };
  rooms.push(leaf.room);
}

function getLeafRoom(leaf: Leaf): Room | undefined {
  if (leaf.room) return leaf.room;
  if (leaf.left) {
    const room = getLeafRoom(leaf.left);
    if (room) return room;
  }
  if (leaf.right) {
    const room = getLeafRoom(leaf.right);
    if (room) return room;
  }
  return undefined;
}

function carveRoom(grid: string[][], room: Room): void {
  for (let row = room.y; row < room.y + room.h; row++) {
    for (let col = room.x; col < room.x + room.w; col++) {
      if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
        grid[row][col] = GAME.dungeon.floorChar;
      }
    }
  }
}

function carveCorridor(grid: string[][], x1: number, y1: number, x2: number, y2: number): void {
  const floor = GAME.dungeon.floorChar;

  // L-shaped corridor: go horizontal first, then vertical
  let cx = x1;
  let cy = y1;

  // Horizontal segment
  while (cx !== x2) {
    if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
      grid[cy][cx] = floor;
    }
    cx += cx < x2 ? 1 : -1;
  }

  // Vertical segment
  while (cy !== y2) {
    if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
      grid[cy][cx] = floor;
    }
    cy += cy < y2 ? 1 : -1;
  }

  // Final cell
  if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
    grid[cy][cx] = floor;
  }
}

function connectLeaves(grid: string[][], leaf: Leaf): void {
  if (!leaf.left || !leaf.right) return;

  connectLeaves(grid, leaf.left);
  connectLeaves(grid, leaf.right);

  const roomA = getLeafRoom(leaf.left);
  const roomB = getLeafRoom(leaf.right);

  if (roomA && roomB) {
    const ax = rngInt(roomA.x + 1, roomA.x + roomA.w - 2);
    const ay = rngInt(roomA.y + 1, roomA.y + roomA.h - 2);
    const bx = rngInt(roomB.x + 1, roomB.x + roomB.w - 2);
    const by = rngInt(roomB.y + 1, roomB.y + roomB.h - 2);

    carveCorridor(grid, ax, ay, bx, by);
  }
}

function roomCenter(room: Room): { col: number; row: number } {
  return {
    col: Math.floor(room.x + room.w / 2),
    row: Math.floor(room.y + room.h / 2),
  };
}

export function generateDungeon(): DungeonResult {
  const cols = GAME.dungeon.cols;
  const rows = GAME.dungeon.rows;

  // Fill with walls
  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(GAME.dungeon.wallChar));
  }

  // BSP split
  const root: Leaf = { x: 0, y: 0, w: cols, h: rows };
  const leaves: Leaf[] = [root];
  let didSplit = true;

  while (didSplit) {
    didSplit = false;
    const current = [...leaves];
    for (const leaf of current) {
      if (!leaf.left && !leaf.right) {
        if (leaf.w > GAME.dungeon.minLeafSize * 2 || leaf.h > GAME.dungeon.minLeafSize * 2) {
          if (splitLeaf(leaf, GAME.dungeon.minLeafSize)) {
            leaves.push(leaf.left!);
            leaves.push(leaf.right!);
            didSplit = true;
          }
        }
      }
    }
  }

  // Create rooms in each leaf
  const rooms: Room[] = [];
  createRooms(root, rooms);

  // Carve rooms into grid
  for (const room of rooms) {
    carveRoom(grid, room);
  }

  // Connect siblings with corridors
  connectLeaves(grid, root);

  // Player starts in first room, stairs in last room
  const playerStart = roomCenter(rooms[0]);
  const stairsPos = roomCenter(rooms[rooms.length - 1]);

  // Place stairs
  grid[stairsPos.row][stairsPos.col] = GAME.dungeon.stairsChar;

  return { grid, rooms, stairs: stairsPos, playerStart };
}
