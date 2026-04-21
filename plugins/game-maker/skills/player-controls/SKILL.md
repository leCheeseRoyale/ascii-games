---
name: player-controls
description: Use when the user wants to make a player move, add player input, handle keyboard/mouse/gamepad controls, build top-down movement, platformer jumping, space-drift physics, grid-based tile movement, click-to-move, or asks "how do I move my character", "add WASD controls", "make the player jump", "add shooting". Covers every movement pattern with copy-paste code.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Player controls

Every movement pattern you'll need, ready to copy into your game.

**The one rule:** Set `velocity`, never move `position` directly. The engine moves things for you.

## Top-down (RPG, arena, twin-stick)

```ts
// game/systems/player-input.ts
import { defineSystem } from '@engine'

export const playerInput = defineSystem({
  name: 'player-input',
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player) return

    const speed = 200
    const kb = engine.keyboard

    player.velocity.vx = 0
    player.velocity.vy = 0
    if (kb.held('KeyA') || kb.held('ArrowLeft'))  player.velocity.vx = -speed
    if (kb.held('KeyD') || kb.held('ArrowRight')) player.velocity.vx = speed
    if (kb.held('KeyW') || kb.held('ArrowUp'))    player.velocity.vy = -speed
    if (kb.held('KeyS') || kb.held('ArrowDown'))  player.velocity.vy = speed

    // Normalize diagonal movement (otherwise diagonal is ~1.4x faster)
    const { vx, vy } = player.velocity
    if (vx !== 0 && vy !== 0) {
      player.velocity.vx *= 0.707
      player.velocity.vy *= 0.707
    }
  },
})
```

Wire in your scene's `setup`: `engine.addSystem(playerInput)`

## Platformer (gravity + jump)

Your player entity needs a `physics` component:

```ts
// game/entities/player.ts
import { FONTS, COLORS, type Entity } from '@engine'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '@', font: FONTS.normal, color: COLORS.accent },
    collider: { type: 'rect', width: 14, height: 14 },
    physics: { gravity: 600, friction: 8 },
    tags: { values: new Set(['player']) },
  }
}
```

```ts
// game/systems/player-input.ts
import { defineSystem } from '@engine'

const SPEED = 200
const JUMP_FORCE = 350

export const playerInput = defineSystem({
  name: 'player-input',
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player) return

    const kb = engine.keyboard
    player.velocity.vx = 0
    if (kb.held('KeyA') || kb.held('ArrowLeft'))  player.velocity.vx = -SPEED
    if (kb.held('KeyD') || kb.held('ArrowRight')) player.velocity.vx = SPEED

    // Jump only when on the ground
    if ((kb.pressed('Space') || kb.pressed('ArrowUp')) && player.physics?.grounded) {
      player.velocity.vy = -JUMP_FORCE  // negative = up
    }
  },
})
```

You also need a collision system that sets `physics.grounded = true` when the player lands on a surface. See `games/platformer/systems/platform-collision.ts` for the pattern.

## Space drift (asteroids-style)

No friction, momentum-based. Player keeps drifting after releasing keys.

```ts
const THRUST = 400

export const playerInput = defineSystem({
  name: 'player-input',
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player) return

    if (engine.keyboard.held('ArrowUp'))    player.velocity.vy -= THRUST * dt
    if (engine.keyboard.held('ArrowDown'))  player.velocity.vy += THRUST * dt
    if (engine.keyboard.held('ArrowLeft'))  player.velocity.vx -= THRUST * dt
    if (engine.keyboard.held('ArrowRight')) player.velocity.vx += THRUST * dt
  },
})
```

Add `physics: { drag: 0.3, maxSpeed: 300 }` to your player entity so they don't accelerate forever.

Add `screenWrap: { margin: 10 }` to the player entity so they wrap around screen edges.

## Grid-based (roguelike, puzzle)

Move one tile at a time. No velocity — teleport between grid cells.

