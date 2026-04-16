/**
 * Tic-Tac-Toe — declarative template using `defineGame`.
 *
 * All UI is on the canvas (engine.ui.*, engine.toast) — React screens
 * suppressed via Empty components so the page is pure game.
 *
 * Input: left-click to place a mark in the hovered cell. R to restart.
 *
 * This whole file (state + moves + UI + input) fits the 30-80 line target
 * that `defineGame` is designed to hit — the wrapper handles turn rotation,
 * phase transitions, and game-over reporting.
 */

import { defineGame, type Engine, type MoveInputCtx } from "@engine";
import { GAME } from "./config";

const Empty = () => null;

type Mark = "X" | "O" | null;
type Player = "X" | "O";
type State = { board: Mark[] };

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkWinner(b: Mark[]): Mark {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
}

export const ticTacToe = defineGame({
  name: "tic-tac-toe",
  players: { min: 2, max: 2, default: 2 },
  setup: (): State => ({ board: Array(9).fill(null) }),
  turns: { order: ["X", "O"] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return "invalid";
      ctx.state.board[idx] = ctx.currentPlayer;
    },
    reset(ctx) {
      ctx.state.board = Array(9).fill(null);
    },
  },
  endIf(ctx) {
    const w = checkWinner(ctx.state.board);
    if (w) return { winner: w };
    if (ctx.state.board.every((c) => c !== null)) return { draw: true };
  },
  render(ctx) {
    drawBoard(ctx.engine, ctx.state.board, ctx.currentPlayer, ctx.result);
    handleInput(ctx);
  },
});

function drawBoard(engine: Engine, board: Mark[], current: Player, result: any) {
  const cell = GAME.board.size / 3;
  const ox = Math.floor(engine.width / 2 - GAME.board.size / 2);
  const oy = Math.floor(engine.height / 2 - GAME.board.size / 2);
  engine.ui.panel(ox, oy, GAME.board.size, GAME.board.size, {
    border: "double",
    bg: GAME.board.bg,
    borderColor: GAME.board.lineColor,
  });
  for (let i = 0; i < 9; i++) {
    const cx = ox + (i % 3) * cell + cell / 2;
    const cy = oy + Math.floor(i / 3) * cell + cell / 2 + 12;
    const m = board[i];
    if (m) {
      engine.ui.text(cx, cy, m, {
        font: '48px "Fira Code", monospace',
        color: GAME.players[m].color,
        glow: GAME.players[m].glow,
        align: "center",
      });
    }
  }
  const status = result
    ? result.draw
      ? "Draw — press R"
      : `${result.winner} wins — press R`
    : `Turn: ${current}`;
  engine.ui.text(engine.width / 2, oy - 24, status, {
    align: "center",
    font: '20px "Fira Code", monospace',
    color: "#e0e0e0",
  });
}

function handleInput(ctx: MoveInputCtx<State, Player>) {
  const engine = ctx.engine;
  if (engine.keyboard.pressed("KeyR")) ctx.moves.reset();
  if (!engine.mouse.justDown || ctx.result) return;
  const cell = GAME.board.size / 3;
  const ox = engine.width / 2 - GAME.board.size / 2;
  const oy = engine.height / 2 - GAME.board.size / 2;
  const col = Math.floor((engine.mouse.x - ox) / cell);
  const row = Math.floor((engine.mouse.y - oy) / cell);
  if (col < 0 || col > 2 || row < 0 || row > 2) return;
  ctx.moves.place(row * 3 + col);
}

export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(ticTacToe),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
