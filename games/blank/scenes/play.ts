import type { Engine } from "@engine";
import { createTags, defineScene, defineSystem, FONTS } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";

const playerSystem = defineSystem({
  name: "player-input",
  update(engine: Engine, dt: number) {
    for (const player of engine.world.with("position", "velocity", "player")) {
      const speed = GAME.player.speed;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      if (engine.keyboard.held("KeyW") || engine.keyboard.held("ArrowUp"))
        player.velocity.vy = -speed;
      if (engine.keyboard.held("KeyS") || engine.keyboard.held("ArrowDown"))
        player.velocity.vy = speed;
      if (engine.keyboard.held("KeyA") || engine.keyboard.held("ArrowLeft"))
        player.velocity.vx = -speed;
      if (engine.keyboard.held("KeyD") || engine.keyboard.held("ArrowRight"))
        player.velocity.vx = speed;
    }
  },
});

export const playScene = defineScene({
  name: "play",

  setup(engine: Engine) {
    useStore.getState().setScreen("playing");

    // Player — move with WASD or arrow keys
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY },
      velocity: { vx: 0, vy: 0 },
      ascii: { char: "@", font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
      tags: createTags("player"),
      player: { index: 0 },
      screenWrap: { margin: 10 },
    });

    engine.addSystem(playerSystem);

    // ── Next steps ──────────────────────────────────────────────────
    //
    // 1. Add enemies:
    //      bun run new:entity enemy
    //      Then spawn them on a timer:
    //      engine.spawnEvery(1.0, () => engine.spawn(createEnemy(...)))
    //
    // 2. Add collision:
    //      bun run new:system collision
    //      Give entities a collider: 'auto' as const
    //      Check hits: if (overlaps(a, b)) { ... }
    //
    // 3. Add scoring:
    //      import { useStore } from '@ui/store'
    //      useStore.getState().setScore(score)
    //
    // 4. Add a game-over scene:
    //      bun run new:scene game-over
    //      engine.loadScene('game-over')
    //
    // See docs/TUTORIAL.md for a full walkthrough.
    // ────────────────────────────────────────────────────────────────
  },

  update(engine: Engine, _dt: number) {
    if (engine.keyboard.pressed("Escape")) {
      engine.loadScene("title");
    }
  },
});
