# UI and Store Bridge Guide

Complete reference for the dual UI architecture: Canvas UI (immediate-mode, drawn on the game canvas) and React overlay (HTML elements on top of the canvas), connected by the zustand store bridge.

---

## The Dual UI Architecture

The engine provides two independent UI systems that coexist in a strict layering order:

1. **Canvas UI** (`engine.ui`, `engine.dialog`, plus standalone classes like `UIMenu`): Immediate-mode primitives drawn directly onto the game canvas. Best for game-world UI -- HUDs, in-game menus, dialog boxes, health bars, inventory grids, tooltips.

2. **React overlay** (`ui/` directory): HTML/React components positioned absolutely on top of the canvas. Best for complex HTML layouts, forms, accessibility-sensitive UI, or when you need standard DOM behavior.

### How they coexist

```
┌──────────────────────────────────────────────┐
│  React overlay (z-index: 10-30)              │ ← HTML elements on top
│  Screens: MainMenu, PauseMenu, GameOver      │
│  HUD: Score, HealthBar, Debug                 │
├──────────────────────────────────────────────┤
│  Canvas (screen-space UI)                     │ ← engine.ui.render() after camera restore
│  CanvasUI: text, panels, bars, menus          │
│  DialogManager: typewriter dialogs            │
├──────────────────────────────────────────────┤
│  Canvas (world-space)                         │ ← entities, particles, tilemaps
│  Camera transform applied                     │
└──────────────────────────────────────────────┘
```

The render pipeline in `ascii-renderer.ts`:

1. Clear canvas
2. Apply camera transform
3. Draw world entities (ASCII, sprites, text blocks, tilemaps)
4. Draw particles
5. Restore camera transform
6. **Flush Canvas UI draw queue** (`ui.render()`) -- screen-space, unaffected by camera
7. Draw transitions, toasts, debug overlay on top

React renders independently via the DOM, layered above the canvas element using absolute positioning and z-index.

### When to use which

| Use Canvas UI when... | Use React overlay when... |
|---|---|
| UI is part of the game world feel | You need standard HTML elements (forms, inputs) |
| You want ASCII-styled menus, panels | You need accessibility (screen readers, tab order) |
| Pixel-precise positioning matters | Complex responsive layouts are needed |
| You want zero DOM overhead | You need CSS animations or transitions |
| The game is canvas-only (roguelike) | Default screens work fine (asteroid-field) |

---

## The Store Bridge

The zustand store is the **only** sanctioned bridge between the game loop (running in `engine/` and `game/`) and the React overlay (`ui/`). This is a hard architectural boundary.

### Why this pattern

- **Uni-directional data flow**: Game loop writes state, React reads state reactively
- **Import boundaries**: `game/` can import `@ui/store` but never `@ui/*` (except store). `ui/` can import `@game/index` (entry point only) but never `@game/*`
- **No React inside the game loop**: Game code never uses hooks or JSX. It calls `useStore.getState()` to access the raw store object
- **No game logic inside React**: React components only read state and emit events

### Store API Reference

The store lives at `ui/store.ts`. It exports:

#### Core type: `GameStore`

```ts
interface GameStore {
  // Game state (written by game loop)
  screen: GameScreen;       // "menu" | "playing" | "paused" | "gameOver" | custom
  score: number;
  highScore: number;        // auto-tracked: max of all setScore() values
  health: number;
  maxHealth: number;
  fps: number;
  entityCount: number;
  sceneName: string;

  // Game extension point (key-value bag)
  gameState: Record<string, unknown>;
  setGameState: (key: string, value: unknown) => void;
  getGameState: <T>(key: string) => T | undefined;

  // Actions
  setScreen: (screen: GameScreen) => void;
  setScore: (score: number) => void;           // also updates highScore
  setHealth: (current: number, max: number) => void;
  setDebugInfo: (fps: number, entityCount: number) => void;
  setSceneName: (name: string) => void;
  reset: () => void;                           // preserves highScore
}
```

#### Writing from game code

Game code runs outside React, so it must use `getState()` to access the store imperatively:

```ts
import { useStore } from "@ui/store";

// In scene setup or system update:
const store = useStore.getState();
store.setScreen("playing");
store.setScore(42);
store.setHealth(75, 100);
store.setDebugInfo(Math.round(engine.time.fps), entityCount);

// For game-specific state:
store.setGameState("ammo", 30);
store.setGameState("wave", 5);
```

#### Reading from React

React components use the `useStore` hook for reactive subscriptions:

```ts
import { useStore } from "@ui/store";

function MyHUD() {
  const score = useStore(s => s.score);         // re-renders when score changes
  const health = useStore(s => s.health);       // re-renders when health changes
  const wave = useStore(s => s.gameState.wave); // game-specific state
  return <div>Score: {score} | HP: {health} | Wave: {wave}</div>;
}
```

Always use a selector (`s => s.field`) rather than subscribing to the entire store, to avoid unnecessary re-renders.

### Extending the Store

For game-specific state beyond the built-in fields, use `StoreSlice`:

