#!/usr/bin/env bun
/**
 * AI-assisted full game generator.
 *
 * Generates a complete `defineGame<TState>({...})` module from a natural-language pitch.
 *
 * Usage:
 *   bun run ai:game "<pitch>" [--out=path] [--model=opus|sonnet|haiku]
 *                             [--force] [--dry-run]
 *
 * Examples:
 *   bun run ai:game "2-player strategy where you place walls to maze a runner"
 *   bun run ai:game "hotseat battle: place cards on a 3x3 grid, highest sum in a row wins"
 */

import {
  callClaude,
  extractCode,
  loadEnv,
  loadSkill,
  parseArgs,
  slugify,
  writeFileSafe,
} from "./ai-shared";
import { wireEntryPoint } from "./wire-utils";

function printHelp(): void {
  console.error(
    [
      'Usage: bun run ai:game "<pitch>" [flags]',
      "",
      "Generates a complete defineGame<TState>({...}) module from a natural-language pitch.",
      "",
      "Flags:",
      "  --out=<path>           Override output path (default: game/<slug>.ts)",
      "  --model=opus|sonnet|haiku   Default: sonnet",
      "  --force                Overwrite existing file",
      "  --dry-run              Print the prompts that would be sent; don't call API",
      "  --verify               Run bun run check after generation",
      "",
      "Examples:",
      '  bun run ai:game "2-player strategy where you place walls to maze a runner"',
      '  bun run ai:game "hotseat battle: place cards on a 3x3 grid, highest sum in a row wins"',
    ].join("\n"),
  );
}

const DEFINE_GAME_REFERENCE = `// defineGame API (from '@engine')
import { defineGame, type Engine, type MoveInputCtx } from '@engine'

// Shape:
//   defineGame<State>({
//     name: string,
//     players?: { min, max, default },
//     setup: (ctx: { numPlayers, random, engine }) => State,
//     turns?: { order?: readonly Player[], autoEnd?: boolean },   // omit for single-player real-time
//     phases?: { order: string[], [name]: { onEnter?, onExit?, endIf?, moves? } },
//     moves: { moveName(ctx, ...args) { mutate ctx.state; return 'invalid' to reject } },
//     endIf?: (ctx) => { winner?, draw? } | null | undefined,
//     render?: (ctx) => void,  // called each frame — draw with engine.ui.*, read input
//     startScene?: string,
//   })

// ctx shape inside every callback:
//   { engine, state, phase, turn, currentPlayer, playerIndex, numPlayers,
//     moves, random, log, result, endTurn, endPhase, goToPhase }
// - Mutate ctx.state directly inside moves.
// - ctx.moves.<name>(...args) dispatches another move (bound).
// - Return 'invalid' from a move to reject it; state + turn unchanged.

// Rendering primitives (engine.ui.*):
//   engine.ui.panel(x, y, w, h, { border, bg, borderColor })
//   engine.ui.text(x, y, str, { font, color, glow?, align? })
//   engine.ui.bar(x, y, w, h, fillPct, { color, bg? })
// Input (read inside render):
//   engine.mouse.x / engine.mouse.y / engine.mouse.justDown
//   engine.keyboard.pressed('KeyR'), engine.keyboard.held('Space')

// setupGame shape (required to wire the game as the starting scene):
//   export function setupGame(engine: Engine) {
//     return {
//       startScene: engine.runGame(<defineGameValue>),
//       screens: { menu: Empty, playing: Empty, gameOver: Empty },  // canvas-only
//       hud: [],
//     }
//   }
//   const Empty = () => null   // suppresses the default React screens`;

const MINIMAL_EXAMPLE = `// Canonical minimal example — tic-tac-toe (~80 lines).
// Single file: types, defineGame value, render helpers, setupGame export.
import { defineGame, type Engine, type MoveInputCtx } from '@engine'
const Empty = () => null
type Mark = 'X' | 'O' | null
type Player = 'X' | 'O'
type State = { board: Mark[] }
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
function checkWinner(b: Mark[]): Mark {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]
  return null
}
export const ticTacToe = defineGame<State, Player>({
  name: 'tic-tac-toe',
  players: { min: 2, max: 2, default: 2 },
  setup: (): State => ({ board: Array(9).fill(null) }),
  turns: { order: ['X', 'O'] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return 'invalid'
      ctx.state.board[idx] = ctx.currentPlayer
    },
    reset(ctx) { ctx.state.board = Array(9).fill(null) },
  },
  endIf(ctx) {
    const w = checkWinner(ctx.state.board)
    if (w) return { winner: w }
    if (ctx.state.board.every((c) => c !== null)) return { draw: true }
  },
  render(ctx) {
    // ...draw board with engine.ui.panel/text, read engine.mouse.justDown to dispatch ctx.moves.place(idx)
    handleInput(ctx)
  },
})
function handleInput(ctx: MoveInputCtx<State, Player>) {
  if (ctx.engine.keyboard.pressed('KeyR')) ctx.moves.reset()
  if (!ctx.engine.mouse.justDown || ctx.result) return
  // compute idx from mouse, then ctx.moves.place(idx)
}
export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(ticTacToe),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  }
}`;

