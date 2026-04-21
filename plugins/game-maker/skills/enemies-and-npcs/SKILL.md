---
name: enemies-and-npcs
description: Use when the user wants to add enemies, NPCs, bosses, or AI behaviors to their game. Covers patrol routes, chasing the player, fleeing, random wandering, wave spawning, boss patterns, NPC dialog, and state machine composition. Triggers on "add an enemy", "make enemies patrol", "enemy AI", "wave spawner", "NPC dialog", "boss fight", "enemies that chase".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Enemies and NPCs

How to populate your game with things that move, attack, talk, and challenge the player.

## Quick enemy — spawn a basic chaser

```ts
// game/entities/enemy.ts
import { FONTS, type Entity } from '@engine'

export function createEnemy(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: 'E', font: FONTS.normal, color: '#ff4444' },
    collider: { type: 'circle', width: 14, height: 14 },
    health: { current: 3, max: 3 },
    tags: { values: new Set(['enemy']) },
  }
}
```

```ts
// game/systems/enemy-ai.ts
import { defineSystem } from '@engine'

export const enemyAI = defineSystem({
  name: 'enemy-ai',
  update(engine, dt) {
    const player = engine.findByTag('player')
    if (!player) return

    for (const enemy of engine.world.with('position', 'velocity', 'tags')) {
      if (!enemy.tags.values.has('enemy')) continue
      const dx = player.position.x - enemy.position.x
      const dy = player.position.y - enemy.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 200 && dist > 0) {
        const speed = 80
        enemy.velocity.vx = (dx / dist) * speed
        enemy.velocity.vy = (dy / dist) * speed
      } else {
        enemy.velocity.vx = 0
        enemy.velocity.vy = 0
      }
    }
  },
})
```

## Built-in AI behaviors (state machine)

The engine has ready-made AI behaviors. Use them as states in a state machine:

```ts
import { createPatrolBehavior, createChaseBehavior, createFleeBehavior, createWanderBehavior } from '@engine'

export function createGuard(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: 'G', font: FONTS.normal, color: '#ff8800' },
    collider: { type: 'circle', width: 14, height: 14 },
    health: { current: 5, max: 5 },
    tags: { values: new Set(['enemy']) },
    stateMachine: {
      current: 'patrol',
      states: {
        patrol: createPatrolBehavior(
          [{x: 100, y: 100}, {x: 300, y: 100}, {x: 300, y: 200}],
          { speed: 40, waitTime: 1, loop: true }
        ),
        chase: createChaseBehavior({
          targetTag: 'player', speed: 80, range: 200,
          onLostTarget: () => 'patrol',  // go back to patrol if player escapes
        }),
      },
    },
  }
}
```

The built-in `_stateMachine` system runs automatically — it calls the active state's `update()` each frame. Use `transition(entity, 'chase')` from `@engine` to switch states.

### Available behaviors

| Behavior | What it does | Key options |
|---|---|---|
| `createPatrolBehavior(waypoints, opts)` | Walk between points, pause at each | `speed`, `waitTime`, `loop` |
| `createChaseBehavior(opts)` | Move toward tagged target | `targetTag`, `speed`, `range`, `onLostTarget` |
| `createFleeBehavior(opts)` | Run away from tagged target | `targetTag`, `speed`, `range`, `onSafe` |
| `createWanderBehavior(opts)` | Random direction changes | `speed`, `changeInterval` |

## Custom multi-state AI

Combine built-in behaviors with custom states:

```ts
stateMachine: {
  current: 'idle',
  states: {
    idle: {
      enter(entity, engine) { entity.ascii.char = '.' },
      update(entity, engine, dt) {
        const player = engine.findByTag('player')
        if (player) {
          const dist = Math.hypot(
            player.position.x - entity.position.x,
            player.position.y - entity.position.y
          )
          if (dist < 150) transition(entity, 'alert')
        }
      },
    },
    alert: {
      enter(entity, engine) {
        entity.ascii.char = '!'
        entity.ascii.color = '#ffcc00'
        engine.after(1, () => transition(entity, 'chase'))
      },
    },
    chase: createChaseBehavior({
      targetTag: 'player', speed: 100, range: 250,
      onLostTarget: () => 'idle',
    }),
  },
}
```

## Wave spawner

Spawn enemies in escalating waves:

