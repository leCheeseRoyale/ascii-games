# Plan F2: Templates & Constants

## Problem
Only 2 game templates exist (blank, asteroid-field). Only 9 colors and 6 fonts. No way to export a game as a shareable file.

## Items addressed
- #30: Platformer template
- #46: Color palette presets
- #52: Export to single HTML file

## Part 1: Color palettes in `shared/constants.ts`

Add palette presets after the existing FONTS constant:

```ts
/** Themed color palettes for quick styling. */
export const PALETTES = {
  retro: {
    bg: '#1a1a2e', fg: '#e0e0e0', primary: '#e94560', secondary: '#0f3460',
    accent: '#16213e', highlight: '#533483',
  },
  neon: {
    bg: '#0a0a0a', fg: '#ffffff', primary: '#ff00ff', secondary: '#00ffff',
    accent: '#ff6600', highlight: '#00ff00',
  },
  pastel: {
    bg: '#fefefe', fg: '#2d3436', primary: '#fd79a8', secondary: '#74b9ff',
    accent: '#55efc4', highlight: '#ffeaa7',
  },
  forest: {
    bg: '#0b1a0b', fg: '#c8e6c9', primary: '#4caf50', secondary: '#2e7d32',
    accent: '#ffeb3b', highlight: '#81c784',
  },
  ocean: {
    bg: '#0a192f', fg: '#ccd6f6', primary: '#64ffda', secondary: '#8892b0',
    accent: '#f06292', highlight: '#233554',
  },
  monochrome: {
    bg: '#111111', fg: '#eeeeee', primary: '#ffffff', secondary: '#aaaaaa',
    accent: '#666666', highlight: '#cccccc',
  },
} as const;
```

## Part 2: Platformer template

Create `games/platformer/` with a minimal but playable platformer:

### `games/platformer/game.config.ts`

```ts
export const gameConfig = {
  name: 'Platformer',
  description: 'A simple platformer with gravity, jumping, and platforms',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing', 'gameOver'],
    hud: ['score'],
  },
} as const;
```

### `games/platformer/config.ts`

```ts
export const GAME = {
  title: 'PLATFORMER',
  description: 'Jump and collect stars!',

  player: {
    speed: 200,
    jumpForce: -400,
    color: '#00ff88',
    glow: '#00ff8866',
  },

  world: {
    gravity: 800,
    groundY: 0.85, // fraction of screen height
  },

  star: {
    char: '*',
    color: '#ffcc00',
    glow: '#ffcc0066',
    spawnInterval: 2.0,
  },
} as const;
```

### `games/platformer/entities/player.ts`

```ts
import { FONTS } from '@engine'
import type { Entity } from '@engine'
import { GAME } from '../config'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '@', font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
    collider: { type: 'circle', width: 20, height: 20 },
    physics: { gravity: GAME.world.gravity, friction: 0.85 },
    tags: { values: new Set(['player']) },
  }
}
```

### `games/platformer/entities/platform.ts`

```ts
import { FONTS } from '@engine'
import type { Entity } from '@engine'

export function createPlatform(x: number, y: number, width: number): Partial<Entity> {
  const char = '='.repeat(Math.max(1, Math.floor(width / 10)))
  return {
    position: { x, y },
    ascii: { char, font: FONTS.normal, color: '#888888' },
    collider: { type: 'rect', width, height: 8 },
    tags: { values: new Set(['platform']) },
  }
}
```

### `games/platformer/entities/star.ts`

```ts
import { FONTS } from '@engine'
import type { Entity } from '@engine'
import { GAME } from '../config'

export function createStar(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: { char: GAME.star.char, font: FONTS.large, color: GAME.star.color, glow: GAME.star.glow },
    collider: { type: 'circle', width: 16, height: 16, sensor: true },
    tags: { values: new Set(['star']) },
  }
}
```

### `games/platformer/systems/player-input.ts`

```ts
import { defineSystem } from '@engine'
import { GAME } from '../config'

export const playerInputSystem = defineSystem({
  name: 'playerInput',

  update(engine) {
    const groundY = engine.height * GAME.world.groundY

    for (const e of engine.world.with('position', 'velocity', 'physics', 'tags')) {
      if (!e.tags.values.has('player')) continue

      const speed = GAME.player.speed

      // Horizontal movement
      e.velocity.vx = 0
      if (engine.keyboard.held('KeyA') || engine.keyboard.held('ArrowLeft')) e.velocity.vx = -speed
      if (engine.keyboard.held('KeyD') || engine.keyboard.held('ArrowRight')) e.velocity.vx = speed

      // Ground check (simple — at bottom of screen)
      if (e.position.y >= groundY) {
        e.position.y = groundY
        e.velocity.vy = 0
        e.physics.grounded = true
      }

      // Jump
      if (e.physics.grounded && (engine.keyboard.pressed('Space') || engine.keyboard.pressed('ArrowUp') || engine.keyboard.pressed('KeyW'))) {
        e.velocity.vy = GAME.player.jumpForce
        e.physics.grounded = false
      }

      // Screen wrap horizontal
      if (e.position.x < 0) e.position.x = engine.width
      if (e.position.x > engine.width) e.position.x = 0
    }
  },
})
```

### `games/platformer/systems/star-spawner.ts`

```ts
import { Cooldown, defineSystem, rng } from '@engine'
import { GAME } from '../config'
import { createStar } from '../entities/star'

let spawnTimer = new Cooldown(GAME.star.spawnInterval)

export const starSpawnerSystem = defineSystem({
  name: 'starSpawner',

  init() {
    spawnTimer = new Cooldown(GAME.star.spawnInterval)
  },

  update(engine, dt) {
    spawnTimer.update(dt)
    if (spawnTimer.fire()) {
      const x = rng(50, engine.width - 50)
      const y = rng(engine.height * 0.2, engine.height * 0.7)
      engine.spawn(createStar(x, y))
    }
  },
})
```

