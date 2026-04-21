---
name: canvas-ui
description: Use when building canvas-only game UI (no React), working with `engine.ui.*` draw calls (`text`, `panel`, `textPanel`, `bar`, `effectText`, `inlineRun`), `UIMenu` (keyboard/mouse-navigable menus), `DialogManager` (typewriter dialog with choices), `UIScrollPanel` (scrollable lists), `UIGrid` (2D selectable grids), `UITooltip` (hover popups), `UITabs` (tabbed interfaces), styled text tags (`[#hex]`, `[b]`, `[dim]`, `[bg:#hex]`), border styles (`single`, `double`, `rounded`, `heavy`, `ascii`, `dashed`), or designing HUD layouts rendered directly to canvas. Also use when suppressing React overlay for canvas-only games.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Canvas UI subsystem

All UI rendered directly to the HTML Canvas — no DOM elements, no React for these components. This is the primary UI system for `defineGame` games, roguelikes, and any canvas-only game.

## Why canvas UI instead of React

- **Single render target:** Everything draws to the same canvas — no z-index coordination between DOM and canvas
- **Consistent aesthetic:** UI uses the same ASCII font and styling as game entities
- **Portable:** Works in headless/server environments (no DOM needed)
- **Performance:** No React reconciliation overhead for frequently-updating HUD elements (score, health, timers)

React overlay exists for games that want it (menu screens, pause modals). Canvas UI is for in-game HUD, menus, and dialogs that feel part of the game world.

## Source file

**`engine/render/canvas-ui.ts`** (~2000 lines) — contains `CanvasUI` and all 6 component classes.

## Architecture: immediate-mode draw queue

`CanvasUI` uses an **immediate-mode** pattern:

1. Game code calls `engine.ui.text(...)`, `engine.ui.panel(...)`, etc. during update
2. Each call enqueues a **draw closure** into `_queue`
3. During `render()`, all closures execute in order against the canvas context
4. Queue is cleared after render

**Why immediate-mode?** No retained state to sync. No "did the panel move?" diffing. Every frame, you declare exactly what to draw. Matches how game state flows — entity positions change every frame, and so does UI.

**Hit testing:** Components store `_lastX/_lastY/_lastW/_lastH` during draw. Mouse interaction checks these cached bounds. This bridges immediate-mode rendering with stateful interaction.

## CanvasUI core draw functions

All called via `engine.ui.*`:

### `text(x, y, text, opts?)`

Draw styled text at a position.

```typescript
engine.ui.text(10, 10, '[#ff4444]HP: [b]47[/b][/] / 100', {
  font: '16px monospace',
  color: '#ffffff',
  align: 'left',     // 'left' | 'center' | 'right'
  maxWidth: 300,      // word-wrap at this width
  lineHeight: 20,
})
```

Supports styled text tags: `[#hex]`, `[b]`, `[dim]`, `[bg:#hex]` (see styled text section below).

### `effectText(x, y, text, effectFn, opts?)`

Per-character animated text.

```typescript
engine.ui.effectText(100, 50, 'GAME OVER', (charIndex, totalChars, time) => ({
  offsetX: Math.sin(time * 3 + charIndex * 0.5) * 4,
  offsetY: Math.cos(time * 2 + charIndex * 0.3) * 3,
  color: `hsl(${(charIndex / totalChars) * 360}, 80%, 60%)`,
  scale: 1 + Math.sin(time * 4 + charIndex) * 0.1,
}), { font: '32px monospace' })
```

The `effectFn` returns a `CharTransform` per character per frame. Use for title screens, boss names, damage numbers.

### `panel(x, y, w, h, opts?)`

Bordered box with optional title.

```typescript
engine.ui.panel(50, 50, 200, 150, {
  border: 'double',    // 'single' | 'double' | 'rounded' | 'heavy' | 'ascii' | 'dashed' | 'none'
  title: 'Inventory',
  bg: '#111111',
  color: '#888888',
  padding: 8,
  font: '14px monospace',
})
```

**Border characters (Unicode box-drawing):**

| Style | Top-left | Horizontal | Vertical | Example |
|---|---|---|---|---|
| `single` | `┌` | `─` | `│` | `┌──┐` |
| `double` | `╔` | `═` | `║` | `╔══╗` |
| `rounded` | `╭` | `─` | `│` | `╭──╮` |
| `heavy` | `┏` | `━` | `┃` | `┏━━┓` |
| `ascii` | `+` | `-` | `\|` | `+--+` |
| `dashed` | `┌` | `╌` | `╎` | `┌╌╌┐` |

### `textPanel(x, y, text, opts?)`

Auto-sizing panel that shrinkwraps to fit text content.

```typescript
engine.ui.textPanel(100, 100, 'You found a [#ffcc00]Golden Key[/]!', {
  maxWidth: 250,
  border: 'rounded',
  padding: 12,
})
```

Measures text width and height, then draws a panel sized to fit. Uses Pretext for measurement.

### `bar(x, y, width, ratio, opts?)`

ASCII progress bar.

```typescript
engine.ui.bar(10, 30, 20, health / maxHealth, {
  fillChar: '█',
  emptyChar: '░',
  fillColor: '#00ff88',
  emptyColor: '#333333',
  font: '14px monospace',
})
```

### `inlineRun(x, y, chunks, opts?)`

Mixed font/color inline text — for badges, chips, status indicators.

```typescript
engine.ui.inlineRun(10, 50, [
  { text: 'LVL ', font: '12px monospace', color: '#888' },
  { text: '12', font: '14px monospace', color: '#ffcc00' },
  { text: ' ★', font: '14px monospace', color: '#ff8800' },
])
```

Each chunk can have its own font, color, and background. Chunks are measured and laid out inline (left-to-right).

## UIMenu — keyboard/mouse navigable

