#!/usr/bin/env bun
/**
 * AI-assisted juice (particles + sfx + shake + floating text) helper generator.
 *
 * Usage:
 *   bun run ai:juice "<event description>" [--out=path] [--model=opus|sonnet|haiku]
 *                                          [--force] [--dry-run]
 *
 * Examples:
 *   bun run ai:juice "player getting hit by bullet"
 *   bun run ai:juice "collecting a coin"
 *   bun run ai:juice "boss death"
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
      "Usage: bun run ai:juice \"<event description>\" [flags]",
      "",
      "Generates a helper function that layers particles + sfx + camera shake + floating text.",
      "",
      "Flags:",
      "  --out=<path>           Override output path (default: game/helpers/<slug>.ts)",
      "  --model=opus|sonnet|haiku   Default: sonnet",
      "  --force                Overwrite existing file",
      "  --dry-run              Print the prompts that would be sent; don't call API",
      "",
      "Examples:",
      '  bun run ai:juice "player getting hit by bullet"',
      '  bun run ai:juice "collecting a coin"',
      '  bun run ai:juice "boss death"',
    ].join("\n"),
  );
}

const JUICE_REFERENCE = `// Juice primitives (all imported from '@engine')
// engine.particles.burst({ x, y, count, chars: string[], color, speed, lifetime, spread? })
// engine.particles.explosion(x, y)
// engine.particles.sparkle(x, y)
// engine.particles.smoke(x, y)
// engine.camera.shake(magnitude)           // keep <= 12 for routine events, <= 16 for big booms
// engine.floatingText(x, y, text, color?)
// engine.toast.show(text, { color? })
// sfx.hit(), sfx.shoot(), sfx.explode(), sfx.pickup(), sfx.death(), sfx.menu(), sfx.jump()
// engine.tweenEntity(entity, 'ascii.opacity', 1, 0, 0.8, 'easeOut')
// engine.playAnimation(entity, [{char:'◯'},{char:'◎'}], 0.1)

// Signature convention for helpers: (engine: Engine, x: number, y: number, opts?: {...}) => void
// Keep it a SINGLE function unless the event is clearly compound.`;

function buildSystemPrompt(skillMaster: string, skillJuice: string): string {
  return [
    "You are an expert ascii-games engine contributor. You have read the master SKILL.md and the juice SKILL.md below.",
    "Your job: given a gameplay event description, output ONE TypeScript file exporting a helper function that layers appropriate feedback.",
    "",
    "Rules:",
    "1. Import ONLY from '@engine' (Engine type, sfx, any needed primitives).",
    "2. Export a named function whose name reads like the event (`onHit`, `onPickup`, `onBossDeath`, etc.).",
    "3. Signature: `export function <name>(engine: Engine, x: number, y: number, opts?: <Opts>): void`.",
    "4. Layer only the juice that FITS the event — check the combo table in the juice SKILL.md. Do not stack everything.",
    "5. Routine events: particles + sfx + small shake + floating text. Big events: bigger shake, multi-burst, maybe a toast.",
    "6. Camera shake magnitude budget: <=4 light, ~8 medium, ~12 heavy, ~16 only for boss/death.",
    "7. No side effects at module scope. No setTimeout / setInterval — use `engine.after(sec, fn)` if you need delays.",
    "8. TypeScript strict. No `any`.",
    "9. Respond with ONE fenced ```ts ... ``` code block and nothing else.",
    "",
    "Reference:",
    JUICE_REFERENCE,
    "",
    "--- master SKILL.md ---",
    skillMaster,
    "",
    "--- juice SKILL.md ---",
    skillJuice,
  ].join("\n");
}

function buildUserPrompt(description: string, helperName: string): string {
  return [
    `Event: ${description}`,
    `Suggested helper name: ${helperName}`,
    `File path: game/helpers/<slug>.ts`,
    "",
    "Return one complete .ts file in a ```ts fenced block. Include brief JSDoc on the exported helper.",
  ].join("\n");
}

/** Turn a free-form event description into a camelCase helper name, prefixed with `on`. */
function helperNameFor(description: string): string {
  const slug = slugify(description);
  const pascal = pascalCase(slug);
  return `on${pascal}`;
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
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
  const helperName = helperNameFor(description);
  const outPath = flags.out ?? `game/helpers/${slug}.ts`;

  const [skillMaster, skillJuice] = await Promise.all([
    loadSkill("ascii-games-dev"),
    loadSkill("juice"),
  ]);
  const system = buildSystemPrompt(skillMaster, skillJuice);
  const user = buildUserPrompt(description, helperName);

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

  console.log(`Calling Claude (${flags.model ?? "sonnet"}) to compose juice for "${description}"…`);
  const response = await callClaude({
    system,
    prompt: user,
    model: flags.model,
    maxTokens: 4096,
  });

  const code = extractCode(response, "ts");
  if (!code || !code.includes("export function")) {
    console.error("Claude response did not contain an exported helper function. Raw response:");
    console.error(response);
    process.exit(1);
  }

  const result = await writeFileSafe({ path: outPath, content: code + "\n", force: flags.force });
  if (!result.written) {
    console.error(`Refused to write: ${result.reason}`);
    process.exit(1);
  }

  console.log(`Wrote ${outPath}`);
  console.log("\nNext steps:");
  console.log(`  import { ${helperName} } from './helpers/${slug}'`);
  console.log(`  ${helperName}(engine, x, y)   // call from your collision or event handler`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
