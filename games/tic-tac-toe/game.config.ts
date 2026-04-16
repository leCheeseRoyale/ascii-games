export const gameConfig = {
  name: "Tic-Tac-Toe",
  description: "Two-player local tic-tac-toe built with defineGame. Canvas-only UI.",
  version: "1.0",
  ui: {
    screens: ["menu", "playing", "gameOver"],
    hud: [],
  },
} as const;
