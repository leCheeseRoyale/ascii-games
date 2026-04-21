# Blank Template

Empty starter template with a title screen and a play scene containing one movable player.

## API

`defineScene` + ECS (real-time).

## What It Demonstrates

- Minimal project structure: `index.ts` registering two scenes
- `defineScene` and `defineSystem` basics
- Player entity with WASD/arrow movement
- `screenWrap` component
- Scene transitions (Escape to return to title)
- Zustand store bridge (`setScreen`)

## Who Should Use This

Beginners starting from scratch. Pick this when you want a clean slate with the minimum wiring already done. The play scene includes commented next-steps for adding enemies, collisions, scoring, and game-over.
