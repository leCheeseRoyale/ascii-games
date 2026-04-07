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
  console.error('Templates:')
  console.error('  blank          — empty game with title + play scenes')
  console.error('  asteroid-field — complete playable game (dodge & shoot)')
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
      e.position.x += e.velocity.vx * dt
      e.position.y += e.velocity.vy * dt
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
  console.log('  This template uses the existing game/ files.')
  console.log('  If game/ already has the asteroid field code, you\'re good to go!')
  console.log('  Otherwise, check games/asteroid-field/ for the reference implementation.\n')
  console.log('  Run: bun dev')
}
