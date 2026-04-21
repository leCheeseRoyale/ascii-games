/**
 * Collision event system — tracks overlapping pairs and fires enter/stay/exit callbacks.
 *
 * Runs at SystemPriority.physics + 1 (21) so it processes right after physics.
 * Uses collision group/mask bitmasks from the Collider component.
 *
 * Usage:
 *   const { system, onCollide, clear } = createCollisionEventSystem();
 *   engine.addSystem(system);
 *   const unsub = onCollide('bullet', 'enemy', {
 *     onEnter(a, b) { ... },
 *     onExit(a, b) { ... },
 *   });
 */

import type { CollisionCallback, Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import { type Collidable, overlaps } from "../physics/collision";
import { type System, SystemPriority } from "./systems";

interface CollisionHandler {
  tagA: string;
  tagB: string;
  onEnter?: CollisionCallback;
  onExit?: CollisionCallback;
  onStay?: CollisionCallback;
}

// Stable numeric id for pair-key generation. Avoids relying on unstable object identity.
let nextCollisionId = 1;

// WeakMap avoids polluting entities with internal bookkeeping properties.
const collisionIds = new WeakMap<object, number>();

function getCollisionId(entity: Partial<Entity>): number {
  let id = collisionIds.get(entity as object);
  if (id === undefined) {
    id = nextCollisionId++;
    collisionIds.set(entity as object, id);
  }
  return id;
}

function pairKey(a: Partial<Entity>, b: Partial<Entity>): string {
  const idA = getCollisionId(a);
  const idB = getCollisionId(b);
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

/** Check if two colliders should interact based on group/mask bitmasks. */
function groupsMatch(a: Partial<Entity>, b: Partial<Entity>): boolean {
  const ag = a.collider?.group ?? 1;
  const am = a.collider?.mask ?? 0xffffffff;
  const bg = b.collider?.group ?? 1;
  const bm = b.collider?.mask ?? 0xffffffff;
  return (ag & bm) !== 0 && (bg & am) !== 0;
}

export function createCollisionEventSystem(): {
  system: System;
  onCollide: (
    tagA: string,
    tagB: string,
    callbacks: {
      onEnter?: CollisionCallback;
      onExit?: CollisionCallback;
      onStay?: CollisionCallback;
    },
  ) => () => void;
  clear: () => void;
} {
  const handlers: CollisionHandler[] = [];
  // Active overlapping pairs: key → [entityA, entityB, handlerIndex]
  const activePairs = new Map<string, [Partial<Entity>, Partial<Entity>, number]>();

  const system: System = {
    name: "_collisionEvents",
    priority: SystemPriority.physics + 1,

    update(engine: Engine) {
      const currentPairs = new Set<string>();

      for (let h = 0; h < handlers.length; h++) {
        const handler = handlers[h];
        const entitiesA = engine.findAllByTag(handler.tagA);
        const sameTag = handler.tagA === handler.tagB;
        const entitiesB = sameTag ? entitiesA : engine.findAllByTag(handler.tagB);

        for (const a of entitiesA) {
          if (!a.collider || !a.position) continue;
          for (const b of entitiesB) {
            if (a === b) continue;
            if (!b.collider || !b.position) continue;
            if (!groupsMatch(a, b)) continue;

            const key = `${h}:${pairKey(a, b)}`;

            if (overlaps(a as Collidable, b as Collidable)) {
              currentPairs.add(key);
              if (!activePairs.has(key)) {
                // New overlap — enter
                activePairs.set(key, [a, b, h]);
                handler.onEnter?.(a, b);
              } else {
                // Continuing overlap — stay
                handler.onStay?.(a, b);
              }
            }
          }
        }
      }

      // Fire exit events for pairs that are no longer overlapping
      for (const [key, [a, b, h]] of activePairs) {
        if (!currentPairs.has(key)) {
          const handler = handlers[h];
          if (handler) {
            handler.onExit?.(a, b);
          }
          activePairs.delete(key);
        }
      }
    },
  };

  function onCollide(
    tagA: string,
    tagB: string,
    callbacks: {
      onEnter?: CollisionCallback;
      onExit?: CollisionCallback;
      onStay?: CollisionCallback;
    },
  ) {
    const handler: CollisionHandler = { tagA, tagB, ...callbacks };
    handlers.push(handler);
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  function clear() {
    handlers.length = 0;
    activePairs.clear();
  }

  return { system, onCollide, clear };
}
