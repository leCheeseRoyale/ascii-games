---
name: ecs-mastery
description: Use when designing entity/component architecture, defining custom systems, choosing system priorities, understanding built-in system behavior (`_measure`, `_parent`, `_spring`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds`, `_emitter`, `_stateMachine`, `_trail`), working with `SystemPriority` ordering, spawning/destroying entities, querying the world (`engine.world.with()`, `.without()`, `.where()`, `findByTag`, `findAllByTag`), composing entity factories, understanding the scene lifecycle (setup/update/cleanup), using tweens (`engine.tweenEntity`), animations (`engine.playAnimation`), state machines (`stateMachine` component + `transition()`), emitters, lifetime, parent-child hierarchies, or debugging ECS-related issues like double-speed movement or missing entities.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# ECS mastery

This skill covers the Entity-Component-System layer — the architectural backbone of all non-`defineGame` games. Understand this and you understand how everything in the engine connects.

## Why miniplex + plain objects

The engine uses [miniplex](https://github.com/hmans/miniplex) as its ECS world, with entities as **plain JavaScript objects** (no classes, no decorators). Why:

- **Serialization:** Plain objects `JSON.stringify()` naturally — critical for save/load and multiplayer state hashing.
- **Debuggability:** Inspect any entity in the console by printing it. No prototype chain to navigate.
- **Simplicity:** Components are just properties. Adding a component = setting a property. Removing = deleting it.
- **Query performance:** Miniplex uses internal indexing on component presence. `.with('position', 'velocity')` is a pre-built archetype query, not a filter.

## Source files

| File | What it owns |
|---|---|
| `shared/types.ts` | `Entity` type + every component shape |
| `shared/events.ts` | Full typed event catalog |
| `engine/ecs/systems.ts` | `SystemRunner`, `defineSystem`, `SystemPriority`, built-in system list |
| `engine/ecs/screen-bounds-system.ts` | `_screenBounds` built-in |
| `engine/core/engine.ts` | `engine.spawn()`, `engine.destroy()`, entity queries, system registration |
| `engine/core/scene.ts` | Scene lifecycle (setup → update → cleanup) |

## Entity lifecycle

### Spawn

Always use `engine.spawn(partialEntity)`. Never `engine.world.add()` directly.

```typescript
const enemy = engine.spawn({
  position: { x: 100, y: 200 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: 'E', color: '#ff4444', font: '16px monospace' },
  collider: { type: 'circle', width: 16, height: 16 },
  health: { current: 3, max: 3 },
  tags: { values: new Set(['enemy']) },
})
```

**Why `engine.spawn()` instead of `world.add()`?** Spawn validates the entity and warns about common mistakes:
- NaN positions
- Invisible entities (missing char or font)
- Zero-size colliders
- Velocity without position
- Physics without velocity

Warnings surface in the debug overlay (backtick key) and browser console.

### Entity factories

Factories return `Partial<Entity>`, not full entities:

```typescript
export function createEnemy(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: 'E', color: '#ff4444', font: '16px monospace' },
    collider: { type: 'circle', width: 16, height: 16 },
    health: { current: 3, max: 3 },
    tags: { values: new Set(['enemy']) },
  }
}
```

**Why `Partial<Entity>`?** Not every entity needs every component. The type system enforces that you only set components that exist on `Entity`, while allowing any subset.

### Destroy

```typescript
engine.destroy(entity)              // remove single entity
engine.destroyAll('enemy')          // remove all entities with tag
engine.destroyWithChildren(entity)  // remove entity + all children (parent-child hierarchy)
```

**Critical rule:** Never destroy entities during iteration. Materialize first:

```typescript
const toDestroy = [...engine.world.with('bullet')].filter(b => b.health.current <= 0)
for (const b of toDestroy) engine.destroy(b)
```

## Queries

```typescript
engine.world.with('position', 'velocity')           // entities with both components
engine.world.with('health').without('invincible')    // has health, lacks invincible
engine.world.where(e => e.health?.current < 5)       // predicate filter (slower)

engine.findByTag('player')        // first entity with tag (or undefined)
engine.findAllByTag('enemy')      // all entities with tag
```

**Why `.with()` over `.where()`?** Miniplex pre-indexes entities by component presence. `.with()` is an instant archetype lookup. `.where()` runs a predicate on every entity — use it only for value-based filtering after narrowing with `.with()`.

## 11 built-in systems

Auto-registered on every scene load. **Never add these manually.**

| System | Priority | What it does |
|---|---|---|
| `_measure` | 5 | Measures text dimensions via Pretext, updates `collider: "auto"` sizes |
| `_parent` | 10 | Propagates parent position to children (hierarchical transforms) |
| `_spring` | 15 | Applies spring force toward home position (`spring` component) |
| `_physics` | 20 | Integrates velocity, applies gravity/friction/drag/maxSpeed, NaN recovery, boundary bounce |
| `_tween` | 30 | Advances active tweens toward target values with easing |
| `_animation` | 40 | Steps through frame sequences (`animation` component) |
| `_emitter` | 50 | Spawns entities from emitter configs at configured intervals |
| `_stateMachine` | 60 | Runs active state's `update()`, handles transitions |
| `_lifetime` | 70 | Decrements `lifetime.remaining`, destroys entities when expired |
| `_screenBounds` | 80 | Handles entities leaving screen (destroy, wrap, bounce, clamp) |
| `_trail` | (after physics) | Spawns trail entities behind moving entities |

The `_collisionEvents` system is **lazy-registered** on first `engine.onCollide()` call — not part of the default 11.

### System ordering

Custom systems default to `priority: 0` — they run **before all built-ins**.

```typescript
const mySystem = defineSystem({
  name: 'my-movement',
  priority: 0,                          // default: runs first
  update: (engine, dt) => { ... },
})

