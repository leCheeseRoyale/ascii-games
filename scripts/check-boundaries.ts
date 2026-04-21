#!/usr/bin/env bun
/**
 * check-boundaries.ts — Enforces import boundaries between engine/, game/, ui/, shared/.
 *
 * Rules:
 *   engine/  → may import @shared. NEVER @game or @ui.
 *   game/    → may import @engine, @shared, @ui/store ONLY. NEVER @ui/* (except store) or React.
 *   games/   → same as game/ (templates are game code).
 *   ui/      → may import @engine (types only), @shared. NEVER @game.
 *   shared/  → may NOT import @engine, @game, @ui. Zero dependencies on other layers.
 *
 * Exit 1 on violations, 0 on clean.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

// ── Config ──────────────────────────────────────────────────────

interface Rule {
  /** Directory this rule applies to (relative to repo root). */
  dir: string;
  /** Allowed import prefixes. Checked as string prefix match. Entries ending with a non-slash/non-alnum char are treated as exact matches. */
  allowed: string[];
  /** Explicitly denied import prefixes (override allowed). */
  denied: string[];
}

const RULES: Rule[] = [
  {
    dir: "engine",
    allowed: ["@shared", "@engine"],
    denied: ["@game", "@ui"],
  },
  {
    dir: "game",
    allowed: ["@engine", "@shared", "@ui/store"],
    denied: ["@ui/"],
  },
  {
    dir: "games",
    allowed: ["@engine", "@shared", "@ui/store"],
    denied: ["@ui/"],
  },
  {
    dir: "ui",
    // @game/index is the ONE sanctioned bridge — setupGame entry point only.
    allowed: ["@engine", "@shared", "@ui", "@game/index"],
    denied: ["@game/"],
  },
  {
    dir: "shared",
    allowed: [],
    denied: ["@engine", "@game", "@ui"],
  },
];

// Directories to skip entirely.
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "__bench__",
  "packages",
  "scripts",
  "plugins",
  "plans",
  "wiki",
]);

// ── Helpers ─────────────────────────────────────────────────────

const ROOT = import.meta.dir.replace(/[\\/]scripts$/, "");

interface Violation {
  file: string;
  line: number;
  importPath: string;
  rule: string;
}

async function* walkTsFiles(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      yield full;
    }
  }
}

function matchRule(filePath: string): Rule | null {
  const rel = relative(ROOT, filePath).replace(/\\/g, "/");
  for (const rule of RULES) {
    if (rel.startsWith(rule.dir + "/")) return rule;
  }
  return null;
}

const IMPORT_RE = /(?:import\s+.*?\s+from|import)\s+['"]([^'"]+)['"]/g;

async function checkFile(filePath: string): Promise<Violation[]> {
  const rule = matchRule(filePath);
  if (!rule) return [];

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Reset regex lastIndex for each line
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(line))) {
      const importPath = match[1];
      if (!importPath.startsWith("@")) continue;

      // Skip scoped npm packages — only check project path aliases (@shared, @engine, @game, @ui)
      if (!importPath.startsWith("@shared") && !importPath.startsWith("@engine") && !importPath.startsWith("@game") && !importPath.startsWith("@ui")) continue;

      // Check denied first (overrides allowed)
      // Entries ending with '/' are prefix matches; others are exact matches.
      const denied = rule.denied.find((d) => {
        if (d.endsWith("/")) return importPath.startsWith(d);
        return importPath === d || importPath.startsWith(d + "/");
      });
      if (denied) {
        // Special case: @ui/store is allowed from game/ even though @ui/ is denied
        if (denied === "@ui/" && importPath === "@ui/store" && rule.allowed.includes("@ui/store")) {
          continue;
        }
        // Special case: @game/index is allowed from ui/ even though @game/ is denied
        if (denied === "@game/" && importPath === "@game/index" && rule.allowed.includes("@game/index")) {
          continue;
        }
        violations.push({
          file: relative(ROOT, filePath).replace(/\\/g, "/"),
          line: i + 1,
          importPath,
          rule: `${rule.dir}/ must not import ${denied}*`,
        });
        continue;
      }

      // If rule has explicit allowed list, check it
      if (rule.allowed.length > 0) {
        const allowed = rule.allowed.some((a) => {
          // Exact match entries (like @game/index, @ui/store)
          if (!a.endsWith("/")) return importPath === a || importPath.startsWith(a + "/");
          return importPath.startsWith(a);
        });
        if (!allowed) {
          violations.push({
            file: relative(ROOT, filePath).replace(/\\/g, "/"),
            line: i + 1,
            importPath,
            rule: `${rule.dir}/ may only import ${rule.allowed.join(", ")}`,
          });
        }
      }
    }
  }

  return violations;
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const allViolations: Violation[] = [];

  // Check each ruled directory
  for (const rule of RULES) {
    const dirPath = join(ROOT, rule.dir);
    for await (const filePath of walkTsFiles(dirPath)) {
      const violations = await checkFile(filePath);
      allViolations.push(...violations);
    }
  }

  if (allViolations.length === 0) {
    console.log("✓ All import boundaries respected.");
    process.exit(0);
  }

  console.error(`✗ Found ${allViolations.length} boundary violation(s):\n`);

  // Group by rule
  const byRule = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const list = byRule.get(v.rule) ?? [];
    list.push(v);
    byRule.set(v.rule, list);
  }

  for (const [rule, violations] of byRule) {
    console.error(`  ${rule}`);
    for (const v of violations) {
      console.error(`    ${v.file}:${v.line} — import '${v.importPath}'`);
    }
    console.error();
  }

  process.exit(1);
}

main();
