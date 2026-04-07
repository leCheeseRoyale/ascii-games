#!/usr/bin/env bun
/**
 * Scaffold a new scene.
 * Usage: bun run new:scene <name>
 * Example: bun run new:scene title  →  game/scenes/title.ts
 */

const name = process.argv[2]

if (!name) {
  console.error('Usage: bun run new:scene <name>')
  console.error('Example: bun run new:scene title')
  process.exit(1)
}

// Convert to kebab-case for filename, camelCase for scene name
const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
const label = kebab.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const path = `game/scenes/${kebab}.ts`
const file = Bun.file(path)

if (await file.exists()) {
  console.error(`✗ File already exists: ${path}`)
  console.error('  Delete it first or pick a different name.')
  process.exit(1)
}

const template = `import { defineScene, type Engine } from '@engine'

/**
 * ${label} Scene
 *
 * setup()   — runs once when the scene starts (spawn entities, add systems)
 * update()  — runs every frame (scene-level logic, input checks, transitions)
 * cleanup() — runs when leaving the scene (remove entities, reset state)
 */
export default defineScene({
  name: '${kebab}',

  setup(engine: Engine) {
    // Spawn entities
    // engine.world.add({
    //   position: { x: 400, y: 300 },
    //   ascii: { char: '@', font: '24px "Fira Code", monospace', color: '#00ff88' },
    // })

    // Add systems
    // engine.addSystem(mySystem)
  },

  update(engine: Engine, dt: number) {
    // Check for scene transitions
    // if (engine.keyboard.justPressed('Enter')) {
    //   engine.switchScene('next-scene')
    // }
  },

  cleanup(engine: Engine) {
    // Clean up scene-specific state
  },
})
`

await Bun.write(path, template)
console.log(`✓ Created scene: ${path}`)
console.log(`  Import it in game/index.ts and register with engine.registerScene()`)
