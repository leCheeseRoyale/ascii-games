/**
 * FOV System — Fog of war rendering (no phase, runs every frame).
 *
 * Uses dual-layer tilemaps:
 *   - A dim "memory" layer showing previously seen cells.
 *   - A bright "visible" layer rebuilt each turn showing only cells
 *     in the current FOV set.
 *
 * Also toggles visibility of entities (enemies, items) based on FOV.
 */

import {
  createTilemap,
  defineSystem,
  type Engine,
} from "@engine";
import { GAME } from "../config";
import { computeFOV } from "../utils/fov";
import { getDungeonGrid, setVisibleCells, getVisibleCells } from "../scenes/play";

/** Set of cells the player has ever seen, stored as "col,row" strings. */
let explored = new Set<string>();

/** Entity references for the two tilemap layers. */
let memoryEntity: any = null;
let visibleEntity: any = null;

/** Last player position (to avoid recomputing FOV when player hasn't moved). */
let lastCol = -1;
let lastRow = -1;

export const fovSystem = defineSystem({
  name: "fov",

  init(engine: Engine) {
    explored = new Set();
    memoryEntity = null;
    visibleEntity = null;
    lastCol = -1;
    lastRow = -1;

    // Build initial empty tilemaps
    rebuildTilemaps(engine);
  },

  update(engine: Engine) {
    const player = engine.findByTag("player");
    if (!player?.gridPos) return;

    const col = player.gridPos.col;
    const row = player.gridPos.row;

    // Only recompute when player moves
    if (col === lastCol && row === lastRow) {
      updateEntityVisibility(engine);
      return;
    }

    lastCol = col;
    lastRow = row;

    const dungeonGrid = getDungeonGrid();
    if (!dungeonGrid) return;

    // Compute FOV
    const visible = computeFOV(dungeonGrid, col, row, GAME.player.fovRadius, GAME.dungeon.wallChar);
    setVisibleCells(visible);

    // Add visible cells to explored set
    for (const key of visible) {
      explored.add(key);
    }

    // Rebuild tilemap layers
    rebuildTilemaps(engine, visible);
    updateEntityVisibility(engine);
  },
});

function rebuildTilemaps(engine: Engine, visible?: Set<string>): void {
  const dungeonGrid = getDungeonGrid();
  if (!dungeonGrid) return;

  const rows = dungeonGrid.length;
  const cols = dungeonGrid[0]?.length ?? 0;

  // Build memory layer (explored but not currently visible)
  const memoryData: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (explored.has(key) && (!visible || !visible.has(key))) {
        line += dungeonGrid[r][c];
      } else {
        line += " ";
      }
    }
    memoryData.push(line);
  }

  // Build visible layer (currently in FOV)
  const visibleData: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (visible?.has(key)) {
        line += dungeonGrid[r][c];
      } else {
        line += " ";
      }
    }
    visibleData.push(line);
  }

  const wallChar = GAME.dungeon.wallChar;
  const floorChar = GAME.dungeon.floorChar;
  const stairsChar = GAME.dungeon.stairsChar;

  const dimLegend: Record<string, { color?: string; solid?: boolean }> = {
    [wallChar]: { color: "#333333", solid: true },
    [floorChar]: { color: "#1a1a1a" },
    [stairsChar]: { color: "#665500" },
    " ": { color: "transparent" },
  };

  const brightLegend: Record<string, { color?: string; solid?: boolean }> = {
    [wallChar]: { color: GAME.dungeon.wallColor, solid: true },
    [floorChar]: { color: GAME.dungeon.floorColor },
    [stairsChar]: { color: GAME.dungeon.stairsColor },
    " ": { color: "transparent" },
  };

  // Remove old tilemap entities
  if (memoryEntity) {
    try { engine.destroy(memoryEntity); } catch { /* already destroyed */ }
  }
  if (visibleEntity) {
    try { engine.destroy(visibleEntity); } catch { /* already destroyed */ }
  }

  // Spawn memory layer (behind everything)
  memoryEntity = engine.spawn({
    position: { x: 0, y: 0 },
    ...createTilemap(memoryData, GAME.cellSize, dimLegend, { layer: -20 }),
  });

  // Spawn visible layer (above memory, below entities)
  visibleEntity = engine.spawn({
    position: { x: 0, y: 0 },
    ...createTilemap(visibleData, GAME.cellSize, brightLegend, { layer: -10 }),
  });
}

function updateEntityVisibility(engine: Engine): void {
  const visible = getVisibleCells();

  // Hide/show enemies based on FOV
  for (const enemy of engine.findAllByTag("enemy")) {
    if (enemy.gridPos && enemy.ascii) {
      const key = `${enemy.gridPos.col},${enemy.gridPos.row}`;
      enemy.ascii.opacity = visible.has(key) ? 1 : 0;
    }
  }

  // Hide/show items based on FOV
  for (const item of engine.findAllByTag("item")) {
    if (item.gridPos && item.ascii) {
      const key = `${item.gridPos.col},${item.gridPos.row}`;
      item.ascii.opacity = visible.has(key) ? 1 : 0;
    }
  }
}

/** Reset explored state (called on new dungeon generation). */
export function resetExplored(): void {
  explored = new Set();
  memoryEntity = null;
  visibleEntity = null;
  lastCol = -1;
  lastRow = -1;
}
