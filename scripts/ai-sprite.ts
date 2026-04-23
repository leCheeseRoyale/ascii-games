#!/usr/bin/env bun
/**
 * AI-assisted ASCII sprite generator.
 *
 * Usage:
 *   bun run ai:sprite "<prompt>" [--out=path] [--model=opus|sonnet|haiku]
 *                                [--frames=N] [--physics] [--force] [--dry-run]
 *
 * Examples:
 *   bun run ai:sprite "space invader" --frames=2
 *   bun run ai:sprite "small glowing potion bottle" --model=haiku
 *   bun run ai:sprite "dragon" --physics
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
      'Usage: bun run ai:sprite "<prompt>" [flags]',
      "",
      "Generates an ASCII sprite entity factory using Claude.",
      "",
      "Flags:",
      "  --out=<path>           Override output path (default: game/entities/<slug>.ts)",
      "  --model=opus|sonnet|haiku   Default: sonnet",
      "  --frames=N             Number of animation frames (default 1 = static)",
      "  --physics              Generate spawnSprite()-ready code with spring physics",
      "  --force                Overwrite existing file",
      "  --dry-run              Print the prompts that would be sent; don't call API",
      "  --verify               Run bun run check after generation",
      "",
      "Examples:",
      '  bun run ai:sprite "space invader" --frames=2',
      '  bun run ai:sprite "small glowing potion bottle" --model=haiku',
      '  bun run ai:sprite "dragon" --physics',
    ].join("\n"),
  );
}

const SPRITE_COMPONENT_REFERENCE = `// Sprite component shape (multi-line ASCII art)
interface Sprite {
  lines: string[]            // one string per line, rendered centered on position
  font: string               // use FONTS.normal, FONTS.large, or FONTS.small from '@engine'
  color: string              // hex string like '#ff8844'
  glow?: string              // optional glow color
  opacity?: number           // 0..1
  layer?: number             // render order
  colorMap?: Record<string, string>  // optional per-character color
}

// Ascii component shape (single char — use this for tiny sprites)
interface Ascii {
  char: string
  font: string
  color: string
  glow?: string
  opacity?: number
  scale?: number
  layer?: number
}

// Animation (use when --frames > 1)
interface AnimationFrame { char?: string; lines?: string[]; color?: string; duration?: number }
interface Animation {
  frames: AnimationFrame[]
  frameDuration: number    // seconds per frame
  currentFrame: number     // start 0
  elapsed: number          // start 0
  loop?: boolean
  playing?: boolean
}`;

function buildSystemPrompt(skillMaster: string): string {
  return [
    "You are an expert ascii-games engine contributor. You have read the master SKILL.md below.",
    "Your job: given a user prompt, output ONE TypeScript file implementing a single entity factory.",
    "",
    "Rules:",
    "1. Import ONLY from '@engine' (Entity type, FONTS, COLORS).",
    "2. Export a factory named `create<Pascal>(x: number, y: number): Partial<Entity>`.",
    "3. Return an entity literal with `position` plus either `sprite` (multi-line) OR `ascii` (single char).",
    "4. Use `sprite.lines` for any art wider than one character. Keep lines equal-padded.",
    "5. If animation frames are requested, include an `animation` field with frames that MATCH the primary visual shape (same rows for sprite, same char family for ascii).",
    "6. Keep the art tasteful — printable ASCII only, no emoji.",
    "7. Prefer COLORS.* values (accent, primary, success, danger, warning) when they fit; otherwise pick a single hex color.",
    "8. No extra systems, no classes, no side effects at module scope.",
    "9. Respond with ONE fenced ```ts ... ``` code block and nothing else.",
    "",
    "Component reference:",
    SPRITE_COMPONENT_REFERENCE,
    "",
    "--- master SKILL.md (for engine context) ---",
    skillMaster,
  ].join("\n");
}

const SPAWN_SPRITE_REFERENCE = `// engine.spawnSprite() — spawns each character as an independent entity with spring physics.
// It is a method on the Engine instance (not a standalone import).
//
// spawnSprite(opts: {
//   lines: string[]                              // one string per row of ASCII art
//   font: string                                 // e.g. '16px "Fira Code", monospace'
//   position: { x: number; y: number }           // top-left origin
//   color?: string                               // hex string, default '#e0e0e0'
//   spring?: { strength?: number; damping?: number } // spring-to-home params
//   layer?: number                               // render order
//   tags?: string[]                              // entity tags
//   collider?: boolean                           // auto-collider per char, default true
// }): Partial<Entity>[]
//
// Spring defaults: strength 0.08, damping 0.93.
// Typical presets:
//   gentle:  { strength: 0.03, damping: 0.96 }
//   bouncy:  { strength: 0.12, damping: 0.88 }
//   stiff:   { strength: 0.2,  damping: 0.8  }`;

function buildPhysicsSystemPrompt(skillMaster: string): string {
  return [
    "You are an expert ascii-games engine contributor. You have read the master SKILL.md below.",
    "Your job: given a user prompt, output ONE TypeScript file implementing a `spawnSprite()`-ready function.",
    "The generated code calls `engine.spawnSprite()` which decomposes multi-line ASCII art into",
    "individual character entities with spring-to-home physics.",
    "",
    "Rules:",
    "1. Import `type Engine` and `FONTS` (and optionally `COLORS`) from '@engine'.",
    "2. Define the ASCII art as a `string[]` constant (one string per row, equal-padded).",
    "3. Export a function named `spawn<Pascal>(engine: Engine, x: number, y: number)` that calls",
    "   `engine.spawnSprite()` and returns the resulting `Partial<Entity>[]`.",
    "4. Pick a spring preset that fits the visual mood. Import `SpringPresets` from '@engine'",
    "   and use `SpringPresets.gentle`, `SpringPresets.bouncy`, or `SpringPresets.stiff`.",
    "5. Keep the art tasteful — printable ASCII only, no emoji.",
    "6. Prefer COLORS.* values (accent, primary, success, danger, warning) when they fit; otherwise pick a single hex color.",
    "7. No extra systems, no classes, no side effects at module scope.",
    "8. Respond with ONE fenced ```ts ... ``` code block and nothing else.",
    "",
    "spawnSprite API reference:",
    SPAWN_SPRITE_REFERENCE,
    "",
    "--- master SKILL.md (for engine context) ---",
    skillMaster,
  ].join("\n");
}

function buildPhysicsUserPrompt(promptText: string, name: string): string {
  return [
    `User prompt: ${promptText}`,
    `Suggested function name: spawn${name}`,
    `File path: game/entities/<slug>.ts`,
    "",
    "Return one complete .ts file in a ```ts fenced block.",
    "The file must export a function that calls engine.spawnSprite() with appropriate spring physics.",
  ].join("\n");
}

function buildUserPrompt(promptText: string, frames: number, name: string): string {
  const framesLine =
    frames > 1
      ? `Include an \`animation\` component with exactly ${frames} frames, frameDuration: 0.15, loop: true, playing: true.`
      : "Static sprite — no animation component.";
  return [
    `User prompt: ${promptText}`,
    `Suggested factory name: create${name}`,
    `File path: game/entities/<slug>.ts`,
    framesLine,
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

  const promptText = parsed.positional.join(" ").trim();
  if (!promptText) {
    printHelp();
    process.exit(1);
  }

  const { flags } = parsed;
  const frames = flags.frames ?? 1;
  const physics = flags.physics ?? false;
  const slug = slugify(promptText);
  const pascal = pascalCase(slug);
  const outPath = flags.out ?? `game/entities/${slug}.ts`;

  const skillMaster = await loadSkill("ascii-games-dev");
  const system = physics ? buildPhysicsSystemPrompt(skillMaster) : buildSystemPrompt(skillMaster);
  const user = physics
    ? buildPhysicsUserPrompt(promptText, pascal)
    : buildUserPrompt(promptText, frames, pascal);

  if (flags.dryRun) {
    console.log("── SYSTEM PROMPT ──");
    console.log(system);
    console.log("\n── USER PROMPT ──");
    console.log(user);
    console.log("\n── WOULD WRITE TO ──");
    console.log(outPath);
    console.log(`\n(model=${flags.model ?? "sonnet"}, frames=${frames}, physics=${physics})`);
    return;
  }

  // Fail fast on missing API key before we print "calling Claude…"
  await loadEnv();

  console.log(`Calling Claude (${flags.model ?? "sonnet"}) to design "${promptText}"…`);
  const response = await callClaude({
    system,
    prompt: user,
    model: flags.model,
    maxTokens: 4096,
  });

  const code = extractCode(response, "ts");
  const expectedExport = physics ? "export function spawn" : "export function create";
  if (!code || !code.includes(expectedExport)) {
    console.error("Claude response did not contain a valid factory. Raw response:");
    console.error(response);
    process.exit(1);
  }

  const result = await writeFileSafe({ path: outPath, content: code + "\n", force: flags.force });
  if (!result.written) {
    console.error(`Refused to write: ${result.reason}`);
    process.exit(1);
  }

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
  if (physics) {
    console.log(`  import { spawn${pascal} } from './entities/${slug}'`);
    console.log(`  spawn${pascal}(engine, 100, 100)`);
  } else {
    console.log(`  import { create${pascal} } from './entities/${slug}'`);
    console.log(`  engine.spawn(create${pascal}(100, 100))`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
