# Image Mesh — Text Characters as Image Vertices

## Concept

Text characters, positioned by Pretext at spawn time, serve as **vertices in a deformable mesh**. An image is loaded once, subdivided into a grid, and each cell is rendered at its corresponding character entity's position. Lines drawn between adjacent characters visualize the mesh structure. Because characters are full ECS entities with spring physics, the image deforms in real-time — cursor repel warps it, blasts tear it apart, and springs pull it back together.

This is Canvas 2D mesh deformation without WebGL. The vertices are text entities. The texture is a subdivided image. The physics are springs. Pretext computes the home positions once; the frame loop is pure arithmetic + `ctx.drawImage` per cell.

## Why this works at 60fps

```
Spawn time (once):
  image loaded → grid dimensions computed → Pretext measures character positions
  → N entities spawned with spring homes at grid positions
  → each entity gets a meshCell component pointing to its image slice

Every frame (zero DOM, zero Pretext):
  spring forces → velocity integration → position update
  → ctx.drawImage(slice, entity.x, entity.y) per cell
  → ctx.lineTo(neighbor.x, neighbor.y) per edge
```

For an 8×6 mesh: 48 position updates + 48 drawImage calls + ~96 line segments. Trivial.

## Architecture

### New component: `meshCell`

Added to `shared/types.ts`:

```ts
interface MeshCell {
  /** Shared image element (loaded once, referenced by all cells in the mesh) */
  image: HTMLImageElement;
  /** Source rectangle in the image for this cell */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** Grid position for adjacency lookups */
  col: number;
  row: number;
  /** Groups cells into one mesh (for multi-mesh scenes) */
  meshId: string;
  /** Total grid dimensions (for adjacency bounds checking) */
  cols: number;
  rows: number;
  /** Visual options */
  lineColor?: string;
  lineWidth?: number;
  showLines?: boolean;
}
```

### New engine method: `engine.spawnImageMesh(opts)`

```ts
interface SpawnImageMeshOpts {
  /** URL or preloaded HTMLImageElement */
  image: string | HTMLImageElement;
  /** Grid dimensions — image is subdivided into cols × rows cells */
  cols: number;
  rows: number;
  /** Top-left position of the mesh in world space */
  position: { x: number; y: number };
  /** Character to use for each cell (default: '█') */
  char?: string;
  /** Font for character measurement (determines cell size) */
  font?: string;
  /** Spring preset for home-pull behavior */
  spring?: { strength: number; damping: number };
  /** Whether to draw lines between adjacent cells */
  showLines?: boolean;
  /** Color of the mesh lines (default: '#333') */
  lineColor?: string;
  /** Width of mesh lines in pixels (default: 1) */
  lineWidth?: number;
  /** Tags applied to every cell entity */
  tags?: string[];
  /** Render layer for the mesh cells */
  layer?: number;
}
```

Returns `Partial<Entity>[]` — all spawned cell entities.

Under the hood:
1. Load the image (via `engine.preloader` if string URL, or use directly if HTMLImageElement)
2. Compute cell dimensions: `cellW = image.width / cols`, `cellH = image.height / rows`
3. Use Pretext to measure the character width/height for positioning grid spacing
4. For each (col, row), spawn an entity with:
   - `position: { x: position.x + col * spacingX, y: position.y + row * spacingY }`
   - `spring: { targetX: <same>, targetY: <same>, strength, damping }`
   - `velocity: { vx: 0, vy: 0 }`
   - `meshCell: { image, srcX: col * cellW, srcY: row * cellH, srcW: cellW, srcH: cellH, col, row, meshId, cols, rows, showLines, lineColor, lineWidth }`
   - `ascii: { char, font, color: 'transparent' }` (invisible text, used for Pretext measurement and collision sizing)
   - `collider: 'auto'`
   - `tags` if provided
5. Return the array of entities

### New built-in system: `_meshRender`

Runs during the render phase (after the main ascii renderer). For each entity with `meshCell`:

1. **Draw the image slice** at the entity's current position:
   ```ts
   ctx.drawImage(
     cell.image,
     cell.srcX, cell.srcY, cell.srcW, cell.srcH,    // source rect
     pos.x - cell.srcW/2, pos.y - cell.srcH/2,      // dest position (centered)
     cell.srcW, cell.srcH                             // dest size
   );
   ```

2. **Draw lines to right and bottom neighbors** (avoids double-drawing):
   ```ts
   if (cell.showLines) {
     const right = findNeighbor(meshId, col+1, row);
     const below = findNeighbor(meshId, col, row+1);
     if (right) drawLine(pos, right.position, cell.lineColor, cell.lineWidth);
     if (below) drawLine(pos, below.position, cell.lineColor, cell.lineWidth);
   }
   ```

