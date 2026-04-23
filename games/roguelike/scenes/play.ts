/**
 * Play Scene — Main gameplay.
 *
 * Generates a BSP dungeon, spawns player/enemies/items, configures
 * turn phases, and wires all systems. Exposes module-level state
 * (navGrid, dungeonGrid, messages, visibleCells) for systems to read.
 */

import {
  defineScene,
  type Engine,
  GridMap,
  gridToWorld,
  pick,
  rngInt,
  save,
  setStoragePrefix,
  sfx,
} from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";
import { createRat, createSkeleton, createWraith } from "../entities/enemies";
import { createHealthPotion, createShield, createSword } from "../entities/items";
import { createPlayer } from "../entities/player";
import { combatSystem } from "../systems/combat";
import { enemyAISystem } from "../systems/enemy-ai";
import { fovSystem, resetExplored } from "../systems/fov";
import { hudSystem } from "../systems/hud";
import { playerInputSystem, resetPlayerMoved } from "../systems/player-input";
import { generateDungeon } from "../utils/dungeon";

// ── Module-level state shared with systems ──────────────────────

let navGrid: GridMap<string> | null = null;
let dungeonGrid: string[][] | null = null;
let messageLog: string[] = [];
let visibleCells = new Set<string>();

export function getNavGrid(): GridMap<string> | null {
  return navGrid;
}

export function getDungeonGrid(): string[][] | null {
  return dungeonGrid;
}

export function getMessages(): string[] {
  return messageLog;
}

export function addMessage(msg: string): void {
  messageLog.push(msg);
  if (messageLog.length > GAME.messages.maxLog) {
    messageLog = messageLog.slice(-GAME.messages.maxLog);
  }
}

export function getVisibleCells(): Set<string> {
  return visibleCells;
}

export function setVisibleCells(cells: Set<string>): void {
  visibleCells = cells;
}

// ── Scene ───────────────────────────────────────────────────────

