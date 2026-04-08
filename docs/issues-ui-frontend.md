# UI / Frontend / Rendering Issues

Issues found in `ui/`, `engine/render/`, and frontend-related code.

---

## Critical

### U1. `GameCanvas.tsx` imports `@engine` and `@game` — violates architecture boundary
**File:** `ui/GameCanvas.tsx:2,4`

CLAUDE.md rule: "Never import `engine/` or `game/` from `ui/` React components" (only the store is allowed). `GameCanvas.tsx` directly imports `Engine` from `@engine` and `setupGame` from `@game/index`. This entangles the React layer with the framework and game code.

**Fix:** Move engine initialization out of the React component. Have the canvas element created outside React and passed in, or use a ref callback that the engine mounts to.

---

### U2. `drawTextBlock` missing `ctx.save()`/`ctx.restore()` — leaks canvas state
**File:** `engine/render/ascii-renderer.ts:195–217`

`drawAscii`, `drawSprite`, and `drawImage` all wrap their draw operations in `ctx.save()`/`ctx.restore()`. `drawTextBlock` does NOT — it sets `ctx.font`, `ctx.fillStyle`, and `ctx.textBaseline` directly, permanently mutating the canvas context. Any entity drawn after a `textBlock` in the same frame inherits the wrong font/color/baseline.

**Fix:** Add `ctx.save()` at the start and `ctx.restore()` at the end of `drawTextBlock`.

---

### U3. DPR scale applied cumulatively on resize
**File:** `engine/render/ascii-renderer.ts:40–48`

`ctx.scale(dpr, dpr)` is called every time `resize()` fires. Assigning new `canvas.width`/`canvas.height` resets the transform matrix (which is correct), but if `clientWidth`/`clientHeight` are 0 on the first call (canvas not yet in DOM), the canvas stays zero-sized and the next resize applies `ctx.scale` again without a proper reset, doubling the transform. The `Engine` constructor calls `resize()` before React mounts the canvas.

**Fix:** Call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` instead of `ctx.scale(dpr, dpr)` to always set an absolute transform rather than accumulating.

---

### U4. Wipe transition `'in'` phase draws the wrong region
**File:** `engine/render/transitions.ts:82–86`

During the reveal phase, `t` goes 0 to 1. The code draws:
```ts
ctx.fillRect(width * (1 - t), 0, width * t, height)
```
This places a growing black bar on the right side — the opposite of a reveal. The correct reveal (shrinking black bar) should be:
```ts
ctx.fillRect(0, 0, width * (1 - t), height)
```

---

## Important

### U5. `layoutTextBlock` return value discards line widths; `textAlign` never set
**File:** `engine/render/ascii-renderer.ts:211–215`

`layoutTextBlock` returns `{ text, width }[]` per line, but only `.text` is used. Combined with the missing `ctx.save()`/`ctx.restore()` (U2), `ctx.textAlign` is whatever the previous draw call left it as. Right-aligned or centered text blocks will render incorrectly.

---

### U6. `AsciiText.tsx` performs DOM mutation during React render
**File:** `ui/shared/AsciiText.tsx:52`

`injectKeyframes()` (which calls `document.createElement` and `document.head.appendChild`) runs inside the render function body. React 18 Strict Mode may call render multiple times before committing. The `injected` guard prevents duplicates but DOM mutation during render violates React's purity rules.

**Fix:** Move `injectKeyframes()` to module scope (call once at import time) or into a `useEffect`.

---

### U7. `HealthBar.tsx` uses separate `useStore` subscriptions for atomic values
**File:** `ui/hud/HealthBar.tsx:22–23`

Two `useStore` calls for `health` and `maxHealth` (which are always set together via `setHealth`). Should use a single combined selector with `shallow` comparison:
```ts
const { health, maxHealth } = useStore(s => ({ health: s.health, maxHealth: s.maxHealth }), shallow)
```

Same pattern in `GameOverScreen.tsx:8–11` with `score` and `highScore`.

---

## Pretext-Specific Issues

### U8. Verify pretext API usage matches v0.0.4 exports
**File:** `engine/render/text-layout.ts`

The text layout module uses `prepareWithSegments`, `layoutNextLine`, `walkLineRanges`, `prepare`, and `layout`. These are all safe v0.0.4 exports. However, if `measureLineStats()`, `measureNaturalWidth()`, or `materializeLineRange()` are called anywhere, they will fail at runtime as they are NOT exported in v0.0.4.

**Status:** Needs verification that no code paths call unshipped APIs. The `shrinkwrap()` function in `text-layout.ts` should use `walkLineRanges` with a counter, not `measureLineStats`.

---

### U9. Font strings must quote multi-word family names
**Files:** `shared/constants.ts` (FONTS definitions)

Pretext requires font strings to match CSS exactly. Multi-word font families must be quoted: `'16px "Fira Code"'` not `'16px Fira Code'`. Verify all font strings in `FONTS` constants and any inline font declarations use proper quoting. `system-ui` is unsafe on macOS (Canvas and DOM can resolve different fonts).
