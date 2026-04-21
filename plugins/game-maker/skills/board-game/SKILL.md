---
name: board-game
description: Use when the user wants to build a board game, card game, puzzle, or turn-based game using `defineGame`. Covers state design, moves, turn order, phases, win conditions, rendering to canvas, mouse/keyboard input handling, and multi-player hotseat. Triggers on "make a board game", "defineGame", "turn-based game", "card game", "puzzle game", "tic-tac-toe style", "who wins", "take turns".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Board games with defineGame

`defineGame` is the fast path for turn-based games. You define **state + moves + rules** in one object, and the engine handles turn rotation, phase transitions, and game-over detection. No entities, no systems, no ECS — just pure game logic.

## The shape of a defineGame

```ts
import { defineGame, type Engine } from '@engine'

type State = { board: (string | null)[] }
type Player = 'X' | 'O'

const myGame = defineGame<State, Player>({
  name: 'my-game',
  players: { min: 2, max: 2, default: 2 },

  setup(ctx) {
    // Return initial state. Called once when game starts.
    return { board: Array(9).fill(null) }
  },

  turns: {
    order: ['X', 'O'],   // engine rotates after each move
    autoEnd: true,        // auto-advance turn after each move (set false for multi-action turns)
  },

  moves: {
    place(ctx, cellIndex: number) {
      // Mutate ctx.state directly. Return 'invalid' to reject the move.
      if (ctx.state.board[cellIndex] !== null) return 'invalid'
      ctx.state.board[cellIndex] = ctx.currentPlayer
    },
  },

  endIf(ctx) {
    // Return truthy to end the game. Called after every move.
    const winner = checkWinner(ctx.state.board)
    if (winner) return { winner }
    if (ctx.state.board.every(c => c !== null)) return { draw: true }
  },

  render(ctx) {
    // Called every frame. Draw your game and read input here.
    drawBoard(ctx)
    handleInput(ctx)
  },
})

// Wire it
const Empty = () => null
export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(myGame),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  }
}
```

## Key concepts

### State
The `setup` function returns your game's initial state. This is your entire game — board, scores, hands, decks, whatever. Mutate it directly in moves.

### Moves
Moves are the only way to change state. Each move receives `ctx` (context) plus any arguments from the caller.

- Return nothing → move succeeds, turn advances
- Return `'invalid'` → move rejected, no state change, player tries again

### Context (`ctx`)
Every callback receives the same context:

```ts
ctx.state          // your game state (mutable)
ctx.currentPlayer  // whose turn ('X' or 'O')
ctx.turn           // turn number (1-based)
ctx.engine         // engine instance (for rendering, input, ui)
ctx.moves          // bound move dispatchers: ctx.moves.place(3)
ctx.random()       // seeded RNG [0,1) — deterministic for multiplayer
ctx.result         // non-null after game ends (check in render)
ctx.endTurn()      // skip to next player
ctx.endPhase()     // advance to next phase
```

### Rendering
`render(ctx)` is called every frame. Draw with `ctx.engine.ui.*` and read input from `ctx.engine.mouse` / `ctx.engine.keyboard`.

```ts
render(ctx) {
  const e = ctx.engine

  // Draw a grid
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = Math.floor(i / 3)
    const x = 100 + col * 60, y = 100 + row * 60
    e.ui.panel(x, y, 50, 50, { border: 'single' })
    if (ctx.state.board[i]) {
      e.ui.text(x + 18, y + 15, ctx.state.board[i]!, {
        font: FONTS.large, color: ctx.state.board[i] === 'X' ? '#ff4444' : '#4444ff',
      })
    }
  }

  // Handle clicks (only when game is still going)
  if (e.mouse.justDown && !ctx.result) {
    const col = Math.floor((e.mouse.x - 100) / 60)
    const row = Math.floor((e.mouse.y - 100) / 60)
    if (col >= 0 && col < 3 && row >= 0 && row < 3) {
      ctx.moves.place(row * 3 + col)
    }
  }

  // Show current player or result
  if (ctx.result) {
    const msg = ctx.result.draw ? 'Draw!' : `${ctx.result.winner} wins!`
    e.ui.text(e.centerX, 320, msg, { font: FONTS.large, color: COLORS.accent, align: 'center' })
    e.ui.text(e.centerX, 350, 'Press R to restart', { font: FONTS.small, color: '#888', align: 'center' })
    if (e.keyboard.pressed('KeyR')) ctx.moves.reset?.()
  } else {
    e.ui.text(e.centerX, 80, `${ctx.currentPlayer}'s turn`, {
      font: FONTS.normal, color: '#ccc', align: 'center',
    })
  }
}
```

## Phases (multi-step turns)

For games where each turn has stages (draw → play → discard):

```ts
defineGame({
  // ...
  phases: {
    order: ['draw', 'play', 'discard'],
    draw: {
      onEnter(ctx) { /* deal cards */ },
      moves: ['drawCard'],  // only these moves allowed in this phase
      endIf(ctx) { return ctx.state.drawnThisTurn },
    },
    play: {
      moves: ['playCard', 'pass'],
      endIf(ctx) { return ctx.state.passed },
    },
    discard: {
      moves: ['discardCard'],
      endIf(ctx) { return ctx.state.hand.length <= 5 },
    },
  },
})
```

## Single-player (no turns)

Omit `turns` and `players` for puzzle/solitaire games:

```ts
defineGame<State>({
  name: 'puzzle',
  setup: () => ({ grid: generatePuzzle(), moves: 0 }),
  moves: {
    swap(ctx, a: number, b: number) {
      // swap tiles
      ctx.state.moves++
    },
  },
  endIf(ctx) {
    if (isSolved(ctx.state.grid)) return { winner: 'player' }
  },
  render(ctx) { /* draw puzzle, handle input */ },
})
```

## Adding a reset/rematch move

```ts
moves: {
  // ... game moves ...
  reset(ctx) {
    ctx.state.board = Array(9).fill(null)
    // State is fresh, game continues from setup
  },
}
```

## When NOT to use defineGame

Use `defineScene` + `defineSystem` instead if your game needs:
- Tilemaps, camera follow, or scrolling worlds
- Real-time physics (gravity, collision response)
- Many entities on screen (bullets, particles, enemies)
- FOV, pathfinding, or procedural generation
- Complex scene data beyond a single state object

## AI shortcut

```bash
bun run ai:game "2-player strategy game where you place walls to trap the opponent"
```

Generates a complete `defineGame` module ready to run with `bun dev`.

## Reference templates

| Game | Look at |
|---|---|
| Classic 3×3 board | `games/tic-tac-toe/index.ts` |
| Larger grid with gravity | `games/connect-four/index.ts` |
