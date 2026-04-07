# Scaffolding Tools

Bun scripts that generate boilerplate files for scenes, systems, entities, and full game templates.

## Available Scripts

| Command               | What it creates                        |
|-----------------------|----------------------------------------|
| `bun run new:scene`   | A new scene file with defineScene      |
| `bun run new:system`  | A new system file with defineSystem    |
| `bun run new:entity`  | A new entity factory file              |
| `bun run init:game`   | Copies a full example game             |

## new:scene

```bash
bun run new:scene my-scene
```

Creates `game/scenes/my-scene.ts` with a defineScene template:

```ts
import { defineScene } from '@/engine/scene'

export const myScene = defineScene({
  name: 'my-scene',
  systems: [],
  setup(engine) {
    // Called when scene loads
  },
  teardown(engine) {
    // Called when scene unloads
  },
})
```

## new:system

```bash
bun run new:system my-system
```

Creates `game/systems/my-system.ts` with a defineSystem template:

```ts
import { defineSystem } from '@/engine/system'

export const mySystem = defineSystem({
  name: 'my-system',
  update(engine, dt) {
    // Called every frame
  },
})
```

## new:entity

```bash
bun run new:entity my-entity
```

Creates `game/entities/my-entity.ts` with a factory template:

```ts
import type { Entity } from '@/engine/ecs'

export function createMyEntity(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '?',
      color: 'white',
    },
  }
}
```

## init:game

```bash
bun run init:game asteroid-field
bun run init:game blank
```

Copies a complete game template from the examples directory:

- **blank** — Empty game with one scene and no systems. Starting point for a new project.
- **asteroid-field** — The full asteroid field game with 3 scenes, 5 systems, 3 entities, and config.

Files are copied into `game/` and ready to run.

## How They Work

All scripts follow the same pattern:

1. Read `process.argv` for the name argument
2. Convert kebab-case to camelCase/PascalCase as needed
3. Build file content using template literals
4. Write using `Bun.write(path, content)`
5. Log the created file path

```ts
// Simplified example from new-system.ts
const name = process.argv[2]
if (!name) {
  console.error('Usage: bun run new:system <name>')
  process.exit(1)
}

const camel = kebabToCamel(name)
const content = `import { defineSystem } from '@/engine/system'

export const ${camel}System = defineSystem({
  name: '${name}',
  update(engine, dt) {
    //
  },
})
`

await Bun.write(`game/systems/${name}.ts`, content)
console.log(`Created game/systems/${name}.ts`)
```

No dependencies beyond Bun's built-in file API. No AST manipulation. Just string templates.

## See Also

- [[scene-lifecycle]] — What defineScene provides
- [[system-runner]] — What defineSystem provides
- [[entity-factory-pattern]] — The factory pattern these templates follow
