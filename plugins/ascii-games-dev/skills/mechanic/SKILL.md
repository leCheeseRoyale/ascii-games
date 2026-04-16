---
name: mechanic
description: Activates when the user invokes `/ascii-games-dev:mechanic` or asks to "add a mechanic", "wire up an enemy", "make an entity that <behavior>", or "build a <turret/patroller/chaser/spawner>" in the ascii-games engine. Composes entity factory + state-machine behavior + damage hookup from a free-text description.
argument-hint: [mechanic description]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Compose a gameplay mechanic

User input in `$ARGUMENTS`. If empty, ask what they want to build.

## Workflow

### 1. Ground in authoritative references

- `docs/API-generated.md` — verify which `@engine/behaviors/*` helpers exist
- `engine/behaviors/ai.ts` — patrol / chase / flee / wander signatures
- `engine/behaviors/damage.ts` — `createDamageSystem` + `createDamageFlash`
- `engine/behaviors/wave-spawner.ts` — for wave-based enemies
- `engine/ecs/state-machine-system.ts` — how `stateMachine` component works
- `games/roguelike/entities/` + `games/roguelike/systems/` for idiomatic composition

### 2. Decompose the description into 4 layers

Every mechanic is some mix of these:

1. **Entity** — what's on screen. Needs `position` + one of (`ascii` / `sprite` / `textBlock`) + usually `collider` and `tags`.
2. **Behavior** — how it acts each frame. State machine + existing AI primitives, or a custom `defineSystem`.
3. **Interaction** — what happens on touch / damage / pickup. Either a system that checks `overlaps()` or the `_lifetime` / `_screenBounds` / damage-system pipelines.
4. **Feedback** — what the player sees/hears. Particles + camera shake + sfx + floating text. **Don't inline this here — defer to `/ascii-games-dev:juice`** after the mechanic works.

For the user's description, write out the 4 layers explicitly before coding:

```
Description: "enemy that patrols then charges at player when within 8 tiles"

1. Entity:     position, velocity, ascii, collider, health, stateMachine, tags:['enemy']
2. Behavior:   stateMachine with states 'patrol' (via createPatrolBehavior) and 'charge' (custom).
               Transition in `update`: if dist(self, player) < 8*TILE → transition(entity, 'charge')
3. Interaction: collision system — if overlaps(enemy, player) and state==='charge', apply `damage: { amount: 1 }`
4. Feedback:    (defer to /juice — hit flash on damage, dust puff on charge start)
```

### 3. Compose from existing primitives before inventing

Reach for these before writing custom logic:

| Want | Use |
|---|---|
| Patrol between waypoints | `createPatrolBehavior({ waypoints, speed })` |
| Chase target until out of range | `createChaseBehavior({ target, speed, range })` |
| Flee when target close | `createFleeBehavior({ target, speed, panicRange })` |
| Random wandering | `createWanderBehavior({ speed, changeInterval })` |
| Wave-based enemy spawning | `createWaveSpawner({ waves, onWaveComplete })` |
| HP + i-frames + death callback | `createDamageSystem({ invincibilityDuration, onDeath })` |
| One-shot hit visual | `createDamageFlash(entity, engine)` |

If none fit, compose a custom state machine:

```ts
entity.stateMachine = {
  current: 'patrol',
  states: {
    patrol: createPatrolBehavior({ waypoints, speed: 40 }),
    charge: {
      enter(entity, engine) { /* dust puff */ },
      update(entity, engine, dt) { /* move toward player */ },
    },
  },
}
```

Use `transition(entity, 'charge')` from `@engine` to switch states; the built-in `_stateMachine` runs the rest.

### 4. Generate the code

Files to produce (typical):

- `game/entities/<name>.ts` — factory returning `Partial<Entity>`
- `game/systems/<name>-ai.ts` — only if the behavior can't be expressed as a state-machine state
- `game/systems/<name>-collision.ts` — if this mechanic has its own collision response

Wire into the scene: in `play.ts` `setup()` call `engine.spawn(createX(x, y))` and `engine.addSystem(xSystem)`.

### 5. Verify the mechanic works

- `bun run check` — typecheck
- `bun run test` — regressions
- If the dev server is running, the mechanic should appear on hot-reload

### 6. Suggest juice

After the mechanic is wired, say: "Mechanic works. Run `/ascii-games-dev:juice <file>` to layer feedback."

## Things NOT to do

- Don't create a class for the entity. Entities are plain objects.
- Don't manually integrate velocity. `_physics` does it.
- Don't skip tests. Each new system ideally has a quick `mockEngine()`-based test in `engine/__tests__/` or `game/__tests__/` — but only for the game's bespoke systems, not for `@engine/behaviors/*` (already tested).
- Don't spawn from inside a system's iteration loop over the same entity set. Collect first, spawn after.
- Don't reinvent `createPatrolBehavior` et al. Grep `@engine/behaviors/ai` first.

## Example: "turret that tracks player and fires every 2 seconds"

1. Entity: `position`, `ascii` (char '⊕'), `collider`, `tags:['turret']`, plus a custom `_turret: { cooldown: 0 }` field.
2. Behavior: `defineSystem({ name: 'turretAi', update })` — on each frame, rotate toward player (update ascii rotation isn't a thing; instead update a `_aimAngle` field). When cooldown hits 0, `engine.spawn(createBullet(...))` in the aim direction.
3. Interaction: `createDamageSystem` handles the bullet→enemy path if enemies exist; otherwise bullets just fly off-screen and `offScreenDestroy` cleans up.
4. Feedback: defer to `/juice`.

Output files: `game/entities/turret.ts`, `game/entities/turret-bullet.ts`, `game/systems/turret-ai.ts`. Register in `play.ts` setup.
