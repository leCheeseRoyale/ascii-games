import type { Entity } from "@shared/types";
import { destroySoAMeshCell } from "./soa-mesh";
import { defineSystem } from "./systems";

export interface MeshTearOpts {
  /** Max displacement from home before a cell tears. Default 80 pixels. */
  threshold?: number;
  /** Spawn particles on tear. Default true. */
  particles?: boolean;
  /** Number of particles per tear. Default 3. */
  particleCount?: number;
  /** Particle color. Default '#fff'. */
  particleColor?: string;
  /** Only affect entities with this tag. Optional. */
  tag?: string;
}

export function createMeshTearSystem(opts?: MeshTearOpts) {
  const threshold = opts?.threshold ?? 80;
  const thresholdSq = threshold * threshold;
  const particles = opts?.particles ?? true;
  const particleCount = opts?.particleCount ?? 3;
  const particleColor = opts?.particleColor ?? "#fff";
  const tag = opts?.tag;

  return defineSystem({
    name: "mesh-tear",
    update(engine) {
      // --- ECS mesh cells ---
      const toDestroy: { x: number; y: number; entity: Entity }[] = [];

      for (const e of engine.world.with("position", "velocity", "spring", "meshCell")) {
        if (tag && !e.tags?.values.has(tag)) continue;

        const dx = e.position.x - e.spring.targetX;
        const dy = e.position.y - e.spring.targetY;
        const distSq = dx * dx + dy * dy;

        if (distSq > thresholdSq) {
          toDestroy.push({ x: e.position.x, y: e.position.y, entity: e });
        }
      }

      for (const { x, y, entity } of toDestroy) {
        if (particles) {
          engine.particles.burst({
            x,
            y,
            count: particleCount,
            chars: ["·", ".", "*"],
            color: particleColor,
            speed: 60,
            lifetime: 0.4,
          });
        }
        engine.destroy(entity);
      }

      // --- SoA meshes ---
      for (const mesh of engine.soaMeshes.values()) {
        for (let i = 0; i < mesh.count; i++) {
          if (!mesh.alive[i]) continue;

          const dx = mesh.posX[i] - mesh.homeX[i];
          const dy = mesh.posY[i] - mesh.homeY[i];
          const distSq = dx * dx + dy * dy;

          if (distSq > thresholdSq) {
            if (particles) {
              engine.particles.burst({
                x: mesh.posX[i],
                y: mesh.posY[i],
                count: particleCount,
                chars: ["·", ".", "*"],
                color: particleColor,
                speed: 60,
                lifetime: 0.4,
              });
            }
            destroySoAMeshCell(mesh, i);
          }
        }
      }
    },
  });
}
