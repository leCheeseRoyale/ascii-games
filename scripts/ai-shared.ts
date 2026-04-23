#!/usr/bin/env bun
/**
 * Shared utilities for the AI-assisted scaffolding scripts
 * (ai-sprite, ai-mechanic, ai-juice).
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Arg parsing ──────────────────────────────────────────────────

export type ModelAlias = "opus" | "sonnet" | "haiku";

export interface ParsedFlags {
  model?: ModelAlias;
  out?: string;
  force?: boolean;
  dryRun?: boolean;
  verify?: boolean;
  smoke?: boolean;
  frames?: number;
  physics?: boolean;
}

export interface ParsedArgs {
  positional: string[];
  flags: ParsedFlags;
}

const MODEL_ALIASES: Record<string, ModelAlias> = {
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};

/** Parse argv into positional args and known flags. `argv` should be `process.argv.slice(2)`. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: ParsedFlags = {};

  for (const arg of argv) {
    if (arg === "--force") {
      flags.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (arg === "--verify") {
      flags.verify = true;
      continue;
    }
    if (arg === "--physics") {
      flags.physics = true;
      continue;
    }
    if (arg === "--smoke") {
      flags.smoke = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("HELP");
    }
    if (arg.startsWith("--model=")) {
      const val = arg.slice("--model=".length);
      const alias = MODEL_ALIASES[val];
      if (!alias) {
        throw new Error(`Unknown --model value: ${val}. Use opus|sonnet|haiku.`);
      }
      flags.model = alias;
      continue;
    }
    if (arg.startsWith("--out=")) {
      flags.out = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("--frames=")) {
      const n = Number(arg.slice("--frames=".length));
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--frames must be a positive integer, got: ${arg}`);
      }
      flags.frames = Math.floor(n);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }

  return { positional, flags };
}

// ── Env loading ──────────────────────────────────────────────────

export interface LoadedEnv {
  ANTHROPIC_API_KEY: string;
}

/**
 * Read `.env.local` if present (simple KEY=VALUE parsing), fall back to process.env.
 * Throws a friendly error if `ANTHROPIC_API_KEY` cannot be found.
 */
export async function loadEnv(): Promise<LoadedEnv> {
  const fromFile: Record<string, string> = {};
  const envFile = Bun.file(".env.local");
  if (await envFile.exists()) {
    const text = await envFile.text();
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      fromFile[key] = val;
    }
  }

  const apiKey = fromFile.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY.\n" +
        "  Get a key at https://console.anthropic.com/settings/keys\n" +
        "  Then add to .env.local:\n" +
        "    ANTHROPIC_API_KEY=sk-ant-...\n" +
        "  Or export it in your shell.",
    );
  }

  return { ANTHROPIC_API_KEY: apiKey };
}

// ── Skill loading ────────────────────────────────────────────────

/** Read a skill file from `plugins/ascii-games-dev/skills/<name>/SKILL.md`. */
export async function loadSkill(name: string): Promise<string> {
  // Sanitize skill name to prevent path traversal
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeName) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  const path = `plugins/ascii-games-dev/skills/${safeName}/SKILL.md`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Skill file not found: ${path}`);
  }
  return await file.text();
}

// ── Claude API ───────────────────────────────────────────────────

/** Concrete model ids used by the three scripts. Kept centrally so we can bump versions together. */
export const MODEL_IDS: Record<ModelAlias, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface CallClaudeOptions {
  system: string;
  prompt: string;
  model?: ModelAlias;
  maxTokens?: number;
  apiKey?: string;
}

/** Call the Anthropic Messages API and return the concatenated text content. */
export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  const model = opts.model ?? "sonnet";
  const maxTokens = opts.maxTokens ?? 4096;

  const apiKey = opts.apiKey ?? (await loadEnv()).ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL_IDS[model],
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Claude API call failed: ${msg}`);
  }

  const textParts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    }
  }
  if (textParts.length === 0) {
    throw new Error("Claude returned no text content.");
  }
  return textParts.join("\n");
}

// ── Code extraction ──────────────────────────────────────────────

/**
 * Extract a fenced code block from Claude's response.
 * Prefers ```<lang> ... ``` fences; falls back to any triple-backtick block;
 * falls back to the whole text. Whitespace is trimmed.
 */
export function extractCode(text: string, lang = "ts"): string {
  const langRe = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "i");
  const langMatch = text.match(langRe);
  if (langMatch) return langMatch[1].trim();

  const anyMatch = text.match(/```[a-zA-Z0-9]*\s*\n([\s\S]*?)```/);
  if (anyMatch) return anyMatch[1].trim();

  return text.trim();
}

// ── File writing ─────────────────────────────────────────────────

export interface WriteFileSafeArgs {
  path: string;
  content: string;
  force?: boolean;
}

export interface WriteFileSafeResult {
  written: boolean;
  reason?: string;
}

/**
 * Write a file, but refuse to overwrite an existing file unless `force` is set.
 * Bun has no built-in synchronous confirmation prompt, so we don't prompt — we refuse
 * clearly and direct the user to re-run with --force.
 */
export async function writeFileSafe(args: WriteFileSafeArgs): Promise<WriteFileSafeResult> {
  const { path, content, force } = args;
  // Prevent path traversal outside the project
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("..") || normalized.includes("/../")) {
    return {
      written: false,
      reason: `Path traversal blocked: ${path}. Paths must stay within the project.`,
    };
  }
  const file = Bun.file(path);
  if ((await file.exists()) && !force) {
    return {
      written: false,
      reason: `File exists: ${path}. Re-run with --force to overwrite.`,
    };
  }
  await Bun.write(path, content);
  return { written: true };
}

// ── Slug helpers ─────────────────────────────────────────────────

/** Convert a free-text prompt into a kebab-case filename slug. */
export function slugify(prompt: string): string {
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "untitled";
}

/** Convert a kebab-case name into PascalCase. */
export function pascalCase(name: string): string {
  return name.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
}
