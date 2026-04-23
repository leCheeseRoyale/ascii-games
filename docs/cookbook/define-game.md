# defineGame Recipes

Copy-pasteable recipes for declarative, turn-based games using `defineGame`. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Declarative games with `defineGame`

`defineGame` wraps scenes, turn phases, and state into a single object —
the boardgame.io-style ergonomic layer for turn-based games. `engine.runGame(def)`
registers an auto-generated scene and returns its name. Moves mutate
`ctx.state` directly; return `'invalid'` to reject. Auto-rotates `turns.order`
after each successful move. Phase transitions via `phases[name].endIf`;
game-over via top-level `endIf`.

```ts
import { defineGame, type Engine } from "@engine";
const Empty = () => null;
type S = { board: (string | null)[] };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner = (b: S["board"]) => {
  for (const [a,c,d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
};

export const ticTacToe = defineGame<S>({
  name: "tic-tac-toe",
  players: { min: 2, max: 2, default: 2 },
  setup: () => ({ board: Array(9).fill(null) }),
  turns: { order: ["X", "O"] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return "invalid";
      ctx.state.board[idx] = ctx.currentPlayer as string;
    },
    reset: (ctx) => { ctx.state.board = Array(9).fill(null); },
  },
  endIf: (ctx) => {
    const w = winner(ctx.state.board);
    if (w) return { winner: w };
    if (ctx.state.board.every((c) => c !== null)) return { draw: true };
  },
  render(ctx) {
    // Called each frame. Use engine.ui.* to draw; engine.mouse/keyboard for input.
    const e = ctx.engine;
    if (e.mouse.justDown && !ctx.result) {
      const cell = 320 / 3, ox = e.width/2 - 160, oy = e.height/2 - 160;
      const col = Math.floor((e.mouse.x - ox) / cell);
      const row = Math.floor((e.mouse.y - oy) / cell);
      if (col >= 0 && col < 3 && row >= 0 && row < 3) ctx.moves.place(row * 3 + col);
    }
    if (e.keyboard.pressed("KeyR")) ctx.moves.reset();
    // ...draw board with e.ui.panel / e.ui.text (see games/tic-tac-toe)
  },
});

// Canvas-only UI → suppress React default screens.
export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(ticTacToe),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
```

`ctx` also exposes: `turn`, `phase`, `playerIndex`, `numPlayers`, `random()`
(seeded — pass `def.seed` for reproducibility), `log(msg)`, `endTurn()`,
`endPhase()`, `goToPhase(name)`, plus the full `ctx.engine`. Add `systems:
[...]` to register extra systems; add `phases: { order: [...], myPhase:
{ onEnter, endIf, moves: [...] } }` for multi-phase turns.

## Multiplayer games in one line

`createMultiplayerGame` wraps a `defineGame` definition with lockstep
netcode. It composes `NetworkAdapter` + `TurnSync` + `GameRuntime`, hooks
`runtime.dispatch` so moves travel through the wire instead of being
applied locally, and hashes post-turn state so desync fires automatically
if peers diverge. `transport: { kind: 'local', players: N }` runs N peers
in-process over `MockAdapter` — ideal for a same-keyboard hotseat mode or
smoke tests. `transport: { kind: 'socket', url }` connects to a
`GameServer` via `SocketAdapter`.

Critical rules for the wrapped game:

- Every `ctx.random()` must flow through the seeded RNG (`def.seed` set).
  Ad-hoc `Math.random()` will desync immediately.
- `turns.order` should use the peer ids (`player-1`, `player-2`, ...) or
  numbered ids that match peer positions, so the wrapper can resolve the
  active player without an extra mapping config.
- Moves mutate `ctx.state` only — no hidden side-effects. The wrapper
  hashes `state` after each turn and compares across peers.

```ts
import {
  createMultiplayerGame,
  defineGame,
  Engine,
} from "@engine";

type Mark = "X" | "O" | null;
type State = { board: Mark[] };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner = (b: State["board"]) => {
  for (const [a,c,d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
};

const ticTacToe = defineGame<State>({
  name: "tic-tac-toe",
  players: { min: 2, max: 2, default: 2 },
  seed: 1, // required for deterministic RNG across peers
  setup: () => ({ board: Array(9).fill(null) }),
  // turns.order MUST use peer ids so the wrapper can gate moves per peer.
  turns: { order: ["player-1", "player-2"] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return "invalid";
      // Map peer id → mark.
      ctx.state.board[idx] = ctx.currentPlayer === "player-1" ? "X" : "O";
    },
  },
  endIf: (ctx) => {
    const w = winner(ctx.state.board);
    if (w) return { winner: w };
    if (ctx.state.board.every((c) => c !== null)) return { draw: true };
  },
});

// Spin up 2 peers in one process for dev / hotseat testing.
const handle = await createMultiplayerGame(ticTacToe, {
  transport: { kind: "local", players: 2 },
  engineFactory: () => new Engine(document.querySelector("canvas")!),
  onDesync: (e) => console.warn("desync at turn", e.turn, e.hashes),
});

// Dispatch a move on peer A — every peer's runtime applies it after the
// lockstep turn completes. `handle.allPeers` lets UI show both views.
handle.runtime.dispatch("place", [4]); // player-1 plays center
```

For socket transport, swap the transport and point at a `GameServer`:

```ts
const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "socket", url: "wss://my-server/play", resumeOnReconnect: true },
  roomId: "abc-123",
  engineFactory: () => new Engine(canvas),
});
```
