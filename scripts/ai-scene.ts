#!/usr/bin/env bun
/**
 * AI-assisted ECS game generator.
 *
 * Generates a complete defineScene-based game (scene + systems + entities + index)
 * from a natural-language pitch. For real-time, physics-heavy, or complex games.
 *
 * Usage:
 *   bun run ai:scene "<pitch>" [--model=opus|sonnet|haiku]
 *                               [--force] [--dry-run] [--verify] [--smoke]
 *
 * Examples:
 *   bun run ai:scene "space shooter with waves of enemies and power-ups"
 *   bun run ai:scene "snake game with growing tail and wrapping edges"
 */

import {
  callClaude,
  extractCode,
  loadEnv,
  loadSkill,
  parseArgs,
  slugify,
} from "./ai-shared";
import { smokeTest } from "./smoke-test";

function printHelp(): void {
  console.error(
    [
      'Usage: bun run ai:scene "<pitch>" [flags]',
      "",
      "Generates a complete defineScene-based game from a natural-language pitch.",
      "Produces a single-file game with scene, inline systems, and entity factories.",
      "",
      "Flags:",
      "  --model=opus|sonnet|haiku   Default: sonnet",
      "  --force                Overwrite existing files",
      "  --dry-run              Print the prompts; don't call API",
      "  --verify               Run bun run check after generation",
      "  --smoke                Headless smoke test (tick 60 frames, check for errors)",
      "",
      "Examples:",
      '  bun run ai:scene "space shooter with waves of enemies"',
      '  bun run ai:scene "snake game with growing tail" --verify --smoke',
    ].join("\n"),
  );
}

const ECS_REFERENCE = `// ECS game structure (from '@engine')
// A game is a setupGame function + scenes + systems + entity factories.

// Entity factories return Partial<Entity>:
//   function createBullet(x: number, y: number): Partial<Entity> {
//     return { position: { x, y }, velocity: { vx: 0, vy: -300 }, ascii: { char: '|' }, collider: 'auto' as const, tags: createTags('bullet') }
//   }

// Systems run every frame:
//   const mySystem = defineSystem({ name: 'my-system', update(engine, dt) { ... } })

// Scenes wire it all together:
//   const playScene = defineScene({ name: 'play', setup(engine) { engine.spawn(...); engine.addSystem(...) }, update(engine, dt) { ... } })

// setupGame registers scenes and returns the starting scene:
//   export function setupGame(engine: Engine): string { engine.registerScene(playScene); return 'play' }

// Key APIs:
//   engine.spawn(entity)               — add entity to world
//   engine.destroy(entity)             — remove entity
//   engine.findByTag('player')         — find first entity with tag
//   engine.findAllByTag('enemy')       — find all entities with tag
//   engine.world.with('position', 'velocity')  — query entities by components
//   engine.keyboard.held('ArrowLeft')  — check key state
//   engine.keyboard.pressed('Space')   — check key just pressed this frame
//   engine.mouse.x / .y / .justDown   — mouse position and click
//   engine.after(sec, fn)              — one-shot timer
//   engine.every(sec, fn)              — repeating timer
//   engine.spawnEvery(sec, factory)    — spawn entities on interval
//   engine.loadScene('name')           — switch scenes
//   engine.onCollide('tagA', 'tagB', (a, b) => {})  — collision handler
//   engine.particles.burst({ x, y, count, chars, color, speed, lifetime })
//   engine.camera.shake(magnitude)     — screen shake
//   engine.flash(color, duration)      — screen flash
//   engine.width / engine.height       — canvas dimensions
//   engine.centerX / engine.centerY    — canvas center

// Components (all optional on entities):
//   position: { x, y }                — world position
//   velocity: { vx, vy }              — velocity (_physics integrates this)
//   ascii: { char, font?, color?, glow? }  — text rendering
//   collider: 'auto' | { type: 'rect', width, height }  — collision shape
//   physics: { gravity?, friction?, drag?, bounce?, maxSpeed? }  — physics config
//   tags: createTags('player', 'enemy')  — entity tags for queries
//   health: { current, max }           — HP
//   lifetime: { remaining }            — auto-destroy after N seconds
//   screenWrap: { margin? }            — wrap at screen edges
//   screenClamp: { margin? }           — clamp to screen edges
//   layer: number                      — render order (lower = behind)

// DON'T manually integrate velocity — _physics does position += velocity * dt
// DON'T use setInterval/setTimeout — use engine.after/every
// DON'T add built-in systems manually — they auto-register`;

const MINIMAL_EXAMPLE = `// Canonical minimal ECS game — dodge falling objects.
import type { Engine, Entity } from '@engine'
import { createTags, defineScene, defineSystem, COLORS, FONTS } from '@engine'
import { useStore } from '@ui/store'

function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '@', font: FONTS.large, color: COLORS.accent },
    collider: 'auto' as const,
    tags: createTags('player'),
  }
}

function createRock(x: number): Partial<Entity> {
  return {
    position: { x, y: -20 },
    velocity: { vx: 0, vy: 150 },
    ascii: { char: '*', color: '#888' },
    collider: 'auto' as const,
    tags: createTags('rock'),
    lifetime: { remaining: 5 },
  }
}

const inputSystem = defineSystem({
  name: 'player-input',
  update(engine: Engine) {
    for (const p of engine.world.with('position', 'velocity', 'player')) {
      p.velocity.vx = 0
      if (engine.keyboard.held('ArrowLeft')) p.velocity.vx = -200
      if (engine.keyboard.held('ArrowRight')) p.velocity.vx = 200
    }
  },
})

let score = 0
const playScene = defineScene({
  name: 'play',
  setup(engine: Engine) {
    score = 0
    useStore.getState().setScreen('playing')
    engine.spawn(createPlayer(engine.centerX, engine.height - 40))
    engine.addSystem(inputSystem)
    engine.spawnEvery(0.5, () => createRock(Math.random() * engine.width))
    engine.onCollide('player', 'rock', (_player, rock) => {
      engine.destroy(rock)
      engine.flash('#ff0000', 0.1)
      engine.camera.shake(4)
    })
    engine.every(1, () => { score++; useStore.getState().setScore(score) })
  },
  update(engine: Engine) {
    if (engine.keyboard.pressed('Escape')) engine.loadScene('play')
  },
})

export function setupGame(engine: Engine): string {
  engine.registerScene(playScene)
  return 'play'
}`;

