# Rendering & Art Assets

Recipes for rendering, ASCII art, sprite caching, and visual effects. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Rendering

### Styled text tags
`engine.ui.text`, `engine.ui.multiline`, and `TextBlock` components parse inline tags.
```ts
engine.ui.text(20, 20, "[#ff4444]HP[/] 42/100  [b]x3[/b]  [dim]lvl 7[/dim]  [bg:#222]status[/bg]");
engine.spawn({
  position: { x: 200, y: 200 },
  textBlock: { text: "[#0f8]OK[/] — [b]Space[/b]", font: "16px monospace", maxWidth: 300, lineHeight: 20, color: "#e0e0e0" },
});
```

Supported tags: `[#hex]`, `[b]`, `[i]`, `[u]`, `[dim]`, `[bg:#hex]`, and their closing tags (`[/]`, `[/b]`, `[/i]`, `[/u]`, `[/dim]`, `[/bg]`).

### Mixed-font HUD row via `CanvasUI.inlineRun`
Each chunk keeps its own font / color / bg / padding, baseline-aligned. No wrapping.
```ts
import { FONTS } from "@engine";
engine.ui.inlineRun(16, 20, [
  { text: " HP ",     font: FONTS.bold,   color: "#fff",    bg: "#aa2233", padX: 4 },
  { text: " 42/100 ", font: FONTS.normal, color: "#e0e0e0",                padX: 4 },
  { text: " LVL 7 ",  font: FONTS.small,  color: "#aaa",    bg: "#222",    padX: 4 },
], { gap: 6 });
```

### Multi-line text block entity
Spawn a `textBlock` entity for auto-wrapping paragraphs in world space. Supports styled tags, alignment, justified layout, and obstacle flow.
```ts
engine.spawn({
  position: { x: 100, y: 50 },
  textBlock: {
    text: "The [b]Ancient Door[/b] is locked. [dim]A faint glow seeps through the cracks.[/dim]",
    font: '16px "Fira Code", monospace',
    maxWidth: 400,
    lineHeight: 22,
    color: "#d0d0d0",
    align: "left", // "left" | "center" | "right" | "justify"
  },
});
```

### Text flowing around obstacles
Any entity with `position` + `obstacle` automatically pushes `textBlock` layout aside.
```ts
engine.spawn({ position: { x: 300, y: 120 }, obstacle: { radius: 60 } });
engine.spawn({
  position: { x: 50, y: 80 },
  textBlock: { text: longDescription, font: FONTS.normal, maxWidth: 500, lineHeight: 20, color: "#ccc" },
});
```

### Text effects on entities
Attach `textEffect` to any `ascii`, `sprite`, or `textBlock` entity for per-character animation.
```ts
import { wave, shake, rainbow, compose } from "@engine";
engine.spawn({
  position: { x: 400, y: 200 },
  ascii: { char: "GAME OVER", font: '48px "Fira Code"', color: "#ff4444" },
  textEffect: { fn: compose(shake(3), rainbow(2)) },
});

// textBlock also supports per-character effects (plain text only)
engine.spawn({
  position: { x: 100, y: 100 },
  textBlock: {
    text: "The ancient door creaks open...",
    font: '16px "Fira Code", monospace', maxWidth: 300, lineHeight: 22, color: "#d0d0d0",
  },
  textEffect: { fn: wave(4, 0.3, 2) },
});
```

### Screen-space multiline text
`engine.ui.multiline()` renders wrapped text without a panel — useful for subtitles, credits, or inline descriptions.
```ts
const h = engine.ui.multiline(20, 80, longDescription, 360, {
  font: FONTS.small,
  color: "#aaa",
  align: "left", // "left" | "center" | "right"
  lineHeight: 18,
});
```

### Canvas text input
`UITextField` is a fully canvas-rendered text input with Pretext-powered cursor positioning.
It works on desktop (keyboard) and mobile (hidden DOM input triggers on-screen keyboard).
```ts
import { UITextField } from "@engine";

const nameField = new UITextField({
  width: 240,
  placeholder: "Enter your name...",
  maxLength: 16,
  font: FONTS.normal,
  color: "#e0e0e0",
});

// In your scene update:
nameField.update(engine);
nameField.draw(engine.ui, 100, 200);

if (nameField.confirmed) {
  engine.toast.show(`Hello, ${nameField.value}!`);
}
```

