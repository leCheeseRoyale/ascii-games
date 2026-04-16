#!/usr/bin/env bun
/**
 * AI-assisted ASCII sprite generator.
 *
 * Usage:
 *   bun run ai:sprite "<prompt>" [--out=path] [--model=opus|sonnet|haiku]
 *                                [--frames=N] [--force] [--dry-run]
 *
 * Examples:
 *   bun run ai:sprite "space invader" --frames=2
 *   bun run ai:sprite "small glowing potion bottle" --model=haiku
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
      "Usage: bun run ai:sprite \"<prompt>\" [flags]",
      "",
      "Generates an ASCII sprite entity factory using Claude.",
      "",
      "Flags:",
      "  --out=<path>           Override output path (default: game/entities/<slug>.ts)",
      "  --model=opus|sonnet|haiku   Default: sonnet",
      "  --frames=N             Number of animation frames (default 1 = static)",
      "  --force                Overwrite existing file",
      "  --dry-run              Print the prompts that would be sent; don't call API",
      "",
      "Examples:",
      '  bun run ai:sprite "space invader" --frames=2',
      '  bun run ai:sprite "small glowing potion bottle" --model=haiku',
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
    console.error(err instanceof Error ? err.message : String(err));
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
  const slug = slugify(promptText);
  const pascal = pascalCase(slug);
  const outPath = flags.out ?? `game/entities/${slug}.ts`;

  const skillMaster = await loadSkill("ascii-games-dev");
  const system = buildSystemPrompt(skillMaster);
  const user = buildUserPrompt(promptText, frames, pascal);

  if (flags.dryRun) {
    console.log("── SYSTEM PROMPT ──");
    console.log(system);
    console.log("\n── USER PROMPT ──");
    console.log(user);
    console.log("\n── WOULD WRITE TO ──");
    console.log(outPath);
    console.log(`\n(model=${flags.model ?? "sonnet"}, frames=${frames})`);
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
  if (!code || !code.includes("export function create")) {
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
  console.log("\nNext steps:");
  console.log(`  import { create${pascal} } from './entities/${slug}'`);
  console.log(`  engine.spawn(create${pascal}(100, 100))`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
