import { Cooldown, defineSystem, sfx } from "@engine";
import { GAME } from "../config";
import { createBullet } from "../entities/bullet";

let shootCooldown: Cooldown;
let lastDirX: number;
let lastDirY: number;

export const playerInputSystem = defineSystem({
  name: "playerInput",

  init() {
    shootCooldown = new Cooldown(GAME.player.bulletCooldown);
    lastDirX = 0;
    lastDirY = -1;
  },

  update(engine, dt) {
    shootCooldown.update(dt);
    const kb = engine.keyboard;

    for (const e of engine.world.with("position", "velocity", "player")) {
      const speed = GAME.player.speed;
      let dx = 0;
      let dy = 0;

      // WASD + Arrow keys
      if (kb.held("KeyW") || kb.held("ArrowUp")) dy -= 1;
      if (kb.held("KeyS") || kb.held("ArrowDown")) dy += 1;
      if (kb.held("KeyA") || kb.held("ArrowLeft")) dx -= 1;
      if (kb.held("KeyD") || kb.held("ArrowRight")) dx += 1;

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }

      e.velocity.vx = dx * speed;
      e.velocity.vy = dy * speed;

      // Track aim direction
      if (dx !== 0 || dy !== 0) {
        lastDirX = dx;
        lastDirY = dy;
      }

      // Shoot with Space
      if (kb.held("Space") && shootCooldown.fire()) {
        const bSpeed = GAME.player.bulletSpeed;
        const len = Math.sqrt(lastDirX * lastDirX + lastDirY * lastDirY) || 1;
        const bvx = (lastDirX / len) * bSpeed;
        const bvy = (lastDirY / len) * bSpeed;
        engine.spawn(createBullet(e.position.x, e.position.y, bvx, bvy));
        sfx.shoot();
      }
    }
  },
});