### Scrollable text view
`UITextView` displays long wrapped text in a scrollable viewport — ideal for lore, credits, and dialog history.
```ts
import { UITextView } from "@engine";

const lore = new UITextView({ width: 360, height: 200, align: "left" });
lore.setText(longLoreParagraph);

// In your scene update:
lore.update(engine); // ArrowUp/Down/PageUp/Down/Home/End
lore.draw(engine.ui, 20, 80);

// Mouse wheel (wire from your own event handler):
lore.scrollBy(-30); // scroll up 30px
```

### Text measurement helpers
Use Pretext-powered measurement without spawning entities.
```ts
import { measureHeight, shrinkwrap, getLineCount, measureLineWidth } from "@engine";
const h = measureHeight(text, font, 400, 20);
const tightW = shrinkwrap(text, font, 400);
const lines = getLineCount(text, font, 400);
const singleLineW = measureLineWidth("Score: 1234", font);
```

### Camera follow + deadzone + bounds
```ts
const player = engine.findByTag("player")!;
engine.camera.follow(player, {
  smoothing: 0.15, deadzone: { width: 120, height: 80 },
  lookahead: 0.25, offset: { x: 0, y: -20 },
});
engine.camera.setBounds({ minX: 0, minY: 0, maxX: 2000, maxY: 1200 });
```

### Floating text / toast / particles / shake
```ts
engine.floatingText(x, y - 12, "-7", "#ff4444");
engine.toast.show("Wave 3", { y: 80, color: "#ffcc00" });
engine.particles.burst({ x, y, count: 16, chars: ["*", "."], color: "#fa0", speed: 140, lifetime: 0.6 });
engine.particles.explosion(x, y, "#f44");
engine.particles.sparkle(x, y, "#ff0");
engine.camera.shake(6);
```

### Scene transition (fade, wipe, dissolve)
```ts
engine.loadScene("gameOver", { transition: "fade", duration: 0.4, data: { score } });
// fade | fadeWhite | wipe | dissolve | scanline
```

## Art Assets & Sprite Caching

The `ArtAsset` type and bitmap caching system provide a structured way to
define, reuse, and efficiently render multi-line ASCII art. Static art is
rendered once to an offscreen canvas and drawn via `drawImage()` every frame,
while interactive art decomposes into per-character physics entities.

### Defining Art Assets

Store reusable ASCII art as exported `ArtAsset` objects. Each asset bundles
lines, per-character colors, a base color, and optional font/glow settings:

```ts
// game/art/dragon.ts
import type { ArtAsset } from '@engine'

export const DRAGON: ArtAsset = {
  lines: [
    "   /\\_/\\   ",
    "  ( o.o )  ",
    "   > ^ <   ",
  ],
  colorMap: {
    "o": "#ffcc00",  // eyes
    "^": "#ff4444",  // nose
    "/": "#888888",  // whiskers
    "\\": "#888888",
  },
  color: "#cccccc",
}
```

The `ArtAsset` interface:

```ts
interface ArtAsset {
  lines: string[];
  colorMap?: Record<string, string>;  // per-character color overrides
  font?: string;                      // default: '16px "Fira Code", monospace'
  color?: string;                     // base color (fallback when char not in colorMap)
  glow?: string;                      // CSS glow color
}
```

### Spawning Static Art (Bitmap-Cached)

`engine.spawnArt()` renders the art once to an offscreen canvas, then draws
it as a single `drawImage()` call every frame. Ideal for backgrounds,
decorations, and any art that does not need per-character physics:

```ts
import { DRAGON } from '../art/dragon'

engine.spawnArt(DRAGON, { position: { x: 400, y: 300 }, layer: 1 })
// Rendered once to offscreen canvas, drawn as image every frame
// Spaces are transparent — layers compose naturally
```

### Spawning Interactive Art (Physics)

`engine.spawnInteractiveArt()` decomposes the art into per-character physics
entities, each with spring-to-home behavior. Use for text or art that reacts
to the cursor, collisions, or explosions:

