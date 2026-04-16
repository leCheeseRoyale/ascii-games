/**
 * Damage processing system + visual feedback helper.
 *
 * Damage is a transient component stored on entities via the [key: string]: any indexer.
 * Internal state (_invincibleTimer) is also stored on entities with underscore prefix.
 */

import { events } from "@shared/events";
import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import { defineSystem, type System } from "../ecs/systems";

// ── Public types ────────────────────────────────────────────────

export interface DamageComponent {
  /** Amount of damage to apply. */
  amount: number;
  /** Optional reference to the entity that caused the damage. */
  source?: Partial<Entity>;
  /** Optional damage type for filtering (e.g. 'fire', 'physical'). */
  type?: string;
}

export interface DamageSystemConfig {
  /** Duration of invincibility after taking damage, in seconds. Default 0.5. */
  invincibilityDuration?: number;
  /** Called when an entity takes damage. Return false to cancel the damage. */
  onDamage?: (
    entity: Partial<Entity>,
    damage: DamageComponent,
    engine: Engine,
  ) => boolean | undefined;
  /** Called when an entity's health reaches 0 or below. */
  onDeath?: (entity: Partial<Entity>, lastDamage: DamageComponent, engine: Engine) => void;
}

export interface DamageFlashOptions {
  /** Flash color to temporarily apply. Default '#ffffff'. */
  flashColor?: string;
  /** Duration of the flash in seconds. Default 0.15. */
  flashDuration?: number;
  /** Camera shake magnitude. 0 to disable. Default 5. */
  shakeMagnitude?: number;
  /** Whether to emit hit particles. Default true. */
  particles?: boolean;
  /** Color of hit particles. Default '#ff4444'. */
  particleColor?: string;
}

// ── Damage system ───────────────────────────────────────────────

export function createDamageSystem(config?: DamageSystemConfig): System {
  const invincibilityDuration = config?.invincibilityDuration ?? 0.5;

  return defineSystem({
    name: "damageSystem",

    update(engine: Engine, dt: number) {
      for (const entity of engine.world.with("health")) {
        const e = entity as any;

        // Tick down invincibility timer
        if (e._invincibleTimer !== undefined && e._invincibleTimer > 0) {
          e._invincibleTimer -= dt;
        }

        // Skip if no damage component present
        if (!e.damage) continue;

        const damage: DamageComponent = e.damage;

        // Skip if currently invincible
        if (e._invincibleTimer !== undefined && e._invincibleTimer > 0) {
          delete e.damage;
          continue;
        }

        // Allow callback to cancel damage
        if (config?.onDamage) {
          const result = config.onDamage(entity, damage, engine);
          if (result === false) {
            delete e.damage;
            continue;
          }
        }

        // Apply damage
        entity.health.current -= damage.amount;

        // Set invincibility
        if (invincibilityDuration > 0) {
          e._invincibleTimer = invincibilityDuration;
        }

        events.emit("combat:damage-taken", {
          entity,
          amount: damage.amount,
          source: damage.source,
          type: damage.type,
          remainingHp: Math.max(0, entity.health.current),
        });

        // Check for death
        if (entity.health.current <= 0) {
          entity.health.current = 0;
          config?.onDeath?.(entity, damage, engine);
          events.emit("combat:entity-defeated", {
            entity,
            source: damage.source,
            type: damage.type,
          });
        }

        // Remove transient damage component
        delete e.damage;
      }
    },
  });
}

// ── Damage flash helper ─────────────────────────────────────────

/**
 * One-shot visual feedback for taking damage.
 *
 * Temporarily flashes the entity's color, shakes the camera, and emits particles.
 * Uses engine.after() for timing — no manual cleanup needed.
 */
export function createDamageFlash(
  entity: Partial<Entity>,
  engine: Engine,
  options?: DamageFlashOptions,
): void {
  const flashColor = options?.flashColor ?? "#ffffff";
  const flashDuration = options?.flashDuration ?? 0.15;
  const shakeMagnitude = options?.shakeMagnitude ?? 5;
  const emitParticles = options?.particles ?? true;
  const particleColor = options?.particleColor ?? "#ff4444";

  // Store original color and apply flash
  let originalColor: string | undefined;
  if (entity.ascii) {
    originalColor = entity.ascii.color;
    entity.ascii.color = flashColor;
  } else if (entity.sprite) {
    originalColor = entity.sprite.color;
    entity.sprite.color = flashColor;
  }

  // Restore original color after flash duration
  if (originalColor !== undefined) {
    const savedColor = originalColor;
    engine.after(flashDuration, () => {
      if (entity.ascii) {
        entity.ascii.color = savedColor;
      } else if (entity.sprite) {
        entity.sprite.color = savedColor;
      }
    });
  }

  // Camera shake
  if (shakeMagnitude > 0) {
    engine.camera.shake(shakeMagnitude);
  }

  // Hit particles
  if (emitParticles && entity.position) {
    engine.particles.burst({
      x: entity.position.x,
      y: entity.position.y,
      count: 8,
      chars: ["*", ".", "+", "×"],
      color: particleColor,
      speed: 80,
      lifetime: 0.4,
      spread: Math.PI * 2,
    });
  }
}
