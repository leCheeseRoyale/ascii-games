# Asteroid Field Game

Complete walkthrough of the example game that ships with the engine.

## Overview

A classic asteroid-dodging shooter rendered entirely in ASCII. The player pilots `@` through a field of tumbling ASCII asteroids, shooting them for score while managing health-based lives.

## Game Structure

### 3 Scenes

| Scene     | Purpose                                      |
|-----------|----------------------------------------------|
| title     | Main menu. Waits for game:start event.       |
| play      | Core gameplay loop. All systems active.      |
| game-over | Shows final score. Waits for game:restart.   |

Flow: `title → play → game-over → play → ...`

### 5 Systems

| System           | Role                                              |
|------------------|---------------------------------------------------|
| player-input     | WASD/arrows movement, Space to shoot, screen wrap |
| movement         | Applies velocity to position (pos += vel * dt)    |
| asteroid-spawner | Spawns asteroids from screen edges on a timer     |
| collision        | Bullet×asteroid and player×asteroid detection     |
| lifetime         | Destroys entities when lifetime.remaining <= 0    |

### 3 Entity Factories

| Factory        | Creates                            |
|----------------|------------------------------------|
| createPlayer   | The @ player with health + collider|
| createAsteroid | Random ASCII rock with velocity    |
| createBullet   | Small • projectile with lifetime   |

## Wiring: game/index.ts

```ts
export function setupGame(engine: Engine): string {
  engine.registerScene('title', titleScene)
  engine.registerScene('play', playScene)
  engine.registerScene('game-over', gameOverScene)
  return 'title' // initial scene
}
```

GameCanvas calls setupGame on mount, then engine.start('title').

## Gameplay Mechanics

### Movement
WASD or arrow keys set player velocity. Diagonal movement is normalized so you don't move faster diagonally. The player wraps around screen edges.

### Shooting
Space fires a bullet in the last movement direction (defaults to up). Bullets have a cooldown (GAME.player.shootCooldown) to prevent spam. Bullets auto-destroy after 1.5 seconds via the lifetime system.

### Scoring
Each asteroid destroyed by a bullet awards points (GAME.scoring.perKill). Score is pushed to the zustand store which auto-tracks high score.

### Health-Based Lives
Player starts with maxHealth (default 3). Each asteroid collision costs 1 health. Health <= 0 triggers death and transition to game-over scene.

### Difficulty Ramp
As play time increases:
- **Spawn rate increases** — spawn interval decreases from initial value down to a minimum of 0.3 seconds
- **Speed increases** — asteroids move faster over time
- This creates natural tension escalation without explicit difficulty levels

### Invincibility Frames
After taking a hit, the player gets ~1.5 seconds of invincibility. During this time, asteroid collisions are ignored. Visual feedback indicates the invincible state.

### Juice

- **Particle explosions** — asteroids burst into particles on destruction. Death triggers a massive explosion.
- **Screen shake** — small shake (3) on asteroid kill, big shake (8) on player hit.
- **Procedural audio** — sfx.hit on asteroid destruction, sfx.explode on player hit, sfx.death on game over.

## Configuration: game/config.ts

All tuning values live in the GAME config object:

```ts
const GAME = {
  title: '...',
  description: '...',
  player: {
    speed: ...,
    maxHealth: ...,
    invincibleTime: ...,
    shootCooldown: ...,
    bulletSpeed: ...,
    color: 'green',
    glow: true,
  },
  asteroid: {
    chars: ['◆', '●', '▲', ...],
    colors: [...],
    speed: { min: ..., max: ... },
    spawnInterval: { min: ..., max: ... },
    minScale: ...,
    maxScale: ...,
  },
  scoring: {
    perKill: ...,
  },
}
```

## See Also

- [[scene-lifecycle]] — How title/play/game-over scenes manage transitions
- [[system-runner]] — How the 5 systems execute each frame
- [[entity-factory-pattern]] — The createPlayer/Asteroid/Bullet factories
