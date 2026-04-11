/**
 * Interaction System — detects mouse hover, click, and drag on entities.
 *
 * Entities with `position`, `collider`, and `interactive` get their
 * interaction state updated each frame based on mouse position.
 *
 * Not auto-registered. Add with: engine.addSystem(interactionSystem)
 */

import type { Interactive } from "@shared/types";
import type { Engine } from "../core/engine";
import { type Collidable, overlaps } from "../physics/collision";
import type { System } from "./systems";

/** Create an Interactive component with sensible defaults. */
export function makeInteractive(opts?: { cursor?: string; autoMove?: boolean }): Interactive {
  return {
    hovered: false,
    clicked: false,
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    cursor: opts?.cursor,
    autoMove: opts?.autoMove ?? true,
  };
}

export const interactionSystem: System = {
  name: "_interaction",

  update(engine: Engine, _dt: number) {
    const worldMouse = engine.camera.screenToWorld(engine.mouse.x, engine.mouse.y);
    const pointCollider: Collidable = {
      position: { x: worldMouse.x, y: worldMouse.y },
      collider: { type: "circle", width: 1, height: 1 },
    };

    const entities = [...engine.world.with("position", "collider", "interactive")];

    // Sort by layer descending — frontmost entities get priority
    const getLayer = (e: Record<string, unknown>) =>
      (e.ascii as { layer?: number } | undefined)?.layer ??
      (e.sprite as { layer?: number } | undefined)?.layer ??
      (e.image as { layer?: number } | undefined)?.layer ??
      0;
    entities.sort((a, b) => getLayer(b) - getLayer(a));

    let consumed = false;

    for (const entity of entities) {
      const inter = entity.interactive;
      const hit = !consumed && overlaps(pointCollider, entity as unknown as Collidable);

      inter.hovered = hit;
      inter.clicked = hit && engine.mouse.justDown;

      // Start drag
      if (inter.clicked) {
        inter.dragging = true;
        inter.dragOffset.x = entity.position.x - worldMouse.x;
        inter.dragOffset.y = entity.position.y - worldMouse.y;
      }

      // End drag
      if (!engine.mouse.down) {
        inter.dragging = false;
      }

      // Move with mouse while dragging
      if (inter.dragging && inter.autoMove !== false) {
        entity.position.x = worldMouse.x + inter.dragOffset.x;
        entity.position.y = worldMouse.y + inter.dragOffset.y;
      }

      if (hit) consumed = true;
    }

    // Update cursor
    const hovered = entities.find((e) => e.interactive.hovered && e.interactive.cursor);
    if (engine.renderer?.canvas) {
      engine.renderer.canvas.style.cursor = hovered?.interactive.cursor ?? "default";
    }
  },
};