```ts
// In game/index.ts (or games/<template>/index.ts):
import type { Engine } from "@engine";
import { type StoreSlice, typedStore } from "@ui/store";

interface MyGameState {
  ammo: number;
  wave: number;
  setAmmo: (n: number) => void;
  nextWave: () => void;
}

const gameSlice: StoreSlice<MyGameState> = {
  initialState: { ammo: 30, wave: 1 },
  actions: (set, get) => ({
    setAmmo: (n: number) => set({ ammo: n }),
    nextWave: () => set({ wave: get().wave + 1 }),
  }),
};

export function setupGame(engine: Engine) {
  engine.registerScene(playScene);
  return {
    startScene: "play",
    store: gameSlice,  // auto-extended during setup
  };
}

// Then access with type safety:
const useGameStore = typedStore<MyGameState>();
useGameStore.getState().setAmmo(25);       // in game code
const ammo = useGameStore(s => s.ammo);    // in React
```

The `extendStore()` function is called automatically by `GameCanvas` when `setupGame` returns a `store` field. It is idempotent (safe during HMR).

### Import Boundary Rules

These are enforced by `bun run check:bounds`:

```
game/ → can import @ui/store          (the ONLY ui import allowed)
game/ → CANNOT import @ui/App, @ui/screens/*, @ui/hud/*, etc.

ui/   → can import @engine, @shared, @ui/*, @game/index
ui/   → CANNOT import @game/* (only the index entry point)

engine/ → CANNOT import @ui or @game at all
```

---

## Canvas UI Primitives

All Canvas UI rendering uses an immediate-mode draw queue. You call methods each frame; they push closures into `_queue`. The engine flushes the queue once per frame via `ui.render()`, which runs after the camera transform is restored (so Canvas UI draws in screen space).

**Key principle**: Canvas UI is stateless between frames. If you stop calling a draw method, it stops appearing. There is nothing to "remove" -- just stop drawing it.

### `CanvasUI.text()` -- Styled text

Draws text at screen coordinates. Supports inline style tags.

```ts
text(x: number, y: number, text: string, opts?: UITextOpts): void

interface UITextOpts {
  color?: string;    // default: "#e0e0e0"
  font?: string;     // default: '16px "Fira Code", monospace'
  glow?: string;     // shadow color (shadowBlur: 8)
  align?: "left" | "center" | "right";  // default: "left"
  opacity?: number;  // 0-1
}
```

**Supported style tags**:

| Tag | Effect |
|---|---|
| `[#ff4444]...[/]` | Color (hex, 3-8 digits) |
| `[b]...[/b]` | Bold |
| `[dim]...[/dim]` | Dimmed opacity |
| `[bg:#222]...[/bg]` | Background highlight |

**Examples**:

```ts
// Simple text
engine.ui.text(20, 20, "Score: 1234", { color: "#00ff88", font: FONTS.bold });

// Centered text
engine.ui.text(engine.centerX, 40, "GAME TITLE", {
  align: "center",
  font: FONTS.huge,
  color: "#00ff88",
  glow: "#00ff8844",
});

// Right-aligned
engine.ui.text(engine.width - 16, 20, "Turn 42", {
  align: "right",
  color: "#666",
  font: FONTS.small,
});

// Styled tags
engine.ui.text(20, 20,
  "[#ff4444]HP[/] 42/100  [b]x3[/b]  [dim]lvl 7[/dim]  [bg:#222]status[/bg]"
);

// With opacity for fade effects
engine.ui.text(16, logY + i * 18, message, {
  color: "#e0e0e0",
  font: FONTS.small,
  opacity: Math.max(0.3, alpha),
});
```

**Real usage** (from `games/roguelike/systems/hud.ts`):

```ts
engine.ui.text(16, 20, `Floor ${floor}`, {
  color: GAME.dungeon.stairsColor,
  font: FONTS.bold,
});

engine.ui.text(16, 44, "HP", {
  color: COLORS.danger,
  font: FONTS.bold,
});

engine.ui.text(engine.width - 16, 20, `Turn ${turnCount}`, {
  color: COLORS.dim,
  font: FONTS.small,
  align: "right",
});
```

### `CanvasUI.effectText()` -- Per-character effects

Draws text where each character can be individually transformed (position, color, scale, opacity). Used for wave, shake, rainbow, and other character-level animations.

```ts
effectText(
  x: number, y: number, text: string,
  effectFn: TextEffectFn, opts?: UITextOpts
): void

type TextEffectFn = (
  charIndex: number,
  totalChars: number,
  time: number
) => CharTransform;

interface CharTransform {
  dx?: number;      // horizontal offset
  dy?: number;      // vertical offset
  color?: string;   // override color
  opacity?: number; // 0-1
  scale?: number;   // uniform scale
  char?: string;    // replace character
}
```

The engine provides built-in effect factories (`wave`, `shake`, `rainbow`, `compose`) exported from `@engine`. Typically you attach effects to entities via the `textEffect` component rather than calling `effectText` directly, but the method is available for screen-space use:

```ts
import { wave, shake, rainbow, compose } from "@engine";

// In a system update:
engine.ui.effectText(
  engine.centerX, 100, "GAME OVER",
  compose(shake(3), rainbow(2)),
  { font: FONTS.huge, align: "center" }
);
```

