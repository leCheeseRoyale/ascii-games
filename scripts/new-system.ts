#!/usr/bin/env bun
/**
 * Scaffold a new system.
 * Usage: bun run new:system <name>
 * Example: bun run new:system movement  →  game/systems/movement.ts
 */

const name = process.argv[2]

if (!name) {
  console.error('Usage: bun run new:system <name>')
  console.error('Example: bun run new:system movement')
  process.exit(1)
}

const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
const label = kebab.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const path = `game/systems/${kebab}.ts`
const file = Bun.file(path)

if (await file.exists()) {
  console.error(`✗ File already exists: ${path}`)
  process.exit(1)
}

const template = `import { defineSystem, type Engine } from '@engine'

/**
 * ${label} System
 *
 * Systems run every frame. Query entities with engine.world.with(...components).
 * Keep systems focused — one concern per system.
 */
export default defineSystem({
  name: '${kebab}',

  update(engine: Engine, dt: number) {
    // Query entities that have the components you need
    // for (const entity of engine.world.with('position', 'velocity')) {
    //   entity.position.x += entity.velocity.vx * dt
    //   entity.position.y += entity.velocity.vy * dt
    // }
  },
})
`

await Bun.write(path, template)
console.log(`✓ Created system: ${path}`)
console.log(`  Add it in your scene's setup(): engine.addSystem(${kebab.replace(/-./g, c => c[1].toUpperCase())}System)`)