```typescript
const menu = new UIMenu(engine, {
  x: 100, y: 100,
  items: ['New Game', 'Continue', 'Settings', 'Quit'],
  font: '16px monospace',
  color: '#cccccc',
  selectedColor: '#00ff88',
  border: 'single',
})

// In update loop:
menu.update(engine)    // handles ArrowUp/Down, Enter, Escape, mouse hover/click

if (menu.confirmed) {
  switch (menu.selectedIndex) {
    case 0: startNewGame(); break
    case 1: loadGame(); break
    // ...
  }
}
if (menu.cancelled) goBack()
```

**Features:**
- Keyboard: ArrowUp/Down to navigate, Enter to confirm, Escape to cancel
- Mouse: hover highlights, click confirms
- Prefix indicator: `"► "` for selected, `"  "` for unselected
- `confirmed` and `cancelled` are one-frame flags (reset after read)

## DialogManager — typewriter text with choices

```typescript
// Simple text
engine.dialog.show('Welcome to the dungeon.', {
  speaker: 'NPC',
  typeSpeed: 30,      // characters per second
  border: 'double',
})

// With choices
const choice = await engine.dialog.choice('Which path?', [
  'Go left',
  'Go right',
  'Turn back',
])
// choice: 0, 1, or 2
```

**Features:**
- Typewriter effect (configurable speed)
- Speaker name label
- Auto-sizing based on screen width (90% max, 500px limit)
- Blinking `▼` press-to-continue indicator
- Choice prompts with keyboard/mouse selection
- Choice highlighting with alternate border/background

**For branching dialog, use `runDialogTree()` from `/ascii-games-dev:behaviors`** — it orchestrates the dialog manager.

## UIScrollPanel — scrollable lists

```typescript
const scroll = new UIScrollPanel(engine, {
  x: 50, y: 50,
  width: 300, height: 200,
  items: inventoryItems.map(i => `${i.icon} ${i.name} x${i.count}`),
  font: '14px monospace',
  color: '#cccccc',
  border: 'single',
})

scroll.update(engine)   // Arrow/Page/Home/End keys, mouse wheel
scroll.render(engine)
```

**Features:**
- Keyboard: Arrow keys (one item), Page Up/Down (page), Home/End
- Mouse: scroll wheel
- Scrollbar with track + thumb visualization
- Content area clipping

## UIGrid — 2D selectable grid

```typescript
const grid = new UIGrid(engine, {
  x: 100, y: 100,
  cols: 4, rows: 3,
  cellWidth: 48, cellHeight: 48,
  cells: items.map(i => ({
    text: i.icon,
    label: i.name,
    color: i.rarity === 'rare' ? '#ffcc00' : '#cccccc',
    bg: '#1a1a1a',
  })),
  border: 'single',
  selectedBorder: 'double',
})

grid.update(engine)     // Arrow keys, mouse click
if (grid.confirmed) useItem(grid.selectedIndex)
```

**Features:**
- Keyboard: arrow keys for 2D navigation
- Mouse: click to select
- Per-cell icon, text, colors, backgrounds
- Selected cell highlight (alternate border/background)

## UITooltip — hover popups

```typescript
const tooltip = new UITooltip(engine, {
  font: '12px monospace',
  color: '#cccccc',
  bg: '#222222',
  border: 'rounded',
  maxWidth: 200,
})

// In update:
if (hoveredItem) {
  tooltip.show(engine.mouse.x + 10, engine.mouse.y + 10, hoveredItem.description)
} else {
  tooltip.hide()
}
tooltip.render(engine)
```

**Features:**
- Auto-positioned (flips to stay on screen)
- Show/hide with optional offset from cursor
- Shrinkwrap sizing

## UITabs — tabbed interface

```typescript
const tabs = new UITabs(engine, {
  x: 50, y: 50,
  width: 400,
  tabs: ['Stats', 'Inventory', 'Quests'],
  font: '14px monospace',
  color: '#888888',
  activeColor: '#00ff88',
})

tabs.update(engine)     // Tab/Shift+Tab, arrow keys, mouse click

// Render content based on active tab
switch (tabs.activeIndex) {
  case 0: renderStats(engine); break
  case 1: renderInventory(engine); break
  case 2: renderQuests(engine); break
}
tabs.render(engine)
```

## Styled text tags

Used by `engine.ui.text()`, `engine.ui.textPanel()`, and `engine.dialog.show()`:

| Tag | Effect | Example |
|---|---|---|
| `[#rrggbb]...[/]` | Text color (also `[#rgb]`) | `[#ff4444]damage[/]` |
| `[b]...[/b]` | Bold | `[b]critical hit[/b]` |
| `[dim]...[/dim]` | 50% opacity | `[dim]secondary[/dim]` |
| `[bg:#rrggbb]...[/bg]` | Background highlight | `[bg:#333]selected[/bg]` |

Tags nest and stack. Strip all with `stripTags(text)`.

## Suppressing React for canvas-only games

Return empty screens and HUD from `setupGame()`:

```typescript
const Empty = () => null

export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(myGame),  // or a scene name
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  }
}
```

React still mounts but renders nothing visible. Canvas fills the viewport. All UI handled by `engine.ui.*` and the component classes above.

## Things NOT to do

- Don't mix React and canvas UI for the same element — pick one per UI piece.
- Don't call `engine.ui.*` outside of `update()` or `render()` callbacks — the draw queue is flushed each frame.
- Don't cache CanvasUI component instances across scenes — create fresh ones in scene setup.
- Don't use `ctx.fillText()` directly for UI — go through `engine.ui.text()` which handles styled text, alignment, and wrapping.
- Don't forget to call `.update(engine)` on interactive components (UIMenu, UIScrollPanel, etc.) — they need it for keyboard/mouse input.
