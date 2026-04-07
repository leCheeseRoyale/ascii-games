#!/usr/bin/env bun
/**
 * Initialize a new game from a template.
 * Usage: bun run init:game <template>
 * Templates: blank, asteroid-field
 */
import { mkdir } from 'node:fs/promises'

const template = process.argv[2]

if (!template || !['blank', 'asteroid-field'].includes(template)) {
  console.error('Usage: bun run init:game <template>')
  console.error('Templates: blank, asteroid-field')
  process.exit(1)
}

async function writeIfMissing(path: string, content: string) {
  const file = Bun.file(path)
  if (await file.exists()) {
    console.log(`  ⊘ Skipped (exists): ${path}`)
    return false
  }
  await Bun.write(path, content)
  console.log(`  ✓ Created: ${path}`)
  return true
}

// Ensure directories
await mkdir('game/scenes', { recursive: true })
await mkdir('game/systems', { recursive: true })
await mkdir('game/entities', { recursive: true })
await mkdir('game/data', { recursive: true })

if (template === 'blank') {
  console.log('Initializing blank game...\n')

  await writeIfMissing('game/config.ts', `/**
 * Game configuration — tweak these values to tune gameplay.
 */
export const GAME = {
  title: 'My ASCII Game',
  width: 800,
  height: 600,
  fps: 60,
} as const
`)

  await writeIfMissing('game/scenes/title.ts', `import { defineScene, type Engine, COLORS, FONTS } from '@engine'

export default defineScene({
  name: 'title',

  setup(engine: Engine) {
    // Title text
    engine.world.add({
      position: { x: 400, y: 200 },
      textBlock: {
        text: 'MY GAME',
        font: '48px "Fira Code", monospace',
        color: COLORS.primary,
        align: 'center',
      },
    })

    // Prompt
    engine.world.add({
      position: { x: 400, y: 350 },
      textBlock: {
        text: 'Press ENTER to start',
        font: '16px "Fira Code", monospace',
        color: COLORS.dim,
        align: 'center',
      },
    })
  },

  update(engine: Engine, _dt: number) {
    if (engine.keyboard.justPressed('Enter')) {
      engine.switchScene('play')
    }
  },

  cleanup(_engine: Engine) {},
})
`)

  await writeIfMissing('game/scenes/play.ts', `import { defineScene, type Engine } from '@engine'

export default defineScene({
  name: 'play',

  setup(engine: Engine) {
    // Player
    engine.world.add({
      position: { x: 400, y: 300 },
      ascii: { char: '@', font: '24px "Fira Code", monospace', color: '#00ff88' },
      tags: { player: true },
    })
  },

  update(engine: Engine, dt: number) {
    const player = engine.world.with('position', 'tags').first
    if (!player) return

    const speed = 200
    if (engine.keyboard.isDown('ArrowLeft'))  player.position.x -= speed * dt
    if (engine.keyboard.isDown('ArrowRight')) player.position.x += speed * dt
    if (engine.keyboard.isDown('ArrowUp'))    player.position.y -= speed * dt
    if (engine.keyboard.isDown('ArrowDown'))  player.position.y += speed * dt
  },

  cleanup(_engine: Engine) {},
})
`)

  await writeIfMissing('game/index.ts', `import { type Engine } from '@engine'
import titleScene from './scenes/title'
import playScene from './scenes/play'

/**
 * Register all scenes and return the starting scene name.
 */
export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
`)

  console.log('\n✓ Blank game initialized!')
  console.log('  Run: bun dev')

} else if (template === 'asteroid-field') {
  console.log('Initializing asteroid-field game...\n')

  // Check if the template directory exists
  const templateDir = 'scripts/templates/asteroid-field'
  const templateFile = Bun.file(`${templateDir}/index.ts`)

  if (await templateFile.exists()) {
    // Copy from templates
    const glob = new Bun.Glob(`${templateDir}/**/*.ts`)
    for await (const path of glob.scan('.')) {
      const relative = path.replace(`${templateDir}/`, '')
      const dest = `game/${relative}`
      await mkdir(dest.split('/').slice(0, -1).join('/'), { recursive: true })
      const content = await Bun.file(path).text()
      await writeIfMissing(dest, content)
    }
    console.log('\n✓ Asteroid-field game initialized!')
  } else {
    // Generate inline
    await writeIfMissing('game/config.ts', `export const GAME = {
  title: 'Asteroid Field',
  width: 800,
  height: 600,
  fps: 60,
  asteroidSpeed: 80,
  playerSpeed: 250,
  bulletSpeed: 400,
  spawnInterval: 0.8,
} as const
`)

    await writeIfMissing('game/entities/ship.ts', `import type { Entity } from '@engine'

export function createShip(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '^', font: '24px "Fira Code", monospace', color: '#00ff88' },
    collider: { type: 'circle', width: 20, height: 20 },
    health: { current: 3, max: 3 },
    tags: { player: true },
  }
}
`)

    await writeIfMissing('game/entities/asteroid.ts', `import type { Entity } from '@engine'
import { rng, pick } from '@engine'

const CHARS = ['*', 'O', 'o', '@', '#']

export function createAsteroid(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: (rng() - 0.5) * 40, vy: 60 + rng() * 80 },
    ascii: { char: pick(CHARS), font: '20px "Fira Code", monospace', color: '#ff8844' },
    collider: { type: 'circle', width: 18, height: 18 },
    health: { current: 1, max: 1 },
    tags: { asteroid: true },
  }
}
`)

    await writeIfMissing('game/entities/bullet.ts', `import type { Entity } from '@engine'

export function createBullet(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: -400 },
    ascii: { char: '|', font: '14px "Fira Code", monospace', color: '#ffff00' },
    collider: { type: 'circle', width: 4, height: 12 },
    lifetime: { remaining: 2 },
    tags: { bullet: true },
  }
}
`)

    await writeIfMissing('game/scenes/title.ts', `import { defineScene, type Engine, COLORS } from '@engine'

export default defineScene({
  name: 'title',
  setup(engine: Engine) {
    engine.world.add({
      position: { x: 400, y: 200 },
      textBlock: { text: 'ASTEROID FIELD', font: '48px "Fira Code", monospace', color: COLORS.primary, align: 'center' },
    })
    engine.world.add({
      position: { x: 400, y: 300 },
      textBlock: { text: 'Press ENTER', font: '16px "Fira Code", monospace', color: COLORS.dim, align: 'center' },
    })
  },
  update(engine: Engine) {
    if (engine.keyboard.justPressed('Enter')) engine.switchScene('play')
  },
  cleanup() {},
})
`)

    await writeIfMissing('game/scenes/play.ts', `import { defineScene, type Engine, Cooldown, rng } from '@engine'
import { createShip } from '../entities/ship'
import { createAsteroid } from '../entities/asteroid'
import { createBullet } from '../entities/bullet'
import { GAME } from '../config'

const spawnTimer = new Cooldown(GAME.spawnInterval)
const shootTimer = new Cooldown(0.15)

export default defineScene({
  name: 'play',

  setup(engine: Engine) {
    engine.world.add(createShip(400, 500))
  },

  update(engine: Engine, dt: number) {
    const player = engine.world.with('position', 'tags').where(e => e.tags?.player).first
    if (!player) return

    // Movement
    if (engine.keyboard.isDown('ArrowLeft'))  player.position.x -= GAME.playerSpeed * dt
    if (engine.keyboard.isDown('ArrowRight')) player.position.x += GAME.playerSpeed * dt

    // Shooting
    if (engine.keyboard.isDown(' ') && shootTimer.ready(dt)) {
      engine.world.add(createBullet(player.position.x, player.position.y - 20))
    } else {
      shootTimer.tick(dt)
    }

    // Spawn asteroids
    if (spawnTimer.ready(dt)) {
      engine.world.add(createAsteroid(rng() * GAME.width, -20))
    } else {
      spawnTimer.tick(dt)
    }
  },

  cleanup() {},
})
`)

    await writeIfMissing('game/index.ts', `import { type Engine } from '@engine'
import titleScene from './scenes/title'
import playScene from './scenes/play'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
`)

    console.log('\n✓ Asteroid-field game initialized!')
  }

  console.log('  Run: bun dev')
}
