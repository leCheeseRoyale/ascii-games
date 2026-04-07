/**
 * Asteroid Field — Game Configuration
 */

export const GAME = {
  title: 'ASTEROID FIELD',
  description: 'Dodge and destroy asteroids in the void of space',

  player: {
    speed: 220,
    color: '#00ff88',
    glow: '#00ff8866',
    bulletSpeed: 500,
    bulletCooldown: 0.15,
    maxHealth: 5,
    invincibleTime: 1.0,
  },

  asteroid: {
    chars: ['*', '◆', '●', '○', '×', '♦', '◇', '▲'],
    colors: ['#ff6644', '#ffaa22', '#ff4466', '#ffcc44', '#ff8833', '#ee5533'],
    minSpeed: 40,
    maxSpeed: 160,
    spawnInterval: 1.2,     // seconds between spawns at start
    minSpawnInterval: 0.2,  // fastest spawn rate
    difficultyRamp: 0.02,   // interval decrease per second
    speedRamp: 0.5,         // speed increase per second
  },

  bullet: {
    char: '•',
    color: '#44ffff',
    glow: '#44ffff66',
    lifetime: 1.5,
    size: 6,
  },

  scoring: {
    perKill: 100,
    bonusMultiplier: 1.5,
  },
} as const
