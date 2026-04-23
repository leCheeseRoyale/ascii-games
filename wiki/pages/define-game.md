---
title: defineGame API
created: 2026-04-21
updated: 2026-04-23
type: architecture
tags: [engine, game-loop, lifecycle, declarative]
sources: [engine/core/define-game.ts]
---

# defineGame API

`defineGame` is a declarative, boardgame.io-style API for turn-based and board games. You describe state, moves, phases, and turn order in a single object; the engine auto-wires a scene, rotates turns, gates phase transitions, and detects game-over. Best for hotseat multiplayer, puzzles, and board games (tic-tac-toe, connect-four, etc.).

For real-time or physics-heavy games, use `defineScene` + `defineSystem` instead. See [[scene-lifecycle]].

## GameDefinition

The full definition shape:

```ts
interface GameDefinition<TState, TPlayer extends string | number> {
  name: string
  players?: { min?: number; max?: number; default?: number }
  seed?: number                           // deterministic RNG seed
  setup: (ctx: SetupContext) => TState    // construct initial state
  turns?: TurnsConfig<TPlayer>
  phases?: { order: string[]; [name: string]: PhaseConfig | string[] }
  moves: Record<string, MoveFn<TState>>
  endIf?: (ctx: GameContext<TState>) => GameResult | null | undefined | void
  systems?: System[]                      // extra ECS systems
  render?: (ctx: GameContext<TState>) => void   // per-frame draw callback
  startScene?: string                     // override scene name (default "play")
}
```

## GameContext

Every callback receives a `GameContext` with: `engine` (full Engine instance), `state` (mutable -- mutate directly in moves), `currentPlayer` / `playerIndex` / `numPlayers`, `phase` (current phase or null), `turn` (1-based), `moves` (bound move dispatchers), `random()` (deterministic seeded RNG), `log(msg)`, `result` (set once endIf fires), `endTurn()`, `endPhase()`, and `goToPhase(name)`.

## Moves

Moves mutate `ctx.state` directly. Return `'invalid'` to reject a move (state stays untouched, turn does not advance). Return nothing on success.

```ts
moves: {
  place(ctx, idx: number) {
    if (ctx.state.board[idx] !== null) return 'invalid'
    ctx.state.board[idx] = ctx.currentPlayer
  },
}
```

Moves dispatched after game-over return `'game-over'`.

## Turns and Phases

By default, turns auto-advance after each successful move. `turns.order` defines player rotation; `currentPlayer` cycles through it. Set `autoEnd: false` for multi-action turns where moves call `ctx.endTurn()` explicitly.

Turn operations (`endTurn`, `endPhase`, `goToPhase`) called inside a move are deferred until after `endIf` is evaluated. If `endIf` triggers game-over, the deferred ops are discarded — the final state reflects the player and turn at the time of the winning move. After game-over, all turn operations are no-ops.

```ts
turns: { order: ['X', 'O'], autoEnd: true }
```

Phases gate which moves are available and provide lifecycle hooks. Phase `endIf` returns a phase name to switch to (or falsy to stay). Top-level `endIf` returns a `GameResult` to end the game.

```ts
phases: {
  order: ['placing', 'scoring'],
  placing: {
    moves: ['place'],
    onEnter: (ctx) => { /* ... */ },
    endIf: (ctx) => ctx.state.allPlaced ? 'scoring' : null,
  },
}
```

## Minimal Example

```ts
const ticTacToe = defineGame<{ board: (string | null)[] }>({
  name: 'tic-tac-toe',
  players: { min: 2, max: 2, default: 2 },
  setup: () => ({ board: Array(9).fill(null) }),
  turns: { order: ['X', 'O'] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return 'invalid'
      ctx.state.board[idx] = ctx.currentPlayer as string
    },
  },
  endIf: (ctx) =>
    ctx.state.board.every(c => c !== null) ? { draw: true } : undefined,
})

export function setupGame(engine: Engine) {
  return { startScene: engine.runGame(ticTacToe) }
}
```

`engine.runGame(def)` creates a `GameRuntime`, builds a scene via `buildGameScene()`, registers it, and returns the scene name. The runtime dispatches moves, checks phase/game endIf after each move, auto-rotates turns, and calls `render()` each frame.

For the scene that `runGame` generates, see [[scene-lifecycle]]. For the frame loop that drives update, see [[game-loop]]. For a high-level view of the engine, see [[engine-overview]].
