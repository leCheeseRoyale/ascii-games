import { defineSystem, SystemPriority } from "./systems";

export const screenBoundsSystem = defineSystem({
  name: "_screenBounds",
  priority: SystemPriority.screenBounds,
  update(engine, _dt) {
    const w = engine.width;
    const h = engine.height;

    // Screen wrap — trigger when entity's edge passes boundary
    for (const e of engine.world.with("position", "screenWrap")) {
      const hw = e.visualBounds?.halfW ?? 0;
      const hh = e.visualBounds?.halfH ?? 0;
      const m = e.screenWrap.margin ?? 0;
      if (e.position.x + hw < -m) e.position.x = w + m - hw;
      else if (e.position.x - hw > w + m) e.position.x = -m + hw;
      if (e.position.y + hh < -m) e.position.y = h + m - hh;
      else if (e.position.y - hh > h + m) e.position.y = -m + hh;
    }

    // Screen clamp — keep entity's visual extent within bounds
    for (const e of engine.world.with("position", "screenClamp")) {
      const hw = e.visualBounds?.halfW ?? 0;
      const hh = e.visualBounds?.halfH ?? 0;
      const p = e.screenClamp.padding ?? 0;
      if (e.position.x < p + hw) e.position.x = p + hw;
      else if (e.position.x > w - p - hw) e.position.x = w - p - hw;
      if (e.position.y < p + hh) e.position.y = p + hh;
      else if (e.position.y > h - p - hh) e.position.y = h - p - hh;
    }

    // Off-screen destroy — destroy when entire entity is off-screen
    const toRemove: any[] = [];
    for (const e of engine.world.with("position", "offScreenDestroy")) {
      const hw = e.visualBounds?.halfW ?? 0;
      const hh = e.visualBounds?.halfH ?? 0;
      const m = e.offScreenDestroy.margin ?? 50;
      if (
        e.position.x + hw < -m ||
        e.position.x - hw > w + m ||
        e.position.y + hh < -m ||
        e.position.y - hh > h + m
      ) {
        toRemove.push(e);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
