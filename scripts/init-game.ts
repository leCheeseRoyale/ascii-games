#!/usr/bin/env bun
/**
 * Initialize a new game from a template.
 * Usage: bun run init:game <template>
 * Templates: blank, asteroid-field
 */
import { mkdir } from 'node:fs/promises'

const template = process.argv[2]

if (!template || !['blank', 'asteroid-field', 'platformer'].includes(template)) {
  console.error('Usage: bun run init:game <template>')
  console.error('Templates:')
  console.error('  blank          — empty game with title + play scenes')
  console.error('  asteroid-field — complete playable game (dodge & shoot)')
  console.error('  platformer     — platformer with gravity, jumping, and collectibles')
  process.exit(1)
}

async function writeFile(path: string, content: string) {
  const file = Bun.file(path)
  if (await file.exists()) {
    console.log(`  ⊘ Skipped (exists): ${path}`)
    return
  }
  await Bun.write(path, content)
  console.log(`  ✓ Created: ${path}`)
}

await mkdir('game/scenes', { recursive: true })
await mkdir('game/systems', { recursive: true })
await mkdir('game/entities', { recursive: true })

if (template === 'blank') {
  console.log('\n🎮 Initializing blank game...\n')

  await writeFile('game/config.ts', `export const GAME = {
  title: 'My ASCII Game',
  description: 'An ASCII adventure',
} as const
`)

  await writeFile('game/game.config.ts', `export const gameConfig = {
  name: 'Blank Game',
  description: 'Empty starter template with title and play scenes',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing'],
    hud: [],
  },
} as const;
`)

  await writeFile('game/scenes/title.ts', `import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const titleScene = defineScene({
  name: 'title',

  setup(engine: Engine) {
    useStore.getState().setScreen('menu')

    engine.spawn({
      position: { x: engine.width / 2, y: engine.height / 2 - 60 },
      ascii: { char: 'MY GAME', font: FONTS.huge, color: COLORS.accent, glow: '#00ff8844' },
    })

    engine.spawn({
      position: { x: engine.width / 2, y: engine.height / 2 + 40 },
      ascii: { char: '[ PRESS SPACE ]', font: FONTS.bold, color: COLORS.fg },
    })
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play')
    }
  },
})
`)

  await writeFile('game/scenes/play.ts', `import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')

    // Player
    engine.spawn({
      position: { x: engine.width / 2, y: engine.height / 2 },
      velocity: { vx: 0, vy: 0 },
      ascii: { char: '@', font: FONTS.large, color: COLORS.accent, glow: '#00ff8844' },
    })
  },

  update(engine: Engine, dt: number) {
    // Move player with WASD/arrows
    for (const e of engine.world.with('position', 'velocity', 'ascii')) {
      const speed = 200
      e.velocity.vx = 0
      e.velocity.vy = 0
      if (engine.keyboard.held('ArrowLeft') || engine.keyboard.held('KeyA')) e.velocity.vx = -speed
      if (engine.keyboard.held('ArrowRight') || engine.keyboard.held('KeyD')) e.velocity.vx = speed
      if (engine.keyboard.held('ArrowUp') || engine.keyboard.held('KeyW')) e.velocity.vy = -speed
      if (engine.keyboard.held('ArrowDown') || engine.keyboard.held('KeyS')) e.velocity.vy = speed
      // _physics system handles position += velocity * dt automatically
    }

    if (engine.keyboard.pressed('Escape')) {
      engine.loadScene('title')
    }
  },
})
`)

  await writeFile('game/index.ts', `import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
`)

  console.log('\n✓ Blank game ready! Run: bun dev\n')

} else if (template === 'asteroid-field') {
  console.log('\n🎮 Initializing asteroid-field game...\n')

  await writeFile('game/config.ts', `/**
 * Asteroid Field — Game Configuration
 */

export const GAME = {
  title: "ASTEROID FIELD",
  description: "Dodge and destroy asteroids in the void of space",

  player: {
    speed: 220,
    color: "#00ff88",
    glow: "#00ff8866",
    bulletSpeed: 500,
    bulletCooldown: 0.15,
    maxHealth: 5,
    invincibleTime: 1.0,
  },

  asteroid: {
    chars: ["*", "◆", "●", "○", "×", "♦", "◇", "▲"],
    colors: ["#ff6644", "#ffaa22", "#ff4466", "#ffcc44", "#ff8833", "#ee5533"],
    minSpeed: 40,
    maxSpeed: 160,
    spawnInterval: 1.2,
    minSpawnInterval: 0.2,
    difficultyRamp: 0.02,
    speedRamp: 0.5,
  },

  bullet: {
    char: "•",
    color: "#44ffff",
    glow: "#44ffff66",
    lifetime: 1.5,
    size: 6,
  },

  scoring: {
    perKill: 100,
    bonusMultiplier: 1.5,
  },
} as const;
`)

  await writeFile('game/game.config.ts', `export const gameConfig = {
  name: 'Asteroid Field',
  description: 'Dodge and shoot asteroids',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing', 'paused', 'gameOver'],
    hud: ['score', 'health'],
  },
} as const;
`)

  await writeFile('game/scenes/title.ts', `import { COLORS, defineScene, FONTS, pick, rng, rngInt } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";

export const titleScene = defineScene({
  name: "title",

  setup(engine) {
    useStore.getState().setScreen("menu");
    useStore.getState().reset();

    const cx = engine.width / 2;
    const cy = engine.height / 2;

    // Title text
    engine.spawn({
      position: { x: cx, y: cy - 80 },
      ascii: {
        char: GAME.title,
        font: FONTS.huge,
        color: COLORS.accent,
        glow: "#00ff8844",
      },
    });

    // Subtitle
    engine.spawn({
      position: { x: cx, y: cy + 10 },
      ascii: {
        char: GAME.description,
        font: FONTS.normal,
        color: COLORS.dim,
      },
    });

    // "Press SPACE" prompt
    engine.spawn({
      position: { x: cx, y: cy + 80 },
      ascii: {
        char: "[ PRESS SPACE TO START ]",
        font: FONTS.bold,
        color: COLORS.fg,
      },
    });

    // Big player character in center
    engine.spawn({
      position: { x: cx, y: cy - 20 },
      ascii: {
        char: "@",
        font: '64px "Fira Code", monospace',
        color: GAME.player.color,
        glow: GAME.player.glow,
      },
    });

    // Ambient drifting asteroids
    for (let i = 0; i < 15; i++) {
      const edge = rngInt(0, 3);
      const w = engine.width;
      const h = engine.height;
      let x: number, y: number;
      switch (edge) {
        case 0:
          x = rng(0, w);
          y = rng(-50, 0);
          break;
        case 1:
          x = rng(w, w + 50);
          y = rng(0, h);
          break;
        case 2:
          x = rng(0, w);
          y = rng(h, h + 50);
          break;
        default:
          x = rng(-50, 0);
          y = rng(0, h);
          break;
      }
      const vx = rng(-30, 30);
      const vy = rng(-30, 30);

      engine.spawn({
        position: { x, y },
        velocity: { vx, vy },
        ascii: {
          char: pick(GAME.asteroid.chars),
          font: FONTS.normal,
          color: pick(["#333333", "#444444", "#555555"]),
          scale: rng(0.6, 1.5),
          opacity: rng(0.2, 0.5),
        },
      });
    }
  },

  update(engine, dt) {
    if (engine.keyboard.pressed("Space")) {
      engine.loadScene("play");
    }
  },
});
`)

  await writeFile('game/scenes/play.ts', `import { defineScene } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";
import { createPlayer } from "../entities/player";
import { asteroidSpawnerSystem } from "../systems/asteroid-spawner";
import { collisionSystem, resetScore } from "../systems/collision";
import { lifetimeSystem } from "../systems/lifetime";
import { playerInputSystem } from "../systems/player-input";

export const playScene = defineScene({
  name: "play",

  setup(engine) {
    const store = useStore.getState();
    store.setScreen("playing");
    store.setScore(0);
    store.setHealth(GAME.player.maxHealth, GAME.player.maxHealth);
    resetScore();

    // Spawn player at center
    engine.spawn(createPlayer(engine.width / 2, engine.height / 2));

    // Add game systems
    engine.addSystem(playerInputSystem);
    engine.addSystem(asteroidSpawnerSystem);
    engine.addSystem(collisionSystem);
    engine.addSystem(lifetimeSystem);
  },

  update(engine, dt) {
    // Sync store with debug info
    const entities = [...engine.world.with("position")].length;
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities);

    // Pause on Escape
    if (engine.keyboard.pressed("Escape")) {
      if (engine.isPaused) {
        engine.resume();
        useStore.getState().setScreen("playing");
      } else {
        engine.pause();
        useStore.getState().setScreen("paused");
      }
    }
  },
});
`)

  await writeFile('game/scenes/game-over.ts', `import { COLORS, defineScene, FONTS } from "@engine";
import { useStore } from "@ui/store";

export const gameOverScene = defineScene({
  name: "game-over",

  setup(engine) {
    useStore.getState().setScreen("gameOver");

    const cx = engine.width / 2;
    const cy = engine.height / 2;

    // Big death explosion at center (uses engine-owned particles)
    engine.particles.burst({
      x: cx,
      y: cy,
      count: 60,
      chars: ["@", "#", "*", "!", "×", "·", ".", "+"],
      color: "#00ff88",
      speed: 250,
      lifetime: 2.5,
    });
    engine.particles.burst({
      x: cx,
      y: cy,
      count: 30,
      chars: ["*", "·", "."],
      color: "#ff4444",
      speed: 180,
      lifetime: 2.0,
    });

    // Game Over text
    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: {
        char: "GAME OVER",
        font: FONTS.huge,
        color: COLORS.danger,
        glow: "#ff444444",
      },
    });

    // Score display
    const score = useStore.getState().score;
    const highScore = useStore.getState().highScore;
    engine.spawn({
      position: { x: cx, y: cy + 20 },
      ascii: {
        char: \`SCORE: \${score}\`,
        font: FONTS.boldLarge,
        color: COLORS.fg,
      },
    });

    engine.spawn({
      position: { x: cx, y: cy + 55 },
      ascii: {
        char: \`HIGH SCORE: \${highScore}\`,
        font: FONTS.normal,
        color: COLORS.accent,
      },
    });

    // Restart prompt
    engine.spawn({
      position: { x: cx, y: cy + 110 },
      ascii: {
        char: "[ PRESS SPACE TO RETRY ]",
        font: FONTS.bold,
        color: COLORS.dim,
      },
    });
  },

  update(engine, dt) {
    if (engine.keyboard.pressed("Space")) {
      engine.loadScene("play");
    }
  },
});
`)

  await writeFile('game/systems/asteroid-spawner.ts', `import { defineSystem, rng, rngInt } from "@engine";
import { GAME } from "../config";
import { createAsteroid } from "../entities/asteroid";

let timer = 0;
let elapsed = 0;

export const asteroidSpawnerSystem = defineSystem({
  name: "asteroidSpawner",

  init() {
    timer = 0;
    elapsed = 0;
  },

  update(engine, dt) {
    elapsed += dt;

    // Difficulty ramp: spawn faster and asteroids move faster over time
    const interval = Math.max(
      GAME.asteroid.minSpawnInterval,
      GAME.asteroid.spawnInterval - elapsed * GAME.asteroid.difficultyRamp,
    );
    const speedBonus = elapsed * GAME.asteroid.speedRamp;

    timer -= dt;
    if (timer > 0) return;
    timer = interval;

    const w = engine.width;
    const h = engine.height;

    // Pick a random edge (0=top, 1=right, 2=bottom, 3=left)
    const edge = rngInt(0, 3);
    let x: number, y: number;

    switch (edge) {
      case 0:
        x = rng(0, w);
        y = -30;
        break; // top
      case 1:
        x = w + 30;
        y = rng(0, h);
        break; // right
      case 2:
        x = rng(0, w);
        y = h + 30;
        break; // bottom
      default:
        x = -30;
        y = rng(0, h);
        break; // left
    }

    // Aim roughly toward center with some randomness
    const cx = w / 2 + rng(-w * 0.3, w * 0.3);
    const cy = h / 2 + rng(-h * 0.3, h * 0.3);
    const dx = cx - x;
    const dy = cy - y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = rng(GAME.asteroid.minSpeed, GAME.asteroid.maxSpeed) + speedBonus;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    engine.spawn(createAsteroid(x, y, vx, vy));
  },
});
`)

  await writeFile('game/systems/collision.ts', `import { defineSystem, overlaps, sfx } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";

let score = 0;
let invincibleTimer = 0;

export function getScore() {
  return score;
}
export function resetScore() {
  score = 0;
}

export const collisionSystem = defineSystem({
  name: "collision",

  init() {
    score = 0;
    invincibleTimer = 0;
  },

  update(engine, dt) {
    invincibleTimer = Math.max(0, invincibleTimer - dt);

    const destroyed = new Set<object>();

    const bullets = [...engine.world.with("position", "collider", "tags")].filter((e) =>
      e.tags.values.has("bullet"),
    );
    const asteroids = [...engine.world.with("position", "collider", "tags")].filter((e) =>
      e.tags.values.has("asteroid"),
    );
    const players = [...engine.world.with("position", "collider", "player", "health")];

    // Bullet <-> Asteroid collisions
    for (const bullet of bullets) {
      if (destroyed.has(bullet)) continue;
      for (const asteroid of asteroids) {
        if (destroyed.has(asteroid)) continue;
        if (overlaps(bullet, asteroid)) {
          const color = asteroid.ascii?.color ?? "#ffaa22";
          engine.particles.burst({
            x: asteroid.position.x,
            y: asteroid.position.y,
            count: 12,
            chars: [".", "*", "·", "+", "×"],
            color,
            speed: 120,
            lifetime: 0.6,
          });

          score += GAME.scoring.perKill;
          useStore.getState().setScore(score);

          engine.destroy(bullet);
          engine.destroy(asteroid);
          destroyed.add(bullet);
          destroyed.add(asteroid);
          sfx.hit();
          engine.camera.shake(3);
          break;
        }
      }
    }

    // Player <-> Asteroid collisions
    for (const player of players) {
      if (destroyed.has(player)) continue;
      if (invincibleTimer > 0) break;
      for (const asteroid of asteroids) {
        if (destroyed.has(asteroid)) continue;
        if (!asteroid.position) continue;
        if (overlaps(player, asteroid)) {
          player.health.current -= 1;
          useStore.getState().setHealth(player.health.current, player.health.max);
          invincibleTimer = GAME.player.invincibleTime;

          engine.particles.burst({
            x: player.position.x,
            y: player.position.y,
            count: 20,
            chars: ["!", "#", "*", "@", "×"],
            color: "#ff4444",
            speed: 150,
            lifetime: 0.8,
          });
          engine.camera.shake(8);
          sfx.explode();

          engine.destroy(asteroid);
          destroyed.add(asteroid);

          if (player.health.current <= 0) {
            sfx.death();
            engine.particles.burst({
              x: player.position.x,
              y: player.position.y,
              count: 40,
              chars: ["@", "#", "*", "!", "×", "·"],
              color: "#00ff88",
              speed: 200,
              lifetime: 1.5,
            });
            engine.loadScene("game-over");
            return;
          }
          break;
        }
      }
    }

    // Clean up off-screen asteroids
    const margin = 100;
    const w = engine.width;
    const h = engine.height;
    for (const asteroid of asteroids) {
      if (destroyed.has(asteroid)) continue;
      if (!asteroid.position) continue;
      const { x, y } = asteroid.position;
      if (x < -margin || x > w + margin || y < -margin || y > h + margin) {
        engine.destroy(asteroid);
        destroyed.add(asteroid);
      }
    }
  },
});
`)

  await writeFile('game/systems/lifetime.ts', `import { defineSystem } from "@engine";

export const lifetimeSystem = defineSystem({
  name: "lifetime",
  update(engine, dt) {
    const toRemove: any[] = [];
    for (const e of engine.world.with("lifetime")) {
      e.lifetime.remaining -= dt;
      if (e.lifetime.remaining <= 0) {
        toRemove.push(e);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
`)

  await writeFile('game/systems/movement.ts', `import { defineSystem } from "@engine";

export const movementSystem = defineSystem({
  name: "movement",
  update(engine, dt) {
    for (const e of engine.world.with("position", "velocity")) {
      e.position.x += e.velocity.vx * dt;
      e.position.y += e.velocity.vy * dt;
    }
  },
});
`)

  await writeFile('game/systems/player-input.ts', `import { Cooldown, defineSystem, sfx } from "@engine";
import { GAME } from "../config";
import { createBullet } from "../entities/bullet";

let shootCooldown = new Cooldown(GAME.player.bulletCooldown);

// Track last aim direction for shooting
let lastDirX = 0;
let lastDirY = -1;

export const playerInputSystem = defineSystem({
  name: "playerInput",

  init() {
    shootCooldown = new Cooldown(GAME.player.bulletCooldown);
    lastDirX = 0;
    lastDirY = -1;
  },

  update(engine, dt) {
    shootCooldown.update(dt);
    const kb = engine.keyboard;

    for (const e of engine.world.with("position", "velocity", "player")) {
      const speed = GAME.player.speed;
      let dx = 0;
      let dy = 0;

      // WASD + Arrow keys
      if (kb.held("KeyW") || kb.held("ArrowUp")) dy -= 1;
      if (kb.held("KeyS") || kb.held("ArrowDown")) dy += 1;
      if (kb.held("KeyA") || kb.held("ArrowLeft")) dx -= 1;
      if (kb.held("KeyD") || kb.held("ArrowRight")) dx += 1;

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }

      e.velocity.vx = dx * speed;
      e.velocity.vy = dy * speed;

      // Track aim direction
      if (dx !== 0 || dy !== 0) {
        lastDirX = dx;
        lastDirY = dy;
      }

      // Screen wrapping
      const margin = 20;
      const w = engine.width;
      const h = engine.height;
      if (e.position.x < -margin) e.position.x = w + margin;
      if (e.position.x > w + margin) e.position.x = -margin;
      if (e.position.y < -margin) e.position.y = h + margin;
      if (e.position.y > h + margin) e.position.y = -margin;

      // Shoot with Space
      if (kb.held("Space") && shootCooldown.fire()) {
        const bSpeed = GAME.player.bulletSpeed;
        const len = Math.sqrt(lastDirX * lastDirX + lastDirY * lastDirY) || 1;
        const bvx = (lastDirX / len) * bSpeed;
        const bvy = (lastDirY / len) * bSpeed;
        engine.spawn(createBullet(e.position.x, e.position.y, bvx, bvy));
        sfx.shoot();
      }
    }
  },
});
`)

  await writeFile('game/entities/asteroid.ts', `import { pick, rng } from "@engine";
import { FONTS } from "@shared/constants";
import type { Entity } from "@shared/types";
import { GAME } from "../config";

export function createAsteroid(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  const scale = rng(0.8, 2.2);
  const size = 16 * scale;
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: {
      char: pick(GAME.asteroid.chars),
      font: FONTS.normal,
      color: pick(GAME.asteroid.colors),
      scale,
    },
    collider: { type: "circle", width: size, height: size },
    tags: { values: new Set(["asteroid"]) },
  };
}
`)

  await writeFile('game/entities/bullet.ts', `import { FONTS } from "@shared/constants";
import type { Entity } from "@shared/types";
import { GAME } from "../config";

export function createBullet(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: {
      char: GAME.bullet.char,
      font: FONTS.normal,
      color: GAME.bullet.color,
      glow: GAME.bullet.glow,
    },
    collider: { type: "circle", width: GAME.bullet.size, height: GAME.bullet.size },
    lifetime: { remaining: GAME.bullet.lifetime },
    tags: { values: new Set(["bullet"]) },
  };
}
`)

  await writeFile('game/entities/player.ts', `import { FONTS } from "@shared/constants";
import type { Entity } from "@shared/types";
import { GAME } from "../config";

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: "@",
      font: FONTS.large,
      color: GAME.player.color,
      glow: GAME.player.glow,
    },
    player: { index: 0 },
    collider: { type: "circle", width: 20, height: 20 },
    health: { current: GAME.player.maxHealth, max: GAME.player.maxHealth },
  };
}
`)

  await writeFile('game/index.ts', `/**
 * Asteroid Field — Game Setup
 *
 * Registers all scenes and returns the starting scene name.
 */

import type { Engine } from "@engine";
import { gameOverScene } from "./scenes/game-over";
import { playScene } from "./scenes/play";
import { titleScene } from "./scenes/title";

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  engine.registerScene(gameOverScene);
  return "title";
}
`)

  console.log('\n✓ Asteroid Field game ready! Run: bun dev\n')

} else if (template === 'platformer') {
  console.log('\n🎮 Initializing platformer game...\n')

  await writeFile('game/config.ts', `export const GAME = {
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
`)

  await writeFile('game/game.config.ts', `export const gameConfig = {
  name: 'Platformer',
  description: 'A simple platformer with gravity, jumping, and platforms',
  version: '1.0',
  ui: {
    screens: ['menu', 'playing', 'gameOver'],
    hud: ['score'],
  },
} as const;
`)

  await writeFile('game/entities/player.ts', `import { FONTS } from '@engine'
import type { Entity } from '@engine'
import { GAME } from '../config'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '@', font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
    collider: { type: 'circle', width: 20, height: 20 },
    physics: { gravity: GAME.world.gravity, friction: 0.85 },
    tags: { values: new Set(['player']) },
  }
}
`)

  await writeFile('game/entities/platform.ts', `import { FONTS } from '@engine'
import type { Entity } from '@engine'

export function createPlatform(x: number, y: number, width: number): Partial<Entity> {
  const char = '='.repeat(Math.max(1, Math.floor(width / 10)))
  return {
    position: { x, y },
    ascii: { char, font: FONTS.normal, color: '#888888' },
    collider: { type: 'rect', width, height: 8 },
    tags: { values: new Set(['platform']) },
  }
}
`)

  await writeFile('game/entities/star.ts', `import { FONTS } from '@engine'
import type { Entity } from '@engine'
import { GAME } from '../config'

export function createStar(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: { char: GAME.star.char, font: FONTS.large, color: GAME.star.color, glow: GAME.star.glow },
    collider: { type: 'circle', width: 16, height: 16, sensor: true },
    tags: { values: new Set(['star']) },
  }
}
`)

  await writeFile('game/systems/player-input.ts', `import { defineSystem } from '@engine'
import { GAME } from '../config'

export const playerInputSystem = defineSystem({
  name: 'playerInput',

  update(engine) {
    const groundY = engine.height * GAME.world.groundY

    for (const e of engine.world.with('position', 'velocity', 'physics', 'tags')) {
      if (!e.tags.values.has('player')) continue

      const speed = GAME.player.speed

      // Horizontal movement
      e.velocity.vx = 0
      if (engine.keyboard.held('KeyA') || engine.keyboard.held('ArrowLeft')) e.velocity.vx = -speed
      if (engine.keyboard.held('KeyD') || engine.keyboard.held('ArrowRight')) e.velocity.vx = speed

      // Ground check (simple — at bottom of screen)
      if (e.position.y >= groundY) {
        e.position.y = groundY
        e.velocity.vy = 0
        e.physics.grounded = true
      }

      // Jump
      if (e.physics.grounded && (engine.keyboard.pressed('Space') || engine.keyboard.pressed('ArrowUp') || engine.keyboard.pressed('KeyW'))) {
        e.velocity.vy = GAME.player.jumpForce
        e.physics.grounded = false
      }

      // Screen wrap horizontal
      if (e.position.x < 0) e.position.x = engine.width
      if (e.position.x > engine.width) e.position.x = 0
    }
  },
})
`)

  await writeFile('game/systems/star-spawner.ts', `import { Cooldown, defineSystem, rng } from '@engine'
import { GAME } from '../config'
import { createStar } from '../entities/star'

let spawnTimer = new Cooldown(GAME.star.spawnInterval)

export const starSpawnerSystem = defineSystem({
  name: 'starSpawner',

  init() {
    spawnTimer = new Cooldown(GAME.star.spawnInterval)
  },

  update(engine, dt) {
    spawnTimer.update(dt)
    if (spawnTimer.fire()) {
      const x = rng(50, engine.width - 50)
      const y = rng(engine.height * 0.2, engine.height * 0.7)
      engine.spawn(createStar(x, y))
    }
  },
})
`)

  await writeFile('game/systems/collection.ts', `import { defineSystem, overlaps, sfx } from '@engine'
import { useStore } from '@ui/store'

let score = 0

export const collectionSystem = defineSystem({
  name: 'collection',

  init() {
    score = 0
  },

  update(engine) {
    const players = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('player'))

    const stars = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('star'))

    for (const player of players) {
      for (const star of stars) {
        if (overlaps(player, star)) {
          score += 100
          useStore.getState().setScore(score)
          sfx.pickup()
          engine.particles.burst({
            x: star.position.x,
            y: star.position.y,
            count: 8,
            chars: ['*', '.', '+'],
            color: '#ffcc00',
            speed: 80,
            lifetime: 0.5,
          })
          engine.destroy(star)
        }
      }
    }
  },
})
`)

  await writeFile('game/scenes/title.ts', `import { COLORS, defineScene, FONTS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { GAME } from '../config'

export const titleScene = defineScene({
  name: 'title',

  setup(engine: Engine) {
    useStore.getState().setScreen('menu')
    const cx = engine.width / 2
    const cy = engine.height / 2

    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: { char: GAME.title, font: FONTS.huge, color: COLORS.accent, glow: '#00ff8844' },
    })

    engine.spawn({
      position: { x: cx, y: cy + 10 },
      ascii: { char: GAME.description, font: FONTS.normal, color: COLORS.dim },
    })

    engine.spawn({
      position: { x: cx, y: cy + 80 },
      ascii: { char: '[ PRESS SPACE ]', font: FONTS.bold, color: COLORS.fg },
    })
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade' })
    }
  },
})
`)

  await writeFile('game/scenes/play.ts', `import { defineScene } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { createPlayer } from '../entities/player'
import { collectionSystem } from '../systems/collection'
import { playerInputSystem } from '../systems/player-input'
import { starSpawnerSystem } from '../systems/star-spawner'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')
    useStore.getState().setScore(0)

    // Spawn player near bottom
    engine.spawn(createPlayer(engine.width / 2, engine.height * 0.85))

    // Ground line (visual only)
    const groundY = engine.height * 0.85 + 20
    engine.spawn({
      position: { x: engine.width / 2, y: groundY },
      ascii: {
        char: '\u2500'.repeat(80),
        font: '16px "Fira Code", monospace',
        color: '#444444',
      },
    })

    engine.addSystem(playerInputSystem)
    engine.addSystem(starSpawnerSystem)
    engine.addSystem(collectionSystem)
  },

  update(engine: Engine) {
    const entities = [...engine.world.with('position')].length
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities)

    if (engine.keyboard.pressed('Escape')) {
      if (engine.isPaused) {
        engine.resume()
        useStore.getState().setScreen('playing')
      } else {
        engine.pause()
        useStore.getState().setScreen('paused')
      }
    }
  },
})
`)

  await writeFile('game/index.ts', `import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
`)

  console.log('\n✓ Platformer game ready! Run: bun dev\n')
}
