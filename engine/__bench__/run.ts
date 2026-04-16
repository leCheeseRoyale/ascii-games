/**
 * Runs every .bench.ts file in this directory in sequence. Invoked by `bun run bench`.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = (await readdir(here)).filter((f) => f.endsWith(".bench.ts")).sort();

console.log(`running ${files.length} benchmarks from ${here}\n`);
const t0 = performance.now();

for (const f of files) {
  console.log(`── ${f} ─────────────────────────────`);
  await import(join(here, f));
  console.log("");
}

console.log(`total: ${((performance.now() - t0) / 1000).toFixed(2)}s`);