```ts
import { createWaveSpawner } from '@engine'

const waveSystem = createWaveSpawner({
  waves: [
    { count: 3, interval: 0.5, factory: () => createEnemy(randomEdgeX(), randomEdgeY()) },
    { count: 5, interval: 0.4, factory: () => createEnemy(randomEdgeX(), randomEdgeY()) },
    { count: 8, interval: 0.3, factory: () => createFastEnemy(randomEdgeX(), randomEdgeY()) },
  ],
  delayBetweenWaves: 3,
  onWaveComplete: (waveIndex) => {
    engine.toast.show(`Wave ${waveIndex + 1} complete!`, { color: '#00ff88' })
  },
  onAllComplete: () => {
    engine.toast.show('You survived!', { color: '#ffcc00' })
  },
})

// In scene setup:
engine.addSystem(waveSystem)
```

## Continuous spawning (no waves)

For endless games like asteroid-field:

```ts
import { Cooldown } from '@engine'

const spawnInterval = new Cooldown(2)  // every 2 seconds

export const spawner = defineSystem({
  name: 'enemy-spawner',
  update(engine, dt) {
    spawnInterval.update(dt)
    if (spawnInterval.fire()) {
      engine.spawn(createEnemy(
        Math.random() * engine.width,
        -20  // spawn above screen
      ))
    }
  },
})
```

## NPC dialog

```ts
// Simple one-liner
engine.dialog.show('Welcome to the village!', { speaker: 'Elder', typeSpeed: 30 })

// Choice dialog
const choice = await engine.dialog.choice('Will you help us?', ['Yes', 'No thanks'])
if (choice === 0) startQuest()

// Branching dialog tree
import { runDialogTree } from '@engine'

const tree = {
  start: 'greeting',
  nodes: {
    greeting: {
      speaker: 'Merchant',
      text: 'Browse my wares!',
      choices: [
        { text: 'Buy sword (50g)', next: 'buy-sword', condition: (ctx) => gold >= 50 },
        { text: 'Sell items', next: 'sell' },
        { text: 'Leave', next: null },
      ],
    },
    'buy-sword': {
      text: 'An excellent choice!',
      onEnter: (ctx) => { gold -= 50; addItem('sword') },
      next: 'greeting',
    },
    sell: { text: 'What would you like to sell?', next: null },
  },
}

const flags = await runDialogTree(engine, tree)
```

## Grid-based enemies (roguelike)

For turn-based games with grid movement and pathfinding:

```ts
import { findPath, transition } from '@engine'

// Enemy entity with grid position + state machine
export function createSkeleton(col: number, row: number): Partial<Entity> {
  return {
    position: { x: col * TILE_SIZE, y: row * TILE_SIZE },
    velocity: { vx: 0, vy: 0 },
    gridPos: { col, row },
    ascii: { char: 'S', font: FONTS.normal, color: '#cccccc' },
    health: { current: 3, max: 3 },
    tags: { values: new Set(['enemy']) },
    stateMachine: {
      current: 'idle',
      states: {
        idle: {
          update(entity, engine) {
            const player = engine.findByTag('player')
            if (!player?.gridPos) return
            const dist = Math.abs(player.gridPos.col - entity.gridPos.col)
                       + Math.abs(player.gridPos.row - entity.gridPos.row)
            if (dist <= 6) transition(entity, 'chase')
          },
        },
        chase: {
          update(entity, engine) {
            const player = engine.findByTag('player')
            if (!player?.gridPos) return
            const path = findPath(navGrid, entity.gridPos, player.gridPos, {
              isWalkable: (cell) => cell !== '#',
              maxIterations: 200,
            })
            if (path && path.length > 1) {
              entity.gridPos.col = path[1].col
              entity.gridPos.row = path[1].row
              // Tween for smooth visual movement
              engine.tweenEntity(entity, 'position.x', entity.position.x, path[1].col * TILE_SIZE, 0.15, 'easeOut')
              engine.tweenEntity(entity, 'position.y', entity.position.y, path[1].row * TILE_SIZE, 0.15, 'easeOut')
            }
          },
        },
      },
    },
  }
}
```

## AI generation shortcut

```bash
bun run ai:mechanic "enemy that patrols between waypoints then chases when player is within 5 tiles"
```

This generates a complete system file. Wire it in your scene: `engine.addSystem(generatedSystem)`.

## Reference templates

| Pattern | Look at |
|---|---|
| Simple chase + spawner | `games/asteroid-field/systems/asteroid-spawner.ts` |
| State machine enemies | `games/roguelike/entities/enemies.ts` |
| Grid-based pathfinding AI | `games/roguelike/systems/enemy-ai.ts` |
| Dialog system | `games/roguelike/scenes/play.ts` (intro dialog) |
