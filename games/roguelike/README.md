# Roguelike Template

Turn-based dungeon crawler with BSP-generated dungeons and fog of war.

## API

`defineScene` + ECS (turn-based with phases).

## What It Demonstrates

- Turn-based movement and phase-gated systems
- BSP dungeon generation
- Field-of-view (FOV) system for fog of war
- Combat system with enemy AI
- Canvas-only UI (suppresses React overlay, draws HUD via `engine.ui.*`)
- `setStoragePrefix` for per-game save isolation
- Entity factories for player, enemies, and items

## Who Should Use This

Developers building turn-based games, dungeon crawlers, or tactical RPGs. The most complex template -- demonstrates phased system execution, procedural level generation, and canvas-only rendering.