### `CanvasUI.panel()` -- Bordered panel

Draws a rectangular panel with ASCII box-drawing borders.

```ts
panel(x: number, y: number, w: number, h: number, opts?: UIPanelOpts): void

interface UIPanelOpts {
  border?: BorderStyle;       // default: "single"
  bg?: string;                // default: "rgba(0,0,0,0.85)"
  borderColor?: string;       // default: "#444444"
  title?: string;             // centered in top border
  anchor?: Anchor;            // default: "topLeft"
  font?: string;
}

type BorderStyle = "single" | "double" | "rounded" | "heavy" | "ascii" | "none" | "dashed";
type Anchor = "topLeft" | "topCenter" | "topRight" | "center"
            | "bottomLeft" | "bottomCenter" | "bottomRight";
```

Border characters:

| Style | Example |
|---|---|
| `single` | `┌─┐ │ │ └─┘` |
| `double` | `╔═╗ ║ ║ ╚═╝` |
| `rounded` | `╭─╮ │ │ ╰─╯` |
| `heavy` | `┏━┓ ┃ ┃ ┗━┛` |
| `ascii` | `+-+ \| \| +-+` |
| `dashed` | `┌╌┐ ╎ ╎ └╌┘` |
| `none` | No border (background only) |

**Examples**:

```ts
// Message log background
engine.ui.panel(8, logY - 8, engine.width - 16, messages.length * 18 + 16, {
  bg: "rgba(0, 0, 0, 0.75)",
  border: "single",
  borderColor: "#333333",
});

// Game board (from tic-tac-toe)
engine.ui.panel(ox, oy, GAME.board.size, GAME.board.size, {
  border: "double",
  bg: GAME.board.bg,
  borderColor: GAME.board.lineColor,
});

// HUD panel with title
engine.ui.panel(16, 16, 220, 80, {
  bg: "rgba(0,0,0,0.7)",
  border: "rounded",
  borderColor: "#444",
  title: "Stats",
});
```

### `CanvasUI.textPanel()` -- Auto-sized text panel

A panel that automatically sizes itself to fit text content, with word wrapping.

```ts
textPanel(x: number, y: number, text: string, opts?: UITextPanelOpts): void

interface UITextPanelOpts {
  maxWidth?: number;       // default: 400
  border?: BorderStyle;    // default: "single"
  anchor?: Anchor;         // default: "topLeft"
  color?: string;          // default: "#e0e0e0"
  font?: string;
  padding?: number;        // default: 12
  bg?: string;
  borderColor?: string;
  glow?: string;
  title?: string;          // centered label with separator line
}
```

Text is word-wrapped within `maxWidth - padding*2`. The panel shrinkwraps to the widest line.

```ts
// Item description tooltip
engine.ui.textPanel(engine.centerX, 200,
  "A rusty sword. It has seen better days, but the edge still holds.",
  { maxWidth: 300, anchor: "topCenter", border: "rounded", title: "Rusty Sword" }
);

// Quest text
engine.ui.textPanel(16, 16,
  "Find the ancient key hidden in the depths of the dungeon. " +
  "Beware the guardian that protects it.",
  { maxWidth: 400, border: "double", color: "#aaa", title: "Quest" }
);
```

### `CanvasUI.bar()` -- Progress bar

Draws an ASCII progress bar using fill/empty characters.

```ts
bar(x: number, y: number, width: number, ratio: number, opts?: UIBarOpts): void

interface UIBarOpts {
  fillColor?: string;    // default: "#00ff88"
  emptyColor?: string;   // default: "#333333"
  label?: string;        // appended after the bar
  labelColor?: string;   // default: "#e0e0e0"
  font?: string;
  fillChar?: string;     // default: "█"
  emptyChar?: string;    // default: "░"
}
```

`width` is the number of characters (not pixels). `ratio` is clamped to 0-1.

```ts
// Health bar (from roguelike HUD)
engine.ui.bar(44, 44, 12, hp / maxHp, {
  fillColor: hp / maxHp > 0.3 ? "#00ff88" : "#ff4444",
  emptyColor: "#333333",
  label: `${hp}/${maxHp}`,
  labelColor: COLORS.fg,
});

// XP bar
engine.ui.bar(16, 90, 20, xp / xpToLevel, {
  fillColor: "#8888ff",
  emptyColor: "#222",
  label: `XP ${xp}/${xpToLevel}`,
});

// Custom characters
engine.ui.bar(16, 110, 15, mana / maxMana, {
  fillColor: "#4488ff",
  fillChar: "=",
  emptyChar: "-",
  label: "MP",
});
```

### `CanvasUI.inlineRun()` -- Mixed-font inline text

Draws a single line of text composed of multiple chunks, each with independent font, color, and background. Useful for badge-style HUD rows, mixed-font labels, and inline icons.

```ts
inlineRun(
  x: number, y: number,
  chunks: UIInlineChunk[],
  opts?: UIInlineRunOpts
): number  // returns total drawn width in pixels

interface UIInlineChunk {
  text: string;
  font?: string;
  color?: string;
  bg?: string;       // solid background behind this chunk
  padX?: number;     // horizontal padding inside background
}

interface UIInlineRunOpts {
  font?: string;     // default font for chunks that omit it
  color?: string;    // default color for chunks that omit it
  gap?: number;      // pixels between chunks, default: 0
  maxWidth?: number; // skip chunks that would overflow
}
```