export const playScene = defineScene({
  name: "play",

  setup(engine: Engine) {
    setStoragePrefix("roguelike");
    const store = useStore.getState();
    store.setScreen("playing");

    // Read scene data (floor progression or save data)
    const data = engine.sceneData;
    const floor = data.floor ?? 1;
    const prevMessages: string[] = data.messages ?? [];
    const prevScore = data.score ?? 0;

    store.setScore(prevScore);

    // Restore message log
    messageLog = [...prevMessages];
    addMessage(`--- Floor ${floor} ---`);

    // Generate dungeon
    const dungeon = generateDungeon();
    dungeonGrid = dungeon.grid;

    // Build navigation grid for pathfinding
    const cols = GAME.dungeon.cols;
    const rows = GAME.dungeon.rows;
    navGrid = new GridMap<string>(cols, rows, GAME.dungeon.wallChar);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        navGrid.set(c, r, dungeon.grid[r][c]);
      }
    }

    // Reset FOV
    resetExplored();
    visibleCells = new Set();

    // Spawn player
    const playerWorld = gridToWorld(
      dungeon.playerStart.col,
      dungeon.playerStart.row,
      GAME.cellSize,
    );
    const playerHealth = data.playerHealth ?? GAME.player.maxHealth;
    const playerMaxHealth = data.playerMaxHealth ?? GAME.player.maxHealth;
    const playerStats = data.playerStats ?? {
      attack: GAME.player.attack,
      defense: GAME.player.defense,
      xp: 0,
      level: 1,
      floor,
    };

    const playerEntity = engine.spawn(
      createPlayer(dungeon.playerStart.col, dungeon.playerStart.row, playerWorld.x, playerWorld.y),
    );
    if (playerEntity.health) {
      playerEntity.health.current = playerHealth;
      playerEntity.health.max = playerMaxHealth;
    }
    playerEntity.playerStats = { ...playerStats, floor };

    store.setHealth(playerHealth, playerMaxHealth);

    // Spawn enemies in random rooms (skip first room = player's room)
    const enemyRooms = dungeon.rooms.slice(1);
    const enemyCount = Math.min(GAME.dungeon.enemiesPerFloor + floor, enemyRooms.length * 2);

    for (let i = 0; i < enemyCount; i++) {
      const room = pick(enemyRooms);
      const ec = rngInt(room.x + 1, room.x + room.w - 2);
      const er = rngInt(room.y + 1, room.y + room.h - 2);

      // Don't spawn on player start or stairs
      if (ec === dungeon.playerStart.col && er === dungeon.playerStart.row) continue;
      if (ec === dungeon.stairs.col && er === dungeon.stairs.row) continue;

      const worldPos = gridToWorld(ec, er, GAME.cellSize);

      // Choose enemy type based on floor depth
      if (floor >= 3 && i % 4 === 0) {
        engine.spawn(createWraith(ec, er, worldPos.x, worldPos.y, navGrid));
      } else if (floor >= 2 && i % 3 === 0) {
        engine.spawn(createSkeleton(ec, er, worldPos.x, worldPos.y, navGrid));
      } else {
        engine.spawn(createRat(ec, er, worldPos.x, worldPos.y, navGrid));
      }
    }

    // Spawn items in random rooms
    const itemCount = GAME.dungeon.itemsPerFloor;
    for (let i = 0; i < itemCount; i++) {
      const room = pick(enemyRooms);
      const ic = rngInt(room.x + 1, room.x + room.w - 2);
      const ir = rngInt(room.y + 1, room.y + room.h - 2);

      if (ic === dungeon.playerStart.col && ir === dungeon.playerStart.row) continue;
      if (ic === dungeon.stairs.col && ir === dungeon.stairs.row) continue;

      const worldPos = gridToWorld(ic, ir, GAME.cellSize);

      // Distribute item types
      if (i === 0 && floor > 1) {
        engine.spawn(createSword(ic, ir, worldPos.x, worldPos.y));
      } else if (i === 1 && floor > 2) {
        engine.spawn(createShield(ic, ir, worldPos.x, worldPos.y));
      } else {
        engine.spawn(createHealthPotion(ic, ir, worldPos.x, worldPos.y));
      }
    }

    // Configure turn phases
    engine.turns.configure({ phases: ["player", "enemy", "resolve"] });
    engine.turns.start();

    // Reset player input state
    resetPlayerMoved();

    // Add systems (stateMachineSystem is auto-registered as built-in _stateMachine)
    engine.addSystem(playerInputSystem);
    engine.addSystem(enemyAISystem);
    engine.addSystem(combatSystem);
    engine.addSystem(fovSystem);
    engine.addSystem(hudSystem);

    // Center camera on player
    engine.camera.x = playerWorld.x - engine.centerX;
    engine.camera.y = playerWorld.y - engine.centerY;

    // Save game state on each new floor
    save("roguelike-save", {
      floor,
      playerHealth,
      playerMaxHealth,
      playerStats: { ...playerStats, floor },
      score: prevScore,
      messages: messageLog,
    });

    // Welcome message on floor 1
    if (floor === 1 && prevMessages.length === 0) {
      addMessage("Welcome to the Depths of ASCII.");
      addMessage("Find the stairs (>) to descend deeper.");

      // Show intro dialog on first play
      engine.dialog.show(
        "You stand at the entrance of an ancient dungeon. " +
          "Dark corridors stretch before you, and the air is thick with danger.\n\n" +
          "Find the stairs to descend deeper. Beware the creatures lurking in the shadows.",
        {
          speaker: "Narrator",
          typeSpeed: 40,
          border: "double",
          onChar: () => sfx.menu(),
        },
      );
    }
  },

  update(engine: Engine) {
    // Skip gameplay while dialog is active
    if (engine.dialog.active) return;

    // Keep camera centered on player
    const player = engine.findByTag("player");
    if (player?.position) {
      const targetX = player.position.x - engine.centerX;
      const targetY = player.position.y - engine.centerY;
      engine.camera.x += (targetX - engine.camera.x) * 0.15;
      engine.camera.y += (targetY - engine.camera.y) * 0.15;
    }

    // Sync debug info
    const entities = [...engine.world.with("position")].length;
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities);
  },
});
