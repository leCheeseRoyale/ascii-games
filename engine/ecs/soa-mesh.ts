/**
 * SoA (Struct-of-Arrays) fast path for image meshes with 500+ cells.
 *
 * When a mesh exceeds the SOA_THRESHOLD, positions, velocities, and spring
 * targets are stored in contiguous Float32Array typed arrays and processed
 * in tight loops — bypassing per-entity ECS overhead, GC pressure, and
 * component lookups.
 *
 * The SoA path is transparent to callers: `engine.spawnImageMesh()` returns
 * `Partial<Entity>[]` either way (a single proxy entity for SoA meshes).
 */

/** Threshold: meshes with this many cells or more use the SoA path. */
export const SOA_THRESHOLD = 500;

export interface SoAMesh {
  readonly meshId: string;
  readonly count: number;
  readonly cols: number;
  readonly rows: number;
  readonly posX: Float32Array;
  readonly posY: Float32Array;
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly homeX: Float32Array;
  readonly homeY: Float32Array;
  readonly srcX: Float32Array;
  readonly srcY: Float32Array;
  readonly srcW: Float32Array;
  readonly srcH: Float32Array;
  readonly cellCol: Uint16Array;
  readonly cellRow: Uint16Array;
  readonly alive: Uint8Array;
  readonly image: HTMLImageElement;
  readonly springStrength: number;
  readonly springDamping: number;
  readonly showLines: boolean;
  readonly lineColor: string;
  readonly lineWidth: number;
  readonly gridIndex: Map<string, number>;
}

export interface CreateSoAMeshOpts {
  meshId: string;
  image: HTMLImageElement;
  cols: number;
  rows: number;
  posX: number;
  posY: number;
  spacingX: number;
  spacingY: number;
  srcW: number;
  srcH: number;
  springStrength: number;
  springDamping: number;
  showLines: boolean;
  lineColor: string;
  lineWidth: number;
  shapeFn?: (row: number, rows: number) => { startCol: number; endCol: number };
}

function gridKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/**
 * Allocate a SoAMesh with typed arrays for all cell data.
 * Arrays are sized to `cols * rows` (max possible cells). The actual `count`
 * may be less when a shapeFn masks out cells.
 */
export function createSoAMesh(opts: CreateSoAMeshOpts): SoAMesh {
  const maxCells = opts.cols * opts.rows;

  const posX = new Float32Array(maxCells);
  const posY = new Float32Array(maxCells);
  const velX = new Float32Array(maxCells);
  const velY = new Float32Array(maxCells);
  const homeX = new Float32Array(maxCells);
  const homeY = new Float32Array(maxCells);
  const srcXArr = new Float32Array(maxCells);
  const srcYArr = new Float32Array(maxCells);
  const srcWArr = new Float32Array(maxCells);
  const srcHArr = new Float32Array(maxCells);
  const cellCol = new Uint16Array(maxCells);
  const cellRow = new Uint16Array(maxCells);
  const alive = new Uint8Array(maxCells);
  const gridIndex = new Map<string, number>();

  let idx = 0;
  for (let row = 0; row < opts.rows; row++) {
    const range = opts.shapeFn ? opts.shapeFn(row, opts.rows) : { startCol: 0, endCol: opts.cols };

    for (let col = range.startCol; col < range.endCol; col++) {
      const x = opts.posX + col * opts.spacingX;
      const y = opts.posY + row * opts.spacingY;

      posX[idx] = x;
      posY[idx] = y;
      homeX[idx] = x;
      homeY[idx] = y;
      velX[idx] = 0;
      velY[idx] = 0;
      srcXArr[idx] = col * opts.srcW;
      srcYArr[idx] = row * opts.srcH;
      srcWArr[idx] = opts.srcW;
      srcHArr[idx] = opts.srcH;
      cellCol[idx] = col;
      cellRow[idx] = row;
      alive[idx] = 1;
      gridIndex.set(gridKey(col, row), idx);
      idx++;
    }
  }

  return {
    meshId: opts.meshId,
    count: idx,
    cols: opts.cols,
    rows: opts.rows,
    posX,
    posY,
    velX,
    velY,
    homeX,
    homeY,
    srcX: srcXArr,
    srcY: srcYArr,
    srcW: srcWArr,
    srcH: srcHArr,
    cellCol,
    cellRow,
    alive,
    image: opts.image,
    springStrength: opts.springStrength,
    springDamping: opts.springDamping,
    showLines: opts.showLines,
    lineColor: opts.lineColor,
    lineWidth: opts.lineWidth,
    gridIndex,
  };
}