No wrapping -- extra chunks that exceed `maxWidth` are simply skipped.

```ts
// Mixed-font HUD row
engine.ui.inlineRun(16, 20, [
  { text: " HP ",     font: FONTS.bold,   color: "#fff",    bg: "#aa2233", padX: 4 },
  { text: " 42/100 ", font: FONTS.normal, color: "#e0e0e0",                padX: 4 },
  { text: " LVL 7 ",  font: FONTS.small,  color: "#aaa",    bg: "#222",    padX: 4 },
], { gap: 6 });

// Status badges
engine.ui.inlineRun(16, 50, [
  { text: " POISON ", color: "#00ff00", bg: "rgba(0,255,0,0.15)", padX: 4 },
  { text: " HASTE ",  color: "#ffff00", bg: "rgba(255,255,0,0.15)", padX: 4 },
], { gap: 4, font: FONTS.small });
```

### Measurement Helpers

`CanvasUI` exposes three measurement functions for layout calculations:

```ts
// Pixel width of a string (cached via Pretext)
const w = engine.ui.measureWidth("Score: 1234", FONTS.normal);

// Pixel height of wrapped text
const h = engine.ui.measureHeight(longText, FONTS.normal, 400, 20);

// Width of a single monospace character
const cw = engine.ui.charWidth(FONTS.normal);
```

---

## Standalone UI Classes

These classes manage their own state and input. The pattern for all of them:

1. **Construct** once (in scene `setup`)
2. **`update(engine)`** each frame (handles keyboard/mouse input)
3. **`draw()`** each frame (renders via the CanvasUI queue or directly on ctx)
4. **Read state** (`.confirmed`, `.selectedIndex`, `.active`, etc.)

### `UIMenu` -- Keyboard-navigable menu

A bordered panel with a list of items. Arrow keys (or WASD) move selection; Enter/Space confirms; Escape cancels.

```ts
new UIMenu(items: string[], opts?: UIMenuOpts)

interface UIMenuOpts {
  border?: BorderStyle;       // default: "single"
  title?: string;             // centered header with separator
  selectedColor?: string;     // default: "#00ff88"
  borderColor?: string;       // default: "#444444"
  bg?: string;                // default: "rgba(0,0,0,0.85)"
  anchor?: Anchor;            // default: "topLeft"
  font?: string;
  color?: string;             // unselected item color
  onMove?: () => void;        // callback on selection change (for SFX)
}
```

**State properties**:

| Property | Type | Description |
|---|---|---|
| `selectedIndex` | `number` | Currently highlighted item |
| `confirmed` | `boolean` | True the frame Enter/Space was pressed |
| `cancelled` | `boolean` | True the frame Escape was pressed |
| `active` | `boolean` | Set to `false` to disable input handling |
| `items` | `string[]` | Menu items (can be modified at runtime) |

**Hit testing**: `isPointInside(x, y)` and `getHoveredItem(x, y)` are available for mouse interaction.

**Full example** (from `games/roguelike/scenes/title.ts`):

```ts
import { UIMenu, sfx, COLORS } from "@engine";

let menu: UIMenu;

// In setup:
menu = new UIMenu(["New Game", "Continue", "Controls"], {
  border: "double",
  title: "Main Menu",
  selectedColor: COLORS.accent,
  borderColor: "#555555",
  bg: "rgba(10, 10, 10, 0.9)",
  anchor: "center",
  onMove: () => sfx.menu(),
});

// In update (every frame):
menu.update(engine);
menu.draw(engine.ui, engine.centerX, engine.centerY + 140);

if (menu.confirmed) {
  switch (menu.selectedIndex) {
    case 0: engine.loadScene("play", { transition: "dissolve" }); break;
    case 1: /* load save */ break;
    case 2: engine.dialog.show("WASD to move..."); break;
  }
}
```

### `DialogManager` -- Typewriter dialogs with choices

Managed by the engine as `engine.dialog`. Shows text with a typewriter reveal effect at the bottom of the screen. Supports both plain dismiss and multiple-choice selection.

The dialog system is **promise-based** -- `show()` and `choice()` return Promises that resolve when the player dismisses or selects.

```ts
// Simple dialog (returns Promise<void>)
show(text: string, opts?: UIDialogOpts): Promise<void>

// Choice dialog (returns Promise<number> -- selected index)
choice(text: string, choices: string[], opts?: UIChoiceOpts): Promise<number>

interface UIDialogOpts {
  speaker?: string;        // name label above text
  typeSpeed?: number;      // chars/sec, default: 40. Set 0 for instant
  border?: BorderStyle;    // default: "double"
  onChar?: (ch: string) => void;  // per-character callback (for SFX)
  font?: string;
  color?: string;
  bg?: string;
  borderColor?: string;
  speakerColor?: string;
}

interface UIChoiceOpts extends UIDialogOpts {
  selectedColor?: string;  // highlight color for selected choice
}
```

**Behavior**:

- While the typewriter is revealing text, pressing Enter/Space skips to full reveal
- Once fully revealed, Enter/Space dismisses (simple dialog) or confirms selection (choice dialog)
- Arrow keys navigate choices after text is fully revealed
- `dialog.active` is `true` while a dialog is showing -- use this to gate gameplay

**Examples** (from `games/roguelike/`):

```ts
// Intro narration with typewriter SFX
await engine.dialog.show(
  "You stand at the entrance of an ancient dungeon. " +
  "Dark corridors stretch before you.",
  {
    speaker: "Narrator",
    typeSpeed: 40,
    border: "double",
    onChar: () => sfx.menu(),
  }
);

// Instant text (typeSpeed: 0)
engine.dialog.show(
  "WASD or Arrow Keys to move.\nWalk into enemies to attack.",
  { speaker: "Controls", border: "rounded", typeSpeed: 0 }
);

// Choice dialog
const pick = await engine.dialog.choice(
  "Open the chest?",
  ["Open", "Leave it"],
  { border: "rounded" }
);
if (pick === 0) openChest();
```

**Gating gameplay while dialog is active** (from `games/roguelike/scenes/play.ts`):

```ts
update(engine: Engine) {
  // Skip gameplay while dialog is active
  if (engine.dialog.active) return;

  // Normal gameplay continues here...
}
```

The `DialogManager` auto-positions its panel centered near the bottom of the screen and auto-wraps text to fit. It responsively adjusts to screen width changes.

### `UIScrollPanel` -- Scrollable list

A bordered panel displaying a scrollable list of text items. Supports keyboard (arrow keys, Page Up/Down, Home/End) and mouse wheel scrolling.

```ts
new UIScrollPanel(
  items: string[],
  viewportRows: number,  // visible rows
  width: number,         // panel width in pixels
  opts?: UIScrollPanelOpts
)

interface UIScrollPanelOpts {
  font?: string;
  color?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  padding?: number;
  title?: string;
  anchor?: Anchor;
  scrollbarTrack?: string;   // default: "░"
  scrollbarThumb?: string;   // default: "█"
  scrollbarColor?: string;
  lineHeight?: number;
}
```

**State**: `scrollOffset`, `items` (mutable), `active`.

**Methods**: `setItems(items)` updates the list and clamps scroll. `reset()` scrolls to top.

**Note**: Unlike `UIMenu` and `DialogManager`, `UIScrollPanel` draws directly to the canvas context, not through the `CanvasUI` queue. Pass `engine.renderer.ctx` as the first argument to `draw()`.

```ts
import { UIScrollPanel } from "@engine";

let log: UIScrollPanel;

// setup:
log = new UIScrollPanel(messages, 10, 320, {
  border: "single",
  title: "Message Log",
  font: FONTS.small,
  color: "#aaa",
});

// update:
log.setItems(getMessages());  // update content
log.update(engine);
log.draw(engine.renderer.ctx, 16, engine.height - 240);
```

### `UIGrid` -- Grid selection

A bordered grid of cells with keyboard (arrow keys) and mouse click navigation. Each cell can have text, an icon, color, background, or be marked empty.

```ts
new UIGrid(
  cells: UIGridCell[],
  cols: number,
  rows: number,
  cellWidth: number,   // pixels
  cellHeight: number,  // pixels
  opts?: UIGridOpts
)

interface UIGridCell {
  text?: string;
  icon?: string;       // displayed instead of text if present
  color?: string;
  bg?: string;
  empty?: boolean;     // shows emptyChar in emptyColor
}

interface UIGridOpts {
  font?: string;
  color?: string;
  emptyColor?: string;          // default: "#666666"
  emptyChar?: string;           // default: "·"
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  selectedBorderColor?: string; // default: "#00ff88"
  selectedBg?: string;          // default: "rgba(0,255,136,0.15)"
  padding?: number;
  title?: string;
  anchor?: Anchor;
}
```

**State**: `selectedIndex`, `confirmed` (true on Enter/Space/click), `active`.

**Accessors**: `selectedRow`, `selectedCol`, `selectedCell`.

**Methods**: `setCell(index, cell)`, `getHoveredItem(x, y)`, `isPointInside(x, y)`, `reset()`.

**Note**: Like `UIScrollPanel`, draws directly to `engine.renderer.ctx`.

```ts
import { UIGrid, type UIGridCell } from "@engine";

let inv: UIGrid;

// setup:
const cells: UIGridCell[] = Array.from({ length: 20 }, (_, i) =>
  i < 3
    ? { icon: ["!!", "[]", "()"][i], color: "#ff0" }
    : { empty: true }
);
inv = new UIGrid(cells, 5, 4, 40, 40, {
  title: "Inventory",
  border: "single",
  selectedBorderColor: "#00ff88",
});

// update:
inv.update(engine);
inv.draw(engine.renderer.ctx, 400, 16);

if (inv.confirmed && inv.selectedCell && !inv.selectedCell.empty) {
  useItem(inv.selectedIndex);
}
```

### `UITooltip` -- Hover tooltips

A small text panel that appears near the mouse cursor when hovering over defined regions. Auto-flips to stay on screen.

