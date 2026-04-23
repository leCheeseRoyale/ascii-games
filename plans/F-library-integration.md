# Plan: Library Integration for DX/UX

## Goal
Add open-source libraries that significantly improve developer experience, player experience, and agent reliability — without bloating the bundle, conflicting with existing architecture, or creating maintenance drift.

## Principles
1. **Keep it optional** — games work without any new library
2. **Single source of truth** — never duplicate types (derive TS interfaces from schemas, not vice versa)
3. **No second test runner** — browser tests use Playwright directly, not vitest
4. **Canvas ≠ DOM** — debug overlay is canvas-rendered; DOM tools live outside it
5. **Sub-path exports** — new modules get `@engine/storage`, `@engine/debug` paths, not barrel-file bloat
6. **Everything linted** — `biome.json` covers all code directories before any new files land

---

## Pre-Flight: Fix Architectural Gaps

Before adding any library, fix these existing gaps so new code has clean footing:

### A. Expand biome coverage
`biome.json` only covers `engine/**`, `game/**`, `games/**`, `ui/**`, `shared/**`, `src/**`. It misses `plugins/**`, `scripts/**`, and `docs/**`.

**Fix:** Update `biome.json`:
```json
"includes": [
  "engine/**", "game/**", "games/**", "ui/**", "shared/**", "src/**",
  "plugins/**", "scripts/**"
]
```

### B. Add sub-path aliases
`engine/index.ts` is 564 lines. New modules must not bloat it. Add `tsconfig.json` path aliases (or Vite resolve aliases) for sub-namespaces:

```json
// tsconfig.json additions
"@engine/storage": ["./engine/storage/*"],
"@engine/debug": ["./engine/debug/*"],
"@engine/utils": ["./engine/utils/*"]
```

New public APIs are imported via sub-paths. The root `@engine` barrel only exports core game-loop APIs.

### C. `shared/types.ts` → schema-first migration strategy
Currently `shared/types.ts` has 432 lines of hand-written interfaces. When Zod lands, these become `z.infer<typeof Schema>` — but we **do not** migrate everything at once.

**Strategy:**
1. Create `engine/schemas/` with Zod schemas for the most error-prone types first (`Health`, `SaveData`, `GameConfig`)
2. Derive TS types: `export type Health = z.infer<typeof HealthSchema>`
3. Re-export from `shared/types.ts` so existing code doesn't break
4. Migrate hand-written interfaces to schema-derived incrementally, one component per PR

---

## Phase 1: Runtime Validation (Zod)

### Why
Zero runtime validation means corrupted saves, malformed spawns, and bad configs all crash at runtime. Zod adds ~10KB gzipped and catches data errors at the boundary.

### Integration

**A. Schema directory**
```
engine/schemas/
  components.ts    # HealthSchema, PositionSchema, etc.
  save.ts          # SaveSlotSchema, GameStateSchema
  config.ts        # GameConfigSchema
  index.ts         # barrel export
```

Example:
```ts
// engine/schemas/components.ts
import { z } from "zod";

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const HealthSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().positive(),
});

export type Position = z.infer<typeof PositionSchema>;
export type Health = z.infer<typeof HealthSchema>;
```

**B. Re-export from shared/types.ts (non-breaking)**
```ts
// shared/types.ts
export type { Position, Health } from "@engine/schemas";
// ...existing hand-written types remain until migrated...
```

**C. Save/load validation**
```ts
// engine/storage/storage.ts
import type { z } from "zod";

export function loadSafe<T extends z.ZodType>(
  name: string,
  schema: T,
): z.infer<T> | undefined {
  const raw = load(name);
  if (raw === undefined) return undefined;
  const result = schema.safeParse(raw);
  if (!result.success) {
    console.warn(`[storage] Save "${name}" failed validation:`, result.error.flatten());
    return undefined;
  }
  return result.data;
}
```

**D. Entity spawn validation (optional, additive)**
`engine.spawn()` already has `validateEntity()` for NaN checks. Zod adds shape validation:

```ts
engine.spawn(createPlayer(x, y), {
  schema: PlayerSchema,  // optional — logs debug warning on mismatch
});
```

**E. Game config validation**
`game/config.ts` is imported at boot. Validate it once in `setupGame`:

```ts
import { GameConfigSchema } from "@engine/schemas/config";

const parsed = GameConfigSchema.safeParse(GAME);
if (!parsed.success) {
  console.error("Invalid game config:", parsed.error.flatten());
}
```

### Files to create/modify
- `package.json` — add `zod` to dependencies
- `engine/schemas/` — new directory (components.ts, save.ts, config.ts, index.ts)
- `engine/storage/storage.ts` — add `loadSafe`, `saveSafe`
- `engine/core/engine.ts` — optional `schema` param on `spawn()`
- `shared/types.ts` — re-export schema-derived types

### What NOT to do
- **Do not** create parallel hand-written interfaces AND Zod schemas for the same shape
- **Do not** validate every spawn by default (performance cost on hot paths like particle emitters)
- **Do not** break existing `load<T>()` API — `loadSafe` is additive

