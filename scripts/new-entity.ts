#!/usr/bin/env bun
/**
 * Scaffold a new entity factory.
 * Usage: bun run new:entity <name>
 * Example: bun run new:entity player  →  game/entities/player.ts
 */

const name = process.argv[2]

if (!name) {
  console.error('Usage: bun run new:entity <name>')
  console.error('Example: bun run new:entity player')
  process.exit(1)
}

const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
const pascal = kebab.replace(/(^|-)(\w)/g, (_m, _p, c) => c.toUpperCase())
const camel = pascal[0].toLowerCase() + pascal.slice(1)

const path = `game/entities/${kebab}.ts`
const file = Bun.file(path)

if (await file.exists()) {
  console.error(`✗ File already exists: ${path}`)
  process.exit(1)
}

const template = `import type { Entity } from '@engine'

/**
 * Create a ${pascal} entity.
 *
 * Entity factories return Partial<Entity> — just the components you need.
 * Spawn with: engine.world.add(create${pascal}(x, y))
 */
export function create${pascal}(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '?',
      font: '16px "Fira Code", monospace',
      color: '#00ff88',
    },
    collider: { type: 'circle', width: 16, height: 16 },
    // health: { current: 100, max: 100 },
    // lifetime: { remaining: 5 },
    // tags: { ${camel}: true },
  }
}
`

await Bun.write(path, template)
console.log(`✓ Created entity factory: ${path}`)
console.log(`  Usage: engine.world.add(create${pascal}(x, y))`)
