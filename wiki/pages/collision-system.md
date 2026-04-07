# Collision System

The game-layer system that handles all collision responses in the asteroid field game.

## Overview

Defined with `defineSystem`. Runs every frame during the play scene. Handles two collision pairs: bullet×asteroid and player×asteroid. Also cleans up off-screen asteroids.

## Finding Entities

Entities are found via tags and component queries:

```ts
const bullets   = world.with('position', 'collider', 'tags')
                       .where(e => e.tags.values.has('bullet'))
const asteroids = world.with('position', 'collider', 'tags')
                       .where(e => e.tags.values.has('asteroid'))
const players   = world.with('position', 'collider', 'player', 'health')
```

## Bullet × Asteroid Collisions

Nested loop checks every bullet against every asteroid for overlap:

```ts
for (const bullet of bullets) {
  for (const asteroid of asteroids) {
    if (overlaps(bullet, asteroid)) {
      // Destroy both
      world.remove(bullet)
      world.remove(asteroid)

      // Particle burst at asteroid position
      particles.burst(asteroid.position.x, asteroid.position.y, {
        count: 8,
        color: asteroid.ascii.color,
      })

      // Score
      score += GAME.scoring.perKill
      useStore.getState().setScore(score)

      // Audio + screen shake
      sfx.hit()
      camera.shake(3)
    }
  }
}
```

Score is tracked at module level and pushed to the zustand store.

## Player × Asteroid Collisions

Checks the player against all asteroids, with invincibility protection:

```ts
if (invincibilityTimer > 0) {
  invincibilityTimer -= dt
  return // skip collision checks
}

for (const asteroid of asteroids) {
  if (overlaps(player, asteroid)) {
    // Damage
    player.health.current--
    useStore.getState().setHealth(player.health.current)

    // Invincibility frames
    invincibilityTimer = GAME.player.invincibleTime // ~1.5s

    // Destroy the asteroid
    world.remove(asteroid)

    // Big particle burst
    particles.burst(player.position.x, player.position.y, {
      count: 20,
      color: 'white',
    })

    // Big shake + sound
    camera.shake(8)
    sfx.explode()

    // Check for death
    if (player.health.current <= 0) {
      sfx.death()

      // Massive death explosion
      particles.burst(player.position.x, player.position.y, {
        count: 50,
        color: 'red',
      })

      loadScene('game-over')
      return
    }
  }
}
```

### Invincibility Timer

After getting hit, the player has ~1.5 seconds where asteroid collisions are ignored. The timer is module-level state, decremented by dt each frame. This prevents rapid multi-hit from overlapping asteroids.

## Off-Screen Cleanup

Asteroids that drift far off-screen are removed to prevent entity count from growing forever:

```ts
for (const asteroid of asteroids) {
  const { x, y } = asteroid.position
  if (x < -100 || x > width + 100 || y < -100 || y > height + 100) {
    world.remove(asteroid)
  }
}
```

## Shared State

The collision system exports a shared ParticlePool for other systems to use. Module-level variables track:
- `score` — cumulative kill score
- `invincibilityTimer` — countdown after player hit

These reset when the play scene loads.

## Collision Detection

The `overlaps()` function checks circle-circle intersection using the collider components. Both entities need position and collider components.

## See Also

- [[collision-detection]] — Engine-level overlap utilities
- [[particles]] — The particle pool and burst effects
- [[asteroid-field-game]] — Full game walkthrough
