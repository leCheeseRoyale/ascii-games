# Text-Aware Physics

Recipes for text measurement, auto-colliders, decomposed text, spring physics, and interactive typography. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Text-Aware Physics & Auto-Colliders

The engine measures text via Pretext to derive pixel-accurate bounding boxes.
Three features build on this: auto-sized colliders, spring physics, and
text/sprite decomposition into per-character physics entities.

### Auto-sized colliders

Before auto-colliders, you had to guess pixel dimensions for every text entity:

```ts
// Before (manual, fragile — sizes are eyeballed):
engine.spawn({
  position: { x: 100, y: 50 },
  ascii: { char: "@", font: '16px "Fira Code", monospace', color: "#0f0" },
  collider: { type: "circle", width: 20, height: 20 },
});
```

Pass `collider: "auto"` and the engine measures the text for you:

```ts
// After (Pretext-measured, exact):
engine.spawn({
  position: { x: 100, y: 50 },
  ascii: { char: "@", font: '16px "Fira Code", monospace', color: "#0f0" },
  collider: "auto",
});
```

Works for `ascii`, `sprite`, and `textBlock` entities. Single characters get a
circle collider; multi-line sprites and text blocks get a rect collider. The
`_measure` built-in system (priority 5) runs every frame and updates both
`visualBounds` and the auto-collider whenever the text content, font, or scale
changes — so if you mutate `entity.ascii.char` at runtime, the collider resizes
automatically.

If the entity has no measurable text component, `"auto"` falls back to a 16x16
rect.

### Spring physics

The `spring` component pulls any entity toward a target position. It is not
text-specific -- attach it to anything with `position` and `velocity`.

Use `SpringPresets` for common feels:

```ts
import { SpringPresets } from "@engine";

engine.spawn({
  position: { x: 0, y: 0 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: "◆", font: '16px "Fira Code", monospace', color: "#ff0" },
  spring: { targetX: 200, targetY: 150, ...SpringPresets.bouncy },
});
```

**Spring preset reference:**

| Preset | Strength | Damping | Feel |
|---|---|---|---|
| `SpringPresets.stiff` | 0.12 | 0.90 | Fast snap-back |
| `SpringPresets.snappy` | 0.10 | 0.91 | Quick return |
| `SpringPresets.bouncy` | 0.08 | 0.88 | Playful overshoot |
| `SpringPresets.smooth` | 0.06 | 0.93 | Balanced |
| `SpringPresets.floaty` | 0.04 | 0.95 | Slow, dreamy |
| `SpringPresets.gentle` | 0.02 | 0.97 | Barely perceptible |

**Custom tuning** -- pass raw numbers when presets don't match:

```ts
spring: { targetX: 200, targetY: 150, strength: 0.1, damping: 0.92 },
```

The `_spring` built-in system (priority 15) runs each frame before `_physics`.
It adds a force toward `(targetX, targetY)` scaled by `strength`, then
multiplies velocity by `damping` to bleed energy. Higher strength = snappier
return. Damping in the 0.90--0.97 range feels natural; below 0.90 is overdamped,
above 0.97 is bouncy. Update `targetX`/`targetY` at runtime to move the anchor.

### Interactive text with `spawnText`

`engine.spawnText()` decomposes a string into individual character entities.
Each character gets its own `position`, `velocity`, `ascii`, `spring`, and
auto-collider. They participate in normal physics -- anything that collides with
them pushes them away, and the spring pulls them back.

```ts
import { SpringPresets, createCursorRepelSystem } from "@engine";

// Spawn text -- each character becomes its own physics entity
const chars = engine.spawnText({
  text: "GAME OVER",
  font: '24px "Fira Code", monospace',
  position: { x: 400, y: 300 },
  color: "#ff4444",
  spring: SpringPresets.smooth,
  tags: ["game-over-text"],
  align: "center", // "left" | "center" | "right"
});

// One line: characters flee the cursor and spring back
engine.addSystem(createCursorRepelSystem())
```

Spaces are skipped (no entity spawned). Optional fields: `maxWidth` for
line-wrapping, `lineHeight` (defaults to font size * 1.3), `layer`,
`align` (defaults to `"left"`), and `collider: false` to skip auto-colliders.

### Text effects on `textBlock` entities

Per-character effects work on wrapped paragraph text too (plain text only —
styled tags disable the effect path):

```ts
import { wave, rainbow, compose } from "@engine";

engine.spawn({
  position: { x: 100, y: 100 },
  textBlock: {
    text: "The ancient door creaks open...",
    font: '16px "Fira Code", monospace',
    maxWidth: 300,
    lineHeight: 22,
    color: "#d0d0d0",
  },
  textEffect: { fn: wave(4, 0.3, 2) },
});
```

Apply a blast force to scatter the characters, then watch them spring home:

```ts
for (const char of chars) {
  char.velocity!.vx = (Math.random() - 0.5) * 600;
  char.velocity!.vy = (Math.random() - 0.5) * 600;
}
// Characters scatter outward, then spring back to their home positions.
```

### Interactive sprite with `spawnSprite`

`engine.spawnSprite()` does the same for multi-line ASCII art. Characters are
centered on the sprite's position:

