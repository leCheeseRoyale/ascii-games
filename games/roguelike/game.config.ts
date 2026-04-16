export const gameConfig = {
  name: 'Roguelike',
  description: 'Turn-based dungeon crawler with BSP dungeons and fog of war',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing', 'gameOver'],
    hud: ['health', 'score'],
  },
} as const;
