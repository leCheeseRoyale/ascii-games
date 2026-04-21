---
name: sprite-art
description: Use when the user wants to create ASCII art, design sprites, make multi-frame animations, use color maps for multi-colored sprites, create art assets, build interactive physics-based text art, or use `engine.spawnText`/`engine.spawnSprite`/`engine.spawnArt`/`engine.spawnInteractiveArt`. Triggers on "ASCII art", "make a sprite", "animate a character", "multi-line entity", "color map", "art asset", "interactive text", "physics text". For per-character physics and text measurement, also invoke the globally installed `pretext` skill.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Sprite art

Creating ASCII visuals — from single characters to animated multi-line art to physics-driven interactive text. **For per-character physics text effects, also use the globally installed `pretext` skill.**

## Single character entity

The simplest visual — one character:

```ts
export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: { char: '@', font: FONTS.normal, color: '#00ff88' },
    // ...
  }
}
```

Change appearance dynamically:
```ts
entity.ascii.char = '!'      // different character
entity.ascii.color = '#ff0'  // different color
entity.ascii.opacity = 0.5   // semi-transparent
entity.ascii.scale = 2       // double size
```

## Multi-line sprites

ASCII art that spans multiple lines:

```ts
export function createDragon(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    sprite: {
      lines: [
        '  /\\_/\\  ',
        ' ( o.o ) ',
        '  > ^ <  ',
        ' /|   |\\ ',
        '(_|   |_)',
      ],
      font: FONTS.normal,
      color: '#ff4444',
    },
    collider: 'auto',  // auto-size from sprite dimensions
    // ...
  }
}
```

## Color maps (multi-colored sprites)

Make different characters render in different colors:

```ts
sprite: {
  lines: [
    '  ***  ',
    ' *o o* ',
    '  \_/  ',
  ],
  font: FONTS.normal,
  color: '#ffffff',       // default color
  colorMap: {
    '*': '#ffcc00',       // gold stars
    'o': '#4444ff',       // blue eyes
    '_': '#ff4444',       // red mouth
  },
}
```

## Animation frames

Cycle through different appearances:

```ts
entity.animation = {
  frames: [
    { char: '○' },
    { char: '◐' },
    { char: '●' },
    { char: '◑' },
  ],
  frameDuration: 0.2,
  loop: true,
  playing: true,
  currentFrame: 0,
  elapsed: 0,
}

// Or use the helper:
engine.playAnimation(entity, [
  { char: '○' },
  { char: '◐' },
  { char: '●' },
  { char: '◑' },
], 0.2, true)
```

### Multi-line animation (sprite frames)

```ts
entity.animation = {
  frames: [
    { lines: [' /\\ ', '/  \\', '\\  /', ' \\/ '] },
    { lines: [' -- ', '|  |', '|  |', ' -- '] },
  ],
  frameDuration: 0.5,
  loop: true,
  playing: true,
  currentFrame: 0,
  elapsed: 0,
}
```

### Color-changing animation

```ts
entity.animation = {
  frames: [
    { color: '#ff0000' },
    { color: '#00ff00' },
    { color: '#0000ff' },
  ],
  frameDuration: 0.3,
  loop: true,
  playing: true,
  currentFrame: 0,
  elapsed: 0,
}
```

## Art assets (reusable ASCII art)

Define art once, use everywhere:

```ts
// game/art/tree.ts
import type { ArtAsset } from '@engine'

export const treeArt: ArtAsset = {
  lines: [
    '  🌿  ',
    ' 🌿🌿 ',
    '🌿🌿🌿',
    '  ||  ',
    '  ||  ',
  ],
  font: FONTS.normal,
  color: '#228B22',
}
```

```ts
// Spawn static art (rendered as one entity, bitmap-cached)
engine.spawnArt(treeArt, { position: { x: 200, y: 100 }, tags: ['scenery'] })

// Spawn interactive art (per-character entities with spring physics)
engine.spawnInteractiveArt(treeArt, {
  position: { x: 200, y: 100 },
  spring: SpringPresets.gentle,
  tags: ['scenery'],
})
```

## Interactive physics text

Decompose text into per-character entities that react to physics:

```ts
// Each character becomes its own entity with position, velocity, collider, and spring
engine.spawnText({
  text: 'HELLO WORLD',
  font: FONTS.huge,
  position: { x: 100, y: 200 },
  color: '#00ff88',
  spring: SpringPresets.bouncy,  // characters spring back to home position
  tags: ['title'],
})

// Multi-line sprite version
engine.spawnSprite({
  lines: ['╔════╗', '║ Hi ║', '╚════╝'],
  font: FONTS.normal,
  position: { x: 100, y: 100 },
  spring: SpringPresets.smooth,
})
```

### Spring presets

| Preset | Feel |
|---|---|
| `SpringPresets.stiff` | Tight snap, minimal overshoot |
| `SpringPresets.snappy` | Quick with slight bounce |
| `SpringPresets.bouncy` | Lots of overshoot |
| `SpringPresets.smooth` | Slow, damped |
| `SpringPresets.floaty` | Very slow drift |
| `SpringPresets.gentle` | Moderate, soft |

### Cursor repel (characters flee the mouse)

```ts
import { createCursorRepelSystem } from '@engine'

engine.addSystem(createCursorRepelSystem({
  radius: 120,
  force: 800,
}))
```

### Ambient drift (gentle random motion)

```ts
import { createAmbientDriftSystem } from '@engine'

engine.addSystem(createAmbientDriftSystem({
  strength: 20,
  frequency: 0.5,
}))
```

## Auto-sized colliders

Use `collider: 'auto'` to size the collider from the text/sprite dimensions. The engine measures the text via Pretext and creates a rect collider that matches:

```ts
{
  ascii: { char: 'BOSS', font: FONTS.large, color: '#ff0' },
  collider: 'auto',  // sized to match "BOSS" in FONTS.large
}
```

Updated automatically each frame if the text changes.

## Glow effect

```ts
ascii: { char: '★', font: FONTS.large, color: '#ffcc00', glow: '#ffcc0066' }
sprite: { lines: [...], font: FONTS.normal, color: '#fff', glow: '#ffffff44' }
```

## AI shortcut

```bash
bun run ai:sprite "fire elemental, 3 animation frames, red and orange"
bun run ai:sprite "treasure chest" --physics  # per-character with springs
```

Generates a complete entity factory with ASCII art.

## Design tips

- **Use Unicode box-drawing** for borders: `┌─┐│└─┘╔═╗║╚═╝`
- **Use block elements** for solid shapes: `█▓▒░▀▄▌▐`
- **Use geometric shapes** for abstract things: `●○◆◇▲▽★☆`
- **Spaces are transparent** in sprites — use them to create shapes
- **Keep it small** — ASCII art loses clarity at large sizes
- **Test at game resolution** — what looks good in your editor may be too big/small in-game

## Reference templates

| Pattern | Look at |
|---|---|
| Multi-line sprite entities | `games/asteroid-field/entities/` |
| Per-character physics art | `games/physics-text/scenes/play.ts` |
| Tilemap-based world art | `games/roguelike/scenes/play.ts` |
