/**
 * Wave spawner system — manages escalating enemy waves.
 *
 * Creates a System via defineSystem() that progresses through
 * wave definitions, spawning enemies and tracking completion.
 *
 * Closure-based state machine with phases: waiting → spawning → active → done.
 */

import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import { defineSystem, type System } from "../ecs/systems";

// ── Public types ────────────────────────────────────────────────

export interface WaveEnemy {
  /** Factory function to create an enemy entity at (x, y). */
  create: (x: number, y: number) => Partial<Entity>;
  /** Number of this enemy type to spawn in the wave. */
  count: number;
  /** Delay between individual spawns in seconds. Default 0.5. */
  spawnDelay?: number;
}

export interface WaveDefinition {
  /** Enemy groups to spawn in this wave. */
  enemies: WaveEnemy[];
  /** Tag for tracking these enemies. Defaults to config.enemyTag. */
  tag?: string;
  /** Delay in seconds before this wave starts spawning. */
  delay?: number;
}

export interface WaveSpawnerConfig {
  /** Array of wave definitions to progress through. */
  waves: WaveDefinition[];
  /** Fixed spawn positions. If provided, cycles through them. */
  spawnPositions?: Array<{ x: number; y: number }>;
  /** Use engine.randomEdgePosition() for spawn locations. Default true. */
  useEdgeSpawns?: boolean;
  /** Tag applied to all spawned enemies for tracking. Default 'wave-enemy'. */
  enemyTag?: string;
  /** Called when a wave starts spawning. */
  onWaveStart?: (waveIndex: number, engine: Engine) => void;
  /** Called when all enemies in a wave are destroyed. */
  onWaveComplete?: (waveIndex: number, engine: Engine) => void;
  /** Called when the final wave is completed. */
  onAllWavesComplete?: (engine: Engine) => void;
}

// ── Spawn queue entry ───────────────────────────────────────────

interface SpawnQueueEntry {
  create: (x: number, y: number) => Partial<Entity>;
  delay: number;
}

// ── Factory ─────────────────────────────────────────────────────

export function createWaveSpawner(config: WaveSpawnerConfig): System {
  const enemyTag = config.enemyTag ?? "wave-enemy";
  const useEdgeSpawns = config.useEdgeSpawns ?? true;

  // Closure state
  let phase: "waiting" | "spawning" | "active" | "done" = "waiting";
  let waveIndex = 0;
  let timer = 0;
  let spawnQueue: SpawnQueueEntry[] = [];
  let spawnTimer = 0;
  let positionIndex = 0;

  function getSpawnPosition(engine: Engine): { x: number; y: number } {
    if (config.spawnPositions && config.spawnPositions.length > 0) {
      const pos = config.spawnPositions[positionIndex % config.spawnPositions.length];
      positionIndex++;
      return pos;
    }
    if (useEdgeSpawns) {
      const edge = engine.randomEdgePosition();
      return { x: edge.x, y: edge.y };
    }
    // Fallback: random position across the top
    return { x: Math.random() * engine.width, y: -30 };
  }

  function buildSpawnQueue(wave: WaveDefinition): SpawnQueueEntry[] {
    const queue: SpawnQueueEntry[] = [];
    for (const group of wave.enemies) {
      const delay = group.spawnDelay ?? 0.5;
      for (let i = 0; i < group.count; i++) {
        queue.push({ create: group.create, delay });
      }
    }
    return queue;
  }

  function startWave(engine: Engine): void {
    if (waveIndex >= config.waves.length) {
      phase = "done";
      config.onAllWavesComplete?.(engine);
      return;
    }

    const wave = config.waves[waveIndex];
    const delay = wave.delay ?? 0;

    if (delay > 0) {
      phase = "waiting";
      timer = delay;
    } else {
      beginSpawning(engine);
    }
  }

  function beginSpawning(engine: Engine): void {
    const wave = config.waves[waveIndex];
    phase = "spawning";
    spawnQueue = buildSpawnQueue(wave);
    spawnTimer = 0;
    positionIndex = 0;
    config.onWaveStart?.(waveIndex, engine);
  }

  function spawnOne(engine: Engine): void {
    if (spawnQueue.length === 0) return;

    const entry = spawnQueue.shift();
    if (!entry) return;
    const pos = getSpawnPosition(engine);
    const entityData = entry.create(pos.x, pos.y);

    // Ensure the enemy has the tracking tag
    const wave = config.waves[waveIndex];
    const tag = wave.tag ?? enemyTag;
    if (entityData.tags) {
      entityData.tags.values.add(tag);
    } else {
      entityData.tags = { values: new Set([tag]) };
    }

    engine.spawn(entityData);
  }

  function countEnemies(engine: Engine): number {
    const wave = config.waves[waveIndex];
    const tag = wave?.tag ?? enemyTag;
    let count = 0;
    for (const e of engine.world.with("tags")) {
      if (e.tags.values.has(tag)) count++;
    }
    return count;
  }

  return defineSystem({
    name: "waveSpawner",

    init(engine: Engine) {
      // Reset state on system init
      phase = "waiting";
      waveIndex = 0;
      timer = 0;
      spawnQueue = [];
      spawnTimer = 0;
      positionIndex = 0;
      startWave(engine);
    },

    update(engine: Engine, dt: number) {
      switch (phase) {
        case "waiting": {
          timer -= dt;
          if (timer <= 0) {
            beginSpawning(engine);
          }
          break;
        }

        case "spawning": {
          spawnTimer -= dt;
          if (spawnTimer <= 0 && spawnQueue.length > 0) {
            const nextDelay = spawnQueue[0].delay;
            spawnOne(engine);
            spawnTimer = nextDelay;
          }

          // All spawned, move to active phase
          if (spawnQueue.length === 0) {
            phase = "active";
          }
          break;
        }

        case "active": {
          // Check if all enemies from this wave are destroyed
          if (countEnemies(engine) === 0) {
            config.onWaveComplete?.(waveIndex, engine);
            waveIndex++;
            startWave(engine);
          }
          break;
        }

        case "done":
          // No-op — all waves completed
          break;
      }
    },
  });
}
