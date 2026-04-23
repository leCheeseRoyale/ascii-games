#!/usr/bin/env bun
/**
 * Scaffold a new scene.
 * Usage: bun run new:scene <name> [--no-wire]
 * Example: bun run new:scene boss-fight  →  game/scenes/boss-fight.ts
 */

import { wireScene } from "./wire-utils";

const args = process.argv.slice(2);
const noWire = args.includes("--no-wire");
const name = args.find((a) => !a.startsWith("--"));

if (!name) {
  console.error("Usage: bun run new:scene <name> [--no-wire]");
  console.error("Example: bun run new:scene boss-fight");
  process.exit(1);
}

const kebab = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
const label = kebab.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const camel = kebab.replace(/-(\w)/g, (_m, c) => c.toUpperCase());

const path = `game/scenes/${kebab}.ts`;
if (await Bun.file(path).exists()) {
  console.error(`✗ Already exists: ${path}`);
  process.exit(1);
}

const template = `import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

/**
 * ${label} Scene
 */
export const ${camel}Scene = defineScene({
  name: '${kebab}',

  setup(engine: Engine) {
    // Set UI screen state
    // useStore.getState().setScreen('playing')

    // Spawn entities
    // engine.spawn({
    //   position: { x: engine.width / 2, y: engine.height / 2 },
    //   ascii: { char: '@', font: FONTS.large, color: COLORS.accent },
    // })

    // Add systems
    // engine.addSystem(mySystem)
  },

  update(engine: Engine, dt: number) {
    // Scene-level per-frame logic
    // if (engine.keyboard.pressed('Escape')) {
    //   engine.loadScene('title')
    // }
  },

  cleanup(engine: Engine) {
    // Runs when leaving this scene (before next scene's setup)
  },
})
`;

await Bun.write(path, template);
console.log(`✓ Created scene: ${path}`);

if (!noWire && (await wireScene(kebab, camel))) {
  console.log(`✓ Wired into game/index.ts (import + registerScene)`);
} else if (!noWire) {
  console.log(`  1. Import in game/index.ts:  import { ${camel}Scene } from './scenes/${kebab}'`);
  console.log(`  2. Register:                 engine.registerScene(${camel}Scene)`);
}
console.log(`  Load from another scene:     engine.loadScene('${kebab}')`);
