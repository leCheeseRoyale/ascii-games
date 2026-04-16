/**
 * Connect Four — declarative template using `defineGame`.
 *
 * Second template built on `defineGame`, stress-testing the API on a
 * non-trivial grid game: 7x6 board with gravity and 4-in-a-row detection
 * (horizontal, vertical, both diagonals).
 *
 * All UI is on the canvas (engine.ui.*) — React screens suppressed via
 * Empty components. Left-click a column to drop a disc. R to restart.
 */

import { defineGame, type Engine, type MoveInputCtx } from "@engine";
import { GAME } from "./config";

const Empty = () => null;

type Cell = "R" | "Y" | null;
type Player = "R" | "Y";
type State = { board: Cell[][]; winner?: Cell; draw?: boolean };

const { cols: COLS, rows: ROWS } = GAME;

function makeBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

/** Scan for 4-in-a-row in every direction. Returns the winning piece or null. */
function checkWinner(b: Cell[][]): Cell {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        let k = 1;
        while (
          k < 4 &&
          r + dr * k >= 0 &&
          r + dr * k < ROWS &&
          c + dc * k >= 0 &&
          c + dc * k < COLS &&
          b[r + dr * k][c + dc * k] === p
        )
          k++;
        if (k === 4) return p;
      }
    }
  }
  return null;
}

export const connectFour = defineGame({
  name: "connect-four",
  players: { min: 2, max: 2, default: 2 },
  setup: (): State => ({ board: makeBoard() }),
  turns: { order: ["R", "Y"] },
  moves: {
    drop(ctx, col: number) {
      if (col < 0 || col >= COLS) return "invalid";
      const b = ctx.state.board;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (b[r][col] === null) {
          b[r][col] = ctx.currentPlayer;
          return;
        }
      }
      return "invalid";
    },
    reset(ctx) {
      ctx.state.board = makeBoard();
      ctx.state.winner = undefined;
      ctx.state.draw = undefined;
    },
  },
  endIf(ctx) {
    const w = checkWinner(ctx.state.board);
    if (w) {
      ctx.state.winner = w;
      return { winner: w };
    }
    if (ctx.state.board.every((row) => row.every((c) => c !== null))) {
      ctx.state.draw = true;
      return { draw: true };
    }
  },
  render(ctx) {
    drawBoard(ctx.engine, ctx.state.board, ctx.currentPlayer, ctx.result);
    handleInput(ctx);
  },
});

function drawBoard(engine: Engine, board: Cell[][], current: Player, result: unknown) {
  const cell = GAME.board.cellSize;
  const boardW = COLS * cell;
  const boardH = ROWS * cell;
  const ox = Math.floor(engine.width / 2 - boardW / 2);
  const oy = Math.floor(engine.height / 2 - boardH / 2);
  engine.ui.panel(ox, oy, boardW, boardH, {
    border: "double",
    bg: GAME.board.bg,
    borderColor: GAME.board.lineColor,
  });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = ox + c * cell + cell / 2;
      const cy = oy + r * cell + cell / 2 - 18;
      const piece = board[r][c];
      if (piece) {
        const cfg = GAME.players[piece];
        engine.ui.text(cx, cy, cfg.piece, {
          font: '40px "Fira Code", monospace',
          color: cfg.color,
          glow: cfg.glow,
          align: "center",
        });
      } else {
        engine.ui.text(cx, cy, GAME.empty.char, {
          font: '40px "Fira Code", monospace',
          color: GAME.empty.color,
          align: "center",
        });
      }
    }
  }
  const res = result as { winner?: string; draw?: boolean } | null;
  const status = res
    ? res.draw
      ? "Draw — press R"
      : `${res.winner} wins — press R`
    : `Turn: ${current}`;
  engine.ui.text(engine.width / 2, oy - 28, status, {
    align: "center",
    font: '20px "Fira Code", monospace',
    color: "#e0e0e0",
  });
}

function handleInput(ctx: MoveInputCtx<State, Player>) {
  const engine = ctx.engine;
  if (engine.keyboard.pressed("KeyR")) ctx.moves.reset();
  if (!engine.mouse.justDown || ctx.result) return;
  const cell = GAME.board.cellSize;
  const boardW = COLS * cell;
  const boardH = ROWS * cell;
  const ox = engine.width / 2 - boardW / 2;
  const oy = engine.height / 2 - boardH / 2;
  const col = Math.floor((engine.mouse.x - ox) / cell);
  const row = Math.floor((engine.mouse.y - oy) / cell);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  ctx.moves.drop(col);
}

export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(connectFour),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