```ts
new UITooltip(opts?: UITooltipOpts)

interface UITooltipOpts {
  font?: string;
  color?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  maxWidth?: number;           // default: 250
  padding?: number;            // default: 8
  offset?: { x: number; y: number };  // default: { x: 12, y: 12 }
}
```

**Methods**:

- `show(text, x, y)` -- manually show at a position
- `hide()` -- manually hide
- `updateHover(engine, hitX, hitY, hitW, hitH, text)` -- convenience: auto show/hide based on mouse position within a rectangular region

**Note**: Draws directly to `engine.renderer.ctx`.

```ts
import { UITooltip } from "@engine";

let tip: UITooltip;

// setup:
tip = new UITooltip({ maxWidth: 240, border: "rounded" });

// update:
// Show tooltip when hovering over an item
const item = engine.findByTag("chest");
if (item?.position) {
  tip.updateHover(
    engine,
    item.position.x - 16, item.position.y - 16, 32, 32,
    "An old chest. Might contain treasure."
  );
}
tip.draw(engine.renderer.ctx, engine.width, engine.height);
```

### `UITabs` -- Tabbed panels

A panel with a tab bar. Tab/Shift+Tab or arrow keys switch tabs. Mouse click on tab labels also works. Each tab defines a `render` callback that draws into a clipped content area.

```ts
new UITabs(
  tabs: UITabDef[],
  width: number,     // total panel width in pixels
  height: number,    // total panel height in pixels
  opts?: UITabsOpts
)

interface UITabDef {
  label: string;
  render: (
    ctx: CanvasRenderingContext2D,
    contentX: number,
    contentY: number,
    contentW: number,
    contentH: number,
  ) => void;
}

interface UITabsOpts {
  font?: string;
  color?: string;
  activeColor?: string;        // default: "#00ff88"
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  activeTabBg?: string;        // default: "rgba(0,255,136,0.15)"
  padding?: number;
  title?: string;
  anchor?: Anchor;
}
```

**State**: `activeIndex`, `active`.

**Accessors**: `activeTab`.

**Methods**: `switchTo(index)`, `isPointInside(x, y)`, `reset()`.

**Note**: Draws directly to `engine.renderer.ctx`.

```ts
import { UITabs } from "@engine";

let tabs: UITabs;

// setup:
tabs = new UITabs([
  {
    label: "Stats",
    render: (ctx, x, y, w, h) => {
      ctx.fillStyle = "#e0e0e0";
      ctx.font = '14px "Fira Code", monospace';
      ctx.fillText("ATK: 12", x, y + 20);
      ctx.fillText("DEF: 8", x, y + 40);
    },
  },
  {
    label: "Gear",
    render: (ctx, x, y) => {
      ctx.fillStyle = "#e0e0e0";
      ctx.font = '14px "Fira Code", monospace';
      ctx.fillText("Weapon: Iron Sword", x, y + 20);
      ctx.fillText("Armor: Leather", x, y + 40);
    },
  },
], 400, 300, { title: "Character", border: "double" });

// update:
tabs.update(engine);
tabs.draw(engine.renderer.ctx, 16, 16);
```

---

## React Overlay

### How Screens Work

The React overlay uses a screen registry to map screen names to components. The `App` component reads the current `screen` from the store and renders the matching component:

```tsx
// ui/App.tsx (simplified)
function App() {
  const screen = useStore(s => s.screen);
  const ScreenComponent = getScreen(screen);
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <GameCanvas />
      {ScreenComponent && <ScreenComponent />}
    </div>
  );
}
```

Default screens registered in `ui/defaults.tsx`:

| Screen name | Component | z-index |
|---|---|---|
| `"menu"` | `MainMenu` -- title art, "Press SPACE" | 20 |
| `"playing"` | `HUD` with debug overlay | 10 |
| `"paused"` | `HUD` + `PauseMenu` | 30 |
| `"gameOver"` | `GameOverScreen` -- score, high score, retry | 30 |

Games switch screens by writing to the store:

```ts
useStore.getState().setScreen("playing");
useStore.getState().setScreen("gameOver");
```

### The GameCanvas Component

`ui/GameCanvas.tsx` is the React component that owns the canvas element and the engine lifecycle:

1. Creates the `Engine` instance on mount
2. Calls `setupGame(engine)` to register scenes
3. Processes the return value:
   - If a `string`: uses it as the starting scene name
   - If an object: reads `startScene`, `screens`, `hud`, and `store` fields
4. Registers custom screens and HUD components
5. Extends the store if a `store` slice is provided
6. Wires event listeners for `game:start`, `game:resume`, `game:restart`, `game:pause`
7. Starts the engine

### HUD Component Pattern

The HUD bar renders registered components in a flex row across the top of the screen:

```tsx
// ui/hud/HUD.tsx (simplified)
function HUD({ debug = false }) {
  const components = getHUDComponents();
  return (
    <>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", justifyContent: "space-between",
        padding: "12px 20px", pointerEvents: "none", zIndex: 10,
      }}>
        {components.map(C => <C key={...} />)}
      </div>
      {debug && <Debug />}
    </>
  );
}
```

