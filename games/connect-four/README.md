# Connect Four Template

Two-player local Connect Four on a 7x6 board. Click a column to drop a disc, R to restart.

## API

`defineGame` (declarative, boardgame.io-style).

## What It Demonstrates

- `defineGame` on a non-trivial grid: 7x6 board with gravity (disc dropping)
- Four-in-a-row detection across horizontal, vertical, and both diagonal directions
- Config-driven board dimensions and visual styling (`config.ts`)
- Canvas-only UI with `engine.ui.panel()` and `engine.ui.text()`
- Move validation (full column rejection)
- Suppressing the React overlay with empty screen components

## Who Should Use This

Developers who have seen tic-tac-toe and want a more complex `defineGame` example. Good reference for grid-based board games with gravity or directional win conditions.
