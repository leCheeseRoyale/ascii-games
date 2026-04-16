// Game configuration — tweak these values to change your game's feel.
// This is imported as `GAME` in scenes, systems, and entity factories.

export const GAME = {
  title: "My ASCII Game",
  description: "An ASCII adventure",

  player: {
    speed: 200,
    color: "#00ff88",
    glow: "#00ff8844",
  },
} as const;
