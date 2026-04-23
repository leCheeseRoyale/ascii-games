#!/usr/bin/env bun
/**
 * AI-assisted gameplay system generator.
 *
 * Usage:
 *   bun run ai:mechanic "<description>" [--out=path] [--model=opus|sonnet|haiku]
 *                                       [--force] [--dry-run]
 *
 * Examples:
 *   bun run ai:mechanic "enemy that patrols then chases player when close"
 *   bun run ai:mechanic "turret that fires at the nearest tagged enemy every 2s"
 */

import {
  callClaude,
  extractCode,
  loadEnv,
  loadSkill,
  parseArgs,
  pascalCase,
  slugify,
  writeFileSafe,
} from "./ai-shared";

function printHelp(): void {
  console.error(
    [
      'Usage: bun run ai:mechanic "<description>" [flags]',
      "",
      "Generates a defineSystem(...) module using Claude.",
      "",
      "Flags:",
      "  --out=<path>           Override output path (default: game/systems/<slug>.ts)",
      "  --model=opus|sonnet|haiku   Default: sonnet",
      "  --force                Overwrite existing file",
      "  --dry-run              Print the prompts that would be sent; don't call API",
      "  --verify               Run bun run check after generation",
      "  --verify               Run bun run check after generation",
      "",
      "Examples:",
      '  bun run ai:mechanic "enemy that patrols then chases player when close"',
      '  bun run ai:mechanic "turret that fires at nearest enemy every 2s"',
    ].join("\n"),
  );
}

const SYSTEM_REFERENCE = `// System API (from '@engine')
import { defineSystem, type System, type Engine } from '@engine'

// Query entities:
//   for (const e of engine.world.with('position', 'velocity', 'tags')) { ... }
// Find a single tagged entity:
//   const player = engine.findByTag('player')
// Spawn / destroy:
//   engine.spawn({ ... })
//   engine.destroy(entity)
// Timers / events:
//   engine.after(1.5, () => {...})
//   engine.every(0.5, () => {...})
// Re-usable behaviors live in '@engine':
//   createPatrolBehavior, createChaseBehavior, createFleeBehavior, createWanderBehavior
//   createDamageSystem, createWaveSpawner

// State machine component (preferred for multi-state AI):
interface StateMachine { current: string; states: Record<string, StateMachineState>; next?: string }
interface StateMachineState {
  enter?(entity: Partial<Entity>, engine: Engine): void
  update?(entity: Partial<Entity>, engine: Engine, dt: number): void
  exit?(entity: Partial<Entity>, engine: Engine): void
}
// transition(entity, 'nextStateName') from '@engine' switches states.

// DO NOT manually integrate velocity. _physics already does position += velocity * dt.`;

function buildSystemPrompt(skillMaster: string, skillMechanic: string): string {
  return [
    "You are an expert ascii-games engine contributor. You have read the master SKILL.md and the mechanic SKILL.md below.",
    "Your job: given a free-text mechanic description, output ONE TypeScript file implementing it via `defineSystem(...)`.",
    "",
    "Rules:",
    "1. Import ONLY from '@engine' (Entity type is re-exported from '@engine').",
    "2. Export a named system constant, e.g. `export const fooSystem = defineSystem({...})`.",
    "3. Use `engine.world.with(...)` for queries. Collect entities into an array before destroying/mutating.",
    "4. Prefer reusing `createPatrolBehavior` / `createChaseBehavior` / `createFleeBehavior` / `createWanderBehavior` / `createWaveSpawner` / `createDamageSystem` before writing custom logic.",
    "5. Do NOT manually integrate velocity — `_physics` already does it. Only set `velocity.vx/vy`.",
    "6. Do NOT use setTimeout/setInterval. Use `engine.after(sec, fn)` / `engine.every(sec, fn)`.",
    "7. Keep the system focused: only the update/init logic the description asks for. No feedback polish (that's for /ai-juice).",
    "8. TypeScript strict — give every parameter a type. No `any`.",
    "9. Respond with ONE fenced ```ts ... ``` code block and nothing else.",
    "",
    "Reference:",
    SYSTEM_REFERENCE,
    "",
    "--- master SKILL.md ---",
    skillMaster,
    "",
    "--- mechanic SKILL.md ---",
    skillMechanic,
  ].join("\n");
}

function buildUserPrompt(description: string, name: string): string {
  return [
    `Description: ${description}`,
    `Suggested system variable name: ${name}System`,
    `File path: game/systems/<slug>.ts`,
    "",
    "Return one complete .ts file in a ```ts fenced block. Include update(engine, dt) at minimum. Add init(engine) if stateful.",
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

  const description = parsed.positional.join(" ").trim();
  if (!description) {
    printHelp();
    process.exit(1);
  }

  const { flags } = parsed;
  const slug = slugify(description);
  const camel = slug.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
  const outPath = flags.out ?? `game/systems/${slug}.ts`;

  const [skillMaster, skillMechanic] = await Promise.all([
    loadSkill("ascii-games-dev"),
    loadSkill("mechanic"),
  ]);
  const system = buildSystemPrompt(skillMaster, skillMechanic);
  const user = buildUserPrompt(description, camel);

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

  console.log(`Calling Claude (${flags.model ?? "sonnet"}) to design the mechanic…`);
  const response = await callClaude({
    system,
    prompt: user,
    model: flags.model,
    maxTokens: 6144,
  });

  const code = extractCode(response, "ts");
  if (!code?.includes("defineSystem")) {
    console.error("Claude response did not contain a defineSystem(...) call. Raw response:");
    console.error(response);
    process.exit(1);
  }

  const result = await writeFileSafe({ path: outPath, content: `${code}\n`, force: flags.force });
  if (!result.written) {
    console.error(`Refused to write: ${result.reason}`);
    process.exit(1);
  }

  const pascal = pascalCase(slug);
  console.log(`Wrote ${outPath}`);

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

  console.log("\nNext steps:");
  console.log(`  import { ${camel}System } from './systems/${slug}'`);
  console.log(`  engine.addSystem(${camel}System)    // in your scene's setup()`);
  console.log(
    `\nAfter it works, polish with: bun run ai:juice "${pascal} hit / death / spawn event"`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
