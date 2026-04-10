export const gameConfig = {
  name: 'Asteroid Field',
  description: 'Dodge and shoot asteroids',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing', 'paused', 'gameOver'],
    hud: ['score', 'health'],
  },
} as const;
