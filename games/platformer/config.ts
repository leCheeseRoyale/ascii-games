export const GAME = {
  title: 'PLATFORMER',
  description: 'Jump and collect stars!',

  player: {
    speed: 200,
    jumpForce: -400,
    color: '#00ff88',
    glow: '#00ff8866',
  },

  world: {
    gravity: 800,
    groundY: 0.85, // fraction of screen height
  },

  star: {
    char: '*',
    color: '#ffcc00',
    glow: '#ffcc0066',
    spawnInterval: 2.0,
  },
} as const;