const OUTPUT_RULES = `Output rules — STRICT:
1. Respond with ONE fenced \`\`\`ts ... \`\`\` code block and NOTHING else (no prose before or after).
2. The file must be a complete, compilable TypeScript module.
3. Imports: ONLY from '@engine'. Do NOT import from other local paths or npm packages.
   Required import line: \`import { defineGame, type Engine } from '@engine'\` (add \`type MoveInputCtx\` if you use it).
4. Declare a \`type State = { ... }\` for the game state shape.
5. Build the game with \`defineGame<State>({ ... })\` and export it as a named const (e.g. \`export const <camelName> = defineGame<State>({...})\`).
6. The defineGame object MUST include:
   - \`name\`: string
   - \`setup\`: returning the initial State
   - \`moves\`: object with at least one move; each move has properly typed args (\`(ctx, x: number)\` etc.) and mutates \`ctx.state\` directly
   - \`turns\`: configured with \`order\` if 2+ players (hotseat/turn-based)
   - \`endIf\`: returns \`{ winner }\` / \`{ draw: true }\` / undefined
   - \`render(ctx)\`: uses \`engine.ui.panel\` / \`engine.ui.text\` to draw minimum working visuals + reads \`engine.mouse.justDown\` / \`engine.keyboard.pressed\` to dispatch moves
7. Export a \`setupGame(engine: Engine)\` that returns \`{ startScene: engine.runGame(<defineGameValue>), screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: [] }\`. Define \`const Empty = () => null\` once at the top.
8. TypeScript strict. No \`any\`. Type every parameter.
9. No external deps beyond '@engine'. No React. No side effects at module scope other than the defineGame call + const declarations.
10. Keep the file self-contained and under ~200 lines. Prefer a single file over splitting into modules.`;

function buildSystemPrompt(skillMaster: string, skillNewGame: string): string {
  return [
    "You are an expert ascii-games engine contributor. You have read the master SKILL.md and the new-game SKILL.md below.",
    "Your job: given a natural-language game pitch, output ONE TypeScript file implementing the game via `defineGame<TState>({...})`.",
    "",
    "Reference:",
    DEFINE_GAME_REFERENCE,
    "",
    "Minimal example (study the shape):",
    MINIMAL_EXAMPLE,
    "",
    OUTPUT_RULES,
    "",
    "--- master SKILL.md ---",
    skillMaster,
    "",
    "--- new-game SKILL.md ---",
    skillNewGame,
  ].join("\n");
}

function buildUserPrompt(pitch: string, slug: string, camel: string): string {
  return [
    `Game pitch: ${pitch}`,
    `Suggested defineGame variable name: ${camel}`,
    `Target file path: game/${slug}.ts`,
    "",
    "Design the minimal playable version of this pitch as a single defineGame module.",
    "Pick sensible defaults (grid size, player count, win condition) from the pitch.",
    "If the pitch implies 2+ players, configure turns.order (e.g. ['A','B']). If single-player, omit turns.",
    "Keep visuals minimal but clear: a panel, text for the state, clickable/keyboard move targets.",
    "",
    "Return one complete .ts file in a ```ts fenced block.",
  ].join("\n");
}

/** Turn a kebab-case slug into camelCase (first char lowercase). */
function camelCase(slug: string): string {
  return slug.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
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

  const pitch = parsed.positional.join(" ").trim();
  if (!pitch) {
    printHelp();
    process.exit(1);
  }

  const { flags } = parsed;
  const slug = slugify(pitch);
  const camel = camelCase(slug);
  const outPath = flags.out ?? `game/${slug}.ts`;

  const [skillMaster, skillNewGame] = await Promise.all([
    loadSkill("ascii-games-dev"),
    loadSkill("new-game"),
  ]);
  const system = buildSystemPrompt(skillMaster, skillNewGame);
  const user = buildUserPrompt(pitch, slug, camel);

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

  console.log(`Calling Claude (${flags.model ?? "sonnet"}) to design "${pitch}"…`);
  const response = await callClaude({
    system,
    prompt: user,
    model: flags.model,
    maxTokens: 4000,
  });

  const code = extractCode(response, "ts");
  if (!code || !code.includes("defineGame") || !code.includes("setupGame")) {
    console.error(
      "Claude response did not contain both defineGame(...) and setupGame(...). Raw response:",
    );
    console.error(response);
    process.exit(1);
  }

  const result = await writeFileSafe({ path: outPath, content: code + "\n", force: flags.force });
  if (!result.written) {
    console.error(`Refused to write: ${result.reason}`);
    process.exit(1);
  }

  console.log(`Wrote ${outPath}`);

  // Auto-wire game/index.ts to re-export setupGame from the generated module.
  if (outPath.startsWith("game/") && outPath.endsWith(".ts")) {
    const moduleSlug = outPath.slice("game/".length, -".ts".length);
    if (await wireEntryPoint(moduleSlug)) {
      console.log("✓ Wired game/index.ts → re-exports setupGame from generated module");
    }
  }

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

  console.log("\nRun: bun dev");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
