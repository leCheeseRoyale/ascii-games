import { COLORS, defineScene, FONTS, pick, rng, rngInt } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";

export const titleScene = defineScene({
  name: "title",

  setup(engine) {
    useStore.getState().setScreen("menu");
    useStore.getState().reset();

    const cx = engine.width / 2;
    const cy = engine.height / 2;

    // Title text
    engine.spawn({
      position: { x: cx, y: cy - 80 },
      ascii: {
        char: GAME.title,
        font: FONTS.huge,
        color: COLORS.accent,
        glow: "#00ff8844",
      },
    });

    // Subtitle
    engine.spawn({
      position: { x: cx, y: cy + 10 },
      ascii: {
        char: GAME.description,
        font: FONTS.normal,
        color: COLORS.dim,
      },
    });

    // "Press SPACE" prompt
    engine.spawn({
      position: { x: cx, y: cy + 80 },
      ascii: {
        char: "[ PRESS SPACE TO START ]",
        font: FONTS.bold,
        color: COLORS.fg,
      },
    });

    // Big player character in center
    engine.spawn({
      position: { x: cx, y: cy - 20 },
      ascii: {
        char: "@",
        font: '64px "Fira Code", monospace',
        color: GAME.player.color,
        glow: GAME.player.glow,
      },
    });

    // Ambient drifting asteroids
    for (let i = 0; i < 15; i++) {
      const edge = rngInt(0, 3);
      const w = engine.width;
      const h = engine.height;
      let x: number, y: number;
      switch (edge) {
        case 0:
          x = rng(0, w);
          y = rng(-50, 0);
          break;
        case 1:
          x = rng(w, w + 50);
          y = rng(0, h);
          break;
        case 2:
          x = rng(0, w);
          y = rng(h, h + 50);
          break;
        default:
          x = rng(-50, 0);
          y = rng(0, h);
          break;
      }
      const vx = rng(-30, 30);
      const vy = rng(-30, 30);

      engine.spawn({
        position: { x, y },
        velocity: { vx, vy },
        ascii: {
          char: pick(GAME.asteroid.chars),
          font: FONTS.normal,
          color: pick(["#333333", "#444444", "#555555"]),
          scale: rng(0.6, 1.5),
          opacity: rng(0.2, 0.5),
        },
      });
    }
  },

  update(engine, dt) {
    if (engine.keyboard.pressed("Space")) {
      engine.loadScene("play");
    }
  },
});