```ts
import { DRAGON } from '../art/dragon'

engine.spawnInteractiveArt(DRAGON, {
  position: { x: 400, y: 300 },
  spring: SpringPresets.bouncy,
  tags: ["dragon"],
})
engine.addSystem(createCursorRepelSystem({ radius: 100 }))
// Each character is a physics entity that reacts to cursor
```

### Using artFromString for Inline Art

`artFromString()` parses a template literal into an `ArtAsset`, automatically
stripping leading/trailing blank lines and common indentation. Convenient for
small inline art that does not warrant its own file:

```ts
import { artFromString } from '@engine'

const HOUSE = artFromString(`
  /\\
 /  \\
 |  |
 |__|
`, { "/": "#884422", "\\": "#884422", "|": "#aa8855", "_": "#666" })
```

The second argument is an optional `colorMap`. The return value is a full
`ArtAsset` that you can pass to `spawnArt()` or `spawnInteractiveArt()`.

### ColorMap for Multi-Colored Sprites

The `colorMap` field maps individual characters to CSS color strings. The
base `color` field acts as the fallback for any character not present in the
map. This lets you color specific parts of an art asset without splitting it
into separate sprites:

```ts
const POTION: ArtAsset = {
  lines: [
    " _ ",
    "[_]",
    "|~|",
    "|_|",
  ],
  color: "#aaaaaa",      // default for all characters
  colorMap: {
    "~": "#44ccff",      // liquid
    "_": "#666666",      // cork / base
    "[": "#aa8855",      // bracket left
    "]": "#aa8855",      // bracket right
  },
}
```

Characters not in the `colorMap` inherit the base `color`. If neither is set,
the renderer uses its default text color.

### Space Transparency

Spaces in art asset lines are **not rendered** — they are fully transparent.
This means layered sprites compose naturally: an upper-layer sprite's spaces
do not overwrite lower layers with invisible rectangles. You can freely
overlap art assets at different positions and layers without masking artifacts.

```ts
// These two sprites overlap — spaces in the tree do not hide the house
engine.spawnArt(HOUSE, { position: { x: 200, y: 300 }, layer: 0 })
engine.spawnArt(TREE, { position: { x: 220, y: 280 }, layer: 1 })
```

This also means you can pad art lines with spaces for alignment without any
visual cost.

### Static vs Interactive — When to Use Each

| Use case | API | Performance |
|---|---|---|
| Background scenery | `engine.spawnArt()` | One `drawImage` per frame |
| Decorative elements | `engine.spawnArt()` | One `drawImage` per frame |
| Interactive text | `engine.spawnInteractiveArt()` | N `fillText` calls (one per char) |
| Breakable / scatterable art | `engine.spawnInteractiveArt()` | N `fillText` calls (one per char) |
| Title screens (mouse-reactive) | `engine.spawnInteractiveArt()` | N `fillText` calls (one per char) |
| Scenery with many instances | `engine.spawnArt()` | One `drawImage` per instance per frame |

**Rule of thumb:** Use `spawnArt()` by default. Switch to
`spawnInteractiveArt()` only when you need per-character physics, collisions,
or individual character manipulation.

### Combining Art Assets with Existing Sprite APIs

`ArtAsset` objects are compatible with the existing `spawnSprite()` and
`createAsciiSprite()` APIs. Use whichever entry point fits your workflow:

```ts
// ArtAsset approach (structured, reusable, bitmap-cached)
engine.spawnArt(DRAGON, { position: { x: 400, y: 300 } })

// spawnSprite approach (per-char physics, same art data)
engine.spawnSprite({
  lines: DRAGON.lines,
  font: DRAGON.font ?? '16px "Fira Code", monospace',
  position: { x: 400, y: 300 },
  color: DRAGON.color ?? '#e0e0e0',
  spring: SpringPresets.bouncy,
})

// createAsciiSprite approach (returns a sprite component to spread into spawn)
engine.spawn({
  position: { x: 400, y: 300 },
  ...createAsciiSprite(DRAGON.lines.join('\n'), {
    colorMap: DRAGON.colorMap,
    color: DRAGON.color,
  }),
})
```
