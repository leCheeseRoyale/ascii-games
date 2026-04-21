# Rendering Pipeline Guide

Definitive reference for the ASCII game engine's rendering system. Everything renders as text on a Canvas 2D surface, using [@chenglou/pretext](https://github.com/chenglou/pretext) for text measurement and layout.

## Table of Contents

- [Render Pipeline Overview](#render-pipeline-overview)
- [Entity Rendering](#entity-rendering)
- [Pretext Integration](#pretext-integration)
- [Canvas UI System](#canvas-ui-system)
- [Particles](#particles)
- [Transitions](#transitions)
- [Camera](#camera)
- [Supporting Systems](#supporting-systems)
- [Extension Workflows](#extension-workflows)

---

## Render Pipeline Overview

### Full Frame Sequence

Every frame executes this exact sequence, split between `Engine.update()` and `Engine.render()`:

**Update phase** (in `Engine.update()`):
1. Input polling (keyboard, mouse, gamepad, touch)
2. Systems run (ECS systems including tweens, animation, physics)
3. Scene update callback
4. Scheduler tick (timers, delayed callbacks)
5. Particle simulation (`particles.update(dt)`)
6. Transition advance (`transition.update(dt)`)
7. Camera update (`camera.update(dt)` -- follow, shake decay, bounds clamping)
8. Debug overlay update (error timer decay)
9. Toast update (float + fade)
10. Canvas UI time advance (`ui.update(dt)`)
11. Dialog manager update (typewriter advance, input handling)

**Render phase** (in `Engine.render()`):
1. Dialog queues its draw commands into the UI system
2. `AsciiRenderer.render()` executes:
   1. **Clear** -- fill canvas with `config.bgColor`
   2. **Camera transform** -- translate, shake offset, zoom
   3. **Collect renderables** -- query world for entities with renderable components
   4. **Sort by layer** -- ascending (lower layers draw first, behind higher layers)
   5. **Draw each renderable** -- image, ascii, sprite, textBlock, tilemap
   6. **Draw particles** -- engine-owned particle pool renders in world space
   7. **Debug overlays** -- collider outlines, velocity arrows, position dots (when `config.debug` is true)
   8. **Restore camera transform**
   9. **Flush Canvas UI** -- screen-space UI renders after camera restore
3. **Transition overlay** -- renders on top of everything (fade, wipe, dissolve, scanline)
4. **Toast notifications** -- floating text with fade
5. **Debug overlay** -- profiler panel, entity counts, error banners

```
Engine.render()
  |
  +-- dialog.draw(ui, w, h)           // queue dialog draw commands
  |
  +-- renderer.render(world, config, camera, particles, sceneTime, ui)
  |     |
  |     +-- 1. Clear canvas (config.bgColor)
  |     +-- 2. ctx.save() + camera transform
  |     +-- 3. Collect renderables from world queries
  |     +-- 4. Sort by layer (ascending)
  |     +-- 5. Draw each: image | ascii | sprite | textBlock | tilemap
  |     +-- 6. particles.render(ctx)
  |     +-- 7. Debug: colliders, velocity arrows, position dots
  |     +-- 8. ctx.restore()
  |     +-- 9. ui.render()              // flush Canvas UI draw queue
  |
  +-- transition.render(ctx, w, h)     // overlay on top
  +-- toast.render(ctx, w, h)          // floating notifications
  +-- debug.render(ctx, world, camera) // profiler, error banners
```

### Canvas Sizing and DPI

The renderer handles high-DPI displays automatically:

```typescript
// From AsciiRenderer.resize()
const dpr = window.devicePixelRatio || 1;
const w = this.canvas.clientWidth;
const h = this.canvas.clientHeight;
this.canvas.width = w * dpr;
this.canvas.height = h * dpr;
this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

The canvas backing store is scaled by `devicePixelRatio`, but all drawing coordinates remain in CSS pixels. `resize()` is called on mount and on every `window.resize` event.

### Auto-Rendering Rules

Entities auto-render when they have the right component combinations. No registration or render calls needed:

| Components Required | Render Type | Description |
|---|---|---|
| `position` + `ascii` | ASCII | Single character or short string |
| `position` + `sprite` | Sprite | Multi-line ASCII art |
| `position` + `textBlock` | TextBlock | Wrapped paragraph with alignment |
| `position` + `image` | Image | HTMLImageElement |
| `position` + `tilemap` | Tilemap | Grid of characters with legend |

### Layer Sorting

All renderable types share the same layer system. Default layers:

- **Tilemap**: defaults to layer `-10` (drawn behind everything)
- **All others**: default to layer `0`

```typescript
renderables.sort((a, b) => a.layer - b.layer);
```

Within the same layer, draw order is determined by the order entities appear in the world queries (nondeterministic across frames). If precise front-to-back ordering matters within a layer, use distinct layer values.

---

## Entity Rendering

### ASCII Entities

The simplest renderable. An entity with `position` + `ascii` draws a single character (or short string) centered at the position.

**Component shape** (`shared/types.ts`):
```typescript
interface Ascii {
  char: string;       // character(s) to display
  font: string;       // CSS font string, e.g. '16px "Fira Code", monospace'
  color: string;      // CSS color
  glow?: string;      // shadow color for glow effect
  opacity?: number;   // 0-1, default 1
  scale?: number;     // multiplier on font size
  layer?: number;     // render layer, default 0
}
```

**Rendering behavior:**

1. If no `textEffect`, renders as a single `fillText` call centered at `(x, y)` with `textBaseline: "middle"` and `textAlign: "center"`.
2. If `glow` is set, `ctx.shadowColor` and `ctx.shadowBlur = 8` produce a soft halo.
3. If `scale` is set, the font size is multiplied: `parseFloat(font) * scale`.
4. If `textEffect.fn` is present, the text is rendered per-character with individual transforms (see [Text Effects](#text-effects)).

**Per-character text effect rendering** (when `textEffect` is present):

```typescript
// From AsciiRenderer.drawAscii() -- effect path
const chars = [...a.char];
// Measure each character width for positioning
const charWidths: number[] = [];
for (const ch of chars) {
  charWidths.push(ctx.measureText(ch).width);
}
const totalW = charWidths.reduce((sum, w) => sum + w, 0);
let cx = x - totalW / 2;

for (let i = 0; i < chars.length; i++) {
  const transform = effectFn(i, chars.length, this.sceneTime);
  // Apply dx, dy, opacity, scale, color, char substitution
  ctx.fillText(transform.char ?? chars[i], cx + (transform.dx ?? 0), y + (transform.dy ?? 0));
  cx += charWidths[i];
}
```

**Usage example:**
```typescript
engine.spawn({
  position: { x: 400, y: 300 },
  ascii: { char: '@', font: '24px "Fira Code", monospace', color: '#00ff88', glow: '#00ff88' },
});
```

### Sprite Entities

Multi-line ASCII art. Each line is drawn centered horizontally, stacked vertically.

**Component shape:**
```typescript
interface Sprite {
  lines: string[];                    // one string per line
  font: string;                       // CSS font string
  color: string;                      // base color for all lines
  glow?: string;                      // shadow glow color
  opacity?: number;                   // 0-1
  layer?: number;                     // render layer
  colorMap?: Record<string, string>;  // per-character color overrides
}
```

**Rendering behavior:**

Line height is derived from font size: `fontSize * 1.2`. Lines are vertically centered on the entity position:

```typescript
const fontSize = parseFloat(s.font) || 16;
const lineHeight = fontSize * 1.2;
const totalHeight = s.lines.length * lineHeight;
const startY = y - totalHeight / 2 + lineHeight / 2;

for (let i = 0; i < s.lines.length; i++) {
  ctx.fillText(s.lines[i], x, startY + i * lineHeight);
}
```

Each line is drawn with `textAlign: "center"` at the entity's x position.

**Usage example:**
```typescript
engine.spawn({
  position: { x: 200, y: 150 },
  sprite: {
    lines: [
      '  /\\  ',
      ' /  \\ ',
      '/____\\',
    ],
    font: '14px "Fira Code", monospace',
    color: '#ffcc00',
  },
});
```

### TextBlock Entities

Wrapped paragraphs with alignment, styled text tags, justified layout, and obstacle flow.

**Component shape:**
```typescript
interface TextBlock {
  text: string;          // raw text, may contain style tags
  font: string;          // CSS font string
  maxWidth: number;      // wrapping width in pixels
  lineHeight: number;    // pixels between lines
  color: string;         // base text color
  align?: 'left' | 'center' | 'right' | 'justify';  // default 'left'
  layer?: number;        // render layer
}
```

**Rendering behavior** (from `AsciiRenderer.drawTextBlock()`):

The renderer inspects the text and chooses a code path:

1. **Justified + no obstacles**: Uses `layoutJustifiedBlock()` for per-word positioning with distributed spacing.
2. **Obstacles present**: Uses `layoutTextAroundObstacles()` to flow text around circular obstacles.
3. **Has style tags**: Strips tags for layout via `layoutTextBlock()`, then renders with per-character styling via `drawStyledRun()`.
4. **Plain text**: Standard `layoutTextBlock()` with alignment offsets.

**Style tag rendering** works by building a char-to-style map from `parseStyledText()` segments and then grouping consecutive characters with the same style into single `fillText` calls:

```typescript
// Build char-to-style map
const charStyles: StyledSegment[] = new Array(plainChars);
let charIndex = 0;
for (const seg of segments) {
  for (let ci = 0; ci < seg.text.length && charIndex < plainChars; ci++) {
    charStyles[charIndex] = seg;
    charIndex++;
  }
}

// Render each line with style runs
// Groups consecutive chars with same (color, font, opacity, bgColor) into single fillText
```

**Alignment offsets** for center and right:
```typescript
if (align === 'center') {
  lineX = x + (tb.maxWidth - lines[i].width) / 2;
} else if (align === 'right') {
  lineX = x + tb.maxWidth - lines[i].width;
}
```

### Image Entities

Render an `HTMLImageElement` at the entity position.

**Component shape:**
```typescript
interface ImageComponent {
  image: HTMLImageElement;       // from engine.loadImage()
  width: number;                 // 0 = use natural width
  height: number;                // 0 = use natural height
  opacity?: number;              // 0-1
  layer?: number;                // render layer
  anchor?: 'center' | 'topLeft'; // default 'center'
  rotation?: number;             // radians
}
```

**Loading images:**
```typescript
const img = await engine.loadImage('/sprites/hero.png');
engine.spawn({
  position: { x: 100, y: 100 },
  image: { image: img, width: 32, height: 32 },
});
```

The image loader (`engine/render/image-loader.ts`) caches loaded images by URL and deduplicates in-flight requests. Use `engine.preloadImages([...urls])` to batch-load.

### Tilemap Entities

A grid of ASCII characters, each cell sized by `cellSize` pixels.

**Component shape:**
```typescript
interface TilemapComponent {
  data: string[];                           // rows of characters
  legend: Record<string, TileLegendEntry>;  // char -> { color?, bg?, solid? }
  cellSize: number;                         // pixels per cell
  offsetX: number;                          // pixel offset from position
  offsetY: number;                          // pixel offset from position
  font?: string;                            // default '16px "Fira Code", monospace'
  layer?: number;                           // default -10 (behind everything)
}
```

**Rendering behavior:**

Each non-space character is drawn centered in its cell. If the legend entry has a `bg` color, a filled rectangle is drawn behind the character:

```typescript
for (let row = 0; row < tm.data.length; row++) {
  for (let col = 0; col < tm.data[row].length; col++) {
    const char = tm.data[row][col];
    if (char === ' ') continue;
    const entry = tm.legend[char];
    const px = ox + tm.offsetX + col * cs + cs / 2;
    const py = oy + tm.offsetY + row * cs + cs / 2;
    if (entry?.bg) {
      ctx.fillStyle = entry.bg;
      ctx.fillRect(px - cs / 2, py - cs / 2, cs, cs);
    }
    ctx.fillStyle = entry?.color ?? '#ffffff';
    ctx.fillText(char, px, py);
  }
}
```

### Text Effects

Text effects are per-character visual transforms applied during rendering. They are composable functions.

**Type signature:**
```typescript
type TextEffectFn = (charIndex: number, totalChars: number, time: number) => CharTransform;

interface CharTransform {
  dx: number;        // horizontal offset in pixels
  dy: number;        // vertical offset in pixels
  color?: string;    // override character color
  opacity?: number;  // override character opacity
  scale?: number;    // scale multiplier
  char?: string;     // substitute character
}
```

**Built-in effects** (from `engine/render/text-effects.ts`):

| Effect | Description | Key Parameters |
|---|---|---|
| `wave()` | Sinusoidal vertical undulation | amplitude, frequency, speed |
| `sway()` | Horizontal side-to-side motion | amplitude, frequency, speed |
| `shake()` | Random per-character jitter | magnitude, speed |
| `rainbow()` | Cycling hue per character | speed, spread |
| `glitch()` | Random character substitution | intensity, chars |
| `pulse()` | Breathing opacity | speed, min |
| `throb()` | Pulsing scale | speed, min, max |
| `fadeIn()` | Staggered reveal left-to-right | charDelay, fadeDuration |
| `popIn()` | Characters pop up with overshoot | charDelay, duration |
| `float()` | Gentle bobbing motion | amplitude, speed, spread |
| `flicker()` | Random opacity drops (neon sign) | speed, dropChance |
| `spiral()` | Characters orbit inward | radius, speed, decayTime |
| `scatter()` | Characters fly in from random directions | distance, duration |

**Composition** -- effects combine via `compose()`:
```typescript
import { wave, rainbow, compose } from '@engine';

// On an entity
engine.spawn({
  position: { x: 100, y: 200 },
  ascii: { char: 'LEGENDARY!', font: '24px "Fira Code", monospace', color: '#ff0' },
  textEffect: { fn: compose(wave(5), rainbow()) },
});

// In canvas UI
engine.ui.effectText(x, y, 'Wavy text', wave(), { color: '#0f8' });
```

`compose()` adds offsets (`dx`, `dy`), cascades `color`/`char` (last wins), and multiplies `opacity` and `scale`.

**Named presets** via `textEffect()`:
```typescript
import { textEffect } from '@engine';
const fn = textEffect('wave', { amplitude: 8, speed: 4 });
```

---

## Pretext Integration

This is the most critical section. All text measurement in the engine goes through the Pretext integration layer (`engine/render/text-layout.ts`), which wraps `@chenglou/pretext` with an LRU caching layer.

### Architecture: prepare + layout Two-Phase Model

Pretext separates text handling into two phases:

1. **Prepare** (`prepareWithSegments(text, font, opts)`) -- Measures the text, builds internal segment data. This is the expensive step (involves canvas `measureText` calls internally). The result is a `PreparedTextWithSegments` object.

2. **Layout** (`layout()`, `layoutWithLines()`, `layoutNextLine()`, `walkLineRanges()`) -- Takes prepared text and a max width, determines line breaks. This is cheap once text is prepared.

The engine's caching layer ensures each unique `(text, font, whiteSpace)` combination is prepared exactly once.

### The LRU Caching Layer

Two caches, each with 512 entries:

```typescript
// PreparedTextWithSegments cache -- keyed by (font + NUL + text)
const preparedCache = new LRUCache<PreparedTextWithSegments>(512);

// Single-line width cache -- keyed by (font + NUL + text)
const widthCache = new LRUCache<number>(512);
```

The LRU implementation uses a `Map` (which preserves insertion order). On access, entries are moved to the end. When full, the oldest entry is evicted:

```typescript
class LRUCache<V> {
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);   // remove
      this.map.set(key, v);   // re-insert at end
    }
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first); // evict oldest
    }
    this.map.set(key, value);
  }
}
```

Cache keys include an optional `whiteSpace` mode:
```typescript
function cacheKey(text: string, font: string, opts?: PrepareOptions): string {
  if (!opts?.whiteSpace) return `${font}\x00${text}`;
  return `${font}\x00${opts.whiteSpace}\x00${text}`;
}
```

### measureLineWidth()

Measures the width of a single line of text with no wrapping. Returns **raw fractional pixel width** (no rounding) -- use this for precise positioning.

```typescript
export function measureLineWidth(text: string, font: string): number
```

Internally: checks the `widthCache`, falls through to `measureNaturalWidth()` which walks line ranges at `Infinity` width and returns the max width. Result is cached.

**When to use:** Per-frame positioning of text (alignment offsets, cursor positioning, inline chunk layout). The fractional precision avoids sub-pixel jitter.

### shrinkwrap()

Finds the widest line width when text is laid out at `maxWidth`. Returns a **ceiled integer** suitable for container sizing.

```typescript
export function shrinkwrap(text: string, font: string, maxWidth: number): number
```

**When to use:** Computing panel widths, auto-sizing text containers. The ceiling ensures containers never clip text.

### measureHeight()

Returns total text height without building line objects. Very cheap after first `prepare()`.

```typescript
export function measureHeight(text: string, font: string, maxWidth: number, lineHeight: number): number
```

### getLineCount()

Returns the number of lines when text is laid out at `maxWidth`.

```typescript
export function getLineCount(text: string, font: string, maxWidth: number): number
```

### layoutTextBlock()

The workhorse layout function. Wraps text to `maxWidth` and returns line objects.

```typescript
export function layoutTextBlock(
  text: string, font: string, maxWidth: number, lineHeight: number
): { text: string; width: number }[]
```

Returns an array where each element has the line's text content and its measured pixel width. Used by the renderer for plain and styled text blocks, by `textPanel()` for auto-sizing, by `DialogManager` for typewriter layout, and by `UITooltip` for content sizing.

### layoutJustifiedBlock()

Justified text with per-word positioning. Each word gets an explicit x coordinate so extra space is distributed evenly between words.

```typescript
export function layoutJustifiedBlock(
  text: string, font: string, maxWidth: number, lineHeight: number, startX?: number
): JustifiedLine[]

interface JustifiedLine {
  words: JustifiedWord[];  // each word has { text, x, width }
  y: number;
  isLastLine: boolean;     // last lines remain left-aligned (standard justification)
}
```

The algorithm:
1. Layout text normally via `layoutTextBlock()` to determine line breaks.
2. For each non-last line with 2+ words: compute total word width, distribute remaining space equally between word gaps.
3. Last lines and single-word lines remain left-aligned.

### layoutTextAroundObstacles()

Variable-width layout that flows text around circular obstacles. Each line may have a different available width.

```typescript
export function layoutTextAroundObstacles(
  text: string, font: string,
  startX: number, startY: number, maxWidth: number, lineHeight: number,
  obstacles: { position: Position; obstacle: Obstacle }[]
): RenderedLine[]

interface RenderedLine {
  text: string;
  x: number;     // may differ per line
  y: number;
  width: number;
}
```

Uses `layoutNextLine()` from Pretext -- a cursor-based line-by-line API where each line gets a different width:

```typescript
while (true) {
  // Calculate available width at this y, accounting for circular obstacles
  // For each obstacle, check vertical overlap and compute intrusion
  const availWidth = Math.max(rightEdge - leftEdge, 30);
  const line = layoutNextLine(prepared, cursor, availWidth);
  if (line === null) break;
  result.push({ text: line.text, x: leftEdge, y, width: line.width });
  cursor = line.end;
  y += lineHeight;
}
```

Obstacle intrusion is computed geometrically: for a circle at `(ox, oy)` with radius `r`, if a line at height `y` overlaps vertically, the horizontal intrusion is `sqrt(r^2 - dy^2)`. Text flows to whichever side (left or right of the obstacle) has more space.

### Styled Text: parseStyledText() and stripTags()

**Tag syntax:**
| Tag | Effect | Closing |
|---|---|---|
| `[#rrggbb]` or `[#rgb]` | Color | `[/]` |
| `[b]` | Bold | `[/b]` |
| `[dim]` | 50% opacity | `[/dim]` |
| `[bg:#rrggbb]` | Background color | `[/bg]` |

Tags can be nested: `[b][#f00]bold red[/][/b]`.

**parseStyledText()** returns an array of `StyledSegment` objects:
```typescript
interface StyledSegment {
  text: string;
  color: string;
  font: string;
  opacity: number;
  bgColor: string | null;
}
```

Uses a stack-based parser -- each opening tag pushes the current style, each closing tag pops. The tag regex:
```typescript
/\[(#[0-9a-fA-F]{3,8}|\/|b|\/b|dim|\/dim|bg:#[0-9a-fA-F]{3,8}|\/bg)\]/g
```

**stripTags()** removes all style tags, returning plain text. Essential because Pretext does not understand the engine's tag syntax -- layout must be done on plain text, then styles are mapped back onto the laid-out lines.

**Critical invariant** (tested in `engine/__tests__/render/text-layout.test.ts`):
```
sum(segment.text.length for segment in parseStyledText(raw)) === stripTags(raw).length
```

If this invariant breaks, the char-to-style mapping in the renderer produces misaligned colors.

### insertSoftHyphens()

Preprocessing step that inserts `­` (soft hyphen) into long words to enable better line breaking. URLs get `​` (zero-width space) instead. Call before passing text to layout functions:

```typescript
const hyphenated = insertSoftHyphens(longText, 12);  // break every 12 chars
const lines = layoutTextBlock(hyphenated, font, maxWidth, lineHeight);
```

### clearTextCache()

Clears all three caches: the prepared text LRU, the width LRU, and Pretext's internal cache.

```typescript
export function clearTextCache(): void {
  preparedCache.clear();
  widthCache.clear();
  clearPretextCache();  // @chenglou/pretext internal
}
```

**When to call:**
- After changing the global font (rare)
- When you need to free memory (the cache holds references to prepared text objects)
- During scene transitions if the new scene uses entirely different text

**When NOT to call:**
- Every frame (defeats the purpose of caching)
- During normal gameplay (the LRU naturally evicts stale entries)

### PrepareOptions: whiteSpace Support

```typescript
interface PrepareOptions {
  whiteSpace?: 'normal' | 'pre-wrap';
}
```

- `normal` (default): Collapses whitespace, wraps at word boundaries.
- `pre-wrap`: Preserves whitespace and newlines, still wraps at `maxWidth`.

### Performance Characteristics

| Function | First Call | Subsequent Calls | Notes |
|---|---|---|---|
| `measureLineWidth()` | ~1 prepare + 1 walk | Cache hit (Map lookup) | Fractional result, no rounding |
| `shrinkwrap()` | ~1 prepare + 1 walk | 1 walk (prepared is cached) | Ceiled integer |
| `measureHeight()` | ~1 prepare + 1 layout | 1 layout (prepared is cached) | Cheapest height query |
| `layoutTextBlock()` | ~1 prepare + 1 layoutWithLines | 1 layoutWithLines | Returns line objects |
| `layoutJustifiedBlock()` | N+1 measureLineWidth + 1 layoutTextBlock | Mostly cached | Per-word measurement |
| `layoutTextAroundObstacles()` | 1 prepare + N layoutNextLine | N layoutNextLine | One prepare, N line layouts |

**Key insight:** The expensive operation is `prepareWithSegments()`. Once a text+font combo is prepared, all layout operations are fast. The LRU ensures frequently used strings stay prepared.

### Local Helpers

Two helpers are defined locally because they are not yet exported by `@chenglou/pretext`:

```typescript
// Measure the natural (unwrapped) width of text
function measureNaturalWidth(prepared: PreparedTextWithSegments): number {
  let max = 0;
  walkLineRanges(prepared, Infinity, (line) => {
    if (line.width > max) max = line.width;
  });
  return max;
}

// Get line count and max line width at a given maxWidth
function measureLineStats(
  prepared: PreparedTextWithSegments, maxWidth: number
): { lineCount: number; maxLineWidth: number }
```

These may move upstream in a future Pretext release.

---

## Canvas UI System

### CanvasUI: Immediate-Mode Architecture

`CanvasUI` is an immediate-mode UI system with a deferred draw queue. Game code pushes draw commands during update; all commands are flushed in a single batch during render.

```typescript
class CanvasUI {
  _queue: DrawFn[] = [];   // closures pushed by UI methods
  private ctx: CanvasRenderingContext2D;
  private _time = 0;       // internal time for effects

  update(dt: number): void { this._time += dt; }

  render(): void {
    for (const fn of this._queue) fn();
    this._queue.length = 0;  // clear after flush
  }
}
```

**Important:** Canvas UI draws in screen space (after the camera transform is restored). Coordinates are pixel positions on screen, not world positions.

**Access:** `engine.ui` is the CanvasUI instance. Available from scene `setup()`, `update()`, and system `run()` callbacks.

### Primitives

#### text()

Draw text at screen coordinates. Supports styled tags.

```typescript
ui.text(x: number, y: number, text: string, opts?: UITextOpts): void

interface UITextOpts {
  color?: string;    // default '#e0e0e0'
  font?: string;     // default '16px "Fira Code", monospace'
  glow?: string;     // shadow glow color
  align?: 'left' | 'center' | 'right';  // default 'left'
  opacity?: number;  // 0-1
}
```

When `text` contains style tags (e.g. `[#ff0]yellow[/]`), the tags are parsed and each segment is rendered with its own color/font/opacity/background. Alignment is computed on the stripped (plain) text width.

**Example:**
```typescript
engine.ui.text(10, 10, 'Score: [#ff0]1250[/]', { font: '20px "Fira Code", monospace' });
engine.ui.text(engine.centerX, 50, 'GAME OVER', { align: 'center', color: '#ff0000', glow: '#ff0000' });
```

#### effectText()

Draw text with per-character effects (wave, shake, rainbow, etc).

```typescript
ui.effectText(x: number, y: number, text: string, effectFn: TextEffectFn, opts?: UITextOpts): void
```

Each character is positioned individually using `ctx.measureText().width` for the per-character widths. The effect function receives `(charIndex, totalChars, uiTime)` and returns a `CharTransform`.

**Example:**
```typescript
import { wave, rainbow, compose } from '@engine';
engine.ui.effectText(engine.centerX, 200, 'PRESS START', compose(wave(3), rainbow()), {
  align: 'center',
  font: '28px "Fira Code", monospace',
});
```

#### panel()

Draw a bordered panel with optional background and title.

```typescript
ui.panel(x: number, y: number, w: number, h: number, opts?: UIPanelOpts): void

interface UIPanelOpts {
  border?: BorderStyle;     // default 'single'
  bg?: string;              // default 'rgba(0,0,0,0.85)'
  borderColor?: string;     // default '#444444'
  title?: string;           // centered on top border
  anchor?: Anchor;          // default 'topLeft'
  font?: string;            // border/title font
}
```

**Border styles:**
| Style | Characters |
|---|---|
| `single` | `─ │ ┌ ┐ └ ┘` |
| `double` | `═ ║ ╔ ╗ ╚ ╝` |
| `rounded` | `─ │ ╭ ╮ ╰ ╯` |
| `heavy` | `━ ┃ ┏ ┓ ┗ ┛` |
| `ascii` | `- \| + + + +` |
| `dashed` | `╌ ╎ ┌ ┐ └ ┘` |
| `none` | no border |

**Anchors** resolve `(x, y)` relative to the panel rectangle:
| Anchor | Behavior |
|---|---|
| `topLeft` | (x, y) is the top-left corner |
| `topCenter` | (x, y) is the top-center edge |
| `center` | (x, y) is the center |
| `bottomRight` | (x, y) is the bottom-right corner |
| (etc.) | |

#### textPanel()

Auto-sized panel that shrinkwraps to fit text content. Measures text with `layoutTextBlock()`, computes content dimensions, adds padding, and draws a bordered panel.

```typescript
ui.textPanel(x: number, y: number, text: string, opts?: UITextPanelOpts): void

interface UITextPanelOpts {
  maxWidth?: number;      // default 400
  border?: BorderStyle;   // default 'single'
  anchor?: Anchor;        // default 'topLeft'
  color?: string;         // text color
  font?: string;
  padding?: number;       // default 12
  bg?: string;
  borderColor?: string;
  glow?: string;
  title?: string;         // header with separator line
}
```

If a `title` is provided, it renders as a centered header with a horizontal separator below it (matching `UIMenu` style). The title width is factored into the panel's minimum width.

#### bar()

ASCII progress bar using fill/empty characters.

```typescript
ui.bar(x: number, y: number, width: number, ratio: number, opts?: UIBarOpts): void

interface UIBarOpts {
  fillColor?: string;    // default '#00ff88'
  emptyColor?: string;   // default '#333333'
  label?: string;        // text after the bar
  labelColor?: string;
  font?: string;
  fillChar?: string;     // default '█'
  emptyChar?: string;    // default '░'
}
```

`width` is the number of characters, not pixels. `ratio` is clamped to 0-1.

**Example:**
```typescript
engine.ui.bar(10, 50, 20, player.health / player.maxHealth, {
  fillColor: '#ff4444',
  label: `HP ${player.health}/${player.maxHealth}`,
});
```

#### inlineRun()

Draw a single line of mixed-font/color text -- badges, chips, inline icons. Each chunk keeps its own font/color/background.

```typescript
ui.inlineRun(x: number, y: number, chunks: UIInlineChunk[], opts?: UIInlineRunOpts): number

interface UIInlineChunk {
  text: string;
  font?: string;
  color?: string;
  bg?: string;       // solid background behind chunk
  padX?: number;     // horizontal padding inside background
}

interface UIInlineRunOpts {
  font?: string;     // base font
  color?: string;    // base color
  gap?: number;      // pixels between chunks, default 0
  maxWidth?: number;  // skip trailing chunks that overflow
}
```

Returns the total drawn width in pixels. Chunks that would exceed `maxWidth` are silently skipped.

**Example:**
```typescript
engine.ui.inlineRun(10, 80, [
  { text: ' LVL 5 ', bg: '#333', color: '#0f8', padX: 4 },
  { text: ' WARRIOR ', bg: '#600', color: '#faa', padX: 4 },
  { text: '  ATK: 42', color: '#ccc' },
], { gap: 8 });
```

### Measurement Helpers

```typescript
// Measure text width (delegates to Pretext, cached)
ui.measureWidth(text: string, font: string): number

// Measure text height (multi-line at maxWidth)
ui.measureHeight(text: string, font: string, maxWidth: number, lineHeight: number): number

// Get the width of a single monospace character
ui.charWidth(font: string): number
```

`charWidth()` uses the canvas `measureText('M').width` and caches by font string. Used internally for border drawing, bar layout, and scrollbar positioning.

### UIMenu

Keyboard-navigable menu with selection, confirmation, and cancellation.

**Constructor:**
```typescript
new UIMenu(items: string[], opts?: UIMenuOpts)

interface UIMenuOpts {
  border?: BorderStyle;       // default 'single'
  title?: string;
  selectedColor?: string;     // default '#00ff88'
  borderColor?: string;
  bg?: string;
  anchor?: Anchor;
  font?: string;
  color?: string;
  onMove?: () => void;        // callback on selection change
}
```

**Usage pattern:**
```typescript
const menu = new UIMenu(['New Game', 'Continue', 'Options'], {
  title: 'MAIN MENU',
  border: 'double',
});

// In scene update:
menu.update(engine);
menu.draw(engine.ui, engine.centerX, engine.centerY);

if (menu.confirmed) {
  switch (menu.selectedIndex) {
    case 0: engine.loadScene('play'); break;
    case 1: engine.loadScene('continue'); break;
    case 2: engine.loadScene('options'); break;
  }
}
if (menu.cancelled) engine.loadScene('title');
```

**Input:** ArrowUp/W, ArrowDown/S navigate. Enter/Space confirms. Escape cancels. Set `menu.active = false` to disable input.

**Hit testing:** `menu.isPointInside(x, y)` checks bounds. `menu.getHoveredItem(x, y)` returns the item index under a point (for mouse interaction).

**Rendering:** Selected item shows `►` prefix in `selectedColor`. Title shows centered with a horizontal separator below. Panel auto-sizes to the widest item.

### DialogManager

Typewriter dialog with optional choices. Promise-based -- `show()` and `choice()` return promises that resolve when the player dismisses or selects.

**Constructor:** `new DialogManager()` (no options -- options are per-call).

**API:**
```typescript
// Show text with typewriter effect. Resolves when dismissed.
dialog.show(text: string, opts?: UIDialogOpts): Promise<void>

// Show text with choices. Resolves with the selected index.
dialog.choice(text: string, choices: string[], opts?: UIChoiceOpts): Promise<number>

interface UIDialogOpts {
  speaker?: string;
  typeSpeed?: number;      // chars per second, default 40. 0 = instant.
  border?: BorderStyle;    // default 'double'
  onChar?: (ch: string) => void;  // callback per revealed character
  font?: string;
  color?: string;
  bg?: string;
  borderColor?: string;
  speakerColor?: string;
}
```

**Access:** `engine.dialog` is the DialogManager. Its `draw()` is called automatically by the engine before the main render.

**Typewriter behavior:**
- Characters reveal at `typeSpeed` chars/sec.
- Enter/Space during reveal skips to full text.
- After full reveal: Enter/Space dismisses (or confirms choice).
- Choices navigate with ArrowUp/Down, confirm with Enter/Space.
- A blinking `▼` indicator appears when text is fully revealed (non-choice mode).

**Layout:** Panel is centered near the bottom of the screen, max 500px or 90% of screen width. Layout is recomputed when viewport width changes.

**Example:**
```typescript
await engine.dialog.show('Welcome, traveler.', { speaker: 'Elder', typeSpeed: 60 });
const choice = await engine.dialog.choice('Will you help?', ['Yes', 'No'], { speaker: 'Elder' });
```

### UIScrollPanel

Scrollable list panel with keyboard, mouse wheel, and page navigation.

**Constructor:**
```typescript
new UIScrollPanel(items: string[], viewportRows: number, width: number, opts?: UIScrollPanelOpts)

interface UIScrollPanelOpts {
  font?: string;
  color?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  padding?: number;         // default 8
  title?: string;
  anchor?: Anchor;
  scrollbarTrack?: string;  // default '░'
  scrollbarThumb?: string;  // default '█'
  scrollbarColor?: string;
  lineHeight?: number;
}
```

**Input:** ArrowUp/Down scroll one row. PageUp/PageDown scroll a full viewport. Home/End jump to start/end. Mouse wheel scrolls when the cursor is inside the panel bounds (uses hit-test from previous frame's drawn position).

**Rendering:** Draws directly to a `CanvasRenderingContext2D` (not queued into CanvasUI). Uses `ctx.clip()` to clip content to the viewport area. Scrollbar track and thumb are drawn with ASCII characters.

**Dynamic content:** Call `panel.setItems(newItems)` to update content; scroll offset is clamped automatically.

### UIGrid

Keyboard and mouse-navigable grid of cells. Used for inventories, map selectors, etc.

**Constructor:**
```typescript
new UIGrid(
  cells: UIGridCell[], cols: number, rows: number,
  cellWidth: number, cellHeight: number, opts?: UIGridOpts
)

interface UIGridCell {
  text?: string;
  icon?: string;
  color?: string;
  bg?: string;
  empty?: boolean;  // renders emptyChar in emptyColor
}
```

**Input:** Arrow keys navigate. Enter/Space confirms. Mouse click on a cell selects and confirms. `grid.selectedIndex`, `grid.selectedRow`, `grid.selectedCol`, `grid.selectedCell` expose current state. `grid.confirmed` is true for one frame after confirmation.

### UITooltip

Floating tooltip that follows a target position with auto-flip to stay on screen.

```typescript
new UITooltip(opts?: UITooltipOpts)

tooltip.show(text: string, x: number, y: number): void
tooltip.hide(): void
tooltip.updateHover(engine, hitX, hitY, hitW, hitH, text): void  // convenience
tooltip.draw(ctx, screenW, screenH): void
```

Auto-flips horizontally if extending past the right edge, vertically if extending past the bottom. Content is word-wrapped via `layoutTextBlock()`.

### UITabs

Tabbed panel with keyboard (Tab, ArrowLeft/Right) and mouse click navigation.

```typescript
new UITabs(tabs: UITabDef[], width: number, height: number, opts?: UITabsOpts)

interface UITabDef {
  label: string;
  render: (ctx, contentX, contentY, contentW, contentH) => void;
}
```

Each tab has a `render` callback that receives the clipped content area. The active tab label has a background highlight, and a horizontal separator below the tab bar has a gap under the active tab (classic tab UI pattern).

---

## Particles

The particle system (`engine/render/particles.ts`) manages lightweight text particles -- NOT ECS entities. They exist in a flat array with object pooling for allocation efficiency.

### ParticlePool

```typescript
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  char: string;
  color: string;
  life: number;       // remaining seconds
  maxLife: number;
  font: string;
}

class ParticlePool {
  particles: Particle[] = [];
  private pool: Particle[] = [];  // recycled objects
}
```

**Lifecycle:**
1. `burst()` spawns particles from the pool (or allocates new ones).
2. `update(dt)` advances position by velocity, applies slight gravity (`vy += 50 * dt`), decrements life. Dead particles are returned to the pool via swap-and-pop (O(1) removal).
3. `render(ctx)` draws each particle as a single `fillText` call with alpha based on remaining life ratio.

### burst() Options

```typescript
particles.burst({
  x: number, y: number,
  count: number,
  chars: string | string[],     // random pick per particle
  color: string,
  speed?: number,               // default 100
  spread?: number,              // radians, default 2*PI (all directions)
  lifetime?: number,            // default 1 second
  font?: string,
});
```

Each particle gets a random angle within `spread` (centered upward), random speed between `30%-100%` of `speed`, and random lifetime between `50%-100%` of `lifetime`.

### Convenience Methods

```typescript
// 25 fire chars + 10 embers
particles.explosion(x, y, color?: string)

// 8 sparkle chars
particles.sparkle(x, y, color?: string)

// 6 smoke chars
particles.smoke(x, y, color?: string)

// Remove all particles
particles.clear()
```

**Access:** `engine.particles` is the ParticlePool. Particles render automatically in world space (inside the camera transform, after entity drawing).

---

## Transitions

Scene transitions (`engine/render/transitions.ts`) overlay the entire screen during scene changes.

### Transition Types

| Type | Effect |
|---|---|
| `fade` | Fade to/from black |
| `fadeWhite` | Fade to/from white |
| `wipe` | Black rectangle sweeps left-to-right / right-to-left |
| `dissolve` | ASCII characters fill the screen with deterministic noise |
| `scanline` | Horizontal lines sweep from top to bottom |
| `none` | Instant cut |

### Two-Phase Model

Transitions have two phases:
1. **Out** (`alpha: 0 -> 1`): Screen fades/wipes to the transition overlay.
2. **Midpoint**: The `onMidpoint` callback fires (this is where scene loading happens).
3. **In** (`alpha: 1 -> 0`): The overlay fades/wipes away, revealing the new scene.

```typescript
class Transition {
  type: TransitionType;
  duration: number;       // duration of each half
  phase: 'out' | 'in';
  active: boolean;
  error: Error | null;

  start(onMidpoint?: () => void | Promise<void>): void;
  update(dt: number): void;
  render(ctx, width, height): void;
}
```

**Async safety:** If `onMidpoint` returns a Promise, the transition pauses at full opacity until the promise resolves. A safety timeout (default 5 seconds) forces the transition to continue if the loader hangs.

**Error recovery:** If `onMidpoint` rejects, the error is stored in `transition.error` and the transition proceeds to the `in` phase anyway.

**Usage** (handled automatically by `engine.loadScene()`):
```typescript
engine.loadScene('play', { transition: 'fade', duration: 0.5 });
```

### dissolve Effect Details

The dissolve transition is particularly thematic for an ASCII engine. It fills the screen with a grid of box-drawing characters (`░▒▓█╬╠╣╦╩╗╔╚╝─│┌┐└┘`), using deterministic pseudo-random thresholds per cell so the pattern is consistent frame-to-frame at the same alpha value.

---

## Camera

The camera system (`engine/render/camera.ts`) provides pan, zoom, follow, shake, and coordinate conversion.

### State

```typescript
class Camera {
  x: number; y: number;          // world position (center of viewport)
  zoom: number;                   // 1 = normal
  shakeX: number; shakeY: number; // current shake offset
  viewWidth: number; viewHeight: number;  // viewport dimensions
  followTarget: CameraFollowTarget | null;
  followOpts: CameraFollowOpts;
  bounds: CameraBounds | null;
}
```

### Transform Application

The renderer applies the camera transform in this order:

```typescript
ctx.save();
ctx.translate(-camera.x + w / 2, -camera.y + h / 2);   // center camera on viewport
ctx.translate(camera.shakeX, camera.shakeY);              // shake offset
if (camera.zoom !== 1) {
  ctx.translate(camera.x, camera.y);                      // zoom around camera center
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}
```

### Follow

```typescript
// New API: follow an entity
camera.follow(target: CameraFollowTarget | null, opts?: CameraFollowOpts): void

// Legacy API: follow a point
camera.follow(x: number, y: number, smoothing?: number): void

interface CameraFollowOpts {
  smoothing?: number;    // lerp speed 0-1, default 0.1. 1 = instant snap.
  deadzone?: { width: number; height: number };  // no movement while inside
  lookahead?: number;    // offset toward velocity direction
  offset?: { x: number; y: number };             // constant offset from target
}
```

**Smoothing** is frame-rate independent: `t = 1 - (1 - smoothing)^(dt * 60)`.

**Deadzone** creates a rectangle around the camera center. The camera only moves when the follow target exits this rectangle. This produces "box follow" behavior -- the camera snaps to keep the target on the deadzone edge.

**Lookahead** adds `velocity * lookahead` to the effective target position, so the camera leads the movement direction.

### Bounds

```typescript
camera.setBounds({ minX: 0, minY: 0, maxX: worldWidth, maxY: worldHeight });
```

The camera viewport is clamped so it never shows areas outside the bounds. If bounds are smaller than the viewport, the camera centers on the bounds.

### Shake

```typescript
camera.shake(magnitude?: number)  // default 5
```

Each frame, random offsets within `[-magnitude, magnitude]` are applied. Magnitude decays exponentially: `magnitude *= 0.9^(dt * 60)`. Shake coexists with follow -- the follow lerp is applied to `(x, y)`, shake is a separate visual offset.

### Coordinate Conversion

```typescript
// Screen (mouse) coordinates -> world coordinates
camera.screenToWorld(screenX, screenY): Vec2

// World coordinates -> screen coordinates
camera.worldToScreen(worldX, worldY): Vec2
```

Both account for camera position, zoom, and shake offset. Round-trip is exact.

---

## Supporting Systems

### Debug Overlay

`engine/render/debug.ts` provides `DebugOverlay` with:

- **Error banners** -- red strips at the top of the screen. Always visible (even when debug mode is off). Auto-expire after a configurable duration. Deduplicated by message text.
- **Collider outlines** -- green stroked circles/rectangles, drawn in world space with the camera transform.
- **Entity count** -- bottom-left corner, shows total entities and collider count.
- **Profiler panel** (only when debug enabled):
  - FPS and frame time
  - Frame budget bar (green < 85%, amber 85-100%, red > 100% of 16.67ms)
  - Per-system timing table (name, last, avg, max -- sorted by avg descending)
  - Archetype counts (position+velocity, position+ascii, collider+tags, etc.)
  - Memory/queue stats (total entities, tween entities, scheduler tasks)

Toggle with backtick key or `engine.debug.toggle()`. Profiler timing tracking is automatically disabled when the overlay is hidden (zero overhead).

### Toast Notifications

`engine/render/toast.ts` provides floating text that drifts upward and fades out.

```typescript
engine.toast.show('+100', { x: entity.x, y: entity.y, color: '#ffcc00', duration: 1.5 });
engine.toast.showAt('+100', entity.x, entity.y, { color: '#ffcc00' });
```

Toasts render in world space (but after the camera restore, so coordinates are in screen space). When `x` or `y` is `-1`, the toast centers on screen.

### Viewport

`engine/render/viewport.ts` tracks display dimensions, orientation, and safe-area insets for mobile devices.

```typescript
engine.viewport.width      // window.innerWidth
engine.viewport.height     // window.innerHeight
engine.viewport.orientation // 'portrait' | 'landscape'
engine.viewport.safeArea   // { top, right, bottom, left } in pixels
```

Emits `viewport:resized` and `viewport:orientation` events via the shared event bus. Safe-area insets are read from CSS `env(safe-area-inset-*)` via a hidden probe element.

### Virtual Controls

Touch/mobile controls in `engine/render/virtual-controls.ts`:

- **VirtualJoystick** -- Analog stick returning `x`, `y` in -1..1 with configurable deadzone. Rendered as an outer ring with a thumb circle.
- **VirtualDpad** -- 4-button cross (up/down/left/right booleans). Rendered as four labeled squares.

Both use anchor-based positioning and can hide when not touched (`visibleOnlyOnTouch`).

### Image Loader

`engine/render/image-loader.ts` provides cached async image loading:

```typescript
const img = await engine.loadImage('/hero.png');      // cached + deduplicated
await engine.preloadImages(['/bg.jpg', '/enemy.png']); // batch load
const cached = getCachedImage('/hero.png');             // sync, null if not loaded
clearImageCache();                                      // free memory
```

---

## Extension Workflows

### Adding a New Renderable Entity Type

1. **Define the component type** in `shared/types.ts`:
```typescript
export interface MyRenderable {
  data: string;
  color: string;
  layer?: number;
}
```

2. **Add to the Entity interface** in `shared/types.ts`:
```typescript
export interface Entity {
  // ... existing components ...
  myRenderable: MyRenderable;
}
```

3. **Add collection in AsciiRenderer.render()** (`engine/render/ascii-renderer.ts`):
```typescript
// In the "Collect all renderables" section:
for (const e of world.with('position', 'myRenderable')) {
  renderables.push({ entity: e, layer: e.myRenderable.layer ?? 0, type: 'myRenderable' });
}
```

4. **Add the type to the Renderable interface:**
```typescript
interface Renderable {
  entity: Partial<Entity>;
  layer: number;
  type: 'ascii' | 'sprite' | 'textBlock' | 'image' | 'tilemap' | 'myRenderable';
}
```

5. **Add a case in the draw switch:**
```typescript
case 'myRenderable':
  this.drawMyRenderable(r.entity);
  break;
```

6. **Implement the draw method:**
```typescript
private drawMyRenderable(entity: Partial<Entity>): void {
  const { ctx } = this;
  const { x, y } = entity.position!;
  const mr = entity.myRenderable!;
  ctx.save();
  ctx.fillStyle = mr.color;
  // ... draw logic ...
  ctx.restore();
}
```

### Creating a New Canvas UI Primitive

Add a method to `CanvasUI` in `engine/render/canvas-ui.ts`:

```typescript
myPrimitive(x: number, y: number, data: MyData, opts?: MyOpts): void {
  const font = opts?.font ?? DEFAULT_FONT;
  const color = opts?.color ?? DEFAULT_COLOR;

  // Capture all values needed for rendering (closures reference these)
  this._queue.push(() => {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    // ... draw logic using captured values ...
    ctx.restore();
  });
}
```

Key rules:
- All values used inside the closure must be captured in local variables before `_queue.push()`.
- Use `measureLineWidth()` for text measurement (cached, no DOM).
- Use `_charWidth()` and `_lineHeight()` for monospace metrics.
- Use `_drawBorder()` for bordered panels.
- Use `resolveAnchor()` for anchor-based positioning.

### Creating a New Standalone UI Class

Follow the established pattern (UIMenu, UIScrollPanel, UIGrid, UITooltip, UITabs):

```typescript
export class UIMyWidget {
  active = true;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;

  constructor(opts?: MyWidgetOpts) { /* store options */ }

  update(engine: Engine): void {
    if (!this.active) return;
    // Read engine.keyboard, engine.mouse
    // Use _lastX/_lastY/_lastW/_lastH for mouse hit testing
  }

  draw(ui: CanvasUI, x: number, y: number): void {
    // Push to ui._queue or draw directly to ctx
    // Store _lastX/_lastY/_lastW/_lastH for next frame's hit testing
  }

  isPointInside(x: number, y: number): boolean {
    return x >= this._lastX && x <= this._lastX + this._lastW
        && y >= this._lastY && y <= this._lastY + this._lastH;
  }

  reset(): void { /* restore initial state */ }
}
```

### Adding a New Text Effect

Add a factory function to `engine/render/text-effects.ts`:

```typescript
export function myEffect(param1 = defaultValue): TextEffectFn {
  return (i, n, t) => {
    // i = character index (0-based)
    // n = total characters
    // t = scene time in seconds
    return {
      dx: 0,          // horizontal offset
      dy: 0,          // vertical offset
      color: undefined, // override color (or omit)
      opacity: undefined, // override opacity (or omit)
      scale: undefined,   // scale multiplier (or omit)
      char: undefined,    // substitute character (or omit)
    };
  };
}
```

Add a case to `textEffect()` for named preset access:
```typescript
case 'myEffect':
  return myEffect(o.param1);
```

Effects compose via `compose()` -- offsets add, color/char last-wins, opacity/scale multiply.

### Optimizing Text Rendering Performance

1. **Reuse text content.** The Pretext caching layer keys on `(text, font)`. Changing text every frame defeats the cache -- if possible, update text at a lower frequency.

2. **Avoid clearTextCache() during gameplay.** The LRU handles eviction automatically.

3. **Use measureLineWidth() for positioning, shrinkwrap() for sizing.** `measureLineWidth()` returns fractional precision for sub-pixel-accurate positioning. `shrinkwrap()` returns ceiled integers for container sizing that never clips.

4. **Batch styled text.** The `drawStyledRun()` method groups consecutive characters with the same style into single `fillText` calls. Fewer style changes = fewer draw calls.

5. **Pre-process long words.** Call `insertSoftHyphens()` on content with long words (technical terms, URLs) to enable better line breaking and avoid overflow.

6. **Mind the cache size.** Each LRU holds 512 entries. If you have more than 512 unique `(text, font)` combinations actively in use, the cache will thrash. Consider reducing text variety or increasing `MAX_CACHE_SIZE`.

7. **Don't call Pretext prepare() directly.** The renderer's caching layer wraps it. Bypassing the cache means duplicate preparation work. All public API functions (`measureLineWidth`, `layoutTextBlock`, etc.) go through the cache automatically.

8. **For per-character effects**, the engine uses `ctx.measureText().width` (not Pretext) for individual character widths. This is a Canvas API call, not a DOM reflow -- it is fast but not cached across frames. For static effect text that does not change content, the per-character measurement cost is negligible.
