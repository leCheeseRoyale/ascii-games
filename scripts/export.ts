#!/usr/bin/env bun
/**
 * Export the game as a single, self-contained HTML file.
 * Usage: bun run export
 *
 * Runs `bun run build`, then inlines the JS and CSS into one HTML file.
 */
import { readdir } from "node:fs/promises";

console.log("\n📦 Building for production...\n");

const buildResult = Bun.spawnSync(["bun", "run", "build"], {
  stdio: ["inherit", "inherit", "inherit"],
});
if (buildResult.exitCode !== 0) {
  console.error("Build failed!");
  process.exit(1);
}

// Find the built JS file
const distFiles = await readdir("dist/assets");
const jsFile = distFiles.find((f) => f.endsWith(".js"));

if (!jsFile) {
  console.error("No JS file found in dist/assets/");
  process.exit(1);
}

const js = await Bun.file(`dist/assets/${jsFile}`).text();
const cssFile = distFiles.find((f) => f.endsWith(".css"));
const css = cssFile ? await Bun.file(`dist/assets/${cssFile}`).text() : "";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ASCII Game</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: hidden; background: #0a0a0a; }
${css}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>`;

const outPath = "dist/game.html";
await Bun.write(outPath, html);
const size = (html.length / 1024).toFixed(1);
console.log(`\n✓ Exported to ${outPath} (${size} KB)`);
console.log("  Open this file in any browser to play!\n");
