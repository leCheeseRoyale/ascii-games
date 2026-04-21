# Testing and Quality Assurance Guide

This is the quality assurance bible for the ASCII game engine project. It covers the complete verification workflow, test infrastructure, testing patterns, linting, boundary enforcement, dead-code detection, and benchmarking.

---

## Table of Contents

1. [The Verification Loop](#the-verification-loop)
2. [Test Infrastructure](#test-infrastructure)
3. [Testing Patterns](#testing-patterns)
4. [Writing New Tests](#writing-new-tests)
5. [Import Boundary Enforcement](#import-boundary-enforcement)
6. [Linting (Biome)](#linting-biome)
7. [Dead Code Detection (Knip)](#dead-code-detection-knip)
8. [Benchmarking](#benchmarking)
9. [CI/Quality Checklist](#ciquality-checklist)

---

## The Verification Loop

Before declaring any work done, run the full verification loop:

```bash
bun run check:all    # typecheck + boundary enforcement + lint
bun test             # full test suite (or targeted: bun test <path>)
```

### What Each Step Catches

| Command | Tool | Catches |
|---------|------|---------|
| `bun run check` | `tsc --noEmit` | Type errors, missing imports, interface mismatches, incorrect generic usage |
| `bun run check:bounds` | `scripts/check-boundaries.ts` | Cross-layer import violations (e.g., engine importing from game) |
| `bun run lint` | Biome | Unused imports, `==` instead of `===`, unused variables, style violations |
| `bun test` | bun:test | Logic errors, regressions, behavioral correctness |

The `check:all` script chains the first three sequentially:

```bash
bun run check && bun run check:bounds && bun run lint
```

### Targeted Tests vs Full Suite

- **Full suite** (`bun test`): Run before any PR or when changes span multiple subsystems. The suite has 1200+ tests across 63 files and completes in seconds.
- **Single file** (`bun test engine/__tests__/physics/collision.test.ts`): Run while iterating on a specific module.
- **Name filter** (`bun test -t "overlapping circles"`): Run a specific test by name substring.

### What IS and ISN'T Mechanically Verifiable

**Verifiable headlessly:**
- Type correctness (tsc)
- Logic and state transitions (bun:test)
- Import boundaries (check:bounds)
- Code style and lint rules (Biome)
- Performance regressions (benchmarks with threshold assertions)
- Dead code and unused exports (Knip)

**NOT verifiable headlessly:**
- Visual rendering correctness (canvas output, text appearance, particle effects)
- UI layout and responsiveness (React overlay, screen positioning)
- Audio playback
- Input feel (key responsiveness, gamepad deadzone tuning)

State this limitation explicitly instead of claiming success when changes touch render or UI code. The tests cover the *data* flowing into the renderer (styled text parsing, text layout measurement, camera transforms) but not the pixel-level output.

---

## Test Infrastructure

### Framework: bun:test

The project uses bun's built-in test runner. The API mirrors Jest/Vitest:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("ModuleName", () => {
  beforeEach(() => {
    // setup per test
  });

  test("does something specific", () => {
    expect(result).toBe(expected);
  });
});
```

Key `expect` matchers used throughout the codebase:
- `toBe(value)` -- strict equality
- `toEqual(value)` -- deep equality
- `toBeNull()`, `toBeUndefined()`, `toBeDefined()`
- `toBeGreaterThan(n)`, `toBeLessThan(n)`, `toBeGreaterThanOrEqual(n)`, `toBeLessThanOrEqual(n)`
- `toContain(item)` -- array/string contains
- `toHaveLength(n)` -- array/string length
- `toThrow()` -- function throws
- `toBeTypeOf("number")` -- typeof check
- `resolves` / `rejects` -- promise assertions

### Test File Organization

```
engine/__tests__/
  setup.ts              # Global preload (localStorage stub, AudioContext stub, window stub)
  helpers.ts            # Shared test helpers (mockEngine factory)
  behaviors/            # Achievement, loot, crafting, currency, dialog, inventory, etc.
  core/                 # defineGame, scene management, turn manager, multiplayer
  ecs/                  # Systems, priorities, lifetime, state machines, pools, tags
  input/                # Key bindings, gamepad, touch
  net/                  # Socket adapter, game server, room listing, determinism soak
  physics/              # Collision detection, spatial hash
  render/               # Text layout, styled text parsing, camera, transitions, viewport
  storage/              # Save/load, game state, save slots
  templates/            # Smoke tests for each game template (blank, asteroid-field, etc.)
  utils/                # Pathfinding, scheduler, grid, math, noise, color, dungeon, timer
```

Tests mirror the engine source structure: `engine/physics/collision.ts` is tested in `engine/__tests__/physics/collision.test.ts`.

### Global Test Setup (`setup.ts`)

Every test file is preloaded with `engine/__tests__/setup.ts`, which provides:

1. **localStorage stub** -- An in-memory `Map<string, string>` implementation of the `Storage` interface. Cleared via `beforeEach`.
2. **AudioContext stub** -- Prevents `zzfx` from crashing at import time. Audio playback is a no-op.
3. **window stub** -- Provides `addEventListener`, `removeEventListener`, `devicePixelRatio`, `innerWidth`, `innerHeight` so engine modules that attach listeners at import time (Keyboard, Gamepad) don't crash.

```typescript
// From setup.ts -- localStorage stub
const store = new Map<string, string>();
const localStorageStub: Storage = {
  getItem(key: string): string | null { return store.get(key) ?? null; },
  setItem(key: string, value: string): void { store.set(key, value); },
  removeItem(key: string): void { store.delete(key); },
  clear(): void { store.clear(); },
  get length(): number { return store.size; },
  key(index: number): string | null { return [...store.keys()][index] ?? null; },
};
globalThis.localStorage = localStorageStub;
```

### Shared Helpers (`helpers.ts`)

The `mockEngine` factory creates a lightweight engine stub for system tests:

```typescript
import { createWorld } from "../ecs/world";

export function mockEngine(opts?: { width?: number; height?: number }) {
  const world = createWorld();
  const destroyed: any[] = [];
  return {
    world,
    width: opts?.width ?? 800,
    height: opts?.height ?? 600,
    spawn(data: Record<string, any>) { return world.add(data as any); },
    destroy(entity: any) { world.remove(entity); destroyed.push(entity); },
    _destroyed: destroyed,
    turns: { active: false, currentPhase: null as string | null },
    systems: { clear(_engine: any) {} },
    debug: { showError(_msg: string, _dur?: number) {} },
  };
}
```

### Template Smoke Test Engine (`templates/_engine.ts`)

For template smoke tests, a more comprehensive `mockTemplateEngine` is used. It provides stubbed versions of every engine surface a game template might touch: keyboard, mouse, particles, UI, dialog, camera, timers, scene loading, tween, and the full system runner. This allows template tests to boot a real game, load a scene, and tick 60+ frames without a DOM.

---

## Testing Patterns

### Core Tests: Engine Lifecycle, Scene Management, defineGame

**Scene management** (`core/scene.test.ts`) tests the `SceneManager` lifecycle: registering scenes, loading them (calling `setup`), transitioning between scenes (calling `cleanup` on the old scene and clearing the world), and delegating `update` calls:

```typescript
test("calls cleanup on previous scene", async () => {
  let cleanedUp = false;
  sm.register(defineScene({
    name: "old",
    setup: () => {},
    cleanup: () => { cleanedUp = true; },
  }));
  sm.register(defineScene({ name: "new", setup: () => {} }));
  await sm.load("old", engine as any);
  expect(cleanedUp).toBe(false);
  await sm.load("new", engine as any);
  expect(cleanedUp).toBe(true);
});
```

**defineGame** (`core/define-game.test.ts`) tests the declarative game API through `GameRuntime`. This is the most comprehensive core test file. It creates a `stubEngine` with real `SystemRunner`, `SceneManager`, and `TurnManager`, then tests:
- Setup producing initial state
- Moves mutating state and advancing turns
- Invalid move rejection (state and turn untouched)
- Phase transitions via `endIf`
- Game-over detection halting subsequent moves
- Turn rotation with string player IDs
- Seeded RNG determinism across runtimes
- Phase move whitelisting
- `autoEnd: false` for multi-action turns
- Type narrowing of `ctx.currentPlayer` (compile-time assertion)

```typescript
test("moves mutate state and advance the turn", () => {
  const def = defineGame<{ plays: number }>({
    name: "mutator",
    setup: () => ({ plays: 0 }),
    turns: { order: ["A", "B"] },
    moves: {
      play(ctx) { ctx.state.plays++; },
    },
  });
  const engine = stubEngine();
  const runtime = new GameRuntime(def, engine);
  runtime.start();
  expect(runtime.currentPlayer).toBe("A");
  runtime.dispatch("play", []);
  expect(runtime.gameState.plays).toBe(1);
  expect(runtime.currentPlayer).toBe("B");
});
```

### ECS Tests: System Execution, Priorities, Queries

**SystemRunner** (`ecs/systems.test.ts`) tests add/remove lifecycle, update delegation, phase gating, and clear:

```typescript
test("skips system with wrong phase when turns are active", () => {
  engine.turns.active = true;
  engine.turns.currentPhase = "play";
  let ran = false;
  runner.add(
    defineSystem({
      name: "attack-only",
      phase: "attack",
      update: () => { ran = true; },
    }),
    engine as any,
  );
  runner.update(engine as any, 0.016);
  expect(ran).toBe(false);
});
```

**System priority ordering** (`ecs/system-priority.test.ts`) verifies systems run in ascending priority order, with stable ordering for equal priorities, and that custom systems (default priority 0) run before built-in systems:

```typescript
test("priority between built-in slots interleaves correctly", () => {
  const order: string[] = [];
  runner.add(defineSystem({ name: "_physics", priority: SystemPriority.physics, update: () => order.push("physics") }), engine as any);
  runner.add(defineSystem({ name: "_tween", priority: SystemPriority.tween, update: () => order.push("tween") }), engine as any);
  runner.add(defineSystem({ name: "collision", priority: SystemPriority.physics + 1, update: () => order.push("collision") }), engine as any);
  runner.update(engine as any, 0.016);
  expect(order).toEqual(["physics", "collision", "tween"]);
});
```

### Behavior Tests: Achievements, Loot Tables, Inventory

**Achievement tracker** (`behaviors/achievements.test.ts`) -- one of the most thorough test files (593 lines). Tests register/registerAll, progress accumulation, event recording, prerequisite gating, unlock events, hidden achievements, custom condition predicates, aggregate counts/points, event listeners with unsubscribe, and serialize/deserialize round-trips through localStorage:

```typescript
test("accumulates progress but does not unlock until prereqs are met", () => {
  const at = new AchievementTracker();
  at.register(firstBlood);
  at.register(slayer);
  at.progress("slayer", 100);
  expect(at.getState("slayer")?.progress).toBe(100);
  expect(at.getState("slayer")?.unlocked).toBe(false);
  at.progress("first-blood", 1);
  expect(at.getState("first-blood")?.unlocked).toBe(true);
  at.progress("slayer", 1);
  expect(at.getState("slayer")?.unlocked).toBe(true);
});
```

**Loot tables** (`behaviors/loot.test.ts`) -- tests seeded RNG, weighted selection with statistical verification, count ranges, aggregation, conditions with flags, chance rolls, guaranteed drops, sampling without replacement, nested/recursive tables, and a realistic integration scenario:

```typescript
test("higher weight items are picked more often", () => {
  const table: LootTable<string> = {
    rolls: 1,
    entries: [
      { item: "common", weight: 90 },
      { item: "rare", weight: 10 },
    ],
  };
  let commonCount = 0;
  let rareCount = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const drops = rollLoot(table, { seed });
    if (drops[0]?.item === "common") commonCount++;
    if (drops[0]?.item === "rare") rareCount++;
  }
  expect(commonCount).toBeGreaterThan(rareCount);
  expect(commonCount).toBeGreaterThan(1500);
  expect(rareCount).toBeGreaterThan(50);
});
```

### Render Tests: Text Layout, Styled Text Parsing

**Text layout** (`render/text-layout.test.ts`) tests `parseStyledText` (parsing `[#color]`, `[b]`, `[dim]`, `[bg:]` tags into styled segments), `stripTags`, the char-count invariant between parsed segments and stripped text, `insertSoftHyphens`, and cache clearing:

```typescript
test("char mapping resolves to the correct segment for each index", () => {
  const raw = "[#0f0]A[/][b]B[/b][#f00]C[/]";
  const segs = parseStyledText(raw, BASE_FONT, BASE_COLOR);
  const plain = stripTags(raw);
  expect(plain).toBe("ABC");
  const charStyles = new Array(plain.length);
  let i = 0;
  for (const seg of segs) {
    for (let ci = 0; ci < seg.text.length && i < plain.length; ci++) {
      charStyles[i++] = seg;
    }
  }
  expect(charStyles[0].color).toBe("#0f0");
  expect(charStyles[1].font).toContain("bold");
  expect(charStyles[2].color).toBe("#f00");
});
```

### Physics Tests: Collision Detection

**Collision** (`physics/collision.test.ts`) tests `overlaps` for circle-circle, rect-rect, and circle-rect pairs, including edge cases (barely touching, identical shapes, order independence), and `overlapAll` for batch queries:

```typescript
function circle(x: number, y: number, radius: number): Collidable {
  return {
    position: { x, y },
    collider: { type: "circle", width: radius * 2, height: radius * 2 },
  };
}

test("barely touching circles do not overlap (strict less-than)", () => {
  expect(overlaps(circle(0, 0, 10), circle(20, 0, 10))).toBe(false);
});
```

### Net Tests: Socket Adapter, Server Rooms

**Socket adapter** (`net/socket-adapter.test.ts`) spins up a real `GameServer` on an ephemeral port and connects via `SocketAdapter`. This is a true integration test -- actual WebSocket connections, real message routing:

```typescript
test("two clients see each other via peers + onPeerJoin", async () => {
  server = await startServer();
  const a = track(makeClient(server.port));
  await a.connect();
  const joins: string[] = [];
  a.onPeerJoin((id) => joins.push(id));
  const b = track(makeClient(server.port));
  await b.connect();
  await flush(60);
  expect(a.peers).toContain(b.id);
  expect(b.peers).toContain(a.id);
  expect(joins).toEqual([b.id]);
});
```

Uses `afterEach` to clean up all clients and the server. Helper `waitUntil` polls a predicate with a timeout for async assertions. Tests cover: connect/disconnect, unicast/broadcast, room isolation, auto-reconnect, peer join/leave, error resilience.

### Input Tests: Key Bindings, Input Mapping

**InputBindings** (`input/bindings.test.ts`) uses `MockKeyboard`, `MockGamepad`, and `MockMouse` classes to simulate input state, then tests action binding, held/pressed/released queries, multi-key bindings, gamepad/mouse channels, default bindings, deep-copy isolation, save/load through localStorage, and conflict detection:

```typescript
class MockKeyboard {
  keys = new Set<string>();
  justPressed = new Set<string>();
  press(k: string): void { this.keys.add(k); this.justPressed.add(k); }
  held(k: string): boolean { return this.keys.has(k); }
  pressed(k: string): boolean { return this.justPressed.has(k); }
  // ...
}

test("held returns true when the second bound key is held", () => {
  input.set("move-up", { keys: ["ArrowUp", "KeyW"] });
  kb.hold("KeyW");
  expect(input.held("move-up")).toBe(true);
});
```

### Utility Tests: Pathfinding, Grid, Scheduler

**Pathfinding** (`utils/pathfinding.test.ts`) tests A* pathfinding on a `GridMap`: open grids, wall navigation, L-shaped corridors, enclosed goals, out-of-bounds, diagonal mode, custom walkability predicates, and degenerate cases (start equals goal, adjacent cells):

```typescript
test("navigates around walls", () => {
  const grid = new GridMap<string>(5, 5, ".");
  grid.set(0, 2, "#"); grid.set(1, 2, "#"); grid.set(2, 2, "#"); grid.set(3, 2, "#");
  const path = findPath(grid, { col: 0, row: 0 }, { col: 0, row: 4 }, {
    isWalkable: (_c, _r, v) => v !== "#",
  });
  expect(path).not.toBeNull();
  for (const step of path!) {
    expect(grid.get(step.col, step.row)).not.toBe("#");
  }
});
```

### Template Smoke Tests

Each game template has a smoke test that boots the full game via `mockTemplateEngine`, loads its start scene, and ticks 60 frames without errors. `defineGame` templates (tic-tac-toe, connect-four) also dispatch moves through the `GameRuntime` and verify state mutations.

```typescript
test("setupGame boots, registers a scene, ticks 60 frames, moves mutate state", async () => {
  const engine = mockTemplateEngine();
  // ... setup shims for runGame ...
  const result = setupGame(engine as unknown as Parameters<typeof setupGame>[0]);
  startScene = typeof result === "string" ? result : result.startScene;
  await engine.loadScene(startScene as string);
  for (let i = 0; i < 60; i++) { engine.tick(1 / 60); }
  // ... dispatch moves and verify game state ...
});
```

---

## Writing New Tests

### Step 1: Where to Put the File

Follow the existing structure. If you're testing `engine/physics/spatial-hash.ts`, the test goes in `engine/__tests__/physics/spatial-hash.test.ts`. Create the subdirectory if it doesn't exist.

### Step 2: Basic Structure

```typescript
import { beforeEach, describe, expect, test } from "bun:test";
import { MyModule } from "../../path/to/module";

describe("MyModule", () => {
  // Optional per-test setup
  let instance: MyModule;
  beforeEach(() => {
    instance = new MyModule();
  });

  describe("methodName", () => {
    test("does X when given Y", () => {
      const result = instance.methodName(y);
      expect(result).toBe(expectedX);
    });

    test("throws when given invalid input", () => {
      expect(() => instance.methodName(invalid)).toThrow();
    });

    test("handles edge case", () => {
      expect(instance.methodName(edgeCase)).toBeNull();
    });
  });
});
```

### Step 3: What to Test

1. **Happy path** -- normal operation produces expected results
2. **Edge cases** -- empty inputs, zero values, boundary conditions
3. **Error cases** -- invalid input is rejected or handled gracefully
4. **Idempotency** -- repeated calls produce consistent results
5. **State transitions** -- before/after state is correct
6. **No-op safety** -- calling with unknown IDs or on disconnected state doesn't crash

### Mocking Strategies

The project uses several mocking approaches, none of which require external libraries:

**1. Lightweight stubs** (`helpers.ts` `mockEngine`): Minimal object that satisfies the interface a system needs. Used for system tests.

**2. Full template engine mock** (`templates/_engine.ts` `mockTemplateEngine`): Comprehensive stub with real `SystemRunner` and `SceneManager` but stubbed rendering, input, and audio. Used for template smoke tests.

**3. Inline stub engine** (in `define-game.test.ts`): Purpose-built stub with real `createWorld`, `SystemRunner`, `SceneManager`, and `TurnManager`. Used where you need specific real machinery.

**4. Mock input devices** (in `bindings.test.ts`): Classes like `MockKeyboard`, `MockGamepad`, `MockMouse` that implement the same interface as the real input classes with helper methods (`press`, `release`, `hold`, `reset`).

**5. Global stubs** (`setup.ts`): `localStorage`, `AudioContext`, and `window` stubs installed before all tests. These prevent import-time crashes.

### Testing Async Behavior

For async operations (WebSocket, scene loading), the codebase uses:

```typescript
// Simple delay for settling
async function flush(ms = 40): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Polling with timeout
async function waitUntil(predicate: () => boolean, timeoutMs = 1500, pollMs = 10): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`waitUntil timeout after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
```

For promise-based assertions:

```typescript
await expect(client.connect()).rejects.toThrow();
expect(sm.load("scene", engine)).resolves.toBeUndefined();
```

### Testing ECS Systems

Pattern: create a `mockEngine`, add a system to a `SystemRunner`, spawn entities with specific components, call `runner.update()`, then assert entity state:

```typescript
const engine = mockEngine();
const runner = new SystemRunner();
runner.add(defineSystem({
  name: "my-system",
  update: (e, dt) => {
    for (const entity of e.world.with("position", "velocity")) {
      // system logic
    }
  },
}), engine as any);

engine.spawn({ position: { x: 0, y: 0 }, velocity: { vx: 100, vy: 0 } });
runner.update(engine as any, 1 / 60);

const [entity] = [...engine.world.with("position")];
expect(entity.position.x).toBeCloseTo(100 / 60);
```

### Testing Canvas Rendering

Canvas rendering cannot be fully tested without a browser. The testable parts are:
- **Styled text parsing** -- `parseStyledText` produces correct segments with correct colors/fonts
- **Text stripping** -- `stripTags` removes markup correctly
- **Layout invariants** -- segment lengths sum to plain text length
- **Camera transforms** -- world-to-screen coordinate math
- **Transition state** -- progress curves and completion detection

The approach is to test the data transformations that *feed* the renderer rather than the pixels it produces.

---

## Import Boundary Enforcement

### The Boundaries

```
engine/   --> may import @shared, @engine. NEVER @game or @ui.
game/     --> may import @engine, @shared, @ui/store ONLY. NEVER @ui/* (except store).
games/    --> same as game/ (templates are game code).
ui/       --> may import @engine, @shared, @ui, @game/index. NEVER @game/*.
shared/   --> may NOT import @engine, @game, @ui. Zero dependencies.
```

### How `check:bounds` Works

The script `scripts/check-boundaries.ts` walks every `.ts`/`.tsx` file in the five layer directories. For each file, it:

1. Determines which layer the file belongs to (by directory prefix).
2. Extracts all import paths via regex (`import ... from '...'`).
3. Skips non-aliased imports (those not starting with `@`).
4. Checks each import against the layer's denied list first (overrides allowed), then against the allowed list.
5. Collects violations and reports them grouped by rule.

Special cases are handled: `@ui/store` is explicitly allowed from `game/` even though `@ui/` is denied; `@game/index` is allowed from `ui/` even though `@game/` is denied.

The `__bench__` directory and `scripts/` are excluded from checking.

### What Violations Look Like

```
$ bun run check:bounds
X Found 1 boundary violation(s):

  engine/ must not import @game*
    engine/physics/physics-system.ts:3 - import '@game/config'
```

### How to Fix Violations

1. **Move the imported code to `shared/`** if it's a type, constant, or event.
2. **Accept it via a callback or parameter** instead of importing it directly.
3. **Restructure** so the dependency flows in the correct direction (game depends on engine, not the reverse).

---

## Linting (Biome)

### Configuration Overview

The project uses [Biome](https://biomejs.dev/) (v2.4.10) for linting and formatting. Configuration is in `biome.json`:

**Scope:** `engine/**`, `game/**`, `games/**`, `ui/**`, `shared/**`, `src/**`.

**Lint rules (production code):**
| Rule | Level | Purpose |
|------|-------|---------|
| `noUnusedImports` | error | Dead imports bloat bundles and confuse readers |
| `noUnusedVariables` | warn | Unused vars suggest incomplete refactoring |
| `noDoubleEquals` | error | `==` has surprising coercion behavior; use `===` |
| `noExplicitAny` | warn | Prefer specific types for type safety |
| `noAssignInExpressions` | warn | Assignments inside conditions are error-prone |
| `useConst` | error | Variables that are never reassigned should be `const` |
| `noNonNullAssertion` | warn | `!` operator hides potential null errors |

**Test/bench overrides:** Tests get relaxed rules because test code often uses `any` for mocks and `!` for convenience:
- `noExplicitAny`: off
- `noNonNullAssertion`: off
- `useLiteralKeys`: off

**Formatter:** 2-space indent, 100-character line width.

### Running the Linter

```bash
bun run lint          # Check for violations (read-only)
bun run lint:fix      # Auto-fix what Biome can fix
```

Auto-fixable issues include: unused imports, `let` to `const`, formatting. Non-auto-fixable issues (like `noDoubleEquals`) require manual correction.

---

## Dead Code Detection (Knip)

[Knip](https://knip.dev/) finds unused dependencies, exports, and files. Configuration is in `knip.json`:

```json
{
  "entry": [
    "engine/index.ts",
    "games/*/index.ts",
    "scripts/*.ts",
    "engine/__bench__/*.bench.ts",
    "engine/__bench__/harness.ts",
    "engine/__bench__/setup.ts",
    "ui/GameCanvas.tsx",
    "ui/store.ts",
    "ui/screen-registry.ts"
  ],
  "project": [
    "engine/**/*.ts",
    "games/**/*.ts",
    "ui/**/*.tsx",
    "ui/**/*.ts",
    "shared/**/*.ts",
    "scripts/**/*.ts",
    "src/**/*.tsx"
  ],
  "ignore": ["games/*/game.config.ts"],
  "ignoreExportsUsedInFile": true,
  "rules": {
    "types": "warn",
    "exports": "warn",
    "files": "warn"
  }
}
```

### What Knip Checks

- **Unused dependencies** -- packages in `package.json` that nothing imports.
- **Unused exports** -- functions/types exported but never imported elsewhere. Set to `warn` because some exports are part of the public API surface consumed by games not yet written.
- **Unused files** -- `.ts`/`.tsx` files that no entry point reaches.
- **Unused types** -- exported type declarations with no consumers.

### Running Knip

```bash
bun run knip
```

The `ignoreExportsUsedInFile: true` setting prevents false positives for exports that are used within the same file (common in barrel re-exports like `engine/index.ts`).

---

## Benchmarking

### Infrastructure

Benchmarks live in `engine/__bench__/`:

```
engine/__bench__/
  setup.ts                    # Canvas/DOM stubs for headless rendering
  harness.ts                  # Bench engine factory, measurement, stats, reporting
  run.ts                      # Runner: discovers and executes all *.bench.ts files
  physics-heavy.bench.ts      # Physics system stress test
  particle-heavy.bench.ts     # Particle emitter/update stress test
  styled-text-heavy.bench.ts  # Styled text rendering stress test
  text-block-heavy.bench.ts   # Text block layout stress test
```

### The Bench Harness

`harness.ts` provides:

- **`createBenchEngine()`** -- A full engine with real `SystemRunner`, all 8 built-in systems, a real `AsciiRenderer`, `Camera`, and `ParticlePool`. Uses canvas stubs from `setup.ts` so no DOM is needed.
- **`measure(fn, iters, warmup)`** -- Runs `fn()` with warmup iterations, then collects timing samples.
- **`stats(samples)`** -- Computes median, p95, min, max from samples.
- **`report(scenario, count, tickStats, renderStats)`** -- Formatted console output.

### How to Write a Benchmark

```typescript
import { createBenchEngine, measure, report, stats } from "./harness";

const COUNTS = [100, 1000, 5000];
const DT = 1 / 60;

for (const count of COUNTS) {
  const engine = createBenchEngine();

  // Spawn entities
  for (let i = 0; i < count; i++) {
    engine.spawn({
      position: { x: (i * 13) % engine.width, y: (i * 17) % engine.height },
      velocity: { vx: Math.cos(i) * 120, vy: Math.sin(i) * 120 },
      ascii: { char: "o", font: '16px monospace', color: "#88ccff" },
    });
  }

  // Measure
  const tickSamples = measure(() => engine.tick(DT), 100, 10);
  const renderSamples = measure(() => engine.render(), 100, 10);
  report("my-scenario", count, stats(tickSamples), stats(renderSamples));

  // Regression gate
  if (stats(tickSamples).median > budgetMs) {
    throw new Error(`[regression] exceeded budget`);
  }
}
```

### Performance Baselines

Each benchmark has built-in regression thresholds. If the median exceeds the budget, the bench throws an error:

| Scenario | n=100 tick | n=1000 tick | n=5000 tick |
|----------|-----------|------------|------------|
| physics-heavy | 5ms | 25ms | 120ms |
| styled-text-heavy | 5ms | 25ms | 100ms |

### Running Benchmarks

```bash
bun run bench
```

This discovers and runs all `*.bench.ts` files in sequence, reporting stats and asserting budgets.

---

## CI/Quality Checklist

### Pre-Commit Workflow

Before committing any change:

1. **`bun run check:all`** -- Must pass cleanly (exit 0).
   - Type errors? Fix them. Missing imports? Add them.
   - Boundary violations? Restructure the import.
   - Lint errors? `bun run lint:fix` for auto-fixable; manual fix for the rest.
2. **`bun test`** (or targeted `bun test <path>` for the subsystem you changed).
   - All tests must pass. If a test fails, the change has a regression.
3. **If you touched performance-sensitive code:** `bun run bench` to verify no regressions.
4. **If you touched render/UI code:** State explicitly that visual correctness was not mechanically verified.

### Pre-PR Checklist

- [ ] `bun run check:all` passes
- [ ] `bun test` passes (full suite)
- [ ] New functionality has tests
- [ ] No boundary violations introduced
- [ ] No unused imports or variables left behind
- [ ] Commit messages reflect the nature of the change
- [ ] If render/UI changes: noted that visual correctness is not headlessly verifiable

### What "Done" Looks Like

A change is done when:

1. **`check:all` passes** -- types, boundaries, and lint are clean.
2. **Tests pass** -- existing tests still pass; new functionality has coverage.
3. **Limitations are stated** -- if UI/render correctness can't be verified headlessly, say so explicitly rather than claiming success.

There is no "it compiles so it works" -- the test suite is the mechanical contract. Type-check catches structural issues; tests catch behavioral ones. Both must pass.
