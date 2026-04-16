import { defineSystem, SystemPriority } from "./systems";

export const screenBoundsSystem = defineSystem({
  name: "_screenBounds",
  priority: SystemPriority.screenBounds,
  update(engine, dt) {
    const w = engine.width;
    const h = engine.height;

    // Screen wrap
    for (const e of engine.world.with("position", "screenWrap")) {
      const m = e.screenWrap.margin ?? 0;
      if (e.position.x < -m) e.position.x = w + m;
      else if (e.position.x > w + m) e.position.x = -m;
      if (e.position.y < -m) e.position.y = h + m;
      else if (e.position.y > h + m) e.position.y = -m;
    }

    // Screen clamp
    for (const e of engine.world.with("position", "screenClamp")) {
      const p = e.screenClamp.padding ?? 0;
      if (e.position.x < p) e.position.x = p;
      else if (e.position.x > w - p) e.position.x = w - p;
      if (e.position.y < p) e.position.y = p;
      else if (e.position.y > h - p) e.position.y = h - p;
    }

    // Off-screen destroy
    const toRemove: any[] = [];
    for (const e of engine.world.with("position", "offScreenDestroy")) {
      const m = e.offScreenDestroy.margin ?? 50;
      if (e.position.x < -m || e.position.x > w + m || e.position.y < -m || e.position.y > h + m) {
        toRemove.push(e);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
