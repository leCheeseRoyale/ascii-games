// Game configuration — tweak these values to change your game's feel.
// This is imported as `GAME` in the game definition.

export const GAME = {
  title: "Tic-Tac-Toe",
  description: "Two-player local ASCII tic-tac-toe",

  board: {
    size: 320,
    lineColor: "#4a4a4a",
    bg: "#0a0a0a",
  },

  players: {
    X: { color: "#00ff88", glow: "#00ff8844" },
    O: { color: "#ff6ac1", glow: "#ff6ac144" },
  },
} as const;
