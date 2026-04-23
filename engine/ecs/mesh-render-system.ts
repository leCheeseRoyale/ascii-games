/**
 * Mesh Render System — draws image slices and connecting lines for meshCell entities.
 *
 * Mesh cells are spawned by `engine.spawnImageMesh()`. Each cell entity holds a
 * `meshCell` component that references a shared HTMLImageElement and describes
 * which rectangular slice of that image this cell renders.
 *
 * This system runs AFTER screenBounds (priority 85) so all positions are final.
 * During its update tick it is a no-op — the actual drawing is performed by
 * `renderMeshCells()`, which the renderer calls inside the camera transform.
 */

import type { MeshCell, Position } from "@shared/types";
import type { Engine } from "../core/engine";
import { type System, SystemPriority } from "./systems";
import type { GameWorld } from "./world";

/** Priority: after screenBounds (80). */
const MESH_RENDER_PRIORITY = SystemPriority.screenBounds + 5; // 85

/**
 * Built-in system registered in the system runner. The update tick itself is a
 * no-op — mesh rendering is driven by `renderMeshCells()` which the renderer
 * calls during its draw pass (inside the camera transform).
 */
export const meshRenderSystem: System = {
  name: "_meshRender",
  priority: MESH_RENDER_PRIORITY,

  update(_engine: Engine, _dt: number) {
    // Intentionally empty — rendering is handled by renderMeshCells() called
    // from the renderer's draw pass so it runs inside the camera transform.
  },
};

// ── Grid cache types ───────────────────────────────────────────────

interface CellEntry {
  position: Position;
  meshCell: MeshCell;
}

type GridCache = Map<string, Map<string, CellEntry>>;

function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/**
 * Build a grid lookup: meshId -> (col:row -> cell entity).
 * Rebuilt each frame because entities may be destroyed at any time.
 */
function buildGridCache(cells: Iterable<{ position: Position; meshCell: MeshCell }>): GridCache {
  const cache: GridCache = new Map();

  for (const cell of cells) {
    const id = cell.meshCell.meshId;
    let grid = cache.get(id);
    if (!grid) {
      grid = new Map();
      cache.set(id, grid);
    }
    grid.set(cellKey(cell.meshCell.col, cell.meshCell.row), {
      position: cell.position,
      meshCell: cell.meshCell,
    });
  }

  return cache;
}

// ── Render function (called by AsciiRenderer inside camera transform) ──

/**
 * Draw all mesh cells: image slices centered on entity positions, plus optional
 * lines to right and bottom neighbors. Called by the renderer after regular
 * renderables and particles, while the camera transform is still active.
 */
export function renderMeshCells(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  const cells = world.with("meshCell", "position");

  // Fast bail-out — avoid building the cache when there are no mesh cells.
  // Materialize into an array so we can iterate twice (cache build + draw).
  const cellArray: { position: Position; meshCell: MeshCell }[] = [];
  for (const c of cells) {
    cellArray.push(c);
  }
  if (cellArray.length === 0) return;

  const cache = buildGridCache(cellArray);

  // --- Pass 1: draw lines (behind the image slices) ---
  for (const entry of cellArray) {
    const mc = entry.meshCell;
    if (!mc.showLines) continue;

    const pos = entry.position;
    const grid = cache.get(mc.meshId);
    if (!grid) continue;

    const lineColor = mc.lineColor ?? "#333";
    const lineWidth = mc.lineWidth ?? 1;

    // Right neighbor
    if (mc.col + 1 < mc.cols) {
      const right = grid.get(cellKey(mc.col + 1, mc.row));
      if (right) {
        drawMeshLine(ctx, pos, right.position, lineColor, lineWidth);
      }
    }

    // Bottom neighbor
    if (mc.row + 1 < mc.rows) {
      const below = grid.get(cellKey(mc.col, mc.row + 1));
      if (below) {
        drawMeshLine(ctx, pos, below.position, lineColor, lineWidth);
      }
    }
  }

  // --- Pass 2: draw image slices (on top of lines) ---
  for (const entry of cellArray) {
    const mc = entry.meshCell;
    const pos = entry.position;

    ctx.drawImage(
      mc.image,
      // Source rect
      mc.srcX,
      mc.srcY,
      mc.srcW,
      mc.srcH,
      // Destination rect (centered on entity position)
      pos.x - mc.srcW / 2,
      pos.y - mc.srcH / 2,
      mc.srcW,
      mc.srcH,
    );
  }
}

/** Draw a single mesh edge between two cell positions. */
function drawMeshLine(
  ctx: CanvasRenderingContext2D,
  from: Position,
  to: Position,
  color: string,
  width: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}
