#!/usr/bin/env bun
/**
 * Scaffold a new entity factory.
 * Usage: bun run new:entity <name>
 * Example: bun run new:entity power-up  →  game/entities/power-up.ts
 */

const name = process.argv[2];

if (!name) {
  console.error("Usage: bun run new:entity <name>");
  console.error("Example: bun run new:entity power-up");
  process.exit(1);
}

const kebab = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
const pascal = kebab.replace(/(^|-)(\w)/g, (_m, _d, c) => c.toUpperCase());

const path = `game/entities/${kebab}.ts`;
if (await Bun.file(path).exists()) {
  console.error(`✗ Already exists: ${path}`);
  process.exit(1);
}

const template = `import type { Entity } from '@engine'
import { FONTS, COLORS, createTags } from '@engine'

/**
 * Create a ${pascal} entity.
 * Spawn with: engine.spawn(create${pascal}(x, y))
 */
export function create${pascal}(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '?',
      font: FONTS.normal,
      color: COLORS.accent,
    },
    collider: 'auto' as const,
    tags: createTags('${kebab}'),
    // health: { current: 3, max: 3 },
    // lifetime: { remaining: 5 },
  }
}
`;

await Bun.write(path, template);
console.log(`✓ Created entity: ${path}`);
console.log(`  Usage: engine.spawn(create${pascal}(x, y))`);
