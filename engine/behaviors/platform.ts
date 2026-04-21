/**
 * One-way platform system — reusable factory for platformer games.
 *
 * Entities tagged with `platformTag` (default "platform") act as one-way
 * platforms: dynamic entities can stand on them but pass through from below.
 * Resolution only happens when the dynamic entity is falling (vy >= 0) and
 * its bottom edge is near the platform's top edge.
 *
 * Usage:
 *   engine.addSystem(createPlatformSystem());
 *   engine.addSystem(createPlatformSystem({ entityTag: 'player', platformTag: 'cloud', tolerance: 10 }));
 */

import type { Engine } from "../core/engine";
import { defineSystem, type System, SystemPriority } from "../ecs/systems";

export interface PlatformSystemOpts {
  /** Tag on entities that stand on platforms. Default "player". */
  entityTag?: string;
  /** Tag on platform entities. Default "platform". */
  platformTag?: string;
  /** Pixel tolerance for crossing-top detection. Default 14. */
  tolerance?: number;
  /** Optional ground Y position (absolute pixels). If set, entities are also grounded at this line. */
  groundY?: number;
}

export function createPlatformSystem(opts?: PlatformSystemOpts): System {
  const entityTag = opts?.entityTag ?? "player";
  const platformTag = opts?.platformTag ?? "platform";
  const tolerance = opts?.tolerance ?? 14;
  const groundY = opts?.groundY;

  return defineSystem({
    name: "platform-collision",
    priority: SystemPriority.physics + 2,

    update(engine: Engine) {
      const platforms = engine.findAllByTag(platformTag).filter((e) => e.position && e.collider);

      for (const entity of engine.world.with(
        "position",
        "velocity",
        "physics",
        "collider",
        "tags",
      )) {
        if (!entity.tags.values.has(entityTag)) continue;

        const halfH = entity.collider.height / 2;
        const halfW = entity.collider.width / 2;
        const bottom = entity.position.y + halfH;

        let grounded = false;

        // Optional ground line
        if (groundY !== undefined && bottom >= groundY) {
          entity.position.y = groundY - halfH;
          entity.velocity.vy = 0;
          grounded = true;
        }

        // One-way platform surfaces — only resolve when descending or stationary
        if (entity.velocity.vy >= 0) {
          for (const plat of platforms) {
            const platHalfW = plat.collider.width / 2;
            const platHalfH = plat.collider.height / 2;
            const platTop = plat.position.y - platHalfH;
            const dx = Math.abs(entity.position.x - plat.position.x);
            const overlapX = dx < halfW + platHalfW;
            const crossingTop = bottom >= platTop && bottom <= platTop + tolerance;
            if (overlapX && crossingTop) {
              entity.position.y = platTop - halfH;
              entity.velocity.vy = 0;
              grounded = true;
              break;
            }
          }
        }

        entity.physics.grounded = grounded;
      }
    },
  });
}
