/**
 * SoA Mesh System — runs spring + physics updates on all SoA meshes.
 *
 * Registered as a built-in system at the same priority as the ECS spring
 * system so spring + physics happen in the same frame slot as their
 * ECS counterparts.
 */

import type { Engine } from "../core/engine";
import { updateSoAMeshPhysics, updateSoAMeshSprings } from "./soa-mesh";
import type { System } from "./systems";
import { SystemPriority } from "./systems";

export const soaMeshSystem: System = {
  name: "_soaMesh",
  priority: SystemPriority.spring,

  update(engine: Engine, dt: number) {
    for (const mesh of engine.soaMeshes.values()) {
      updateSoAMeshSprings(mesh);
      updateSoAMeshPhysics(mesh, dt);
    }
  },
};
