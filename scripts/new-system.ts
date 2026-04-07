#!/usr/bin/env bun
/**
 * Scaffold a new system.
 * Usage: bun run new:system <name>
 * Example: bun run new:system gravity  →  game/systems/gravity.ts
 */

const name = process.argv[2]

if (!name) {
  console.error('Usage: bun run new:system <name>')
  console.error('Example: bun run new:system gravity')
  process.exit(1)
}

const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
const label = kebab.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const camel = kebab.replace(/-(\w)/g, (_m, c) => c.toUpperCase())

const path = `game/systems/${kebab}.ts`
if (await Bun.file(path).exists()) {
  console.error(`✗ Already exists: ${path}`)
  process.exit(1)
}

const template = `import { defineSystem } from '@engine'
import type { Engine } from '@engine'

/**
 * ${label} System
 *
 * Runs every frame. Query entities with engine.world.with(...components).
 */
export const ${camel}System = defineSystem({
  name: '${kebab}',

  // init(engine: Engine) {
  //   // Called once when the system is added
  // },

  update(engine: Engine, dt: number) {
    // Example: apply velocity to position
    // for (const e of engine.world.with('position', 'velocity')) {
    //   e.position.x += e.velocity.vx * dt
    //   e.position.y += e.velocity.vy * dt
    // }
  },

  // cleanup(engine: Engine) {
  //   // Called when the system is removed
  // },
})
`

await Bun.write(path, template)
console.log(`✓ Created system: ${path}`)
console.log(`  Add in your scene's setup():  engine.addSystem(${camel}System)`)
