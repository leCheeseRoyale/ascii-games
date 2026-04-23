# ECS Patterns

Recipes for scenes, systems, and entities. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Scenes & Systems

### Define a scene
`setup` spawns entities and adds systems. Built-in systems are auto-registered.
```ts
import { defineScene, type Engine } from "@engine";
export const playScene = defineScene({
  name: "play",
  setup(engine: Engine) {
    engine.spawn({ position: { x: 100, y: 100 }, ascii: { char: "@", font: "16px monospace", color: "#fff" } });
  },
  update(_engine, _dt) {},  // optional
  cleanup(_engine) {},       // optional
});
```

### Register a system with priority
Lower priority runs first. Default `0` (before all built-ins). Use `SystemPriority.*` to interleave.
```ts
import { defineSystem, SystemPriority } from "@engine";
export const collisionSystem = defineSystem({
  name: "collision",
  priority: SystemPriority.physics + 1, // after physics, before tween
  update(engine) { for (const _e of engine.world.with("position", "collider")) { /* ... */ } },
});
// engine.addSystem(collisionSystem);
```

### Switch scenes with a transition
Types: `fade`, `fadeWhite`, `wipe`, `dissolve`, `scanline`.
```ts
await engine.loadScene("play", { transition: "dissolve", duration: 0.5 });
```

### Pass data between scenes
```ts
engine.loadScene("play", { data: { floor: 2, playerHp: 50 } });
// Inside playScene.setup:
const { floor = 1, playerHp = 100 } = engine.sceneData;
```

## Entities

### Spawn a player with input-driven movement
`_physics` integrates velocity — do not write `position += velocity * dt` yourself.
```ts
import { defineSystem, FONTS } from "@engine";
engine.spawn({
  position: { x: 200, y: 200 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "@", font: FONTS.large, color: "#00ff88" },
  tags: { values: new Set(["player"]) },
});
export const playerInput = defineSystem({
  name: "playerInput",
  update(engine) {
    for (const p of engine.world.with("player", "velocity")) {
      const kb = engine.keyboard;
      p.velocity.vx = ((kb.held("KeyD") ? 1 : 0) - (kb.held("KeyA") ? 1 : 0)) * 180;
      p.velocity.vy = ((kb.held("KeyS") ? 1 : 0) - (kb.held("KeyW") ? 1 : 0)) * 180;
    }
  },
});
```

### Entity factories return `Partial<Entity>`
```ts
import { FONTS, type Entity } from "@engine";
export function createBullet(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y }, velocity: { vx, vy },
    ascii: { char: "|", font: FONTS.normal, color: "#ffff00" },
    collider: { type: "circle", width: 4, height: 4 },
    lifetime: { remaining: 1.5 },
    tags: { values: new Set(["bullet"]) },
  };
}
```

### Destroy entities safely during iteration
Collect first — never mutate the world mid-query.
```ts
const toKill: any[] = [];
for (const e of engine.world.with("health")) if (e.health.current <= 0) toKill.push(e);
for (const e of toKill) engine.destroy(e);
```

### Entity pool for bullets / particles
Trades memory for alloc churn. `acquire` reuses a released entity or grows up to `max`.
```ts
import { createEntityPool, FONTS } from "@engine";
const bullets = createEntityPool(engine, () => ({
  position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "|", font: FONTS.normal, color: "#ff0", opacity: 1 },
  collider: { type: "circle", width: 4, height: 4 },
  tags: { values: new Set(["bullet"]) },
}), { size: 64, max: 256 });
const b = bullets.acquire({ position: { x, y }, velocity: { vx: 0, vy: -400 } });
b.ascii!.opacity = 1;
bullets.release(b); // on collision / off-screen
```
