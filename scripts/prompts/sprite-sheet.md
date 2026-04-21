# AI Sprite Sheet Generator Prompt

Use this prompt with any AI (Claude, GPT, etc.) to generate a complete character sprite sheet that works directly with the ASCII game engine.

## Prompt Template

Copy everything below the line and fill in [BRACKETS]:

---

Generate a complete ASCII art sprite sheet for a character: **[CHARACTER DESCRIPTION]**

The output must be a single TypeScript file that exports a `SpriteSheet` object. Follow this exact format:

```typescript
import type { SpriteSheet } from '@engine'

export const [CHARACTER_NAME]: SpriteSheet = {
  name: "[character name]",
  width: [widest frame character count],
  height: [tallest frame line count],
  color: "[base hex color]",
  colorMap: {
    // Map individual characters to colors for multi-colored art
    // e.g., "O": "#ffcc00" for eyes, "@": "#ff4444" for body
  },
  states: {
    idle: {
      frameDuration: 0.5,
      loop: true,
      frames: [
        { lines: [/* frame 1 */] },
        { lines: [/* frame 2 */] },
      ],
    },
    walk: {
      frameDuration: 0.15,
      loop: true,
      frames: [
        { lines: [/* frame 1 */] },
        { lines: [/* frame 2 */] },
        { lines: [/* frame 3 */] },
      ],
    },
    // ... more states
  },
}
```

## Rules for the ASCII art:

1. **All frames within a state must have the same number of lines** (pad shorter frames with spaces)
2. **All lines within a frame should be the same width** (pad with trailing spaces)
3. **Use spaces for transparency** — spaces are not rendered, so layers compose naturally
4. **Use meaningful characters** — `O` for head, `|` for body, `/` `\` for limbs, `=` for weapons, etc.
5. **Face right by default** — the engine can flip sprites by reversing lines
6. **Minimum 8 lines tall** for visual impact at 16px font
7. **Keep width under 20 characters** to fit on screen with two fighters

## Required animation states:

| State | Frames | Duration | Loop | Description |
|-------|--------|----------|------|-------------|
| `idle` | 2-3 | 0.5s | yes | Breathing/standing animation |
| `walk` | 3-4 | 0.15s | yes | Walking forward |
| `jump` | 2 | 0.2s | no | Jump arc (rising, falling) |
| `punch` | 3 | 0.08s | no | Wind-up, extend, retract |
| `kick` | 3 | 0.1s | no | Wind-up, extend, retract |
| `block` | 1 | — | no | Blocking pose (held) |
| `hurt` | 2 | 0.12s | no | Recoil from hit |
| `ko` | 3 | 0.2s | no | Falling down defeated |
| `victory` | 2 | 0.4s | yes | Celebration pose |

## ColorMap convention:

```typescript
colorMap: {
  "O": "#ffcc00",   // head
  "@": "#4488ff",   // body/torso  
  "/": "#cccccc",   // limbs
  "\\": "#cccccc",  // limbs
  "|": "#cccccc",   // limbs
  "=": "#ff4444",   // weapon/fist highlight
  "_": "#888888",   // ground/feet
  "^": "#ff8844",   // hair/hat
  "*": "#ffee00",   // effect/impact
}
```

## Example output for a basic fighter:

```typescript
import type { SpriteSheet } from '@engine'

export const FIGHTER: SpriteSheet = {
  name: "Fighter",
  width: 12,
  height: 9,
  color: "#cccccc",
  colorMap: {
    "O": "#ffcc00",
    "@": "#4488ff",
    "=": "#ff4444",
    "*": "#ffee00",
  },
  states: {
    idle: {
      frameDuration: 0.5,
      loop: true,
      frames: [
        { lines: [
          "            ",
          "    O       ",
          "   /@\\      ",
          "   /@\\      ",
          "    |       ",
          "   / \\      ",
          "  /   \\     ",
          "  |   |     ",
          "            ",
        ]},
        { lines: [
          "            ",
          "    O       ",
          "   /@\\      ",
          "   /@\\      ",
          "    |       ",
          "   / \\      ",
          "  /   \\     ",
          "  |   |     ",
          "            ",
        ]},
      ],
    },
    punch: {
      frameDuration: 0.08,
      loop: false,
      frames: [
        { lines: [
          "            ",
          "    O       ",
          "   /@\\      ",
          "   /@|      ",
          "    |       ",
          "   / \\      ",
          "  /   \\     ",
          "  |   |     ",
          "            ",
        ]},
        { lines: [
          "            ",
          "    O       ",
          "   /@\\      ",
          "   /@--=    ",
          "    |       ",
          "   / \\      ",
          "  /   \\     ",
          "  |   |     ",
          "         *  ",
        ]},
        { lines: [
          "            ",
          "    O       ",
          "   /@\\      ",
          "   /@\\      ",
          "    |       ",
          "   / \\      ",
          "  /   \\     ",
          "  |   |     ",
          "            ",
        ]},
      ],
    },
    hurt: {
      frameDuration: 0.12,
      loop: false,
      frames: [
        { lines: [
          "  *         ",
          "    O       ",
          "    /@@     ",
          "    /@@     ",
          "     |      ",
          "    / \\     ",
          "   /   \\    ",
          "   |   |    ",
          "            ",
        ]},
        { lines: [
          "            ",
          "     O      ",
          "     /@@    ",
          "     /@@    ",
          "      |     ",
          "     / \\    ",
          "    /   \\   ",
          "    |   |   ",
          "            ",
        ]},
      ],
    },
    // ... (generate all required states)
  },
}
```

## Using the sprite sheet in-game:

```typescript
import { FIGHTER } from '../art/fighter'
import { spriteSheetFrames } from '@engine'

// Spawn the fighter
const fighter = engine.spawn({
  position: { x: 200, y: 400 },
  velocity: { vx: 0, vy: 0 },
  sprite: {
    lines: FIGHTER.states.idle.frames[0].lines,
    font: '16px "Fira Code", monospace',
    color: FIGHTER.color,
    colorMap: FIGHTER.colorMap,
  },
  physics: { gravity: 800, bounce: 0, friction: 0.9 },
  collider: 'auto',
  tags: createTags('player'),
  stateMachine: {
    current: 'idle',
    states: {
      idle: {
        enter(entity) {
          const anim = spriteSheetFrames(FIGHTER, 'idle')!;
          entity.animation = { ...anim, currentFrame: 0, elapsed: 0 };
        },
      },
      punch: {
        enter(entity) {
          const anim = spriteSheetFrames(FIGHTER, 'punch')!;
          entity.animation = { ...anim, currentFrame: 0, elapsed: 0 };
        },
      },
      // ... other states
    },
  },
})
```

Now generate the complete sprite sheet for: **[CHARACTER DESCRIPTION]**