/**
 * Apply spring forces to all alive cells.
 * Matches the ECS spring system formula exactly:
 *   vel += (home - pos) * strength
 *   vel *= damping
 * Note: no dt scaling — same as the ECS `_spring` system.
 */
export function updateSoAMeshSprings(mesh: SoAMesh): void {
  const { posX, posY, velX, velY, homeX, homeY, alive, count } = mesh;
  const strength = mesh.springStrength;
  const damping = mesh.springDamping;

  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;

    velX[i] += (homeX[i] - posX[i]) * strength;
    velY[i] += (homeY[i] - posY[i]) * strength;
    velX[i] *= damping;
    velY[i] *= damping;
  }
}

/**
 * Integrate velocity into position for all alive cells.
 * Matches the ECS physics system: `pos += vel * dt`.
 */
export function updateSoAMeshPhysics(mesh: SoAMesh, dt: number): void {
  const { posX, posY, velX, velY, alive, count } = mesh;

  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;

    posX[i] += velX[i] * dt;
    posY[i] += velY[i] * dt;
  }
}

/**
 * Render a SoA mesh: image slices centered on positions, plus optional
 * lines between neighboring cells.
 */
export function renderSoAMesh(ctx: CanvasRenderingContext2D, mesh: SoAMesh): void {
  const {
    posX,
    posY,
    srcX,
    srcY,
    srcW,
    srcH,
    cellCol,
    cellRow,
    alive,
    count,
    image,
    showLines,
    lineColor,
    lineWidth,
    gridIndex,
  } = mesh;

  // --- Pass 1: draw lines between neighbors (behind image slices) ---
  if (showLines) {
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;

    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const col = cellCol[i];
      const row = cellRow[i];
      const x = posX[i];
      const y = posY[i];

      // Right neighbor
      const rightIdx = gridIndex.get(gridKey(col + 1, row));
      if (rightIdx !== undefined && alive[rightIdx]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(posX[rightIdx], posY[rightIdx]);
        ctx.stroke();
      }

      // Bottom neighbor
      const belowIdx = gridIndex.get(gridKey(col, row + 1));
      if (belowIdx !== undefined && alive[belowIdx]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(posX[belowIdx], posY[belowIdx]);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // --- Pass 2: draw image slices (on top of lines) ---
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;

    const w = srcW[i];
    const h = srcH[i];

    ctx.drawImage(image, srcX[i], srcY[i], w, h, posX[i] - w / 2, posY[i] - h / 2, w, h);
  }
}

/**
 * Apply a radial force to all alive cells within radius of (fx, fy).
 * Used by cursor-repel to warp SoA meshes.
 */
export function applySoAMeshForce(
  mesh: SoAMesh,
  fx: number,
  fy: number,
  radius: number,
  force: number,
): void {
  const { posX, posY, velX, velY, alive, count } = mesh;
  const radiusSq = radius * radius;

  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;

    const dx = posX[i] - fx;
    const dy = posY[i] - fy;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radiusSq || distSq < 0.01) continue;

    const dist = Math.sqrt(distSq);
    const f = force * ((radius - dist) / radius);
    velX[i] += (dx / dist) * f;
    velY[i] += (dy / dist) * f;
  }
}

/**
 * Mark a cell as dead. It will be skipped by spring, physics, and render.
 */
export function destroySoAMeshCell(mesh: SoAMesh, index: number): void {
  if (index >= 0 && index < mesh.count) {
    mesh.alive[index] = 0;
  }
}
