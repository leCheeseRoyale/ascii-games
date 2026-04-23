/**
 * Shape presets for non-rectangular image meshes.
 * A shape function receives a row index and total rows, returns which columns are active.
 */

export type MeshShapeFn = (row: number, rows: number) => { startCol: number; endCol: number };
export type MeshShape = "circle" | "diamond" | "triangle" | MeshShapeFn;

export function resolveShape(shape: MeshShape, cols: number): MeshShapeFn {
  if (typeof shape === "function") return shape;
  switch (shape) {
    case "circle":
      return circleShape(cols);
    case "diamond":
      return diamondShape(cols);
    case "triangle":
      return triangleShape(cols);
  }
}

function circleShape(cols: number): MeshShapeFn {
  return (row, rows) => {
    if (rows <= 0 || cols <= 0) return { startCol: 0, endCol: 0 };
    const cy = (rows - 1) / 2;
    const cx = (cols - 1) / 2;
    const ry = rows / 2;
    const rx = cols / 2;
    const dy = (row - cy) / ry;
    const halfW = Math.sqrt(Math.max(0, 1 - dy * dy)) * rx;
    const startCol = Math.max(0, Math.floor(cx - halfW));
    const endCol = Math.min(cols, Math.ceil(cx + halfW) + 1);
    return { startCol, endCol };
  };
}

function diamondShape(cols: number): MeshShapeFn {
  return (row, rows) => {
    if (rows <= 0 || cols <= 0) return { startCol: 0, endCol: 0 };
    const cy = (rows - 1) / 2;
    // Avoid divide-by-zero when rows=1 (cy=0): treat single row as full width
    const dist = cy === 0 ? 0 : Math.abs(row - cy) / cy;
    const halfW = (1 - dist) * (cols / 2);
    const cx = (cols - 1) / 2;
    const startCol = Math.max(0, Math.floor(cx - halfW));
    const endCol = Math.min(cols, Math.ceil(cx + halfW) + 1);
    return { startCol, endCol };
  };
}

function triangleShape(cols: number): MeshShapeFn {
  return (row, rows) => {
    if (rows <= 0 || cols <= 0) return { startCol: 0, endCol: 0 };
    const progress = rows <= 1 ? 1 : row / (rows - 1); // 0 at top, 1 at bottom
    const halfW = Math.max(0.5, progress * (cols / 2));
    const cx = (cols - 1) / 2;
    const startCol = Math.max(0, Math.floor(cx - halfW));
    const endCol = Math.min(cols, Math.ceil(cx + halfW) + 1);
    return { startCol, endCol };
  };
}
