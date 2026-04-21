/**
 * Parent-child hierarchy system.
 *
 * Syncs child entity positions to parent positions each frame.
 * Children's positions are calculated as: parent.position + child.offset
 *
 * Should run BEFORE other systems so collision/rendering see correct positions.
 */

import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import { type System, SystemPriority } from "./systems";

export const parentSystem: System = {
  name: "_parent",
  priority: SystemPriority.parent,
  update(engine: Engine, _dt: number) {
    // Process all children: set their world position based on parent + offset
    for (const entity of engine.world.with("child", "position")) {
      const child = entity.child;
      const parent = child.parent as Partial<Entity>;
      if (parent?.position) {
        entity.position.x = parent.position.x + child.offsetX;
        entity.position.y = parent.position.y + child.offsetY;
      }
    }
  },
};
