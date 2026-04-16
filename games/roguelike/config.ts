/**
 * Roguelike — Game Configuration
 */

export const GAME = {
  title: "DEPTHS OF ASCII",
  description: "A turn-based dungeon crawler",

  cellSize: 24,

  player: {
    char: "@",
    color: "#00ff88",
    glow: "#00ff8844",
    maxHealth: 20,
    attack: 5,
    defense: 2,
    fovRadius: 8,
  },

  enemies: {
    rat: {
      char: "r",
      name: "Rat",
      color: "#aa8844",
      health: 6,
      attack: 2,
      defense: 0,
      xp: 10,
      chaseRange: 5,
    },
    skeleton: {
      char: "s",
      name: "Skeleton",
      color: "#cccccc",
      health: 12,
      attack: 4,
      defense: 1,
      xp: 25,
      chaseRange: 7,
    },
    wraith: {
      char: "W",
      name: "Wraith",
      color: "#aa44ff",
      glow: "#aa44ff44",
      health: 18,
      attack: 6,
      defense: 2,
      xp: 50,
      chaseRange: 10,
      phaseWalls: true,
    },
  },

  items: {
    healthPotion: {
      char: "!",
      name: "Health Potion",
      color: "#ff4444",
      healAmount: 8,
    },
    sword: {
      char: "/",
      name: "Sword",
      color: "#44aaff",
      attackBonus: 3,
    },
    shield: {
      char: "]",
      name: "Shield",
      color: "#ffaa00",
      defenseBonus: 2,
    },
  },

  dungeon: {
    cols: 50,
    rows: 30,
    minRoomSize: 4,
    maxRoomSize: 10,
    minLeafSize: 7,
    wallChar: "#",
    floorChar: ".",
    stairsChar: ">",
    wallColor: "#666666",
    floorColor: "#333333",
    stairsColor: "#ffcc00",
    dimAlpha: 0.3,
    enemiesPerFloor: 6,
    itemsPerFloor: 3,
  },

  scoring: {
    perKill: 50,
    perFloor: 200,
    perPotion: 10,
  },

  messages: {
    maxLog: 5,
  },
} as const;
