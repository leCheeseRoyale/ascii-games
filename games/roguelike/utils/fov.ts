/**
 * Field of View — Simplified recursive shadowcasting.
 *
 * Returns a set of visible cell keys as "col,row" strings.
 * Walls block vision but are themselves visible (so the player can see walls).
 */

// Octant multipliers for shadowcasting
const OCTANT_MULTIPLIERS = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

function isBlocking(grid: string[][], col: number, row: number, wallChar: string): boolean {
  if (row < 0 || row >= grid.length) return true;
  if (col < 0 || col >= grid[0].length) return true;
  return grid[row][col] === wallChar;
}

function castLight(
  grid: string[][],
  visible: Set<string>,
  cx: number,
  cy: number,
  radius: number,
  row: number,
  startSlope: number,
  endSlope: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  wallChar: string,
): void {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;

  for (let i = row; i <= radius; i++) {
    let blocked = false;

    for (let dx = -i, dy = -i; dx <= 0; dx++) {
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      const mapX = cx + dx * xx + dy * xy;
      const mapY = cy + dx * yx + dy * yy;

      // Check if within radius
      const distSq = dx * dx + dy * dy;
      if (distSq <= radius * radius) {
        if (mapY >= 0 && mapY < grid.length && mapX >= 0 && mapX < grid[0].length) {
          visible.add(`${mapX},${mapY}`);
        }
      }

      if (blocked) {
        if (isBlocking(grid, mapX, mapY, wallChar)) {
          nextStartSlope = rSlope;
          continue;
        }
        blocked = false;
        startSlope = nextStartSlope;
      } else if (isBlocking(grid, mapX, mapY, wallChar) && i < radius) {
        blocked = true;
        castLight(
          grid,
          visible,
          cx,
          cy,
          radius,
          i + 1,
          startSlope,
          lSlope,
          xx,
          xy,
          yx,
          yy,
          wallChar,
        );
        nextStartSlope = rSlope;
      }
    }

    if (blocked) break;
  }
}

/**
 * Compute field of view from a position on the grid.
 * Returns a set of "col,row" strings for all visible cells.
 */
export function computeFOV(
  grid: string[][],
  col: number,
  row: number,
  radius: number,
  wallChar = "#",
): Set<string> {
  const visible = new Set<string>();

  // Origin is always visible
  visible.add(`${col},${row}`);

  // Cast light in all 8 octants
  for (const [xx, xy, yx, yy] of OCTANT_MULTIPLIERS) {
    castLight(grid, visible, col, row, radius, 1, 1.0, 0.0, xx, xy, yx, yy, wallChar);
  }

  return visible;
}
