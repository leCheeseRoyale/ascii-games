import { defineSystem } from "./systems";

export interface MeshInputForceOpts {
  /** Force strength applied per frame. Default 400. */
  force?: number;
  /** Radius from the force origin. Default 120. */
  radius?: number;
  /** Where to apply the force: 'cursor' follows mouse, 'center' uses mesh center. Default 'cursor'. */
  origin?: "cursor" | "center";
  /** Only affect entities with this tag. Optional. */
  tag?: string;
}

export function createMeshInputForceSystem(opts?: MeshInputForceOpts) {
  const force = opts?.force ?? 400;
  const radius = opts?.radius ?? 120;
  const origin = opts?.origin ?? "cursor";
  const tag = opts?.tag;

  return defineSystem({
    name: "mesh-input-force",
    update(engine) {
      let dx = 0;
      let dy = 0;

      if (engine.keyboard.held("ArrowLeft") || engine.keyboard.held("KeyA")) dx -= 1;
      if (engine.keyboard.held("ArrowRight") || engine.keyboard.held("KeyD")) dx += 1;
      if (engine.keyboard.held("ArrowUp") || engine.keyboard.held("KeyW")) dy -= 1;
      if (engine.keyboard.held("ArrowDown") || engine.keyboard.held("KeyS")) dy += 1;

      // Gamepad stick input
      const stick = engine.gamepad.stick("left");
      if (Math.abs(stick.x) > 0.1) dx += stick.x;
      if (Math.abs(stick.y) > 0.1) dy += stick.y;

      if (dx === 0 && dy === 0) return;

      // Normalize direction
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }

      // Determine force origin point
      const cam = engine.camera;
      let ox: number;
      let oy: number;
      if (origin === "cursor") {
        ox = engine.mouse.x + cam.x - engine.width / 2;
        oy = engine.mouse.y + cam.y - engine.height / 2;
      } else {
        ox = engine.width / 2 + cam.x - engine.width / 2;
        oy = engine.height / 2 + cam.y - engine.height / 2;
      }

      const radiusSq = radius * radius;

      // Apply directional force to ECS spring entities near origin
      for (const e of engine.world.with("position", "velocity", "spring")) {
        if (tag && !e.tags?.values.has(tag)) continue;

        const ex = e.position.x - ox;
        const ey = e.position.y - oy;
        const distSq = ex * ex + ey * ey;
        if (distSq >= radiusSq) continue;

        const dist = Math.sqrt(distSq);
        const falloff = (radius - dist) / radius;
        e.velocity.vx += dx * force * falloff;
        e.velocity.vy += dy * force * falloff;
      }

      // Apply to SoA meshes
      for (const mesh of engine.soaMeshes.values()) {
        const { posX, posY, velX, velY, alive, count } = mesh;
        for (let i = 0; i < count; i++) {
          if (!alive[i]) continue;

          const ex = posX[i] - ox;
          const ey = posY[i] - oy;
          const distSq = ex * ex + ey * ey;
          if (distSq >= radiusSq) continue;

          const dist = Math.sqrt(distSq);
          const falloff = (radius - dist) / radius;
          velX[i] += dx * force * falloff;
          velY[i] += dy * force * falloff;
        }
      }
    },
  });
}
