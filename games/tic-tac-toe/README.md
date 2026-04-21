# Tic-Tac-Toe Template

Two-player local tic-tac-toe. Click to place marks, R to restart.

## API

`defineGame` (declarative, boardgame.io-style).

## What It Demonstrates

- `defineGame` API: state, moves, turn rotation, game-over detection
- Single-file game definition (~80 lines of game logic)
- Canvas-only UI via `engine.ui.panel()` and `engine.ui.text()`
- Mouse input for cell selection
- Win/draw detection with line scanning
- Suppressing the React overlay with empty screen components

## Who Should Use This

Beginners learning `defineGame`, or anyone building a simple turn-based board game or puzzle. The smallest complete `defineGame` example -- read this before connect-four.