Neighbor lookup: query `engine.world.with('meshCell')`, filter by `meshId`, `col`, `row`. Cache the grid lookup per mesh per frame to avoid O(N²).

### Line physics (optional extension)

Lines between cells can have behavior:
- **Opacity by stretch:** `opacity = 1 - (stretchDist / maxStretch)` — lines fade as mesh stretches
- **Snap threshold:** if distance between neighbors exceeds `maxStretch`, the line disappears (mesh tears)
- **Color by tension:** lerp from `lineColor` to red as stretch increases

## Interactions with existing systems

The mesh cells are normal ECS entities. All existing systems work automatically:

| System | Effect on mesh |
|--------|---------------|
| `_spring` | Pulls cells back to home positions (image reforms) |
| `_physics` | Integrates velocity, applies gravity/friction/drag |
| `createCursorRepelSystem` | Cursor warps the image by pushing cells |
| `engine.onCollide` | Other entities can collide with mesh cells |
| `engine.destroy(cell)` | Destroying a cell removes that image slice (image tears) |
| `engine.particles.burst` | Particles at cell position on destruction |
| `_lifetime` | Cells can auto-destroy (timed image dissolution) |
| `_tween` | Tween cell opacity for fade effects |

## Usage examples

### Basic: Interactive portrait
```ts
const face = engine.spawnImageMesh({
  image: 'assets/portrait.png',
  cols: 10, rows: 12,
  position: { x: engine.centerX, y: engine.centerY },
  spring: SpringPresets.bouncy,
  showLines: false,
});
engine.addSystem(createCursorRepelSystem({ radius: 120 }));
// Cursor warps the face; release and it springs back
```

### Destructible sprite
```ts
const enemy = engine.spawnImageMesh({
  image: 'assets/dragon.png',
  cols: 8, rows: 6,
  position: { x: 400, y: 200 },
  spring: SpringPresets.stiff,
  showLines: true,
  lineColor: '#ff000044',
  tags: ['enemy'],
});

// When bullet hits a mesh cell, destroy that cell
engine.onCollide('bullet', 'enemy', (bullet, cell) => {
  engine.destroy(bullet);
  engine.destroy(cell); // image slice disappears
  engine.particles.burst({ x: cell.position.x, y: cell.position.y, count: 5, chars: ['░','▒'], color: '#ff4444' });
  engine.camera.shake(3);
});
```

### Terrain deformation
```ts
const terrain = engine.spawnImageMesh({
  image: 'assets/landscape.png',
  cols: 20, rows: 4,
  position: { x: 0, y: engine.height - 100 },
  spring: { strength: 0.04, damping: 0.95 }, // slow recovery
  showLines: true,
  lineColor: '#44ff4433',
});

// Explosions deform terrain
function detonatAt(x: number, y: number) {
  for (const cell of engine.world.with('meshCell', 'position', 'velocity')) {
    const dx = cell.position.x - x;
    const dy = cell.position.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 100) {
      const force = 500 * (1 - dist / 100);
      cell.velocity.vx += (dx / dist) * force;
      cell.velocity.vy += (dy / dist) * force;
    }
  }
}
```

### Wireframe mode (lines only, no image)
```ts
const wireframe = engine.spawnImageMesh({
  image: 'assets/shape.png',  // image exists but rendered transparent
  cols: 12, rows: 12,
  position: { x: 300, y: 300 },
  spring: SpringPresets.floaty,
  showLines: true,
  lineColor: '#00ffcc',
  lineWidth: 2,
  char: '·', // visible dot at each vertex
});
// Now you have a physics-driven wireframe. Cursor repel creates organic deformations.
```

## Implementation files

| File | Changes |
|------|---------|
| `shared/types.ts` | Add `MeshCell` interface to Entity |
| `engine/core/engine.ts` | Add `spawnImageMesh()` method |
| `engine/ecs/mesh-render-system.ts` | New system: renders image slices + lines |
| `engine/ecs/systems.ts` | Register `_meshRender` as built-in |
| `engine/index.ts` | Export `MeshCell` type and any new helpers |
| `engine/__tests__/ecs/mesh-render.test.ts` | Unit tests |

Estimated: ~200-300 lines of new engine code.

## Performance notes

- Image is loaded once, shared across all cells via reference (not copied)
- `ctx.drawImage` with source rect is hardware-accelerated on all browsers
- Grid neighbor lookup is cached per mesh per frame (Map keyed by `${meshId}:${col}:${row}`)
- For large meshes (20×20 = 400 cells), spring system is O(N), render is O(N), lines are O(N). All linear.
- Memory: each cell is one entity (~20 component fields). 400 entities is well within the engine's tested range (1249 tests pass with 1000+ entity stress tests)