const postPhysics = defineSystem({
  name: 'post-physics-clamp',
  priority: SystemPriority.physics + 1,  // 21: runs right after physics
  update: (engine, dt) => { ... },
})
```

**`SystemPriority` constants:**
```
measure=5, parent=10, spring=15, physics=20, tween=30,
animation=40, emitter=50, stateMachine=60, lifetime=70, screenBounds=80
```

**Why explicit priorities instead of dependency graphs?** Simpler to reason about. You can see the exact execution order by sorting priorities. No circular dependency issues. The numeric system allows inserting between any two built-ins.

### Phase gating

For turn-based games, systems can declare a `phase`:

```typescript
const combatSystem = defineSystem({
  name: 'combat',
  phase: 'combat',        // only runs during 'combat' phase
  update: (engine, dt) => { ... },
})
```

Systems without `phase` always run. This lets you gate real-time behavior to specific turn phases.

## Scene lifecycle

```typescript
const playScene = defineScene({
  name: 'play',
  setup: (engine) => {
    // Spawn entities, add custom systems, configure camera
    engine.spawn(createPlayer(100, 100))
    engine.addSystem(playerInputSystem)
  },
  update: (engine, dt) => {
    // Per-frame logic that doesn't fit in a system
    // Runs AFTER all systems
  },
  cleanup: (engine) => {
    // Called when leaving this scene
    // Systems and entities are auto-cleared, but cleanup custom state here
  },
})
```

**What happens on `engine.loadScene('play')`:**
1. Old scene's `cleanup()` called
2. Music stopped
3. All systems cleared
4. All entities removed from world
5. New scene's `setup()` called
6. 11 built-in systems added (after setup, so custom systems register first)
7. `scene:loaded` event emitted

**Why clear everything between scenes?** Prevents entity/system leakage. Each scene starts clean. If you need persistent entities across scenes, store the data and recreate them in the new scene's setup.

## Tweens

```typescript
engine.tweenEntity(entity, 'position.x', 0, 400, 1.0, 'easeOut')
engine.tweenEntity(entity, 'ascii.opacity', 1, 0, 0.5, 'easeInOut')
```

The `_tween` system (priority 30) advances tweens each frame. Supports nested property paths. Available easing: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`.

## Animations

```typescript
entity.animation = {
  frames: [{ char: '◯' }, { char: '◎' }, { char: '●' }],
  frameDuration: 0.15,
  loop: true,
}
engine.playAnimation(entity, frames, frameDuration)
```

The `_animation` system (priority 40) steps through frames, updating the entity's `ascii.char`.

## State machines

```typescript
entity.stateMachine = {
  current: 'idle',
  states: {
    idle: {
      enter: (entity, engine) => { entity.ascii.char = '.' },
      update: (entity, engine, dt) => {
        if (playerNearby) transition(entity, 'alert')
      },
    },
    alert: {
      enter: (entity, engine) => { entity.ascii.char = '!' },
      update: (entity, engine, dt) => { ... },
      exit: (entity, engine) => { ... },
    },
  },
}
```

The `_stateMachine` system (priority 60) calls the active state's `update()`. `transition(entity, newState)` calls `exit()` on old state, sets `current`, calls `enter()` on new state.

## Emitters

```typescript
entity.emitter = {
  factory: () => ({
    position: { x: entity.position.x, y: entity.position.y },
    velocity: { vx: (Math.random() - 0.5) * 100, vy: -50 },
    ascii: { char: '*', color: '#ffcc00' },
    lifetime: { remaining: 0.5 },
  }),
  interval: 0.1,    // spawn every 0.1s
  count: 3,         // spawn 3 per interval
}
```

The `_emitter` system (priority 50) spawns entities from the factory at the configured interval.

## Parent-child hierarchies

```typescript
const parent = engine.spawn({ position: { x: 100, y: 100 }, ... })
const child = engine.spawn({
  position: { x: 20, y: 0 },   // offset from parent
  parent: { entity: parent },
  ...
})
```

The `_parent` system (priority 10) adds the parent's position to the child's position each frame. `engine.destroyWithChildren(parent)` recursively destroys the hierarchy.

## Things NOT to do

- **Don't create classes for entities.** Plain objects only. Classes break serialization and miniplex query performance.
- **Don't mutate the world during iteration.** Materialize to array first: `const list = [...engine.world.with(...)]`.
- **Don't add built-in systems manually.** They auto-register on scene load.
- **Don't integrate velocity manually.** `_physics` handles `position += velocity * dt`.
- **Don't use `engine.world.add()` directly.** Use `engine.spawn()` for validation.
- **Don't use `setInterval`/`setTimeout`.** Use `engine.after()`, `engine.every()`, `engine.sequence()`, `Cooldown`.

## When to read further

- Physics details (gravity, collision, springs) → invoke **`/ascii-games-dev:physics`**
- AI state machines → invoke **`/ascii-games-dev:behaviors`**
- Component shapes reference → read `shared/types.ts`
- Event catalog → read `shared/events.ts`
- System priority constants → read `engine/ecs/systems.ts`
