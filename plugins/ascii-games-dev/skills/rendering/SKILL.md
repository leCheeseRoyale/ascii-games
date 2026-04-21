---
name: rendering
description: Use when editing files under `engine/render/`, working with ASCII text rendering, canvas drawing, text layout or measurement via Pretext, styled text (`[#hex]`, `[b]`, `[dim]`, `[bg:#hex]`), scene transitions (`fade`, `wipe`, `dissolve`, `scanline`), sprite caching, text effects (shake, wave, glitch, rainbow), the debug overlay, `engine.ui.*` draw calls, `AsciiRenderer`, `CanvasUI`, `layoutTextBlock`, `measureLineWidth`, `shrinkwrap`, `layoutJustifiedBlock`, `layoutTextAroundObstacles`, or per-character physics text (`engine.spawnText`, `engine.spawnSprite`). Also use when diagnosing rendering performance, visual glitches, or text measurement issues.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Rendering subsystem

This skill covers the entire visual pipeline — from text measurement through canvas drawing. **For any text measurement, layout, or per-character physics work, also invoke the globally installed `pretext` skill** — it documents the underlying `@chenglou/pretext` library that powers all text measurement in this engine.

## Why this architecture

The engine renders ASCII characters to an HTML Canvas 2D context — no DOM elements for game content. Text measurement uses **Pretext** (`@chenglou/pretext`), a pure TypeScript library that computes line breaks and character widths without touching the DOM. This means:

- Zero layout thrashing or reflow — critical for 60fps
- Works identically in headless/server environments
- All measurement results are LRU-cached (512 entries per cache type)

Canvas UI uses an **immediate-mode draw queue** (closures enqueued during game logic, flushed during render). This avoids retained-mode state sync bugs and makes hit testing straightforward — each component stores its last-drawn bounds.

## Rendering pipeline (per frame)

The full pipeline executes in `engine/render/ascii-renderer.ts`:

```
1. ctx.fillRect(background)           — clear canvas
2. ctx.save() → translate + scale     — apply camera transform + shake
3. Collect all renderables → sort by `layer` (ascending)
4. For each renderable:
   - Image entities → drawImage
   - ASCII entities → single char via fillText (or sprite cache for multiline)
   - TextBlock entities → paragraph rendering with styled text + wrapping
5. Particles → engine-owned particle pool render
6. Debug overlay (if enabled) → collider outlines, velocity arrows, position dots
7. ctx.restore()                       — undo camera
8. Screen-space UI (CanvasUI) → menus, panels, HUD — after camera restore so they stay fixed
```

**Why this order:** Camera transform wraps world-space entities but not UI. Sorting by `layer` gives artists explicit z-control. Debug renders last in world-space so overlays don't occlude game content.

## Source files

| File | What it owns | Lines |
|---|---|---|
| `engine/render/ascii-renderer.ts` | Rendering pipeline, entity drawing, sprite cache, debug overlay | ~640 |
| `engine/render/text-layout.ts` | Pretext integration, LRU caches, all layout functions, styled text parser | ~520 |
| `engine/render/canvas-ui.ts` | CanvasUI class, UIMenu, DialogManager, UIScrollPanel, UIGrid, UITooltip, UITabs | ~2000 |
| `engine/render/transitions.ts` | Scene transitions (fade, wipe, dissolve, scanline) | ~180 |

## Text measurement and layout

All measurement goes through `engine/render/text-layout.ts`, which wraps Pretext behind LRU caches.

### Core functions

| Function | Input | Output | When to use |
|---|---|---|---|
| `measureLineWidth(text, font)` | Text + CSS font string | Pixel width (fractional) | Sizing a single unwrapped line |
| `measureHeight(text, font, maxW, lh)` | Text + constraints | Pixel height | Knowing total height before drawing |
| `getLineCount(text, font, maxW)` | Text + max width | Integer | Line count without building line array |
| `shrinkwrap(text, font, maxW)` | Text + max width | Ceiled integer width | Finding widest line when wrapped |
| `layoutTextBlock(text, font, maxW, lh)` | Text + constraints | `{text, width}[]` | Fixed-width paragraph wrapping |
| `layoutJustifiedBlock(text, font, maxW, lh, startX)` | Text + constraints | `JustifiedLine[]` | Newspaper-style justified text |
| `layoutTextAroundObstacles(text, font, startX, startY, maxW, lh, obstacles)` | Text + circular obstacles | `RenderedLine[]` | Text flowing around images/entities |

### Caching architecture

Two LRU caches (max 512 entries each):

- **`preparedCache`** — keyed by `(font, text, whiteSpace?)`. Stores Pretext's `PreparedTextWithSegments`. Reused by all layout functions.
- **`widthCache`** — keyed by `(font, text)`. Stores single-line pixel widths. Used by CanvasUI for inline runs and shrinkwrap.

**Why LRU, not unbounded?** Game text is dynamic (scores, dialog, procedural names). Unbounded caches leak memory. 512 entries covers a full screen of unique text with headroom.

Call `clearTextCache()` if you change fonts at runtime (rare).

### Styled text

