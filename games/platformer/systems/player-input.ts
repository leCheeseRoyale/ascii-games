import { defineSystem } from "@engine";
import { GAME } from "../config";

export const playerInputSystem = defineSystem({
  name: "playerInput",

  update(engine) {
    for (const e of engine.world.with("position", "velocity", "physics", "tags")) {
      if (!e.tags.values.has("player")) continue;

      const speed = GAME.player.speed;

      // Horizontal movement
      e.velocity.vx = 0;
      if (engine.keyboard.held("KeyA") || engine.keyboard.held("ArrowLeft")) e.velocity.vx = -speed;
      if (engine.keyboard.held("KeyD") || engine.keyboard.held("ArrowRight")) e.velocity.vx = speed;

      // Jump — platformCollisionSystem is responsible for setting grounded.
      if (
        e.physics.grounded &&
        (engine.keyboard.pressed("Space") ||
          engine.keyboard.pressed("ArrowUp") ||
          engine.keyboard.pressed("KeyW"))
      ) {
        e.velocity.vy = GAME.player.jumpForce;
        e.physics.grounded = false;
      }

      // Screen wrap horizontal
      if (e.position.x < 0) e.position.x = engine.width;
      if (e.position.x > engine.width) e.position.x = 0;
    }
  },
});
