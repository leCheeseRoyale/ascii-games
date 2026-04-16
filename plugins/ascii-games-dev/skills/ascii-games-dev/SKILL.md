---
name: ascii-games-dev
description: Use when the user is working in the ascii-games engine repo, editing files that import `@engine` / `@game` / `@ui` / `@shared`, building an ASCII-art canvas game, scaffolding scenes/systems/entities for the ascii-games framework, or asking about APIs like `defineScene`, `defineSystem`, `engine.spawn`, `engine.world`, `engine.camera`, `engine.particles`, `TurnSync`, `SocketAdapter`, `GameServer`, `createInventory`, `createEquipment`, `createDamageSystem`, `serializeGameState`, `SystemPriority`, or `engine.viewport`.
---

# Building with the ascii-games engine

The engine is a miniplex-ECS + Pretext-text-layout + React-UI hybrid for ASCII canvas games. Before composing anything, ground yourself in the **authoritative references** and the **six don'ts**. Every downstream task skill assumes you've loaded this context.

## Authoritative references — read these first when working on anything non-trivial

1. **`docs/API-generated.md`** — auto-regenerated list of every `@engine` export. Trust this over any list in your training data. Regenerate with `bun run gen:api` if it looks stale.
2. **`docs/PROJECT-GUIDE.md`** — architecture, boundaries, "Key APIs to Know".
3. **`docs/COOKBOOK.md`** — copy-paste recipes for common patterns.
4. **`games/roguelike/`** — gold-standard reference: turn-based phases, FOV, BSP dungeons, canvas-only UI, save/load.
5. **`games/asteroid-field/`** — real-time reference: physics, collision, particles, waves, React HUD.

When in doubt about an API's shape, do not guess — grep the `@engine` source under `engine/` or read the generated docs. The engine has churned; older recollections may be stale.

## The 6 don'ts

1. **Don't manually integrate velocity.** `_physics` does `position += velocity * dt`. Writing this yourself causes double-speed movement.
2. **Don't add built-in systems manually.** All 8 (`_parent`, `_physics`, `_tween`, `_animation`, `_emitter`, `_stateMachine`, `_lifetime`, `_screenBounds`) auto-register on scene load.
3. **Don't mutate the world during iteration.** Collect entities into an array first, then destroy/modify.
4. **Don't put game logic in `engine/`.** Engine is a reusable framework. Game code goes in `game/` (gitignored, generated from templates in `games/`).
5. **Don't import `ui/` from `engine/` or `game/`** (except the zustand store). And don't import `engine/` / `game/` from `ui/` components.
6. **Don't use `setInterval` / `setTimeout` / classes for entities.** Use `engine.after(sec, fn)` / `engine.every(sec, fn)` / plain-object entities.

## Decision matrix — which API do I reach for?

| Goal | Reach for |
|---|---|
| Real-time action game | `defineScene` + `defineSystem`, no turn phases |
| Turn-based / roguelike | `engine.turns.configure({ phases: [...] })`, systems get `phase: 'play'` |
| Player moves | `velocity` component + input system setting `velocity.vx/vy` (physics does integration) |
| Gravity / platformer | `physics: { gravity, friction }` + custom collision system (see `games/platformer/systems/platform-collision.ts`) |
| Enemy AI (spatial) | `stateMachine` component + `createPatrolBehavior` / `createChaseBehavior` / `createFleeBehavior` / `createWanderBehavior` from `@engine/behaviors/ai` |
| Enemy AI (discrete-state: card games, puzzles, turn-based RPG) | Build yourself. Engine provides no scaffolding. Common patterns: minimax, utility AI, scripted decision trees. |
| HP + damage | `health` component + `createDamageSystem(config)` — emits `combat:damage-taken` / `combat:entity-defeated` events |
| Wave-based enemies | `createWaveSpawner(config)` returns a System |
| Procgen map | `generateDungeon` / `generateBSP` / `generateCave` / `generateWalkerCave`; pair with `createTilemap` |
| Items & inventory | `createInventory({ maxSlots })` + `addItem`, `removeItem`, `transferItem` |
| Equipable gear | `createEquipment(slotIds, blocks?)` + `equipItem(eq, item, stats)` — modifiers auto-apply |
| Stats (HP, atk, def) | `createStats({ atk: 10 })` + `addModifier` — formula `(base + flat) * (1 + percent) * mul` |
| Quests / achievements | `new QuestTracker()` / `new AchievementTracker()` — self-contained, listen to game events |
| Dialog | `engine.dialog.show(text)` or `runDialogTree(engine, tree)` for branching |
| Save/load | `save(key, data)` / `load(key)`; multi-slot via `SaveSlotManager`; full bundle via `serializeGameState` / `rehydrateGameState` |
| Leaderboard | `submitScore` / `getHighScores` from `@engine/storage` |
| Particles | `engine.particles.burst({ x, y, count, chars, color, speed, lifetime, spread })` — also `.explosion`, `.sparkle`, `.smoke` |
| Camera | `engine.camera.follow(entity, { smoothing, deadzone, lookahead })`, `.setBounds`, `.shake(magnitude)` |
| Tween | `engine.tweenEntity(entity, 'position.x', 0, 400, 1, 'easeOut')` |
| Real-time music / sfx | `sfx.shoot()`, `sfx.hit()`, etc. or `playMusic(url)` / `setVolume` |
| Canvas-only UI | `engine.ui.text/panel/bar`, `UIMenu`, `engine.dialog`, `UIScrollPanel`, `UIGrid`, `UITooltip`, `UITabs` |
| React HUD | Write to `useStore.getState().setScore(...)` from game; read via `useStore(s => s.score)` in React |
| Mixed-font HUD chip | `engine.ui.inlineRun(x, y, chunks, opts)` — one chunk per font/color segment |
| Multiplayer (turn-based) | `SocketAdapter` + `TurnSync` (optional `submitStateHash` for desync detection) |
| Multiplayer (real-time) | `SocketAdapter` + your own relay logic over `broadcast` / `sendTo` |
| Remappable inputs | `new InputBindings(keyboard, gamepad, mouse)` + `capture` for rebinding; `findConflicts` for settings UI |
| Mobile | `new Touch(canvas)`, `VirtualJoystick`, `VirtualDpad`; `engine.viewport.safeArea` for notches |
| System runs in specific order | Set `priority: SystemPriority.physics + 1` on your system |

## Typical file shape (for a new game feature)

```
game/
  entities/
    my-entity.ts        -- export function createX(x,y): Partial<Entity>
  systems/
    my-system.ts        -- export const mySystem = defineSystem({ name, update })
  scenes/
    play.ts             -- scene.setup() spawns entities, adds systems
  index.ts              -- setupGame(engine) registers scenes, returns starting name
```

Game code's single bridge to React is the zustand store at `@ui/store`. Never import React from game code.

## Before any large change

Run the invariants:

```bash
bun run check      # typecheck
bun run test       # 1181+ tests
bun run lint       # biome
```

All four must stay green. Breaking tests is a blocker — fix the root cause, don't delete the test.

## Downstream task skills

When the user asks for a higher-level task, delegate or point to:

- **`/ascii-games-dev:new-game`** — start a fresh game from a free-text description
- **`/ascii-games-dev:mechanic`** — compose a new entity + behavior + feedback
- **`/ascii-games-dev:juice`** — layer feedback on an existing event
- **`/ascii-games-dev:multiplayer`** — scaffold multiplayer
- **`/ascii-games-dev:persist`** — wire save/load

Each downstream skill assumes this one has been read. Don't repeat the 6 don'ts or the decision matrix — reference them.
