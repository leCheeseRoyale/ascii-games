/**
 * Enemy entity factories — Rat, Skeleton, Wraith.
 *
 * Each enemy has a stateMachine component with idle/chase/attack states.
 * AI decisions are made during state update functions, using findPath()
 * for pathfinding and gridDistance for range checks.
 */

import {
  FONTS,
  findPath,
  gridDistance,
  transition,
  type Entity,
  type GridMap,
} from "@engine";
import { GAME } from "../config";

interface EnemyConfig {
  char: string;
  name: string;
  color: string;
  glow?: string;
  health: number;
  attack: number;
  defense: number;
  xp: number;
  chaseRange: number;
  phaseWalls?: boolean;
}

function createEnemy(
  cfg: EnemyConfig,
  col: number,
  row: number,
  worldX: number,
  worldY: number,
  navGrid: GridMap<string>,
): Partial<Entity> {
  return {
    position: { x: worldX, y: worldY },
    ascii: {
      char: cfg.char,
      font: FONTS.large,
      color: cfg.color,
      glow: cfg.glow,
      layer: 4,
    },
    health: { current: cfg.health, max: cfg.health },
    tags: { values: new Set(["enemy"]) },
    gridPos: { col, row },
    enemyStats: {
      name: cfg.name,
      attack: cfg.attack,
      defense: cfg.defense,
      xp: cfg.xp,
      chaseRange: cfg.chaseRange,
      phaseWalls: cfg.phaseWalls ?? false,
    },
    stateMachine: {
      current: "idle",
      states: {
        idle: {
          update(entity, engine) {
            const player = engine.findByTag("player");
            if (!player?.gridPos || !entity.gridPos) return;
            const dist = gridDistance(entity.gridPos, player.gridPos);
            if (dist <= cfg.chaseRange) {
              transition(entity, "chase");
            }
          },
        },
        chase: {
          update(entity, engine) {
            const player = engine.findByTag("player");
            if (!player?.gridPos || !entity.gridPos) return;
            const dist = gridDistance(entity.gridPos, player.gridPos);

            if (dist > cfg.chaseRange + 2) {
              transition(entity, "idle");
              return;
            }

            if (dist <= 1) {
              transition(entity, "attack");
              return;
            }

            // Pathfind toward player
            const isWalkable = cfg.phaseWalls
              ? () => true
              : (_c: number, _r: number, val: string | null) => val !== "#";

            const path = findPath(navGrid, entity.gridPos, player.gridPos, {
              isWalkable,
              maxIterations: 200,
            });

            if (path && path.length > 1) {
              // Store next step for the AI system to execute
              entity.enemyIntent = {
                type: "move" as const,
                targetCol: path[1].col,
                targetRow: path[1].row,
              };
            }
          },
        },
        attack: {
          update(entity, engine) {
            const player = engine.findByTag("player");
            if (!player?.gridPos || !entity.gridPos) return;
            const dist = gridDistance(entity.gridPos, player.gridPos);

            if (dist <= 1) {
              entity.enemyIntent = { type: "attack" as const };
            } else {
              transition(entity, "chase");
            }
          },
        },
      },
    },
  };
}

export function createRat(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
  navGrid: GridMap<string>,
): Partial<Entity> {
  return createEnemy(GAME.enemies.rat, col, row, worldX, worldY, navGrid);
}

export function createSkeleton(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
  navGrid: GridMap<string>,
): Partial<Entity> {
  return createEnemy(GAME.enemies.skeleton, col, row, worldX, worldY, navGrid);
}

export function createWraith(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
  navGrid: GridMap<string>,
): Partial<Entity> {
  return createEnemy(
    { ...GAME.enemies.wraith, glow: GAME.enemies.wraith.glow },
    col,
    row,
    worldX,
    worldY,
    navGrid,
  );
}
