# Mesh Interactions

Recipes for interactive image meshes: grabbing, pushing, tearing, pinning, and combining systems. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Quick Reference

One-liner for each mesh interaction system. All factory functions return a system you pass to `engine.addSystem()`.

```ts
import {
  createCursorRepelSystem,     // cursor pushes cells away
  createAmbientDriftSystem,    // gentle sine-wave floating
  createMeshGrabSystem,        // click-drag mesh cells
  createMeshInputForceSystem,  // WASD / gamepad stick pushes cells
  createMeshTearSystem,        // cells rip off when stretched too far
  createMeshPinSystem,         // lock rows/columns/corners in place
  SpringPresets,
} from "@engine";

engine.addSystem(createCursorRepelSystem({ radius: 100, force: 300 }));
engine.addSystem(createAmbientDriftSystem({ amplitude: 0.3, speed: 0.5 }));
engine.addSystem(createMeshGrabSystem({ grabRadius: 40, pullForce: 600 }));
engine.addSystem(createMeshInputForceSystem({ force: 400, radius: 120 }));
engine.addSystem(createMeshTearSystem({ threshold: 80 }));
engine.addSystem(createMeshPinSystem({ pin: "top" }));
```

All systems work on both ECS mesh cells (< 500 cells) and SoA meshes (500+ cells) automatically.

## Grab-and-Drag

Click or touch a mesh cell and drag it around. The grabbed cell follows the cursor with a configurable pull force, and nearby cells get pushed aside.

```ts
import {
  defineScene,
  createMeshGrabSystem,
  SpringPresets,
  type Engine,
} from "@engine";

export const grabScene = defineScene({
  name: "grab-demo",
  setup(engine: Engine) {
    engine.spawnImageMesh({
      image: preloadedImg,
      cols: 10, rows: 8,
      position: { x: 200, y: 100 },
      spring: SpringPresets.bouncy,
      showLines: true,
      lineColor: "rgba(100, 200, 255, 0.3)",
    });

    engine.addSystem(createMeshGrabSystem({
      grabRadius: 50,       // how close the click must be to grab a cell
      pullForce: 800,       // how hard the cell chases the cursor
      neighborForce: 200,   // radial push on nearby cells while dragging
      neighborRadius: 100,  // radius of the neighbor push
      button: 0,            // 0 = left click (default)
    }));
  },
});
```

**Key parameters:**

| Parameter | Default | Effect |
|---|---|---|
| `grabRadius` | 40 | Max pixel distance to acquire a grab target |
| `pullForce` | 600 | Spring-like pull toward cursor (higher = snappier) |
| `neighborForce` | 150 | Pushes nearby cells away from the drag point |
| `neighborRadius` | 80 | Range of the neighbor push |
| `button` | 0 | Mouse button (0 = left, 1 = middle, 2 = right) |
| `tag` | -- | Only grab cells with this tag |

The grab acquires a target on mouse-down (closest cell within `grabRadius`), then pulls it every frame while held. Release to let the spring pull everything back.

## Keyboard/Gamepad Control

Push mesh cells with WASD, arrow keys, or a gamepad left stick. Two origin modes control where the force radiates from.

### Cursor-origin mode (default)

Force radiates from the mouse position. Move the cursor over the mesh, then press WASD to push cells in that direction.

```ts
import { createMeshInputForceSystem } from "@engine";

engine.addSystem(createMeshInputForceSystem({
  force: 400,
  radius: 120,
  origin: "cursor",  // force centered on mouse position (default)
}));
```

### Center-origin mode

Force radiates from the screen center. Good for gamepad-only setups where there is no cursor.

```ts
engine.addSystem(createMeshInputForceSystem({
  force: 500,
  radius: 200,
  origin: "center",  // force centered on screen center
}));
```

**Key parameters:**

| Parameter | Default | Effect |
|---|---|---|
| `force` | 400 | Strength per frame (with distance falloff) |
| `radius` | 120 | Only cells within this range are affected |
| `origin` | `"cursor"` | `"cursor"` = mouse position, `"center"` = screen center |
| `tag` | -- | Only affect cells with this tag |

The system reads `engine.keyboard.held()` for WASD/arrows and `engine.gamepad.stick("left")` for analog input. Direction is normalized, so diagonal input is the same magnitude as cardinal.

## Tearable Images

Cells rip off when their displacement from home exceeds a threshold. Particles burst at the tear point.

```ts
import {
  createMeshTearSystem,
  createCursorRepelSystem,
  SpringPresets,
  type Engine,
} from "@engine";

export const tearScene = defineScene({
  name: "tear-demo",
  setup(engine: Engine) {
    engine.spawnImageMesh({
      image: preloadedImg,
      cols: 12, rows: 10,
      position: { x: 150, y: 80 },
      spring: SpringPresets.smooth,  // moderate spring = easier to tear
      showLines: true,
      lineColor: "#ff440033",
      tags: ["tearable"],
    });

    // Push cells hard enough to exceed the tear threshold
    engine.addSystem(createCursorRepelSystem({ radius: 120, force: 500 }));

    // Cells tear when displaced > 60px from home
    engine.addSystem(createMeshTearSystem({
      threshold: 60,
      particles: true,
      particleCount: 4,
      particleColor: "#ff8844",
    }));
  },
});
```

