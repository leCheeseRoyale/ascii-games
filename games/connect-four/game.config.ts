export const gameConfig = {
  name: "Connect Four",
  description: "Two-player local Connect Four built with defineGame. Canvas-only UI.",
  version: "1.0",
  ui: {
    screens: ["menu", "playing", "gameOver"],
    hud: [],
  },
} as const;
