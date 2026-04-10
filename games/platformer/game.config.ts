export const gameConfig = {
  name: 'Platformer',
  description: 'A simple platformer with gravity, jumping, and platforms',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing', 'gameOver'],
    hud: ['score'],
  },
} as const;
