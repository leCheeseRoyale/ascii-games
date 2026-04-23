/**
 * Utilities for auto-wiring generated files into game/index.ts.
 */

const GAME_INDEX = "game/index.ts";

/**
 * Add an import + engine.registerScene() call to game/index.ts.
 * Returns true if wired successfully, false if index doesn't exist or already contains the import.
 */
export async function wireScene(kebab: string, camel: string): Promise<boolean> {
  const file = Bun.file(GAME_INDEX);
  if (!(await file.exists())) return false;

  let src = await file.text();
  const importLine = `import { ${camel}Scene } from './scenes/${kebab}'`;
  if (src.includes(importLine)) return false;

  // Insert import after the last existing import statement.
  const importInsertIdx = findLastImportEnd(src);
  src = `${src.slice(0, importInsertIdx)}\n${importLine}${src.slice(importInsertIdx)}`;

  // Insert engine.registerScene() before the return statement in setupGame.
  const setupIdx = src.indexOf("setupGame");
  const returnIdx = setupIdx !== -1 ? src.indexOf("return ", setupIdx) : -1;
  if (returnIdx !== -1) {
    const lineStart = src.lastIndexOf("\n", returnIdx) + 1;
    const indent = src.slice(lineStart, returnIdx).match(/^\s*/)?.[0] ?? "  ";
    const registerCall = `${indent}engine.registerScene(${camel}Scene);\n`;
    src = `${src.slice(0, lineStart)}${registerCall}${src.slice(lineStart)}`;
  }

  await Bun.write(GAME_INDEX, src);
  return true;
}

/**
 * Replace game/index.ts to re-export setupGame from a generated ai:game module.
 * Returns true if wired successfully.
 */
export async function wireEntryPoint(slug: string): Promise<boolean> {
  const file = Bun.file(GAME_INDEX);
  if (!(await file.exists())) return false;

  const newIndex = `import type { Engine } from "@engine";\nimport { setupGame as _setup } from "./${slug}";\n\nexport function setupGame(engine: Engine) {\n  return _setup(engine);\n}\n`;
  await Bun.write(GAME_INDEX, newIndex);
  return true;
}

/** Find the byte offset just after the last top-level import statement. */
function findLastImportEnd(src: string): number {
  let lastEnd = 0;
  const re = /^import\s.+$/gm;
  let m: RegExpExecArray | null = re.exec(src);
  while (m !== null) {
    lastEnd = m.index + m[0].length;
    m = re.exec(src);
  }
  return lastEnd;
}
