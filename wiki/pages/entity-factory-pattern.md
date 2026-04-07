# Entity Factory Pattern

How game entities are created through composable factory functions.

## Why Factories Return Partial<Entity>

Entity factories return `Partial<Entity>` instead of full Entity objects because:

1. **Component composition** — entities only get the components they need. A bullet doesn't need health. An asteroid doesn't need player input.
2. **miniplex handles the rest** — when you call `world.add(partial)`, miniplex assigns an ID and fills in defaults. The factory doesn't need to know about every possible component.
3. **Type safety** — TypeScript ensures the components you DO provide are correctly shaped, without forcing you to specify every optional component.

```ts
// Factory returns only the components this entity needs
export function createAsteroid(x, y, vx, vy): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: { ... },
    collider: { ... },
    tags: { values: new Set(['asteroid']) },
  }
}

// miniplex adds it to the world
const entity = world.add(createAsteroid(100, 0, 0, 2))
```

## Component Composition

Mix and match components to define entity archetypes:

| Entity   | position | velocity | ascii | player | collider | health | lifetime | tags |
|----------|----------|----------|-------|--------|----------|--------|----------|------|
| Player   | ✓        | ✓        | ✓     | ✓      | ✓        | ✓      |          |      |
| Asteroid | ✓        | ✓        | ✓     |        | ✓        |        |          | ✓    |
| Bullet   | ✓        | ✓        | ✓     |        | ✓        |        | ✓        | ✓    |

Systems query by component presence, so adding/removing components changes behavior without code changes.

## Example Factories

### createPlayer(x, y)

```ts
export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '@',
      fontSize: /* large */,
      color: 'green',
      glow: true,
    },
    player: { index: 0 },
    collider: { shape: 'circle', width: 20, height: 20 },
    health: { current: GAME.player.maxHealth, max: GAME.player.maxHealth },
  }
}
```

### createAsteroid(x, y, vx, vy)

```ts
export function createAsteroid(x, y, vx, vy): Partial<Entity> {
  const char = randomFrom(GAME.asteroid.chars)
  const color = randomFrom(GAME.asteroid.colors)
  const scale = randomBetween(GAME.asteroid.minScale, GAME.asteroid.maxScale)
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: { char, color, fontSize: baseSize * scale },
    collider: { shape: 'circle', width: 20 * scale, height: 20 * scale },
    tags: { values: new Set(['asteroid']) },
  }
}
```

### createBullet(x, y, vx, vy)

```ts
export function createBullet(x, y, vx, vy): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: { char: '•', color: 'cyan', glow: true, fontSize: /* small */ },
    lifetime: { remaining: 1.5 },
    collider: { shape: 'circle', width: 6, height: 6 },
    tags: { values: new Set(['bullet']) },
  }
}
```

## Convention

One file per factory in `game/entities/`:

```
game/entities/
  player.ts      → createPlayer()
  asteroid.ts    → createAsteroid()
  bullet.ts      → createBullet()
```

Each file exports a single factory function. The scaffolding tool `bun run new:entity` generates this template automatically.

## See Also

- [[ecs-architecture]] — The Entity/Component/System model
- [[component-reference]] — All available components
