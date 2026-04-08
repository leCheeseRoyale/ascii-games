import { COLORS, defineScene, FONTS } from "@engine";
import { useStore } from "@ui/store";

export const gameOverScene = defineScene({
  name: "game-over",

  setup(engine) {
    useStore.getState().setScreen("gameOver");

    const cx = engine.width / 2;
    const cy = engine.height / 2;

    // Big death explosion at center (uses engine-owned particles)
    engine.particles.burst({
      x: cx,
      y: cy,
      count: 60,
      chars: ["@", "#", "*", "!", "×", "·", ".", "+"],
      color: "#00ff88",
      speed: 250,
      lifetime: 2.5,
    });
    engine.particles.burst({
      x: cx,
      y: cy,
      count: 30,
      chars: ["*", "·", "."],
      color: "#ff4444",
      speed: 180,
      lifetime: 2.0,
    });

    // Game Over text
    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: {
        char: "GAME OVER",
        font: FONTS.huge,
        color: COLORS.danger,
        glow: "#ff444444",
      },
    });

    // Score display
    const score = useStore.getState().score;
    const highScore = useStore.getState().highScore;
    engine.spawn({
      position: { x: cx, y: cy + 20 },
      ascii: {
        char: `SCORE: ${score}`,
        font: FONTS.boldLarge,
        color: COLORS.fg,
      },
    });

    engine.spawn({
      position: { x: cx, y: cy + 55 },
      ascii: {
        char: `HIGH SCORE: ${highScore}`,
        font: FONTS.normal,
        color: COLORS.accent,
      },
    });

    // Restart prompt
    engine.spawn({
      position: { x: cx, y: cy + 110 },
      ascii: {
        char: "[ PRESS SPACE TO RETRY ]",
        font: FONTS.bold,
        color: COLORS.dim,
      },
    });
  },

  update(engine, dt) {
    if (engine.keyboard.pressed("Space")) {
      engine.loadScene("play");
    }
  },
});