Default HUD components: `Score` (left) and `HealthBar` (right). Both read from the store.

The `Score` component:

```tsx
function Score() {
  const score = useStore(s => s.score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <AsciiText size="sm" color={COLORS.dim}>SCORE</AsciiText>
      <AsciiText size="md" color={COLORS.accent} glow>
        {String(score).padStart(6, "0")}
      </AsciiText>
    </div>
  );
}
```

### AsciiText Component

`ui/shared/AsciiText.tsx` is a shared React component for styled monospace text:

```tsx
<AsciiText size="lg" color="#00ff88" glow blink>
  GAME OVER
</AsciiText>
```

Props: `size` (`"sm"` 12px, `"md"` 16px, `"lg"` 24px, `"xl"` 48px), `color`, `blink`, `glow`, `style`.

### Suppressing the React Overlay

For canvas-only games (like the roguelike, tic-tac-toe, connect-four), suppress all React screens by returning empty components:

```ts
const Empty = () => null;

export function setupGame(engine: Engine) {
  return {
    startScene: "title",
    screens: {
      menu: Empty,
      playing: Empty,
      gameOver: Empty,
    },
    hud: [],
  };
}
```

This replaces every default screen with a component that renders nothing, and sets the HUD component array to empty. The canvas still renders; the React layer just draws nothing on top.

All three template types that use canvas-only UI follow this exact pattern:

- `games/roguelike/index.ts` -- ECS game with `UIMenu`, `engine.ui.*`, `engine.dialog`
- `games/tic-tac-toe/index.ts` -- `defineGame` with `engine.ui.panel()`, `engine.ui.text()`
- `games/connect-four/index.ts` -- `defineGame` with `engine.ui.panel()`, `engine.ui.text()`

---

## Common UI Workflows

### 1. Adding a HUD element (score, health bar, minimap)

**Option A: React HUD** (default, uses the overlay)

Create a React component that reads from the store:

```tsx
// ui/hud/Ammo.tsx
import { useStore } from "@ui/store";
import { AsciiText } from "@ui/shared/AsciiText";

export function Ammo() {
  const ammo = useStore(s => s.gameState.ammo) as number;
  return (
    <AsciiText size="md" color="#ffcc00">
      AMMO: {ammo}
    </AsciiText>
  );
}
```

Register it in your game setup:

```ts
export function setupGame(engine: Engine) {
  return {
    startScene: "play",
    hud: [Score, HealthBar, Ammo],  // replaces defaults
  };
}
```

Write from game code:

```ts
useStore.getState().setGameState("ammo", player.ammo);
```

**Option B: Canvas HUD** (draws on the canvas, no React)

Create a system that draws each frame:

```ts
import { defineSystem, FONTS, COLORS } from "@engine";

export const hudSystem = defineSystem({
  name: "hud",
  update(engine) {
    const player = engine.findByTag("player");
    if (!player?.health) return;

    const hp = player.health.current;
    const maxHp = player.health.max;

    engine.ui.text(16, 20, "HP", { color: COLORS.danger, font: FONTS.bold });
    engine.ui.bar(44, 44, 12, hp / maxHp, {
      fillColor: hp / maxHp > 0.3 ? "#00ff88" : "#ff4444",
      emptyColor: "#333",
      label: `${hp}/${maxHp}`,
    });
  },
});
```

### 2. Creating an in-game menu

```ts
import { UIMenu, sfx, COLORS } from "@engine";

let pauseMenu: UIMenu;

// In scene setup:
pauseMenu = new UIMenu(["Resume", "Settings", "Quit"], {
  border: "double",
  title: "Paused",
  anchor: "center",
  selectedColor: COLORS.accent,
  onMove: () => sfx.menu(),
});
pauseMenu.active = false;

// In scene update:
if (engine.keyboard.pressed("Escape")) {
  pauseMenu.active = !pauseMenu.active;
}

if (pauseMenu.active) {
  pauseMenu.update(engine);
  pauseMenu.draw(engine.ui, engine.centerX, engine.centerY);

  if (pauseMenu.confirmed) {
    switch (pauseMenu.selectedIndex) {
      case 0: pauseMenu.active = false; break;
      case 1: /* open settings */ break;
      case 2: engine.loadScene("title"); break;
    }
  }
  if (pauseMenu.cancelled) {
    pauseMenu.active = false;
  }
}
```

### 3. Building a dialog/conversation system

```ts
// Simple narration
await engine.dialog.show(
  "The door creaks open, revealing a dimly lit chamber.",
  { speaker: "Narrator", typeSpeed: 40, onChar: () => sfx.menu() }
);

// Branching conversation
const response = await engine.dialog.choice(
  "The merchant eyes you suspiciously. \"What do you want?\"",
  ["Buy supplies", "Ask about the dungeon", "Leave"],
  { speaker: "Merchant", border: "rounded" }
);

switch (response) {
  case 0:
    await engine.dialog.show("\"Take a look at my wares.\"", { speaker: "Merchant" });
    openShop();
    break;
  case 1:
    await engine.dialog.show(
      "\"Dangerous place, that dungeon. Many have gone in... few come back.\"",
      { speaker: "Merchant" }
    );
    break;
  case 2:
    // Do nothing
    break;
}
```