Parse with `parseStyledText(text, baseFont, baseColor)`. Tags:

| Tag | Effect | Example |
|---|---|---|
| `[#rrggbb]...[/]` | Color (also `[#rgb]`) | `[#ff4444]damage[/]` |
| `[b]...[/b]` | Bold (increases font weight) | `[b]critical[/b]` |
| `[dim]...[/dim]` | 50% opacity | `[dim]secondary info[/dim]` |
| `[bg:#rrggbb]...[/bg]` | Background color | `[bg:#333]highlighted[/bg]` |

Tags nest and stack (stack-based state machine). Strip all tags with `stripTags(text)`.

**Why custom tags instead of markdown?** Tags are cheap to parse (one pass, no ambiguity) and map directly to canvas fillStyle/font changes. Markdown semantics don't translate cleanly to canvas rendering.

## Entity rendering types

Three rendering modes, selected by which component an entity has:

1. **`ascii: { char, font, color, opacity, textEffect? }`** — single character or short string. Most entities use this.
2. **`sprite: { lines, font, color, colorMap?, glow? }`** — multiline ASCII art. Cached as canvas bitmaps unless `textEffect` is set (per-char transforms skip the cache).
3. **`textBlock: { text, font, color, maxWidth, lineHeight, justify? }`** — paragraph text with word wrapping.

**Sprite caching:** Multiline sprites are rasterized to an offscreen canvas and cached by `(lines, font, color, colorMap, glow)`. This avoids per-character `fillText` calls every frame. The cache is skipped when `textEffect` is present because per-character transforms need individual draw calls.

## Scene transitions

`engine/render/transitions.ts` implements a **two-phase model**:

1. **"out" phase** — overlay fades in (0 → 1 progress), obscuring the old scene
2. **Midpoint** — at 50% of "out" duration, fires `onMidpoint()` callback (swap scene here)
3. **"in" phase** — overlay fades out (1 → 0 progress), revealing the new scene

Available types:

| Type | Effect |
|---|---|
| `"fade"` | Fade to/from black |
| `"fadeWhite"` | Fade to/from white |
| `"wipe"` | Left-to-right wipe out, right-to-left wipe in |
| `"dissolve"` | Pixelated dissolve using ASCII chars `░▒▓█╬╠╣╦╩╗╔╚╝` |
| `"scanline"` | Horizontal scanlines sweeping down |
| `"none"` | No visual effect |

**Safety:** If `onMidpoint()` returns a Promise, the transition waits (with 5-second timeout to prevent hangs).

Usage in game code:
```ts
engine.loadScene('play', { transition: 'fade', transitionDuration: 0.5 })
```

## Per-character physics text

`engine.spawnText(opts)` and `engine.spawnSprite(opts)` decompose text into individual entities — one per character — each with:
- `position` (placed at the character's layout position)
- `velocity` (zeroed initially)
- `collider` (auto-sized from character measurement)
- `spring` (configured to pull back to home position)

This enables per-character physics interactions: collision, cursor repel, ambient drift, scatter/reform effects. **See the `pretext` skill for the measurement pipeline that computes home positions.**

Spring presets: `SpringPresets.stiff`, `.snappy`, `.bouncy`, `.smooth`, `.floaty`, `.gentle`.

## Debug overlay

Toggled with the backtick key (`` ` ``). When `config.debug === true`, renders in world-space:

- **Green outlines** — collider shapes (circles: arc, rects: strokeRect) at 50% alpha
- **Yellow arrows** — velocity vectors (line from position to position + velocity × 0.1) at 40% alpha
- **Magenta dots** — entity positions at 30% alpha

Also shows engine warnings (NaN recovery, spawn validation failures) as toast-style text.

## Performance considerations

1. **Never call Pretext `prepare()` directly** — the renderer's LRU cache handles it. Bypassing the cache kills performance.
2. **Sprite entities with `textEffect` skip the bitmap cache** — only use textEffect when you need per-character transforms.
3. **Styled text is re-parsed each frame** — for frequently changing styled text, consider caching the parsed segments.
4. **`layoutTextAroundObstacles` is expensive** — it recalculates line widths around circles. Use only for static or slowly-changing layouts.
5. **Border drawing in CanvasUI is per-frame** — not cached. For many simultaneous panels, this can add up.

## Things NOT to do

- Don't call `ctx.measureText()` directly for layout — use `measureLineWidth()` which goes through the Pretext cache.
- Don't create DOM elements for measurement — Pretext handles this without DOM.
- Don't render UI inside the camera transform — CanvasUI renders after `ctx.restore()` for screen-space positioning.
- Don't skip the `layer` component for z-ordering — entities without `layer` default to 0, which may cause unexpected ordering.
- Don't manually draw to the canvas in system update functions — all drawing should go through entity components or CanvasUI.

## When to read further

- Text measurement details → invoke the **`pretext` skill**
- Canvas UI components (menus, dialogs, grids) → invoke the **`/ascii-games-dev:canvas-ui` skill**
- Adding feedback effects (particles, shake, floating text) → invoke **`/ascii-games-dev:juice`**
