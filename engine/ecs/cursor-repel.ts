import { applySoAMeshForce } from "./soa-mesh";
import { defineSystem } from "./systems";

export interface CursorRepelOpts {
  /** Repulsion radius in pixels. Default 100. */
  radius?: number;
  /** Repulsion force strength. Default 300. */
  force?: number;
  /** Only affect entities with this tag. Optional. */
  tag?: string;
}

export function createCursorRepelSystem(opts?: CursorRepelOpts) {
  const radius = opts?.radius ?? 100;
  const force = opts?.force ?? 300;
  const radiusSq = radius * radius;
  const tag = opts?.tag;

  return defineSystem({
    name: "cursor-repel",
    update(engine) {
      const cam = engine.camera;
      const mx = engine.mouse.x + cam.x - engine.width / 2;
      const my = engine.mouse.y + cam.y - engine.height / 2;

      for (const e of engine.world.with("position", "velocity", "spring")) {
        if (tag && !e.tags?.values.has(tag)) continue;

        const dx = e.position.x - mx;
        const dy = e.position.y - my;
        const distSq = dx * dx + dy * dy;
        if (distSq >= radiusSq || distSq < 0.01) continue;

        const dist = Math.sqrt(distSq);
        const f = force * ((radius - dist) / radius);
        e.velocity.vx += (dx / dist) * f;
        e.velocity.vy += (dy / dist) * f;
      }

      // SoA mesh repulsion (fast path for 500+ cell meshes)
      if (engine.soaMeshes.size > 0) {
        for (const mesh of engine.soaMeshes.values()) {
          applySoAMeshForce(mesh, mx, my, radius, force);
        }
      }
    },
  });
}