```ts
import { SpringPresets, createCursorRepelSystem } from "@engine";

const chars = engine.spawnSprite({
  lines: [
    "  /\\  ",
    " /  \\ ",
    "/____\\",
  ],
  font: '16px "Fira Code", monospace',
  position: { x: 200, y: 100 },
  color: "#88ff88",
  spring: SpringPresets.bouncy,
});

engine.addSystem(createCursorRepelSystem())
```

Same API as `spawnText` minus `maxWidth` and `lineHeight` (line spacing is
derived from font size * 1.2). Optional `layer`, `tags`, and `collider: false`.

### Cursor repulsion and ambient drift

`createCursorRepelSystem()` pushes spring entities away from the mouse cursor.
Characters flee the cursor, then the spring pulls them back. Optional parameters:

```ts
import { createCursorRepelSystem, createAmbientDriftSystem } from "@engine";

// Default settings (radius: 100, force: 300)
engine.addSystem(createCursorRepelSystem())

// Custom radius and force
engine.addSystem(createCursorRepelSystem({ radius: 80, force: 200 }))

// Only repel entities with a specific tag
engine.addSystem(createCursorRepelSystem({ tag: "title" }))

// Add gentle floating motion to spring entities
engine.addSystem(createAmbientDriftSystem())

// Drift only star-tagged entities
engine.addSystem(createAmbientDriftSystem({ tag: "star" }))
```

The default priority (0) runs before `_spring` (15), so
the repulsion force is applied first and the spring corrects on the same frame.

**Custom repulsion system** -- when you need full control over the repulsion
behavior, write the system by hand instead of using the factory:

```ts
import { defineSystem } from "@engine";

export const cursorRepel = defineSystem({
  name: "cursor-repel",
  update(engine) {
    const mx = engine.mouse.x;
    const my = engine.mouse.y;
    for (const e of engine.world.with("position", "velocity", "spring")) {
      const dx = e.position.x - mx;
      const dy = e.position.y - my;
      const dist = Math.hypot(dx, dy);
      if (dist < 80 && dist > 0) {
        const force = 300 * ((80 - dist) / 80);
        e.velocity.vx += (dx / dist) * force;
        e.velocity.vy += (dy / dist) * force;
      }
    }
  },
});
```

### Measuring text for custom layout

Use the measurement helpers directly when you need pixel dimensions without
spawning entities — for example, to center a HUD element or size a panel:

```ts
import { measureAsciiVisual, measureSpriteVisual, measureTextBlockVisual } from "@engine";

// Single-line or multi-character ascii
const { width, height } = measureAsciiVisual({
  char: "SCORE: 999",
  font: '16px "Fira Code", monospace',
  scale: 1,
});

// Multi-line sprite
const dragonArt = ["  /\\_/\\  ", " ( o.o ) ", "  > ^ <  "];
const { width: spriteW, height: spriteH } = measureSpriteVisual({
  lines: dragonArt,
  font: '16px "Fira Code", monospace',
});

// Wrapped text block
const { width: blockW, height: blockH } = measureTextBlockVisual({
  text: "A long paragraph that wraps...",
  font: '16px "Fira Code", monospace',
  maxWidth: 400,
  lineHeight: 22,
});
```

These are pure measurement functions — no canvas drawing, no entity creation.
They use the same Pretext measurement path as the renderer, so the numbers
match exactly what you see on screen.

## Interactive Physics Text

`engine.spawnText()` decomposes a string into per-character physics entities with spring-to-home behavior. Combined with `createCursorRepelSystem` and `createAmbientDriftSystem`, this creates interactive title screens and menus in a few lines.

### Complete interactive title screen
```ts
import {
  defineScene,
  SpringPresets,
  createCursorRepelSystem,
  createAmbientDriftSystem,
  type Engine,
} from "@engine";

export const titleScene = defineScene({
  name: "title",
  setup(engine: Engine) {
    // Title text — each character is a physics entity
    const titleChars = engine.spawnText({
      text: "DUNGEON QUEST",
      font: '32px "Fira Code", monospace',
      position: { x: engine.centerX - 180, y: 120 },
      color: "#ffcc00",
      spring: SpringPresets.bouncy,
      tags: ["title"],
    });

    // Subtitle with gentler spring
    engine.spawnText({
      text: "Press SPACE to begin",
      font: '16px "Fira Code", monospace',
      position: { x: engine.centerX - 120, y: 200 },
      color: "#888888",
      spring: SpringPresets.gentle,
      tags: ["title"],
    });

    // Characters flee the cursor, then spring back
    engine.addSystem(createCursorRepelSystem({ radius: 120, force: 400, tag: "title" }));

    // Gentle floating motion
    engine.addSystem(createAmbientDriftSystem({ amplitude: 0.4, speed: 0.6, tag: "title" }));

    // Scatter on click, then watch them spring home
    engine.addSystem({
      name: "click-scatter",
      update(eng) {
        if (eng.mouse.justDown) {
          for (const ch of titleChars) {
            ch.velocity!.vx = (Math.random() - 0.5) * 800;
            ch.velocity!.vy = (Math.random() - 0.5) * 800;
          }
        }
      },
    });
  },
  update(engine) {
    if (engine.keyboard.pressed("Space")) {
      engine.loadScene("play", { transition: "dissolve", duration: 0.6 });
    }
  },
});
```