---

## Phase 2: Browser Integration Tests (Playwright)

### Why
1,249 tests pass but zero verify Canvas 2D output. `spawnText`, Pretext layout, and `measureLineWidth` accuracy cannot be tested headlessly.

### Conflict Avoided
The project uses `bun:test`. We **do not** add vitest. Instead, use **Playwright directly** as a separate test harness.

### Integration

**A. Install dev dependencies**
```bash
bun add -D @playwright/test
bunx playwright install chromium
```

**B. Create browser test directory**
```
engine/__tests__/browser/
  playwright.config.ts
  render-accuracy.spec.ts
  text-layout.spec.ts
  input.spec.ts
```

**C. Test harness**
Playwright tests open `http://localhost:5173` (dev server), inject test code into the page, and assert on canvas pixels or entity counts:

```ts
// render-accuracy.spec.ts
import { test, expect } from "@playwright/test";

test("spawnText creates correct entity count", async ({ page }) => {
  await page.goto("http://localhost:5173");
  const count = await page.evaluate(() => {
    engine.clearWorld();
    engine.spawnText({ text: "ABC", font: "16px monospace", position: { x: 0, y: 0 } });
    return [...engine.world.with("ascii")].length;
  });
  expect(count).toBe(3);
});
```

**D. CI strategy**
- Fast path: `bun test` (headless, 1249+ tests, ~5s)
- Browser path: `bun run test:browser` (Playwright, ~30s, runs on CI only)
- Browser tests require dev server: `bun dev &` → `playwright test`

### Files to create/modify
- `package.json` — add `@playwright/test` to devDependencies, add `"test:browser": "playwright test"` script
- `engine/__tests__/browser/playwright.config.ts` — new
- `engine/__tests__/browser/*.spec.ts` — new browser tests
- `.github/workflows/ci.yml` — add Playwright step

