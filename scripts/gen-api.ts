/**
 * Generate API reference from actual TypeScript declarations.
 * Reads the compiled .d.ts output to extract the real public API surface.
 *
 * Usage: bun run gen:api
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const TMP = join(ROOT, ".api-tmp");

// Step 1: Emit declarations to a temp dir
mkdirSync(TMP, { recursive: true });
try {
  execSync(
    `bunx tsc --declaration --emitDeclarationOnly --outDir "${TMP}" --noEmit false --project "${join(ROOT, "tsconfig.json")}"`,
    { cwd: ROOT, stdio: "pipe" },
  );
} catch {
  // tsc may warn but still emit — continue
}

// Step 2: Read the engine barrel declaration
const barrelPath = join(TMP, "engine", "index.d.ts");
let barrel: string;
try {
  barrel = readFileSync(barrelPath, "utf-8");
} catch {
  console.error(
    "Could not read generated declarations. Run `bun run check` first to ensure no type errors.",
  );
  process.exit(1);
}

// Step 3: Collect all .d.ts files for resolving re-exports
function readDts(relativePath: string): string {
  try {
    return readFileSync(join(TMP, relativePath), "utf-8");
  } catch {
    return "";
  }
}

// Step 4: Parse exports and build markdown
const lines = barrel.split("\n");
const sections: Map<string, string[]> = new Map();
let currentSection = "Uncategorized";

for (const line of lines) {
  const trimmed = line.trim();

  // Track section comments
  if (trimmed.startsWith("//")) {
    currentSection = trimmed
      .replace(/^\/\/\s*/, "")
      .replace(/\s*—.*/, "")
      .trim();
    continue;
  }

  // Skip empty lines
  if (!trimmed || trimmed === "*/") continue;

  // Collect export lines
  if (trimmed.startsWith("export")) {
    if (!sections.has(currentSection)) sections.set(currentSection, []);
    sections.get(currentSection)!.push(trimmed);
  }
}

// Step 5: Also extract key type definitions from shared/types.d.ts
const sharedTypes = readDts("shared/types.d.ts");

// Step 6: Build output
let output = "# Engine API Reference (Auto-Generated)\n\n";
output += "> Generated from actual TypeScript declarations. Do not edit manually.\n";
output += `> Last generated: ${new Date().toISOString().split("T")[0]}\n\n`;

for (const [section, exports] of sections) {
  output += `## ${section}\n\n`;
  output += "```ts\n";
  for (const exp of exports) {
    output += `${exp}\n`;
  }
  output += "```\n\n";
}

// Add component types
if (sharedTypes) {
  output += "## Component Types (from shared/types.ts)\n\n";
  output += "```ts\n";

  // Extract interfaces and types
  const typeLines = sharedTypes.split("\n");
  let inBlock = false;
  let braceDepth = 0;

  for (const line of typeLines) {
    const t = line.trim();
    if (
      t.startsWith("export interface") ||
      t.startsWith("export type") ||
      t.startsWith("export declare")
    ) {
      inBlock = true;
      braceDepth = 0;
    }

    if (inBlock) {
      output += `${line}\n`;
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (braceDepth <= 0 && (t.endsWith("}") || t.endsWith(";") || !t.includes("{"))) {
        inBlock = false;
        output += "\n";
      }
    }
  }

  output += "```\n";
}

// Write output
const outPath = join(ROOT, "docs", "API-generated.md");
mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(outPath, output);
console.log(`API reference written to docs/API-generated.md`);

// Cleanup
rmSync(TMP, { recursive: true, force: true });
