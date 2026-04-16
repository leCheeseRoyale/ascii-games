import { defineSystem } from "@engine";
import { GAME } from "../config";

/**
 * Lands the player on any platform they are falling onto.
 *
 * The player is grounded while their bottom edge sits on a platform's top
 * edge (within a small tolerance). Horizontal movement across platforms is
 * allowed; walking off the edge clears `grounded` so gravity resumes.
 */
export const platformCollisionSystem = defineSystem({
  name: "platformCollision",

  update(engine) {
    const platforms = [...engine.world.with("position", "collider", "tags")].filter((e) =>
      e.tags.values.has("platform"),
    );
    const groundY = engine.height * GAME.world.groundY;

    for (const player of engine.world.with("position", "velocity", "physics", "collider", "tags")) {
      if (!player.tags.values.has("player")) continue;

      const pHalf = player.collider.height / 2;
      const pBottom = player.position.y + pHalf;
      const pHalfW = player.collider.width / 2;

      let grounded = false;

      // Ground line (visual floor).
      if (pBottom >= groundY) {
        player.position.y = groundY - pHalf;
        player.velocity.vy = 0;
        grounded = true;
      }

      // Platform surfaces — only resolve when descending or stationary.
      if (player.velocity.vy >= 0) {
        for (const plat of platforms) {
          const platHalfW = plat.collider.width / 2;
          const platHalfH = plat.collider.height / 2;
          const platTop = plat.position.y - platHalfH;
          const dx = Math.abs(player.position.x - plat.position.x);
          const overlapX = dx < pHalfW + platHalfW;
          const crossingTop = pBottom >= platTop && pBottom <= platTop + 14;
          if (overlapX && crossingTop) {
            player.position.y = platTop - pHalf;
            player.velocity.vy = 0;
            grounded = true;
            break;
          }
        }
      }

      player.physics.grounded = grounded;
    }
  },
});
