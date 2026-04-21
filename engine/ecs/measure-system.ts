import { buildDirtyKey, buildVisualBounds } from "../render/measure-entity";
import type { System } from "./systems";
import { SystemPriority } from "./systems";

export const measureSystem: System = {
  name: "_measure",
  priority: SystemPriority.measure,
  update(engine, _dt) {
    for (const e of engine.world.with("visualBounds")) {
      const key = buildDirtyKey(e);
      if (!key || key === e.visualBounds._key) continue;

      const bounds = buildVisualBounds(e);
      if (!bounds) continue;

      e.visualBounds.width = bounds.width;
      e.visualBounds.height = bounds.height;
      e.visualBounds.halfW = bounds.halfW;
      e.visualBounds.halfH = bounds.halfH;
      e.visualBounds._key = bounds._key;

      // Propagate to auto-collider if present
      if (e.collider && typeof e.collider === "object" && e.collider._auto) {
        e.collider.width = bounds.width;
        e.collider.height = bounds.height;
      }
    }
  },
};
