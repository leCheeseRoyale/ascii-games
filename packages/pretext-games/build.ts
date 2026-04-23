#!/usr/bin/env bun
/**
 * Build the pretext-games package using Bun's native bundler + tsc for declarations.
 */
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const outdir = resolve(import.meta.dir, "dist");

// Clean
rmSync(outdir, { recursive: true, force: true });

// JS bundles (Bun's native bundler)
const results = await Promise.all([
  Bun.build({
    entrypoints: [resolve(root, "engine/index.ts")],
    outdir,
    target: "browser",
    format: "esm",
    sourcemap: "external",
    external: ["react", "react-dom", "@chenglou/pretext", "miniplex", "mitt", "zustand", "zod", "simplex-noise", "zzfx", "@zzfx-studio/zzfxm"],
    naming: "[name].js",
  }),
  Bun.build({
    entrypoints: [resolve(root, "ui/store.ts")],
    outdir,
    target: "browser",
    format: "esm",
    sourcemap: "external",
    external: ["react", "react-dom", "zustand"],
    naming: "[name].js",
  }),
]);

for (const result of results) {
  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

const totalSize = results.reduce((sum, r) => sum + r.outputs.reduce((s, o) => s + o.size, 0), 0);
console.log(`JS bundles: ${(totalSize / 1024).toFixed(1)} KB`);

// Type declarations (tsc emits into dist/engine/..., dist/shared/..., dist/ui/...)
console.log("Generating declarations...");
const tsc = Bun.spawnSync(
  ["bunx", "tsc", "--project", resolve(import.meta.dir, "tsconfig.json"), "--emitDeclarationOnly"],
  { stdout: "inherit", stderr: "inherit" },
);

if (tsc.exitCode !== 0) {
  console.error("Declaration generation failed");
  process.exit(1);
}

// Rewrite path aliases in all .d.ts files (@shared/... → ./shared/..., etc.)
const { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } = await import("node:fs");
const { join: pathJoin, relative: pathRelative, dirname } = await import("node:path");

function rewriteDtsAliases(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = pathJoin(dir, entry.name);
    if (entry.isDirectory()) { rewriteDtsAliases(full); continue; }
    if (!entry.name.endsWith(".d.ts")) continue;
    let content = readFileSync(full, "utf8");
    const rel = pathRelative(dirname(full), outdir);
    const prefix = rel === "" ? "." : rel;
    content = content.replace(/from "@shared\//g, `from "${prefix}/shared/`);
    content = content.replace(/from "@shared"/g, `from "${prefix}/shared/index"`);
    content = content.replace(/from "@engine\//g, `from "${prefix}/engine/`);
    content = content.replace(/from "@engine"/g, `from "${prefix}/engine/index"`);
    content = content.replace(/import\("@shared\//g, `import("${prefix}/shared/`);
    content = content.replace(/import\("@shared"\)/g, `import("${prefix}/shared/index")`);
    content = content.replace(/import\("@engine\//g, `import("${prefix}/engine/`);
    content = content.replace(/import\("@engine"\)/g, `import("${prefix}/engine/index")`);
    writeFileSync(full, content);
  }
}
rewriteDtsAliases(outdir);

// Copy entry-point declarations to dist root and fix relative paths
const engineDts = resolve(outdir, "engine/index.d.ts");
const storeDts = resolve(outdir, "ui/store.d.ts");

if (existsSync(engineDts)) {
  let content = readFileSync(engineDts, "utf8");
  // Paths were rewritten relative to dist/engine/ — adjust for dist/
  content = content.replace(/from "\.\.\//g, 'from "./');
  content = content.replace(/import\("\.\.\//g, 'import("./');
  writeFileSync(resolve(outdir, "index.d.ts"), content);
}
if (existsSync(storeDts)) {
  let content = readFileSync(storeDts, "utf8");
  content = content.replace(/from "\.\.\//g, 'from "./');
  content = content.replace(/import\("\.\.\//g, 'import("./');
  writeFileSync(resolve(outdir, "store.d.ts"), content);
}

console.log("Build complete");
