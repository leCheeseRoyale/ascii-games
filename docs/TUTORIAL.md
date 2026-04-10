# Build Your First ASCII Game — From Zero to Playable

This tutorial walks you through building a complete game with the ASCII engine, step by step. No prior game development experience needed.

By the end, you'll have a working game with a title screen, player movement, enemies, shooting, collisions, scoring, and a game over screen.

---

## Table of Contents

1. [Setup](#1-setup)
2. [How the engine works (2-minute version)](#2-how-the-engine-works)
3. [Create a blank game](#3-create-a-blank-game)
4. [Your first entity](#4-your-first-entity)
5. [Making things move](#5-making-things-move)
6. [Scenes: title, play, game over](#6-scenes-title-play-game-over)
7. [Entity factories](#7-entity-factories)
8. [Systems: reusable game logic](#8-systems-reusable-game-logic)
9. [Collisions](#9-collisions)
10. [Scoring and UI](#10-scoring-and-ui)
11. [Polish: particles, sounds, tweens](#11-polish-particles-sounds-tweens)
12. [Full example: Space Dodger](#12-full-example-space-dodger)
13. [What's next](#13-whats-next)

---

## 1. Setup

You need [Bun](https://bun.sh) installed (a fast JavaScript runtime).

```bash
# Clone the project
git clone <your-repo-url>
cd ascii-games

# Install dependencies
bun install

# Start the dev server (opens in your browser with live reload)
bun dev
```

You should see the current game running in your browser at `http://localhost:5173`.

---

## 2. How the engine works

The engine uses three concepts. That's it:

| Concept | What it is | Example |
|---------|-----------|---------|
| **Entity** | A thing in the game. Just a plain object with data attached. | A player, a bullet, a floating text |
| **System** | A function that runs every frame and updates entities. | "Move all bullets forward", "Check for collisions" |
| **Scene** | A screen in your game. Sets up entities and systems. | Title screen, gameplay, game over |

**The game loop** runs 60 times per second. Each frame:
1. Read keyboard/mouse input
2. Run all systems (they update entities)
3. Draw everything to the screen

**You never draw anything manually.** If an entity has a `position` and something visible (like `ascii`), the engine draws it automatically.

---

## 3. Create a blank game

Generate a clean starting point:

```bash
bun run init:game blank
```

This creates four files in `game/`:

```
game/
  config.ts          # Game settings (title, constants)
  index.ts           # Registers scenes, picks the starting one
  scenes/
    title.ts         # Title screen
    play.ts          # Gameplay screen
```

Run it:

```bash
bun dev
```

You'll see "MY GAME" on screen with a "Press Space" prompt. Press Space and you get a green `@` you can move with WASD or arrow keys.

**That's a working game in 4 files.** Everything from here builds on this.

---

## 4. Your first entity

An entity is just an object with components. Components are data — position, appearance, speed, health, etc.

Open `game/scenes/play.ts`. You'll see this in the `setup` function:

```ts
engine.spawn({
  position: { x: engine.width / 2, y: engine.height / 2 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: '@', font: FONTS.large, color: COLORS.accent, glow: '#00ff8844' },
})
```

That's it. This spawns one entity with three components:
- **position** — where it is on screen (centered)
- **velocity** — how fast it's moving (starts still)
- **ascii** — what it looks like (a green `@` character)

### Try it: Spawn a star

Add this below the player spawn in `setup`:

```ts
engine.spawn({
  position: { x: 200, y: 150 },
  ascii: { char: '*', font: FONTS.normal, color: '#ffcc00' },
})
```

Save the file. A yellow `*` appears at position (200, 150). It just sits there because it has no `velocity`.

### Components you can use

| Component | What it does | Example |
|-----------|-------------|---------|
| `position` | Where the entity is | `{ x: 100, y: 200 }` |
| `velocity` | How fast it moves (pixels/sec) | `{ vx: 50, vy: 0 }` — moves right |
| `ascii` | A character to display | `{ char: '@', font: FONTS.large, color: '#ff0' }` |
| `sprite` | Multi-line ASCII art | `{ lines: [' ^ ', '/|\\'], font: FONTS.normal, color: '#0f0' }` |
| `collider` | Hitbox for collisions | `{ type: 'circle', width: 20, height: 20 }` |
| `health` | Hit points | `{ current: 3, max: 3 }` |
| `lifetime` | Auto-remove after N seconds | `{ remaining: 2.0 }` |
| `physics` | Gravity, friction, drag | `{ gravity: 800, bounce: 0.5 }` |
| `tags` | Labels for querying | `{ values: new Set(['enemy']) }` |
| `screenWrap` | Auto-wrap at screen edges | `{ margin: 20 }` |
| `screenClamp` | Keep entity on screen | `{ padding: 10 }` |
| `offScreenDestroy` | Auto-remove when off screen | `{ margin: 50 }` |

You only add the components you need. An entity with just `position` + `ascii` is a static decoration. Add `velocity` and it moves. Add `collider` and it can collide with things.

---

## 5. Making things move

### Automatic movement

Give an entity `velocity` and the engine moves it automatically every frame:

```ts
engine.spawn({
  position: { x: 0, y: 300 },
  velocity: { vx: 100, vy: 0 },  // moves right at 100 pixels per second
  ascii: { char: '>', font: FONTS.normal, color: '#44aaff' },
})
```

**Important:** The built-in physics system handles `position += velocity * dt` for you. Never do this manually or things will move at double speed.

### Player-controlled movement

In the `update` function (runs every frame), read the keyboard and set velocity:

```ts
update(engine: Engine, dt: number) {
  for (const e of engine.world.with('position', 'velocity', 'ascii')) {
    const speed = 200
    e.velocity.vx = 0
    e.velocity.vy = 0
    if (engine.keyboard.held('ArrowLeft') || engine.keyboard.held('KeyA')) e.velocity.vx = -speed
    if (engine.keyboard.held('ArrowRight') || engine.keyboard.held('KeyD')) e.velocity.vx = speed
    if (engine.keyboard.held('ArrowUp') || engine.keyboard.held('KeyW')) e.velocity.vy = -speed
    if (engine.keyboard.held('ArrowDown') || engine.keyboard.held('KeyS')) e.velocity.vy = speed
  }
}
```

`engine.world.with('position', 'velocity', 'ascii')` finds all entities that have those components. The `for` loop runs your logic on each one.

### Input cheat sheet

```ts
engine.keyboard.held('KeyA')       // true while A is held down
engine.keyboard.pressed('Space')   // true only the frame Space was pressed
engine.keyboard.released('Escape') // true only the frame Escape was released

engine.mouse.x, engine.mouse.y    // mouse position
engine.mouse.down                  // true while mouse button is held
engine.mouse.justDown              // true the frame mouse was clicked
```

Key codes use the `code` format: `KeyA`, `KeyW`, `Space`, `ArrowUp`, `ArrowLeft`, `Escape`, `Enter`, `ShiftLeft`, etc.

---

## 6. Scenes: title, play, game over

A scene is a screen in your game. Each scene has three hooks:

```ts
import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'

export const myScene = defineScene({
  name: 'my-scene',

  // Called once when this scene loads — set things up
  setup(engine: Engine) {
    // Spawn entities, add systems
  },

  // Called every frame — game logic goes here
  update(engine: Engine, dt: number) {
    // dt is the time since last frame in seconds (~0.016 at 60fps)
  },

  // Called when leaving this scene — optional cleanup
  cleanup(engine: Engine) {
    // Remove event listeners, etc.
  },
})
```

### Switching scenes

```ts
engine.loadScene('play')                              // instant switch
engine.loadScene('play', { transition: 'fade' })      // fade to black and back
engine.loadScene('play', { transition: 'fadeWhite' })  // fade through white
engine.loadScene('play', { transition: 'wipe' })       // horizontal wipe
```

**Tip:** `engine.centerX` and `engine.centerY` are shortcuts for `engine.width / 2` and `engine.height / 2` — handy for centering things on screen.

When a scene loads, all entities from the previous scene are automatically removed.

### Registering scenes

In `game/index.ts`, register every scene and pick the starting one:

```ts
import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'
import { gameOverScene } from './scenes/game-over'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'  // start here
}
```

### Scaffolding a new scene

Instead of writing from scratch, use the generator:

```bash
bun run new:scene game-over
```

This creates `game/scenes/game-over.ts` with the boilerplate filled in. Then register it in `game/index.ts`.

---

## 7. Entity factories

When you need to spawn the same type of entity multiple times (bullets, enemies, pickups), create a factory function:

```bash
bun run new:entity enemy
```

This creates `game/entities/enemy.ts`:

```ts
import type { Entity } from '@engine'

export function createEnemy(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 50 },
    ascii: { char: 'V', font: '16px "Fira Code", monospace', color: '#ff4444' },
    collider: { type: 'circle', width: 16, height: 16 },
    tags: { values: new Set(['enemy']) },
  }
}
```

Then spawn them from anywhere:

```ts
import { createEnemy } from '../entities/enemy'

// In a scene or system:
engine.spawn(createEnemy(400, 0))
engine.spawn(createEnemy(200, 0))
engine.spawn(createEnemy(600, 0))
```

### Why factories?

- **Consistent** — every enemy looks and behaves the same
- **Tweakable** — change one file, all enemies update
- **Composable** — pass parameters to vary them:

```ts
export function createEnemy(x: number, y: number, fast = false): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: fast ? 150 : 50 },
    ascii: { char: fast ? 'W' : 'V', font: FONTS.normal, color: fast ? '#ff8800' : '#ff4444' },
    collider: { type: 'circle', width: 16, height: 16 },
    tags: { values: new Set(['enemy']) },
  }
}
```

---

## 8. Systems: reusable game logic

A system is a function that runs every frame and operates on entities. Use systems when you have logic that applies to many entities.

```bash
bun run new:system enemy-movement
```

This creates `game/systems/enemy-movement.ts`:

```ts
import { defineSystem } from '@engine'
import type { Engine } from '@engine'

export const enemyMovementSystem = defineSystem({
  name: 'enemyMovement',

  // Called once when the system is added to a scene
  init(engine: Engine) {
    // Reset any module-level state here
  },

  // Called every frame
  update(engine: Engine, dt: number) {
    for (const e of engine.world.with('position', 'velocity', 'tags')) {
      if (e.tags.values.has('enemy')) {
        // Make enemies wobble side to side
        e.velocity.vx = Math.sin(Date.now() / 500) * 100
      }
    }
  },
})
```

### Adding systems to a scene

Systems are added in a scene's `setup`:

```ts
setup(engine) {
  engine.addSystem(enemyMovementSystem)
  engine.addSystem(collisionSystem)
}
```

Order matters — systems run in the order you add them.

### When to use a system vs. scene update

| Put it in a **system** when... | Put it in **scene update** when... |
|---|---|
| Logic applies to many entities | Logic is specific to this scene |
| You want to reuse it across scenes | It's simple (a few lines) |
| It has its own state (timers, cooldowns) | It doesn't need its own state |

### Spawning on a timer

A common pattern — spawn enemies every N seconds:

```ts
import { Cooldown, defineSystem } from '@engine'

let spawnTimer = new Cooldown(1.5)  // every 1.5 seconds

export const spawnerSystem = defineSystem({
  name: 'spawner',

  init() {
    spawnTimer = new Cooldown(1.5)  // reset when scene reloads
  },

  update(engine, dt) {
    spawnTimer.update(dt)
    if (spawnTimer.fire()) {
      engine.spawn(createEnemy(rng(50, engine.width - 50), -20))
    }
  },
})

// Or use the shorthand — no system needed:
engine.spawnEvery(1.5, () => createEnemy(rng(50, engine.width - 50), -20))
```

### Lifetime (auto-remove entities)

Entities with a `lifetime` component are automatically removed when their time runs out — the engine handles this for you. No need to write your own lifetime system.

```ts
engine.spawn({
  position: { x: 100, y: 100 },
  ascii: { char: '*', font: FONTS.normal, color: '#ff0' },
  lifetime: { remaining: 2.0 },  // disappears after 2 seconds
})
```

---

## 9. Collisions

Give entities a `collider` component, then check for overlaps:

```ts
import { overlaps } from '@engine'

// In a system's update:
const bullets = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('bullet'))

const enemies = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('enemy'))

for (const bullet of bullets) {
  for (const enemy of enemies) {
    if (overlaps(bullet, enemy)) {
      engine.destroy(bullet)
      engine.destroy(enemy)
      // Add score, play sound, spawn particles, etc.
    }
  }
}
```

### Collider types

```ts
// Circle — good for characters, bullets, round things
collider: { type: 'circle', width: 20, height: 20 }

// Rectangle — good for walls, platforms, UI elements
collider: { type: 'rect', width: 40, height: 10 }
```

`overlaps()` handles circle-circle, rect-rect, and circle-rect automatically.

---

## 10. Scoring and UI

The game loop and the UI (React) are separate. They communicate through a shared store.

### Setting values from game code

```ts
import { useStore } from '@ui/store'

// Update score
useStore.getState().setScore(500)

// Update health
useStore.getState().setHealth(3, 5)  // 3 current, 5 max

// Change screen (shows different UI overlay)
useStore.getState().setScreen('gameOver')

// Store custom data (for games that need more than score/health)
useStore.getState().setGameState('lives', 3)
useStore.getState().setGameState('level', 'forest')
```

### Built-in store fields

| Field | Default | What it's for |
|-------|---------|--------------|
| `screen` | `'menu'` | Which UI overlay to show |
| `score` | `0` | Player score (auto-tracks high score) |
| `health` / `maxHealth` | `100` | Health bar display |
| `gameState` | `{}` | Your custom data (anything you want) |

### Screen names and what they show

By default, these screen names trigger these UI overlays:

| Screen name | Shows |
|-------------|-------|
| `'menu'` | Main menu with "Press Space to start" |
| `'playing'` | HUD with score and health bar |
| `'paused'` | HUD + pause menu overlay |
| `'gameOver'` | Game over screen with score |

You can use any string as a screen name. If you register custom screen components, they'll appear for that screen name.

### Persistent high scores

Scores can survive page reloads using the built-in leaderboard:

```ts
import { setStoragePrefix, submitScore, getHighScores, getTopScore } from '@engine'

// Call once at game init:
setStoragePrefix('my-game')

// When game ends:
submitScore(score, 'Player')

// On title screen:
const best = getTopScore()     // survives page reload
const top10 = getHighScores()  // sorted leaderboard
```

---

## 11. Polish: particles, sounds, tweens

### Particles

Burst particles at a position for explosions and effects:

```ts
engine.particles.burst({
  x: entity.position.x,
  y: entity.position.y,
  count: 20,
  chars: ['*', '.', '+', '·'],
  color: '#ff4444',
  speed: 150,
  lifetime: 0.8,
})
```

### Sound effects

Built-in procedural sounds (no audio files needed):

```ts
import { sfx } from '@engine'

sfx.shoot()    // laser pew
sfx.hit()      // impact thud
sfx.pickup()   // item collect chime
sfx.explode()  // big boom
sfx.menu()     // menu blip
sfx.death()    // death sound
```

### Camera shake

```ts
engine.camera.shake(5)   // intensity 5 — subtle
engine.camera.shake(15)  // intensity 15 — dramatic
```

### Tweens (smooth animations)

Animate any numeric property over time:

```ts
// Slide an entity from x=0 to x=200 over 0.5 seconds
engine.tweenEntity(entity, 'position.x', 0, 200, 0.5, 'easeOut')

// Fade out opacity over 1 second, then destroy the entity
engine.tweenEntity(entity, 'ascii.opacity', 1, 0, 1.0, 'easeIn', true)
```

Easing options: `'linear'`, `'easeOut'` (fast then slow), `'easeIn'` (slow then fast), `'easeInOut'`

### Delayed actions

```ts
// Run something after 2 seconds
engine.after(2.0, () => {
  engine.loadScene('game-over')
})

// Run something every 0.5 seconds
engine.every(0.5, () => {
  // spawn something, flash something, etc.
})

// Sequence of timed steps
engine.sequence([
  { delay: 1.0, fn: () => showWarning() },
  { delay: 2.0, fn: () => spawnBoss() },     // runs at t=3.0 (delays are cumulative)
  { delay: 1.0, fn: () => startMusic() },     // runs at t=4.0
])
```

### Background music

```ts
import { playMusic, stopMusic, setVolume, toggleMute } from '@engine'

playMusic('/music.mp3')                         // loops by default
playMusic('/music.mp3', { volume: 0.5 })
stopMusic()
setVolume(0.5)   // master volume
toggleMute()     // mute/unmute all audio
```

### Toast notifications

Pop up short messages that float and fade away:

```ts
engine.toast.show('+100', { color: '#ffcc00' })
engine.toast.showAt('Nice!', entity.position.x, entity.position.y, { color: '#0f0' })
```

### Debug overlay

Press backtick (`` ` ``) during gameplay to toggle the debug overlay. Shows collider outlines and entity counts.

---

## 12. Full example: Space Dodger

Let's build a complete game from scratch. Enemies fall from the top, you dodge them. Get hit and it's game over.

### Step 1: Initialize

```bash
bun run init:game blank
```

### Step 2: Game config

Edit `game/config.ts`:

```ts
export const GAME = {
  title: 'SPACE DODGER',
  description: 'Dodge the falling debris!',

  player: {
    speed: 250,
    color: '#00ff88',
    glow: '#00ff8866',
  },

  debris: {
    chars: ['#', 'X', '*', '@', '%'],
    colors: ['#ff4444', '#ff8833', '#ffcc22', '#ff6644'],
    minSpeed: 80,
    maxSpeed: 200,
    spawnInterval: 0.8,
  },
} as const
```

### Step 3: Entity factories

Create `game/entities/player.ts`:

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
    tags: { values: new Set(['player']) },
  }
}
```

Create `game/entities/debris.ts`:

```ts
import { FONTS, pick, rng } from '@engine'
import type { Entity } from '@engine'
import { GAME } from '../config'

export function createDebris(x: number): Partial<Entity> {
  return {
    position: { x, y: -20 },
    velocity: { vx: rng(-30, 30), vy: rng(GAME.debris.minSpeed, GAME.debris.maxSpeed) },
    ascii: {
      char: pick(GAME.debris.chars),
      font: FONTS.normal,
      color: pick(GAME.debris.colors),
      scale: rng(0.8, 1.8),
    },
    collider: { type: 'circle', width: 16, height: 16 },
    tags: { values: new Set(['debris']) },
  }
}
```

### Step 4: Systems

Create `game/systems/debris-spawner.ts`:

```ts
import { Cooldown, defineSystem, rng } from '@engine'
import { GAME } from '../config'
import { createDebris } from '../entities/debris'

let spawnTimer = new Cooldown(GAME.debris.spawnInterval)

export const debrisSpawnerSystem = defineSystem({
  name: 'debrisSpawner',

  init() {
    spawnTimer = new Cooldown(GAME.debris.spawnInterval)
  },

  update(engine, dt) {
    spawnTimer.update(dt)
    if (spawnTimer.fire()) {
      engine.spawn(createDebris(rng(50, engine.width - 50)))
    }
  },
})
```

Create `game/systems/collision.ts`:

```ts
import { defineSystem, overlaps, sfx } from '@engine'
import { useStore } from '@ui/store'

let score = 0
let elapsed = 0

export const collisionSystem = defineSystem({
  name: 'collision',

  init() {
    score = 0
    elapsed = 0
  },

  update(engine, dt) {
    elapsed += dt

    // Score goes up over time (survival game)
    const newScore = Math.floor(elapsed * 10) * 10
    if (newScore > score) {
      score = newScore
      useStore.getState().setScore(score)
    }

    const players = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('player'))

    const debris = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('debris'))

    // Check player-debris collisions
    for (const player of players) {
      for (const d of debris) {
        if (overlaps(player, d)) {
          sfx.death()
          engine.particles.burst({
            x: player.position.x,
            y: player.position.y,
            count: 30,
            chars: ['@', '#', '*', '!'],
            color: '#00ff88',
            speed: 200,
            lifetime: 1.5,
          })
          engine.camera.shake(10)
          engine.loadScene('game-over')
          return
        }
      }
    }

    // Remove debris that fell off screen
    for (const d of debris) {
      if (d.position.y > engine.height + 50) {
        engine.destroy(d)
      }
    }
  },
})
```

Create `game/systems/player-input.ts`:

```ts
import { defineSystem } from '@engine'
import { GAME } from '../config'

export const playerInputSystem = defineSystem({
  name: 'playerInput',

  update(engine) {
    for (const e of engine.world.with('position', 'velocity', 'tags')) {
      if (!e.tags.values.has('player')) continue

      const speed = GAME.player.speed
      e.velocity.vx = 0
      e.velocity.vy = 0

      if (engine.keyboard.held('KeyA') || engine.keyboard.held('ArrowLeft')) e.velocity.vx = -speed
      if (engine.keyboard.held('KeyD') || engine.keyboard.held('ArrowRight')) e.velocity.vx = speed
      if (engine.keyboard.held('KeyW') || engine.keyboard.held('ArrowUp')) e.velocity.vy = -speed
      if (engine.keyboard.held('KeyS') || engine.keyboard.held('ArrowDown')) e.velocity.vy = speed

      // Keep player on screen
      const margin = 10
      if (e.position.x < margin) e.position.x = margin
      if (e.position.x > engine.width - margin) e.position.x = engine.width - margin
      if (e.position.y < margin) e.position.y = margin
      if (e.position.y > engine.height - margin) e.position.y = engine.height - margin
    }
  },
})
```

### Step 5: Scenes

Replace `game/scenes/title.ts`:

```ts
import { COLORS, defineScene, FONTS, pick, rng } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { GAME } from '../config'

export const titleScene = defineScene({
  name: 'title',

  setup(engine: Engine) {
    useStore.getState().setScreen('menu')

    const cx = engine.centerX
    const cy = engine.centerY

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

    // Ambient falling debris on title screen
    for (let i = 0; i < 10; i++) {
      engine.spawn({
        position: { x: rng(0, engine.width), y: rng(0, engine.height) },
        velocity: { vx: rng(-10, 10), vy: rng(20, 60) },
        ascii: {
          char: pick(GAME.debris.chars),
          font: FONTS.normal,
          color: '#333333',
          opacity: rng(0.2, 0.4),
        },
      })
    }
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade' })
    }
  },
})
```

Replace `game/scenes/play.ts`:

```ts
import { defineScene } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { createPlayer } from '../entities/player'
import { collisionSystem } from '../systems/collision'
import { debrisSpawnerSystem } from '../systems/debris-spawner'
import { playerInputSystem } from '../systems/player-input'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')
    useStore.getState().setScore(0)

    engine.spawn(createPlayer(engine.centerX, engine.height - 100))

    engine.addSystem(playerInputSystem)
    engine.addSystem(debrisSpawnerSystem)
    engine.addSystem(collisionSystem)
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

Create `game/scenes/game-over.ts`:

```bash
bun run new:scene game-over
```

Then replace its contents:

```ts
import { COLORS, defineScene, FONTS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const gameOverScene = defineScene({
  name: 'game-over',

  setup(engine: Engine) {
    useStore.getState().setScreen('gameOver')

    const cx = engine.centerX
    const cy = engine.centerY

    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: { char: 'GAME OVER', font: FONTS.huge, color: COLORS.danger, glow: '#ff444444' },
    })

    const score = useStore.getState().score
    engine.spawn({
      position: { x: cx, y: cy + 20 },
      ascii: { char: `SCORE: ${score}`, font: FONTS.boldLarge, color: COLORS.fg },
    })

    engine.spawn({
      position: { x: cx, y: cy + 80 },
      ascii: { char: '[ PRESS SPACE TO RETRY ]', font: FONTS.bold, color: COLORS.dim },
    })
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade' })
    }
  },
})
```

### Step 6: Wire it up

Edit `game/index.ts`:

```ts
import type { Engine } from '@engine'
import { gameOverScene } from './scenes/game-over'
import { playScene } from './scenes/play'
import { titleScene } from './scenes/title'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'
}
```

### Step 7: Run it

```bash
bun dev
```

You now have a complete game with title screen, dodging gameplay, scoring, collisions, particles, sound, and a game over screen.

---

## 13. What's next

### Make it your own

- **Change the visuals** — Edit `config.ts` to change characters, colors, speeds
- **Add difficulty** — Make spawn rate increase over time (see the asteroid-field example in `games/asteroid-field/`)
- **Add health** — Give the player a `health` component and multiple lives
- **Add shooting** — Create a bullet entity factory and fire on Space
- **Add power-ups** — Spawn items that give speed boosts or shields

### Available tools

```bash
bun run new:scene <name>    # Generate a new scene
bun run new:system <name>   # Generate a new system
bun run new:entity <name>   # Generate a new entity factory
bun run init:game <blank|asteroid-field|platformer>  # Start fresh from a template
bun run list:games           # See available templates
bun run export               # Build single shareable HTML file
```

### Colors and fonts

```ts
import { COLORS, FONTS } from '@engine'

// Colors: bg, fg, dim, accent, warning, danger, info, purple, pink
// Fonts: normal (16px), small (12px), large (24px), huge (48px), bold, boldLarge

// Or use your own:
color: '#ff6600'
font: '20px "Fira Code", monospace'

// Dynamic colors:
import { hsl, rainbow, lerpColor } from '@engine'
hsl(120, 80, 50)                    // green as CSS string
rainbow(engine.time.elapsed, 2)     // cycling rainbow
lerpColor('#ff0000', '#0000ff', 0.5) // blend between two colors

import { PALETTES } from '@engine'
// Ready-made palettes: PALETTES.retro, .neon, .pastel, .forest, .ocean, .monochrome
```

### Useful utilities

```ts
import { rng, rngInt, pick, chance, clamp, lerp, dist, vec2, Cooldown } from '@engine'

rng(0, 100)       // random float 0-100
rngInt(1, 6)      // random integer 1-6 (dice roll)
pick(['a', 'b'])  // random element from array
chance(0.3)       // 30% chance to return true
clamp(x, 0, 800)  // keep x between 0 and 800
lerp(a, b, 0.5)   // halfway between a and b
dist(posA, posB)   // distance between two positions
```

### Custom components

Need data that doesn't fit the built-in components? Just add it:

```ts
engine.spawn({
  position: { x: 100, y: 200 },
  ascii: { char: 'M', font: FONTS.large, color: '#aa44ff' },
  // Custom components — any data you want:
  mana: { current: 50, max: 100 },
  inventory: ['sword', 'potion'],
  aiState: 'patrol',
})
```

Query custom components the same way:

```ts
for (const e of engine.world.with('position', 'mana')) {
  e.mana.current += dt * 5  // regenerate mana
}
```

### Study the asteroid-field example

The full asteroid-field game in `games/asteroid-field/` demonstrates all these concepts working together — entity factories, systems, scoring, collisions, particles, difficulty ramping, and screen management. It's a great reference.

---

**That's everything.** You know how to create entities, move them, switch scenes, handle input, detect collisions, track score, and add polish. The rest is creativity.
