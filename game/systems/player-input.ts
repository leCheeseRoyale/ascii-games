import { Cooldown, defineSystem, sfx } from "@engine";
import { GAME } from "../config";
import { createBullet } from "../entities/bullet";

let shootCooldown = new Cooldown(GAME.player.bulletCooldown);

// Track last aim direction for shooting
let lastDirX = 0;
let lastDirY = -1;

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

      // Screen wrapping
      const margin = 20;
      const w = engine.width;
      const h = engine.height;
      if (e.position.x < -margin) e.position.x = w + margin;
      if (e.position.x > w + margin) e.position.x = -margin;
      if (e.position.y < -margin) e.position.y = h + margin;
      if (e.position.y > h + margin) e.position.y = -margin;

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