### `games/platformer/systems/collection.ts`

```ts
import { defineSystem, overlaps, sfx } from '@engine'
import { useStore } from '@ui/store'

let score = 0

export const collectionSystem = defineSystem({
  name: 'collection',

  init() {
    score = 0
  },

  update(engine) {
    const players = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('player'))

    const stars = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('star'))

    for (const player of players) {
      for (const star of stars) {
        if (overlaps(player, star)) {
          score += 100
          useStore.getState().setScore(score)
          sfx.pickup()
          engine.particles.burst({
            x: star.position.x,
            y: star.position.y,
            count: 8,
            chars: ['*', '.', '+'],
            color: '#ffcc00',
            speed: 80,
            lifetime: 0.5,
          })
          engine.destroy(star)
        }
      }
    }
  },
})
```

### `games/platformer/scenes/title.ts`

```ts
import { COLORS, defineScene, FONTS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { GAME } from '../config'

export const titleScene = defineScene({
  name: 'title',

  setup(engine: Engine) {
    useStore.getState().setScreen('menu')
    const cx = engine.width / 2
    const cy = engine.height / 2

    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: { char: GAME.title, font: FONTS.huge, color: COLORS.accent, glow: '#00ff8844' },
    })

    engine.spawn({
      position: { x: cx, y: cy + 10 },
      ascii: { char: GAME.description, font: FONTS.normal, color: COLORS.dim },
    })

    engine.spawn({
      position: { x: cx, y: cy + 80 },
      ascii: { char: '[ PRESS SPACE ]', font: FONTS.bold, color: COLORS.fg },
    })
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade' })
    }
  },
})
```

### `games/platformer/scenes/play.ts`

```ts
import { defineScene } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { createPlayer } from '../entities/player'
import { collectionSystem } from '../systems/collection'
import { playerInputSystem } from '../systems/player-input'
import { starSpawnerSystem } from '../systems/star-spawner'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')
    useStore.getState().setScore(0)

    // Spawn player near bottom
    engine.spawn(createPlayer(engine.width / 2, engine.height * 0.85))

    // Ground line (visual only)
    const groundY = engine.height * 0.85 + 20
    engine.spawn({
      position: { x: engine.width / 2, y: groundY },
      ascii: {
        char: '─'.repeat(80),
        font: '16px "Fira Code", monospace',
        color: '#444444',
      },
    })

    engine.addSystem(playerInputSystem)
    engine.addSystem(starSpawnerSystem)
    engine.addSystem(collectionSystem)
  },

  update(engine: Engine) {
    const entities = [...engine.world.with('position')].length
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities)

    if (engine.keyboard.pressed('Escape')) {
      if (engine.isPaused) {
        engine.resume()
        useStore.getState().setScreen('playing')
      } else {
        engine.pause()
        useStore.getState().setScreen('paused')
      }
    }
  },
})
```

### `games/platformer/index.ts`

```ts
import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
```

## Part 3: Add platformer to init:game script

In `scripts/init-game.ts`, add `'platformer'` to the valid templates list and add a new `else if` block that generates all the platformer files using the same `writeFile()` pattern. Also add it to the usage message.

## Part 4: Update list-games script

The `scripts/list-games.ts` should pick up the new `games/platformer/` automatically since it scans the `games/` directory.

## Part 5: Export to HTML script

Create `scripts/export.ts`:

```ts
#!/usr/bin/env bun
/**
 * Export the game as a single, self-contained HTML file.
 * Usage: bun run export
 *
 * Runs `bun run build`, then inlines the JS and CSS into one HTML file.
 */
import { readdir } from 'node:fs/promises'

console.log('\n📦 Building for production...\n')

const buildResult = Bun.spawnSync(['bun', 'run', 'build'], { stdio: ['inherit', 'inherit', 'inherit'] })
if (buildResult.exitCode !== 0) {
  console.error('Build failed!')
  process.exit(1)
}

// Find the built JS file
const distFiles = await readdir('dist/assets')
const jsFile = distFiles.find(f => f.endsWith('.js'))

if (!jsFile) {
  console.error('No JS file found in dist/assets/')
  process.exit(1)
}

const js = await Bun.file(`dist/assets/${jsFile}`).text()
const cssFile = distFiles.find(f => f.endsWith('.css'))
const css = cssFile ? await Bun.file(`dist/assets/${cssFile}`).text() : ''

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ASCII Game</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: hidden; background: #0a0a0a; }
${css}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>`

const outPath = 'dist/game.html'
await Bun.write(outPath, html)
const size = (html.length / 1024).toFixed(1)
console.log(`\n✓ Exported to ${outPath} (${size} KB)`)
console.log('  Open this file in any browser to play!\n')
```

Add to `package.json`:
```json
"export": "bun run scripts/export.ts"
```

## Rules
- ONLY touch: `shared/constants.ts`, `scripts/`, `games/`, `package.json`
- Do NOT touch `engine/`, `ui/`, or `shared/types.ts`
- Run `bun run check` and `bun run build` to verify
- The platformer template files should be standalone — they can import from `@engine`, `@shared`, `@ui/store` but NOT from other games

## Verification
- `bun run check` passes
- `bun run build` succeeds
- `bun run list:games` shows blank, asteroid-field, and platformer
- `bun run export` produces a working `dist/game.html`
- `games/platformer/` files all compile