### What NOT to do
- **Do not** add vitest or `@vitest/browser`
- **Do not** run Playwright tests in `bun test` (they're too slow)
- **Do not** test visual output pixel-perfectly — test entity counts, component shapes, and canvas metrics, not screenshots

---

## Phase 3: Vite HMR Plugin

### Why
Editing `game/scenes/play.ts` triggers full page reload. You lose entity state, RNG seed, and camera position.

### Integration

**A. Create plugin**
```ts
// plugins/game-hmr/vite-plugin.ts
export default function asciiGameHmr() {
  return {
    name: "ascii-game-hmr",
    handleHotUpdate({ file, server }) {
      if (file.includes("/game/")) {
        server.ws.send({
          type: "custom",
          event: "ascii-game:reload",
          data: { file },
        });
        return []; // prevent full page reload
      }
    },
  };
}
```

**B. Engine-side listener**
```ts
// engine/core/hmr.ts
export function listenForHmr(engine: Engine) {
  if (import.meta.hot) {
    import.meta.hot.on("ascii-game:reload", ({ file }) => {
      if (file.includes("/scenes/")) {
        const sceneName = engine.scenes.current?.name;
        if (sceneName) engine.restartScene();
      }
      // Systems and factories are fresh on next scene load
    });
  }
}
```

**C. Wire into Vite config**
```ts
// vite.config.ts
import asciiGameHmr from "./plugins/game-hmr/vite-plugin";

export default defineConfig({
  plugins: [react(), asciiGameHmr()],
  // ...
});
```

### Files to create/modify
- `plugins/game-hmr/vite-plugin.ts` — new
- `plugins/game-hmr/client.ts` — new (types for `import.meta.hot`)
- `engine/core/hmr.ts` — new
- `vite.config.ts` — add plugin

### What NOT to do
- **Do not** preserve entities across reload (too complex, state mismatch risk). Restart the scene only.
- **Do not** HMR `engine/` files (framework code should reload the page)

---

## Phase 4: Async Storage (localForage)

### Why
`localStorage` is ~5MB, synchronous, and throws on quota exceeded. Roguelikes with big dungeon maps will hit this.

### Integration

**A. Wrapper module**
```ts
// engine/storage/async.ts
import localforage from "localforage";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";

const db = localforage.createInstance({ name: "ascii-game", storeName: "saves" });

export async function saveAsync(name: string, data: unknown): Promise<void> {
  await db.setItem(name, JSON.stringify(data));
}

export async function loadAsync<T>(name: string): Promise<T | undefined> {
  const raw = await db.getItem<string>(name);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function removeAsync(name: string): Promise<void> {
  await db.removeItem(name);
}
```

**B. Existing API untouched**
`engine/storage/storage.ts` (`save`, `load`, `remove`) stays exactly as-is for backward compatibility.

**C. Compression still works**
Add compressed async variants if needed:
```ts
export async function saveCompressedAsync(name: string, data: unknown): Promise<void> {
  await db.setItem(name, compressToUTF16(JSON.stringify(data)));
}
```

### Files to create/modify
- `package.json` — add `localforage` to dependencies
- `engine/storage/async.ts` — new
- `engine/index.ts` — re-export async storage (or use sub-path `@engine/storage/async`)

### What NOT to do
- **Do not** change the sync `save`/`load` API (breaks every template)
- **Do not** make `localforage` mandatory (games without large saves don't need it)

---

## Phase 5: Real-Time Tuning (Tweakpane)

### Why
Tweaking `GAME.player.speed` or gravity requires editing code and reloading. Tweakpane gives live sliders.

### Conflict Avoided
The debug overlay (`engine/render/debug.ts`) is **canvas-rendered**. Tweakpane is **DOM-based**. They cannot merge. Tweakpane lives as a separate floating DOM panel.

### Integration

**A. Separate DOM panel**
```ts
// engine/debug/tweakpane.ts
import { Pane } from "tweakpane";

let pane: Pane | null = null;

export function initTweakpane(config: object) {
  if (pane) return;
  pane = new Pane({ title: "Game Tuning", expanded: false });
  // Auto-discover numeric fields in config and add sliders
}

export function disposeTweakpane() {
  pane?.dispose();
  pane = null;
}
```

**B. Toggle via debug overlay keybind**
Backtick opens the canvas debug overlay. **Shift+Backtick** opens the Tweakpane DOM panel. They're separate systems.

**C. Template integration**
```ts
// games/blank/config.ts
export const GAME = {
  title: "My ASCII Game",
  player: { speed: 200, color: "#00ff88" },
} as const;

// In scene setup:
if (import.meta.env.DEV) {
  initTweakpane(GAME); // only in dev builds
}
```

### Files to create/modify
- `package.json` — add `tweakpane` to dependencies
- `engine/debug/tweakpane.ts` — new
- `engine/render/debug.ts` — add Shift+Backtick listener (delegates to Tweakpane)

### What NOT to do
- **Do not** try to render Tweakpane inside the canvas debug overlay
- **Do not** ship Tweakpane in production builds (wrap in `import.meta.env.DEV`)

---

## Phase 6: Multiplayer Abstraction (PartyKit or PeerJS)

### Why
The engine has low-level net code (`SocketAdapter`, `TurnSync`, `GameServer`) but most devs want `engine.joinRoom("lobby")`.

### Integration

**A. High-level API**
```ts
// engine/net/room.ts
export interface Room {
  id: string;
  send(data: unknown): void;
  onMessage(handler: (data: unknown) => void): () => void;
  onDisconnect(handler: () => void): () => void;
  leave(): void;
}

export async function joinRoom(roomId: string, opts?: RoomOpts): Promise<Room>;
```

**B. Pluggable transport**
```ts
// engine/net/transport.ts
export interface Transport {
  connect(roomId: string): Promise<void>;
  send(data: unknown): void;
  onMessage(handler: (data: unknown) => void): void;
  onDisconnect(handler: () => void): void;
  disconnect(): void;
}
```

PartyKit and PeerJS implement this interface. Games pick one.

### Files to create/modify
- `package.json` — add `partysocket` OR `peerjs` (not both) as optional peer dependency
- `engine/net/room.ts` — new
- `engine/net/transport.ts` — new
- `games/multiplayer-blank/` — new template (2-player sync demo)

### What NOT to do
- **Do not** make multiplayer a hard dependency (most games are single-player)
- **Do not** abstract away the existing low-level net code (keep it for advanced users)

---

## Priority Order

| Phase | Library | Effort | Impact | When |
|---|---|---|---|---|
| Pre-flight | biome.json + tsconfig aliases | Low | High | First |
| 1 | Zod | Medium | Very High | After pre-flight |
| 2 | Playwright | Medium | High | After Zod |
| 3 | Vite HMR plugin | Medium | Very High | Anytime |
| 4 | localForage | Low | Medium | Anytime |
| 5 | Tweakpane | Low | Medium | After HMR |
| 6 | PartyKit/PeerJS | High | High | Later |

## Bundle Impact

| Library | Gzipped | Notes |
|---|---|---|
| zod | ~10KB | Tree-shakeable |
| localforage | ~8KB | Only if used |
| tweakpane | ~40KB | Dev-only, stripped from production |
| partysocket | ~5KB | Only in multiplayer games |
| @playwright/test | 0KB | Dev dependency only |

**Player-facing overhead:** ~18KB (Zod + localForage) for games that use them.

## Note on AI Tools

The existing `ai:*` scripts remain as **optional dev tools** using the raw Anthropic SDK. They are not engine dependencies — users can ignore them and use their own AI tools, IDE completions, or hand-write code. No AI framework is baked into the engine or game runtime.

## Verification Checklist

After each phase:
- [ ] `bun run check:all` passes (typecheck + boundaries + lint)
- [ ] `bun test` passes (all 1249+)
- [ ] New files are in `biome.json` includes
- [ ] New public APIs have sub-path aliases, not barrel bloat
- [ ] AGENTS.md updated with new API
- [ ] At least one template demonstrates the feature
- [ ] No hand-written interfaces duplicate Zod schemas