```ts
const TILE_SIZE = 16

export const playerInput = defineSystem({
  name: 'player-input',
  phase: 'player',  // only runs during player's turn phase
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player?.gridPos) return

    const kb = engine.keyboard
    let dx = 0, dy = 0
    if (kb.pressed('ArrowLeft')  || kb.pressed('KeyA')) dx = -1
    if (kb.pressed('ArrowRight') || kb.pressed('KeyD')) dx = 1
    if (kb.pressed('ArrowUp')    || kb.pressed('KeyW')) dy = -1
    if (kb.pressed('ArrowDown')  || kb.pressed('KeyS')) dy = 1

    if (dx === 0 && dy === 0) return

    const newCol = player.gridPos.col + dx
    const newRow = player.gridPos.row + dy

    // Check if target cell is walkable (your dungeon grid)
    if (!isWalkable(newCol, newRow)) return

    player.gridPos.col = newCol
    player.gridPos.row = newRow
    // Tween the world position for smooth visual movement
    engine.tweenEntity(player, 'position.x', player.position.x, newCol * TILE_SIZE, 0.1, 'easeOut')
    engine.tweenEntity(player, 'position.y', player.position.y, newRow * TILE_SIZE, 0.1, 'easeOut')

    engine.turns.endPhase()  // advance to next turn phase
  },
})
```

## Shooting

```ts
import { defineSystem, FONTS, type Entity } from '@engine'

function createBullet(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: { char: '•', font: FONTS.small, color: '#ffff00' },
    collider: { type: 'circle', width: 4, height: 4 },
    lifetime: { remaining: 2 },
    offScreenDestroy: { margin: 20 },
    tags: { values: new Set(['bullet']) },
  }
}

let shootCooldown = 0
let lastDirX = 0, lastDirY = -1  // default: shoot up

export const shootingSystem = defineSystem({
  name: 'shooting',
  update(engine, dt) {
    shootCooldown -= dt
    const player = engine.findByTag('player')
    if (!player) return

    // Track last movement direction for aiming
    if (player.velocity.vx !== 0 || player.velocity.vy !== 0) {
      lastDirX = Math.sign(player.velocity.vx)
      lastDirY = Math.sign(player.velocity.vy)
    }

    if (engine.keyboard.pressed('Space') && shootCooldown <= 0) {
      shootCooldown = 0.2  // fire rate: 5 per second
      const speed = 400
      engine.spawn(createBullet(
        player.position.x, player.position.y,
        lastDirX * speed, lastDirY * speed
      ))
    }
  },
})
```

## Mouse aiming + click to shoot

```ts
export const mouseShoot = defineSystem({
  name: 'mouse-shoot',
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player || !engine.mouse.justDown) return

    // Direction from player to mouse click
    const dx = engine.mouse.x - player.position.x
    const dy = engine.mouse.y - player.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist === 0) return

    const speed = 400
    engine.spawn(createBullet(
      player.position.x, player.position.y,
      (dx / dist) * speed, (dy / dist) * speed
    ))
  },
})
```

## Click-to-move

```ts
let targetX = 0, targetY = 0, hasTarget = false

export const clickToMove = defineSystem({
  name: 'click-to-move',
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player) return

    if (engine.mouse.justDown) {
      targetX = engine.mouse.x
      targetY = engine.mouse.y
      hasTarget = true
    }

    if (!hasTarget) return

    const dx = targetX - player.position.x
    const dy = targetY - player.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 5) {
      player.velocity.vx = 0
      player.velocity.vy = 0
      hasTarget = false
    } else {
      const speed = 150
      player.velocity.vx = (dx / dist) * speed
      player.velocity.vy = (dy / dist) * speed
    }
  },
})
```

## Gamepad and remappable input

For polished games, use `InputBindings` instead of raw keyboard checks:

```ts
// Read semantic actions instead of raw keys
if (engine.input.held('move-left'))  player.velocity.vx = -speed
if (engine.input.pressed('action-a')) shoot()

// Default bindings: WASD + Arrows + Gamepad D-pad + face buttons
// Players can rebind at runtime — see /game-maker:game-ui for settings screens
```

## Reference templates

| Movement type | Look at |
|---|---|
| Top-down | `games/blank/scenes/play.ts` |
| Space drift + shooting | `games/asteroid-field/systems/player-input.ts` |
| Platformer + jump | `games/platformer/systems/player-input.ts` |
| Grid-based turn | `games/roguelike/systems/player-input.ts` |
| Spring physics text | `games/physics-text/scenes/play.ts` |