**Key parameters:**

| Parameter | Default | Effect |
|---|---|---|
| `threshold` | 80 | Distance in px from home before cell is destroyed |
| `particles` | `true` | Spawn particle burst on tear |
| `particleCount` | 3 | Particles per destroyed cell |
| `particleColor` | `"#fff"` | Particle color |
| `tag` | -- | Only tear cells with this tag |

Lower `threshold` = easier to tear. Pair with a weaker spring preset (`smooth` or `floaty`) so cells travel farther before snapping back.

## Cloth Simulation

Pin the top row of a mesh, apply gravity, and let the remaining cells hang like cloth. The spring system acts as the constraint solver.

```ts
import {
  createMeshPinSystem,
  createCursorRepelSystem,
  SpringPresets,
  type Engine,
} from "@engine";

export const clothScene = defineScene({
  name: "cloth-demo",
  setup(engine: Engine) {
    const cells = engine.spawnImageMesh({
      image: preloadedImg,
      cols: 14, rows: 10,
      position: { x: 100, y: 60 },
      spring: { strength: 0.06, damping: 0.92 },  // soft spring for cloth feel
      showLines: true,
      lineColor: "rgba(200, 200, 255, 0.25)",
      tags: ["cloth"],
    });

    // Add downward gravity to every cell
    for (const cell of cells) {
      if (cell.physics) {
        cell.physics.gravity = 200;
      }
    }

    // Pin the top row — these cells stay locked at their home position
    engine.addSystem(createMeshPinSystem({ pin: "top", tag: "cloth" }));

    // Poke the cloth with the cursor
    engine.addSystem(createCursorRepelSystem({ radius: 80, force: 250, tag: "cloth" }));
  },
});
```

### Pin selector reference

The `pin` option accepts a preset string or a custom function:

```ts
// Preset selectors
createMeshPinSystem({ pin: "top" });      // row 0
createMeshPinSystem({ pin: "bottom" });   // last row
createMeshPinSystem({ pin: "left" });     // column 0
createMeshPinSystem({ pin: "right" });    // last column
createMeshPinSystem({ pin: "corners" });  // four corner cells only

// Custom function — pin every other cell on the top row
createMeshPinSystem({
  pin: (col, row, _cols, _rows) => row === 0 && col % 2 === 0,
});

// Pin a horizontal stripe through the middle
createMeshPinSystem({
  pin: (_col, row, _cols, rows) => row === Math.floor(rows / 2),
});
```

Type signature: `(col: number, row: number, cols: number, rows: number) => boolean`

**Cloth tuning tips:**
- Lower spring `strength` (0.03--0.06) makes the cloth feel heavier and droopier.
- Higher `damping` (0.93--0.96) reduces oscillation so it settles faster.
- Increase gravity (150--300) for heavier fabric, decrease (50--100) for silk.
- Pin corners only (`pin: "corners"`) for a hammock or banner effect.

## Combining Systems

Stack multiple interaction systems for a fully interactive, destructible mesh. Systems compose -- each one applies forces or constraints independently, and the spring integrator resolves everything each frame.

```ts
import {
  defineScene,
  createCursorRepelSystem,
  createMeshGrabSystem,
  createMeshTearSystem,
  createMeshPinSystem,
  createAmbientDriftSystem,
  SpringPresets,
  type Engine,
} from "@engine";

export const combinedScene = defineScene({
  name: "combined-demo",
  setup(engine: Engine) {
    const cells = engine.spawnImageMesh({
      image: preloadedImg,
      cols: 12, rows: 10,
      position: { x: 120, y: 80 },
      spring: SpringPresets.smooth,
      showLines: true,
      lineColor: "rgba(255, 100, 100, 0.3)",
      tags: ["interactive"],
    });

    // Layer 1: cursor pushes cells away on hover
    engine.addSystem(createCursorRepelSystem({
      radius: 100,
      force: 350,
      tag: "interactive",
    }));

    // Layer 2: click and drag individual cells
    engine.addSystem(createMeshGrabSystem({
      grabRadius: 40,
      pullForce: 700,
      tag: "interactive",
    }));

    // Layer 3: cells tear off when dragged too far
    engine.addSystem(createMeshTearSystem({
      threshold: 70,
      particleColor: "#ff6666",
      tag: "interactive",
    }));

    // Layer 4: gentle ambient breathing
    engine.addSystem(createAmbientDriftSystem({
      amplitude: 0.2,
      speed: 0.4,
      tag: "interactive",
    }));
  },
});
```

