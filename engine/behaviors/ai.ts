/**
 * AI behavior factories — return StateMachineState objects for the state machine system.
 *
 * These set velocity directly; the built-in _physics system handles position integration.
 * Internal state is stored on entities with underscore-prefixed keys (_patrol, _wander).
 */

import type { Entity, StateMachineState } from "@shared/types";
import type { Engine } from "../core/engine";
import { transition } from "../ecs/state-machine-system";
import { dist, normalize, sub, type Vec2 } from "../utils/math";

// ── Option types ────────────────────────────────────────────────

export interface PatrolOptions {
  speed: number;
  /** Pause at each waypoint in seconds. Default 0. */
  waitTime?: number;
  /** Loop back to start after last waypoint. Default true. */
  loop?: boolean;
}

export interface ChaseOptions {
  targetTag: string;
  speed: number;
  /** Detection range in pixels. */
  range: number;
  /** State to transition to when target leaves range or is not found. */
  onLostTarget?: string;
}

export interface FleeOptions {
  targetTag: string;
  speed: number;
  /** Range at which to flee. */
  range: number;
  /** State to transition to when target leaves range. */
  onSafe?: string;
}

export interface WanderOptions {
  /** Movement speed in pixels/sec. Default 40. */
  speed?: number;
  /** Seconds between random direction changes. Default 1. */
  changeInterval?: number;
}

// ── Internal helper ─────────────────────────────────────────────

/**
 * Set entity velocity toward a target position. Returns distance to target.
 */
function moveToward(entity: Partial<Entity>, target: Vec2, speed: number): number {
  const pos = entity.position;
  if (!pos) return Infinity;

  const d = dist(pos, target);
  if (d < 1) {
    if (entity.velocity) {
      entity.velocity.vx = 0;
      entity.velocity.vy = 0;
    }
    return d;
  }

  const dir = normalize(sub(target, pos));
  if (entity.velocity) {
    entity.velocity.vx = dir.x * speed;
    entity.velocity.vy = dir.y * speed;
  }
  return d;
}

// ── Patrol ──────────────────────────────────────────────────────

export function createPatrolBehavior(
  waypoints: Vec2[],
  options?: PatrolOptions,
): StateMachineState {
  const speed = options?.speed ?? 60;
  const waitTime = options?.waitTime ?? 0;
  const loop = options?.loop ?? true;

  return {
    enter(entity: Partial<Entity>, _engine: Engine) {
      entity._patrol = { waypointIndex: 0, waitTimer: 0 };
    },

    update(entity: Partial<Entity>, _engine: Engine, dt: number) {
      if (!entity._patrol || !entity.position || !entity.velocity || waypoints.length === 0) return;

      // Waiting at waypoint
      if (entity._patrol.waitTimer > 0) {
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
        entity._patrol.waitTimer -= dt;
        return;
      }

      const target = waypoints[entity._patrol.waypointIndex];
      const d = moveToward(entity, target, speed);

      // Arrived at waypoint
      if (d < speed * dt + 1) {
        entity._patrol.waypointIndex++;

        if (entity._patrol.waypointIndex >= waypoints.length) {
          if (loop) {
            entity._patrol.waypointIndex = 0;
          } else {
            entity._patrol.waypointIndex = waypoints.length - 1;
            entity.velocity.vx = 0;
            entity.velocity.vy = 0;
            return;
          }
        }

        if (waitTime > 0) {
          entity._patrol.waitTimer = waitTime;
          entity.velocity.vx = 0;
          entity.velocity.vy = 0;
        }
      }
    },

    exit(entity: Partial<Entity>, _engine: Engine) {
      if (entity.velocity) {
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
      }
    },
  };
}

// ── Chase ───────────────────────────────────────────────────────

export function createChaseBehavior(options: ChaseOptions): StateMachineState {
  const { targetTag, speed, range, onLostTarget } = options;

  return {
    update(entity: Partial<Entity>, engine: Engine, _dt: number) {
      if (!entity.position || !entity.velocity) return;

      const target = engine.findByTag(targetTag);
      if (!target?.position) {
        if (onLostTarget) transition(entity, onLostTarget);
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
        return;
      }

      const d = dist(entity.position, target.position);
      if (d > range) {
        if (onLostTarget) transition(entity, onLostTarget);
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
        return;
      }

      moveToward(entity, target.position, speed);
    },

    exit(entity: Partial<Entity>, _engine: Engine) {
      if (entity.velocity) {
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
      }
    },
  };
}

// ── Flee ────────────────────────────────────────────────────────

export function createFleeBehavior(options: FleeOptions): StateMachineState {
  const { targetTag, speed, range, onSafe } = options;

  return {
    update(entity: Partial<Entity>, engine: Engine, _dt: number) {
      if (!entity.position || !entity.velocity) return;

      const target = engine.findByTag(targetTag);
      if (!target?.position) {
        if (onSafe) transition(entity, onSafe);
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
        return;
      }

      const d = dist(entity.position, target.position);
      if (d > range) {
        if (onSafe) transition(entity, onSafe);
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
        return;
      }

      // Flee = reverse direction from target
      const dir = normalize(sub(entity.position, target.position));
      entity.velocity.vx = dir.x * speed;
      entity.velocity.vy = dir.y * speed;
    },

    exit(entity: Partial<Entity>, _engine: Engine) {
      if (entity.velocity) {
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
      }
    },
  };
}

// ── Wander ──────────────────────────────────────────────────────

export function createWanderBehavior(options?: WanderOptions): StateMachineState {
  const speed = options?.speed ?? 40;
  const changeInterval = options?.changeInterval ?? 1;

  return {
    enter(entity: Partial<Entity>, _engine: Engine) {
      const angle = Math.random() * Math.PI * 2;
      entity._wander = { timer: changeInterval, angle };
      if (entity.velocity) {
        entity.velocity.vx = Math.cos(angle) * speed;
        entity.velocity.vy = Math.sin(angle) * speed;
      }
    },

    update(entity: Partial<Entity>, _engine: Engine, dt: number) {
      if (!entity._wander || !entity.velocity) return;

      entity._wander.timer -= dt;
      if (entity._wander.timer <= 0) {
        entity._wander.timer = changeInterval;
        entity._wander.angle = Math.random() * Math.PI * 2;
        entity.velocity.vx = Math.cos(entity._wander.angle) * speed;
        entity.velocity.vy = Math.sin(entity._wander.angle) * speed;
      }
    },

    exit(entity: Partial<Entity>, _engine: Engine) {
      if (entity.velocity) {
        entity.velocity.vx = 0;
        entity.velocity.vy = 0;
      }
    },
  };
}
