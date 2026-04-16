// Game configuration — tweak these values to change your game's feel.
// This is imported as `GAME` in the game definition.

export const GAME = {
  title: "Connect Four",
  description: "Two-player local ASCII Connect Four",

  cols: 7,
  rows: 6,

  board: {
    cellSize: 52,
    lineColor: "#4a4a4a",
    bg: "#0a0a0a",
  },

  players: {
    R: { color: "#ff4d4d", glow: "#ff4d4d44", piece: "●" },
    Y: { color: "#ffd84d", glow: "#ffd84d44", piece: "●" },
  },

  empty: { char: "·", color: "#2a2a2a" },
} as const;
