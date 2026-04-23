import { applySoAMeshForce } from "./soa-mesh";
import { defineSystem } from "./systems";

export interface MeshGrabOpts {
  /** Max distance in pixels to grab a cell. Default 40. */
  grabRadius?: number;
  /** Force pulling the grabbed cell toward the cursor. Default 600. */
  pullForce?: number;
  /** Radial push on neighbors while dragging. Default 150. */
  neighborForce?: number;
  /** Radius for the neighbor push effect. Default 80. */
  neighborRadius?: number;
  /** Only affect entities with this tag. Optional. */
  tag?: string;
  /** Mouse button to grab with (0=left, 1=middle, 2=right). Default 0. */
  button?: number;
}

interface GrabState {
  entityId: number | undefined;
  soaMeshId: string | null;
  soaCellIndex: number;
}

export function createMeshGrabSystem(opts?: MeshGrabOpts) {
  const grabRadius = opts?.grabRadius ?? 40;
  const pullForce = opts?.pullForce ?? 600;
  const neighborForce = opts?.neighborForce ?? 150;
  const neighborRadius = opts?.neighborRadius ?? 80;
  const tag = opts?.tag;
  const button = opts?.button ?? 0;
  const grabRadiusSq = grabRadius * grabRadius;

  const grab: GrabState = {
    entityId: undefined,
    soaMeshId: null,
    soaCellIndex: -1,
  };

  return defineSystem({
    name: "mesh-grab",
    update(engine) {
      const cam = engine.camera;
      const mx = engine.mouse.x + cam.x - engine.width / 2;
      const my = engine.mouse.y + cam.y - engine.height / 2;
      const held = engine.mouse.held(button);
      const justPressed = engine.mouse.pressed(button);

      if (!held) {
        grab.entityId = undefined;
        grab.soaMeshId = null;
        grab.soaCellIndex = -1;
        return;
      }

      // --- Acquire grab target on mouse down ---
      if (justPressed) {
        let bestDistSq = grabRadiusSq;

        // Check ECS mesh cells
        for (const e of engine.world.with("position", "velocity", "spring", "meshCell")) {
          if (tag && !e.tags?.values.has(tag)) continue;
          const dx = e.position.x - mx;
          const dy = e.position.y - my;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            grab.entityId = engine.world.id(e);
            grab.soaMeshId = null;
          }
        }

        // Check SoA meshes
        for (const mesh of engine.soaMeshes.values()) {
          for (let i = 0; i < mesh.count; i++) {
            if (!mesh.alive[i]) continue;
            const dx = mesh.posX[i] - mx;
            const dy = mesh.posY[i] - my;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              grab.soaMeshId = mesh.meshId;
              grab.soaCellIndex = i;
              grab.entityId = undefined;
            }
          }
        }
      }

      // --- Apply pull force to grabbed cell ---
      if (grab.entityId !== undefined) {
        const e = engine.getEntityById(grab.entityId);
        if (e?.position && e.velocity) {
          const dx = mx - e.position.x;
          const dy = my - e.position.y;
          e.velocity.vx += dx * (pullForce / 100);
          e.velocity.vy += dy * (pullForce / 100);

          // Push neighbors away from drag point
          if (neighborForce > 0) {
            for (const other of engine.world.with("position", "velocity", "spring")) {
              if (engine.world.id(other) === grab.entityId) continue;
              if (tag && !other.tags?.values.has(tag)) continue;

              const ndx = other.position.x - e.position.x;
              const ndy = other.position.y - e.position.y;
              const nDistSq = ndx * ndx + ndy * ndy;
              const nRadiusSq = neighborRadius * neighborRadius;
              if (nDistSq >= nRadiusSq || nDistSq < 0.01) continue;

              const nDist = Math.sqrt(nDistSq);
              const f = neighborForce * ((neighborRadius - nDist) / neighborRadius);
              other.velocity.vx += (ndx / nDist) * f;
              other.velocity.vy += (ndy / nDist) * f;
            }
          }
        }
      } else if (grab.soaMeshId !== null) {
        const mesh = engine.soaMeshes.get(grab.soaMeshId);
        if (mesh?.alive[grab.soaCellIndex]) {
          const i = grab.soaCellIndex;
          const dx = mx - mesh.posX[i];
          const dy = my - mesh.posY[i];
          mesh.velX[i] += dx * (pullForce / 100);
          mesh.velY[i] += dy * (pullForce / 100);

          if (neighborForce > 0) {
            applySoAMeshForce(mesh, mesh.posX[i], mesh.posY[i], neighborRadius, -neighborForce);
          }
        }
      }
    },
  });
}
