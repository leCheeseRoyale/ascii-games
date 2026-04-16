/**
 * Entity pool — reuse entities for short-lived gameplay elements
 * (bullets, particles, projectiles) to avoid spawn/destroy GC pressure.
 *
 * The pool keeps a reserve of pre-built entity objects. `acquire()` returns
 * one (re-adding it to the world), `release()` removes it from the world but
 * keeps it in memory. This trades memory for allocation churn — useful in
 * hot paths that fire/destroy hundreds of entities per second.
 *
 * Usage:
 *   const bulletPool = createEntityPool(engine, () => ({
 *     position: { x: 0, y: 0 },
 *     velocity: { vx: 0, vy: 0 },
 *     ascii: { char: '|', font: FONTS.normal, color: '#ff0' },
 *     collider: { type: 'circle', width: 4, height: 4 },
 *     tags: { values: new Set(['bullet']) },
 *   }), { size: 100 });
 *
 *   // Fire a bullet — acquire from pool instead of engine.spawn
 *   const bullet = bulletPool.acquire({ position: { x, y }, velocity: { vx, vy: 0 } });
 *
 *   // Return to pool (doesn't free memory — just deactivates)
 *   bulletPool.release(bullet);
 */

import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";

export interface EntityPool<T extends Partial<Entity>> {
  /**
   * Acquire an entity from the pool. If all entities are active and the
   * pool has room, creates a new one. Otherwise reuses the oldest active
   * entity (FIFO). The overrides object is shallow-merged into the entity.
   */
  acquire(overrides?: Partial<Entity>): T;

  /**
   * Release an entity back to the pool. It's deactivated (removed from the
   * world) but kept in memory for future reuse.
   */
  release(entity: T): void;

  /** Number of entities currently in use (acquired). */
  readonly active: number;

  /** Number of entities sitting in the pool (ready to acquire). */
  readonly available: number;

  /** Total allocated (active + available). */
  readonly total: number;

  /** Max pool size (hard cap). */
  readonly max: number;

  /** Pre-allocate entities up to the initial size (or custom count). */
  warmup(count?: number): void;

  /** Release all active entities back to the pool. */
  releaseAll(): void;

  /** Destroy all pooled entities (both active and inactive). */
  destroy(): void;
}

export interface PoolOptions {
  /** Initial pool size (pre-allocated). Default 0. */
  size?: number;
  /** Max entities in the pool. Default Infinity. */
  max?: number;
  /**
   * Called when an entity is released — used to reset state. Default
   * clears velocity, lifetime, and makes the entity invisible (opacity 0).
   */
  reset?: (entity: Partial<Entity>) => void;
}

/** Default reset: clears velocity, lifetime, and ascii opacity. */
function defaultReset(entity: Partial<Entity>): void {
  if (entity.velocity) {
    entity.velocity.vx = 0;
    entity.velocity.vy = 0;
  }
  if (entity.lifetime) {
    entity.lifetime = undefined;
  }
  if (entity.ascii) {
    entity.ascii.opacity = 0;
  }
}

/**
 * Shallow-merge overrides onto the entity. For each key in `overrides`,
 * if both the existing value and the override are plain objects, copy
 * the override's own properties onto the existing object (preserving the
 * same reference). Otherwise assign the override value directly.
 */
function applyOverrides(entity: Partial<Entity>, overrides: Partial<Entity>): void {
  const e = entity as Record<string, any>;
  const src = overrides as Record<string, any>;
  for (const key in src) {
    const incoming = src[key];
    const existing = e[key];
    if (
      incoming !== null &&
      typeof incoming === "object" &&
      !Array.isArray(incoming) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      Object.assign(existing, incoming);
    } else {
      e[key] = incoming;
    }
  }
}

/** Create an entity pool backed by the engine's world. */
export function createEntityPool<T extends Partial<Entity>>(
  engine: Engine,
  factory: () => T,
  options: PoolOptions = {},
): EntityPool<T> {
  const initialSize = options.size ?? 0;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const reset = options.reset ?? defaultReset;

  const active: T[] = [];
  const available: T[] = [];

  function acquire(overrides?: Partial<Entity>): T {
    let entity: T;

    if (available.length > 0) {
      // Reuse a previously released entity.
      entity = available.pop()!;
      if (overrides) applyOverrides(entity, overrides);
      engine.world.add(entity as Entity);
      active.push(entity);
    } else if (active.length + available.length < max) {
      // Grow the pool — create a new entity via factory.
      entity = factory();
      if (overrides) applyOverrides(entity, overrides);
      engine.world.add(entity as Entity);
      active.push(entity);
    } else {
      // Pool is saturated — recycle the oldest active entity (FIFO).
      entity = active.shift()!;
      if (overrides) applyOverrides(entity, overrides);
      // Make sure miniplex sees it as "added" (it still is — this is a no-op
      // in miniplex since it's already in the world, but calling it is safe).
      engine.world.add(entity as Entity);
      active.push(entity);
    }

    return entity;
  }

  function release(entity: T): void {
    const idx = active.indexOf(entity);
    if (idx >= 0) {
      active.splice(idx, 1);
    }
    reset(entity);
    engine.world.remove(entity as Entity);
    available.push(entity);
  }

  function warmup(count?: number): void {
    const target = count ?? initialSize;
    const toCreate = Math.min(target, max - (active.length + available.length));
    for (let i = 0; i < toCreate; i++) {
      const entity = factory();
      reset(entity);
      available.push(entity);
    }
  }

  function releaseAll(): void {
    // Iterate in reverse so splice inside release() stays cheap.
    for (let i = active.length - 1; i >= 0; i--) {
      release(active[i]);
    }
  }

  function destroy(): void {
    for (const e of active) {
      engine.world.remove(e as Entity);
    }
    active.length = 0;
    available.length = 0;
  }

  const pool: EntityPool<T> = {
    acquire,
    release,
    warmup,
    releaseAll,
    destroy,
    get active() {
      return active.length;
    },
    get available() {
      return available.length;
    },
    get total() {
      return active.length + available.length;
    },
    max,
  };

  // Pre-allocate the initial set.
  if (initialSize > 0) {
    pool.warmup();
  }

  return pool;
}
