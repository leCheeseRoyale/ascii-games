---
name: game-maker
description: Use when the user is building a game with the ascii-games engine — writing code in `game/` or `games/`, asking "how do I make X", "I want to add Y to my game", "help me build a Z", or working on gameplay code that imports from `@engine`. This is for game creators, not engine developers. Triggers on game-making questions, gameplay feature requests, or when editing files under `game/` or `games/`.
---

# Making games with the ASCII engine

You're building a game. This skill helps you figure out **what to reach for** based on what you want to make. Every code snippet here is copy-pasteable into your `game/` directory.

## First: what kind of game are you making?

```
Board game, card game, or puzzle (turns, no physics)?
  → Use defineGame — see /game-maker:board-game
  → Look at: games/tic-tac-toe/, games/connect-four/

Real-time action (shooter, arena, dodge game)?
  → Use defineScene + defineSystem
  → Look at: games/asteroid-field/

Platformer (gravity, jumping)?
  → Use defineScene + defineSystem with physics
  → Look at: games/platformer/

Roguelike or turn-based RPG (grid, FOV, dungeon)?
  → Use defineScene + engine.turns
  → Look at: games/roguelike/

Interactive text art or physics toy?
  → Use defineScene with spawnText/spawnSprite
  → Look at: games/physics-text/

Not sure yet?
  → Start with blank template: bun run init:game blank
```

## Quick start

```bash
bun run init:game blank     # or: asteroid-field, platformer, roguelike, tic-tac-toe, connect-four
bun dev                     # opens in browser with hot reload
```

Edit files in `game/`. The engine auto-reloads on save.

## Game structure

```
game/
  index.ts              ← entry point: setupGame(engine) → returns starting scene
  config.ts             ← game constants (speeds, sizes, colors)
  entities/             ← entity factories: createPlayer(x,y), createEnemy(x,y)
  systems/              ← game logic: defineSystem({ name, update })
  scenes/               ← game states: defineScene({ name, setup, update, cleanup })
```

## What do you want to do?

| I want to... | Use this skill |
|---|---|
| Make the player move | `/game-maker:player-controls` |
| Add enemies or NPCs | `/game-maker:enemies-and-npcs` |
| Add combat (HP, damage, death) | `/game-maker:combat-system` |
| Build a map or dungeon | `/game-maker:world-building` |
| Add menus, HUD, or dialogs | `/game-maker:game-ui` |
| Make it feel better (shake, particles, sound) | `/game-maker:game-feel` |
| Make a board/card/puzzle game | `/game-maker:board-game` |
| Save progress or high scores | `/game-maker:progression` |
| Create ASCII art and sprites | `/game-maker:sprite-art` |

## The golden rules

1. **Set velocity, don't move position.** The engine moves things for you. `entity.velocity.vx = 200` — done.
2. **Don't add built-in systems.** Physics, tweens, animations — they're already running.
3. **Collect before you destroy.** Don't destroy entities while looping over them. `const list = [...engine.world.with(...)]` first.
4. **Use engine timers.** `engine.after(2, fn)` and `engine.every(1, fn)` instead of `setTimeout`/`setInterval`.
5. **Entities are plain objects.** No classes. Just `{ position: {x, y}, ascii: {char: '@'}, ... }`.
6. **All game code goes in `game/`.** Never edit `engine/`.

## Scaffolding helpers

```bash
bun run new:entity player     # → game/entities/player.ts
bun run new:system combat     # → game/systems/combat.ts  
bun run new:scene  game-over  # → game/scenes/game-over.ts
```

## AI-assisted (needs ANTHROPIC_API_KEY)

```bash
bun run ai:game    "space invader clone with waves"     # generates a complete defineGame
bun run ai:sprite  "dragon, 3 frames, red and orange"   # generates entity factory with art
bun run ai:mechanic "turret that tracks and fires"       # generates a system
bun run ai:juice   "player picks up a coin"              # generates particles + sfx
```

## Before you ship

```bash
bun run check       # typecheck
bun run build       # production build
bun run export      # → single-file dist/game.html you can share anywhere
```
