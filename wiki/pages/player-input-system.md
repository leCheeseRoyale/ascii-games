# Player Input System

The system that translates keyboard input into player movement and shooting.

## Overview

Defined with `defineSystem`. Queries the world for entities with `position`, `velocity`, and `player` components. Runs every frame during the play scene.

## Movement: WASD / Arrow Keys

Reads `keyboard.held()` for directional input and sets velocity:

```ts
let vx = 0, vy = 0

if (keyboard.held('KeyW') || keyboard.held('ArrowUp'))    vy = -1
if (keyboard.held('KeyS') || keyboard.held('ArrowDown'))  vy =  1
if (keyboard.held('KeyA') || keyboard.held('ArrowLeft'))  vx = -1
if (keyboard.held('KeyD') || keyboard.held('ArrowRight')) vx =  1

// Normalize diagonal movement
if (vx !== 0 && vy !== 0) {
  const len = Math.sqrt(vx * vx + vy * vy)
  vx /= len
  vy /= len
}

entity.velocity.vx = vx * GAME.player.speed
entity.velocity.vy = vy * GAME.player.speed
```

Without normalization, diagonal movement would be ~1.41x faster than cardinal movement.

## Screen Wrapping

After the movement system updates position, the player wraps around screen edges:

```ts
if (position.x > width)  position.x = 0
if (position.x < 0)      position.x = width
if (position.y > height) position.y = 0
if (position.y < 0)      position.y = height
```

This keeps the player always on screen with a classic arcade feel. Walking off one edge teleports to the opposite edge.

## Shooting: Space Bar

Space fires a bullet using a Cooldown to prevent spam:

```ts
if (keyboard.held('Space') && cooldown.ready()) {
  cooldown.reset(GAME.player.shootCooldown)

  // Aim in last movement direction, default to up
  const dir = lastDirection || { vx: 0, vy: -1 }

  world.add(createBullet(
    position.x,
    position.y,
    dir.vx * GAME.player.bulletSpeed,
    dir.vy * GAME.player.bulletSpeed,
  ))
}
```

### Last Movement Direction

The system tracks the last non-zero movement direction. When the player presses Space while stationary, the bullet fires in the last direction they moved. If the player hasn't moved at all, bullets fire upward by default.

### Cooldown

The cooldown prevents firing every frame (which at 60fps would create 60 bullets/second). The cooldown period is configured in `GAME.player.shootCooldown`.

## Bullet Lifecycle

Bullets created here get:
- `position` — at the player's current location
- `velocity` — in the aim direction at bullet speed
- `ascii` — '•' in cyan with glow
- `lifetime` — 1.5 seconds before auto-destruction
- `collider` — small circle for collision detection
- `tags` — Set(['bullet']) for the collision system to find them

The movement system moves them, the lifetime system destroys them, and the collision system checks them against asteroids.

## See Also

- [[input-system]] — The engine's keyboard/mouse input layer
- [[system-runner]] — How systems are scheduled and executed