### Pinned + tearable (destructible banner)

Pin the top edge, add gravity, and let the player rip pieces off by dragging down.

```ts
engine.addSystem(createMeshPinSystem({ pin: "top", tag: "banner" }));
engine.addSystem(createMeshGrabSystem({ pullForce: 900, tag: "banner" }));
engine.addSystem(createMeshTearSystem({ threshold: 65, tag: "banner" }));

// Apply gravity so unpinned cells droop
for (const cell of cells) {
  if (cell.physics) cell.physics.gravity = 180;
}
```

## Connecting to Game Events

Mesh cells are normal ECS entities. Use `engine.onCollide`, world queries, and the store to connect mesh destruction to game logic.

### Score on cell destruction

Track how many cells have been torn off by counting remaining cells each frame:

```ts
import { defineSystem, type Engine } from "@engine";
import { useStore } from "@ui/store";

let initialCellCount = 0;

// Capture initial count after spawn
initialCellCount = engine.world.with("meshCell").entities.length;

const scoreSystem = defineSystem({
  name: "mesh-score",
  update(engine: Engine) {
    const remaining = engine.world.with("meshCell").entities.length;
    const destroyed = initialCellCount - remaining;
    useStore.getState().setScore(destroyed * 10);

    // Game over when all cells are gone
    if (remaining === 0) {
      engine.loadScene("gameOver");
    }
  },
});
engine.addSystem(scoreSystem);
```

### Sound on tear

Watch for the tear system's particle bursts or count cells directly:

```ts
import { defineSystem, type Engine } from "@engine";

let prevCount = 0;

const tearSoundSystem = defineSystem({
  name: "tear-sound",
  update(engine: Engine) {
    const current = engine.world.with("meshCell").entities.length;
    if (current < prevCount) {
      engine.audio.play("tear", { volume: 0.5 });
      engine.camera.shake(2);
    }
    prevCount = current;
  },
});
engine.addSystem(tearSoundSystem);
```

### Collision-based destruction

Destroy mesh cells when projectiles hit them:

```ts
engine.onCollide("bullet", "mesh", (bullet, cell) => {
  engine.destroy(bullet);
  engine.destroy(cell);
  engine.particles.burst({
    x: cell.position!.x,
    y: cell.position!.y,
    count: 5,
    chars: [".", "*", "~"],
    color: "#ff4444",
    speed: 80,
    lifetime: 0.5,
  });
  engine.camera.shake(3);
});
```

Note: `engine.onCollide` works with ECS mesh cells only (they have auto-colliders). SoA meshes (500+ cells) do not have per-cell colliders.

### Win condition: percentage destroyed

```ts
const winThreshold = 0.8; // 80% of cells destroyed = win

const winCheckSystem = defineSystem({
  name: "win-check",
  update(engine: Engine) {
    const remaining = engine.world.with("meshCell").entities.length;
    const ratio = 1 - remaining / initialCellCount;
    if (ratio >= winThreshold) {
      engine.loadScene("victory");
    }
  },
});
```

## Performance Notes

### SoA threshold

Meshes with 500+ cells (`SOA_THRESHOLD`) automatically use Float32Array typed arrays instead of individual ECS entities. This is transparent -- all `create*System` factories handle both paths. Key differences:

| | ECS path (< 500 cells) | SoA path (500+ cells) |
|---|---|---|
| **Entities** | One ECS entity per cell | Single proxy entity |
| **Colliders** | Auto-collider per cell | No per-cell colliders |
| **`engine.onCollide`** | Works | Not available |
| **`engine.destroy(cell)`** | Works | Use `destroySoAMeshCell(mesh, i)` |
| **Interaction systems** | All work | All work (grab, repel, tear, pin, input force) |

### Density vs explicit cols/rows

```ts
// Explicit grid — you control the vertex count
engine.spawnImageMesh({ image: img, cols: 10, rows: 8, position: { x: 0, y: 0 } });

// Density mode — auto-computes cols/rows from image dimensions
// Requires a preloaded HTMLImageElement (naturalWidth must be > 0)
engine.spawnImageMesh({ image: preloadedImg, density: 0.5, position: { x: 0, y: 0 } });
```

Use **explicit cols/rows** when you need a specific vertex count or when using a URL string. Use **density** when you want the engine to calculate an appropriate grid for the image size. Density range is 0--1; higher values produce more vertices (smoother deformation, heavier rendering).

### Rough performance budget

- **< 200 cells:** No concerns. Stack all systems freely.
- **200--500 cells:** Moderate. Avoid running tear + grab + repel + input force + drift simultaneously on low-end devices.
- **500+ cells:** SoA path kicks in. Spring/physics are fast (typed-array loops), but rendering N `ctx.drawImage` calls still costs. Keep `showLines: false` to cut draw calls in half.
- **1000+ cells:** Consider lower density or fewer cols/rows. Profile with the debug overlay (backtick key).
