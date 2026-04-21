import { defineSystem } from "./systems";

export interface AmbientDriftOpts {
  /** Drift amplitude. Default 0.3. */
  amplitude?: number;
  /** Drift speed multiplier. Default 0.5. */
  speed?: number;
  /** Only affect entities with this tag. Optional. */
  tag?: string;
}

export function createAmbientDriftSystem(opts?: AmbientDriftOpts) {
  const amplitude = opts?.amplitude ?? 0.3;
  const speed = opts?.speed ?? 0.5;
  const tag = opts?.tag;

  return defineSystem({
    name: "ambient-drift",
    update(engine, _dt) {
      const time = engine.time.elapsed;
      for (const e of engine.world.with("position", "velocity", "spring")) {
        if (tag && !e.tags?.values.has(tag)) continue;
        // Unique phase per entity based on home position
        const phase = e.spring.targetX * 0.01 + e.spring.targetY * 0.013;
        e.velocity.vx += Math.sin(time * speed + phase) * amplitude;
        e.velocity.vy += Math.cos(time * speed * 0.7 + phase * 1.3) * amplitude;
      }
    },
  });
}