const OUTPUT_RULES = `Output rules — STRICT:
1. Respond with ONE fenced \`\`\`ts ... \`\`\` code block and NOTHING else.
2. The file must be a complete, compilable TypeScript module.
3. Imports: ONLY from '@engine' and '@ui/store'. No other local paths or npm packages.
4. Define entity factories as functions returning Partial<Entity>.
5. Define systems with defineSystem({ name, update(engine, dt) {} }).
6. Define at least one scene with defineScene({ name, setup, update }).
7. Export a setupGame(engine: Engine): string function that registers scenes and returns the starting scene name.
8. Keep it in a SINGLE FILE. Inline systems and entity factories. Under ~200 lines.
9. TypeScript strict. No \`any\`. Type every parameter.
10. DON'T manually integrate velocity. DON'T use setInterval/setTimeout. DON'T add built-in systems.
11. Use createTags('name') for tags, 'auto' as const for colliders.
12. Use engine.onCollide for collision handling, not manual overlap checks.`;

function buildSystemPrompt(skillMaster: string): string {
  return [
    "You are an expert ascii-games engine contributor.",
    "Your job: given a game pitch, output ONE TypeScript file implementing a real-time ECS game via defineScene + defineSystem.",
    "",
    "Reference:",
    ECS_REFERENCE,
    "",
    "Minimal example (study the shape):",
    MINIMAL_EXAMPLE,
    "",
    OUTPUT_RULES,
    "",
    "--- engine skill reference ---",
    skillMaster,
  ].join("\n");
}

function buildUserPrompt(pitch: string): string {
  return [
    `Game pitch: ${pitch}`,
    "",
    "Design the minimal playable version of this pitch as a single-file ECS game.",
    "Include: entity factories, input system, game logic system(s), at least one scene, and setupGame.",
    "Use engine.onCollide for collisions. Use engine.spawnEvery or engine.every for spawning/timing.",
    "Keep visuals clear with distinct ASCII characters for each entity type.",
    "Add juice: engine.particles.burst on hits, engine.camera.shake on impacts, engine.flash on damage.",
    "",
    "Return one complete .ts file in a ```ts fenced block.",
  ].join("\n");
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "HELP") {
      printHelp();
      process.exit(0);
    }
    console.error(msg);
    printHelp();
    process.exit(1);
  }

  const pitch = parsed.positional.join(" ").trim();
  if (!pitch) {
    printHelp();
    process.exit(1);
  }

  const { flags } = parsed;
  const slug = slugify(pitch);
  const outPath = flags.out ?? `game/${slug}.ts`;

  const skillMaster = await loadSkill("ascii-games-dev");
  const system = buildSystemPrompt(skillMaster);
  const user = buildUserPrompt(pitch);

  if (flags.dryRun) {
    console.log("── SYSTEM PROMPT ──");
    console.log(system);
    console.log("\n── USER PROMPT ──");
    console.log(user);
    console.log("\n── WOULD WRITE TO ──");
    console.log(outPath);
    console.log(`\n(model=${flags.model ?? "sonnet"})`);
    return;
  }

  await loadEnv();

  console.log(`Calling Claude (${flags.model ?? "sonnet"}) to design "${pitch}"…`);
  const response = await callClaude({
    system,
    prompt: user,
    model: flags.model,
    maxTokens: 4000,
  });

  const code = extractCode(response, "ts");
  if (!code || !code.includes("defineScene") || !code.includes("setupGame")) {
    console.error(
      "Claude response did not contain both defineScene(...) and setupGame(...). Raw response:",
    );
    console.error(response);
    process.exit(1);
  }

  const file = Bun.file(outPath);
  if ((await file.exists()) && !flags.force) {
    console.error(`File exists: ${outPath}. Re-run with --force to overwrite.`);
    process.exit(1);
  }
  await Bun.write(outPath, `${code}\n`);
  console.log(`Wrote ${outPath}`);

  // Auto-wire game/index.ts
  if (outPath.startsWith("game/") && outPath.endsWith(".ts")) {
    const { wireEntryPoint } = await import("./wire-utils");
    const moduleSlug = outPath.slice("game/".length, -".ts".length);
    if (await wireEntryPoint(moduleSlug)) {
      console.log("✓ Wired game/index.ts → re-exports setupGame from generated module");
    }
  }

  if (flags.verify) {
    console.log("\nRunning typecheck...");
    const proc = Bun.spawn(["bun", "run", "check"], { stdout: "inherit", stderr: "inherit" });
    await proc.exited;
    if (proc.exitCode !== 0) {
      console.error("\nTypecheck failed. Please fix the generated code.");
      process.exit(1);
    }
    console.log("Typecheck passed.");
  }

  if (flags.smoke) {
    await smokeTest();
  }

  console.log("\nRun: bun dev");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