Remember to gate gameplay while dialog is active:

```ts
update(engine) {
  if (engine.dialog.active) return;
  // ... normal gameplay
}
```

### 4. Adding tooltips to game elements

```ts
import { UITooltip } from "@engine";

let tooltip: UITooltip;

// setup:
tooltip = new UITooltip({ maxWidth: 200, border: "rounded" });

// update:
// Check each interactable entity
for (const item of engine.findAllByTag("interactable")) {
  if (!item.position) continue;

  // Convert world position to screen position (accounting for camera)
  const screenX = item.position.x - engine.camera.x;
  const screenY = item.position.y - engine.camera.y;

  tooltip.updateHover(
    engine,
    screenX - 16, screenY - 16, 32, 32,
    item.description ?? "Unknown item"
  );
}

tooltip.draw(engine.renderer.ctx, engine.width, engine.height);
```

### 5. Canvas-only game setup (no React)

```ts
const Empty = () => null;

export function setupGame(engine: Engine) {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  engine.registerScene(gameOverScene);

  return {
    startScene: "title",
    screens: {
      menu: Empty,
      playing: Empty,
      gameOver: Empty,
    },
    hud: [],
  };
}
```

All UI is then handled via `engine.ui.*`, `engine.dialog`, and standalone classes like `UIMenu`.

### 6. Custom store fields for game-specific state

**Quick approach** -- using `gameState` key-value bag:

```ts
// Write:
useStore.getState().setGameState("ammo", 30);
useStore.getState().setGameState("currentWeapon", "shotgun");

// Read (game code):
const ammo = useStore.getState().getGameState<number>("ammo");

// Read (React):
function AmmoDisplay() {
  const ammo = useStore(s => s.gameState.ammo) as number;
  return <span>{ammo}</span>;
}
```

**Typed approach** -- using `StoreSlice`:

```ts
import { type StoreSlice, typedStore } from "@ui/store";

interface ArenaState {
  wave: number;
  enemiesRemaining: number;
  advanceWave: () => void;
  setEnemies: (n: number) => void;
}

const arenaSlice: StoreSlice<ArenaState> = {
  initialState: { wave: 1, enemiesRemaining: 0 },
  actions: (set, get) => ({
    advanceWave: () => set({ wave: get().wave + 1 }),
    setEnemies: (n) => set({ enemiesRemaining: n }),
  }),
};

// Return from setupGame:
return { startScene: "play", store: arenaSlice };

// Access with full types:
const useArena = typedStore<ArenaState>();
useArena.getState().advanceWave();
```

---

## UI Performance

### Draw queue batching

`CanvasUI` does not render immediately when you call `text()`, `panel()`, or `bar()`. Instead, each call pushes a closure into `_queue`. The entire queue is flushed once per frame in `ui.render()`, which runs after the world render. This means:

- **Order is preserved**: items drawn in the order their methods were called
- **No redundant state changes**: the canvas context is saved/restored efficiently
- **Zero cost if unused**: an empty queue flushes instantly

### Text measurement caching

All text measurement goes through Pretext, which caches `prepare()` results in an LRU cache (512 entries). This means:

- `measureLineWidth()`, `measureHeight()`, and `layoutTextBlock()` are cheap on repeat calls with the same text + font
- `_charWidth()` is cached per font string
- Never call Pretext `prepare()` directly -- use the engine's wrapper functions

### When to use Canvas UI vs React

| Consideration | Canvas UI | React overlay |
|---|---|---|
| Rendering cost | Single canvas draw call batch | DOM diffing + layout |
| Text measurement | Pretext cached (fast) | Browser reflow |
| Interactivity | Manual hit testing | Native DOM events |
| Accessibility | None (canvas is opaque) | Full screen reader support |
| Complexity | Simple primitives | Full component model |
| Best for | 10-50 UI elements per frame | Complex forms, settings, menus with many options |

**Rule of thumb**: If your game is primarily canvas-rendered (roguelikes, board games, arcade), use Canvas UI for everything and suppress the React overlay. If you need standard HTML UI behaviors (text input, dropdowns, accessibility), use the React overlay.

---

## Summary of Imports

Canvas UI classes are all exported from `@engine`:

```ts
import {
  // Core (available as engine.ui and engine.dialog)
  CanvasUI,
  DialogManager,

  // Standalone classes (construct yourself)
  UIMenu,
  UIScrollPanel,
  UIGrid,
  UITooltip,
  UITabs,

  // Types
  type UITextOpts,
  type UIPanelOpts,
  type UITextPanelOpts,
  type UIBarOpts,
  type UIInlineChunk,
  type UIInlineRunOpts,
  type UIMenuOpts,
  type UIDialogOpts,
  type UIChoiceOpts,
  type UIScrollPanelOpts,
  type UIGridCell,
  type UIGridOpts,
  type UITooltipOpts,
  type UITabDef,
  type UITabsOpts,
  type BorderStyle,
  type Anchor,
  BORDERS,
} from "@engine";
```

The store is imported from `@ui/store`:

```ts
import { useStore, extendStore, typedStore, type GameStore, type StoreSlice } from "@ui/store";
```
