/**
 * Tilemap — render a grid of ASCII characters and check tile collisions.
 *
 * Usage:
 *   import { createTilemap, isSolidAt } from '@engine'
 *
 *   const map = createTilemap(
 *     ['########', '#......#', '#.@..$.#', '########'],
 *     24,
 *     { '#': { color: '#888', solid: true }, '.': { color: '#333' }, '$': { color: '#ff0' } },
 *   )
 *   engine.spawn({ position: { x: 0, y: 0 }, ...map })
 */

import type { TileLegendEntry, TilemapComponent } from "@shared/types";
import { worldToGrid } from "../utils/grid";

/**
 * Create a tilemap component from an array of strings.
 * Each character in the strings maps to a legend entry.
 */
export function createTilemap(
  data: string[],
  cellSize: number,
  legend: Record<string, TileLegendEntry>,
  opts?: { offsetX?: number; offsetY?: number; font?: string; layer?: number },
): { tilemap: TilemapComponent } {
  return {
    tilemap: {
      data,
      legend,
      cellSize,
      offsetX: opts?.offsetX ?? 0,
      offsetY: opts?.offsetY ?? 0,
      font: opts?.font,
      layer: opts?.layer ?? -10,
    },
  };
}

/**
 * Check if a world position is on a solid tile.
 */
export function isSolidAt(tilemap: TilemapComponent, worldX: number, worldY: number): boolean {
  const { col, row } = worldToGrid(
    worldX - tilemap.offsetX,
    worldY - tilemap.offsetY,
    tilemap.cellSize,
  );

  if (row < 0 || row >= tilemap.data.length) return false;
  const line = tilemap.data[row];
  if (col < 0 || col >= line.length) return false;

  const char = line[col];
  const entry = tilemap.legend[char];
  return entry?.solid === true;
}

/**
 * Get the tile character at a world position.
 */
export function tileAt(tilemap: TilemapComponent, worldX: number, worldY: number): string | null {
  const { col, row } = worldToGrid(
    worldX - tilemap.offsetX,
    worldY - tilemap.offsetY,
    tilemap.cellSize,
  );

  if (row < 0 || row >= tilemap.data.length) return null;
  const line = tilemap.data[row];
  if (col < 0 || col >= line.length) return null;
  return line[col];
}
