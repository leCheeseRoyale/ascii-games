# Shared / Config / Build Issues

Issues found in `shared/`, `scripts/`, `package.json`, `tsconfig.json`, `vite.config.ts`, and `.gitignore`.

---

## Critical

### S1. `.gitignore` uses `_` instead of `*` as glob wildcard
**File:** `.gitignore:15–16`

```
_.log
report.[0-9]_.[0-9]_.[0-9]_.[0-9]_.json
```

The `_` character is NOT a gitignore wildcard — `*` is. `_.log` only matches a file literally named `_.log`, not `npm-debug.log`, `bun.log`, etc. All log files are being tracked.

**Fix:**
```
*.log
report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json
```

---

### S2. `typescript@^5.9.3` in `package.json` — version does not exist
**File:** `package.json:29`

TypeScript 5.9 has not been released. `^5.9.3` will cause `bun install` to fail on fresh installs or CI with "no matching version found."

**Fix:** Use `"typescript": "^5.8.0"` (current stable).

---

## Important

### S3. `tsconfig.json` missing `scripts/` from `include`
**File:** `tsconfig.json:23`

```json
"include": ["src", "engine", "game", "ui", "shared", "vite-env.d.ts"]
```

The `scripts/` directory (Bun scaffolding scripts using `Bun.file()`, `Bun.write()`, `process.argv`) is not type-checked. Errors only surface at runtime.

**Fix:** Add `"scripts"` to the `include` array.

---

### S4. Event bus is fully stringly-typed — no type safety
**File:** `shared/events.ts:11–25`

`EventBus` accepts any `string` as event name and `unknown` as data. Engine events (`scene:loaded`, `engine:started`, etc.) have no type definitions. Typos in event names are silently ignored, and subscribers receive `unknown` data requiring unsafe casts.

**Fix:** Add a typed event map:
```ts
export interface EngineEvents {
  'scene:loaded': string
  'engine:started': undefined
  'engine:stopped': undefined
  'engine:paused': undefined
  'engine:resumed': undefined
}
```
Then constrain `on<K extends keyof EngineEvents>` and `emit<K extends keyof EngineEvents>`.

---

### S5. `vite.config.ts` `@engine` alias maps to directory, not barrel file
**File:** `vite.config.ts:9`

```ts
'@engine': resolve(__dirname, 'engine'),
```

`tsconfig.json` explicitly maps `@engine` to `engine/index.ts`, but `vite.config.ts` maps to the directory. Vite resolves it via `index.ts` lookup, but making it explicit (`engine/index.ts`) eliminates ambiguity.

---

### S6. `@types/react-dom@^19.2.3` ahead of `react-dom@^19.1.0`
**File:** `package.json:22,28`

Types version is higher than runtime version. Type definitions may reference APIs not present at runtime. Both should track the same major.minor series.

---

### S7. `engine/index.ts` does not export `tweenSystem`
**File:** `engine/index.ts`

`parentSystem`, `physicsSystem`, and `animationSystem` are exported. `tweenSystem` is auto-registered but not exported, so developers cannot reference or inspect it externally.

---

### S8. Scaffold template has uncommented `useStore` import
**File:** `scripts/new-scene.ts:28` (template string)

Every scaffolded scene gets an active `import { useStore } from '@ui/store'` even if the developer never uses the store. The import should be commented out alongside its usage example to avoid unnecessary coupling.
