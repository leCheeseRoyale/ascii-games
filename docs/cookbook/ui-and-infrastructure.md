# UI & Infrastructure

Recipes for UI overlays, persistence, scene transitions, mobile support, multiplayer, and performance. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## UI

### Dialog with typewriter
Returns a Promise resolving on dismiss. `onChar` fires per char for SFX blips.
```ts
import { sfx } from "@engine";
await engine.dialog.show("You find a rusty key.", {
  speaker: "Narrator", typeSpeed: 40, border: "double", onChar: () => sfx.menu(),
});
```

### Choice dialog
```ts
const pick = await engine.dialog.choice("Open the chest?", ["Open", "Leave it"], { border: "rounded" });
if (pick === 0) openChest();
```

### `UIMenu` for keyboard nav
Update + draw each frame. Check `menu.confirmed` / `.cancelled` / `.selectedIndex`.
```ts
import { UIMenu, sfx } from "@engine";
let menu: UIMenu;
// setup:
menu = new UIMenu(["New Game", "Continue", "Quit"], {
  border: "double", title: "Main Menu", anchor: "center", onMove: () => sfx.menu(),
});
// update:
menu.update(engine);
menu.draw(engine.ui, engine.centerX, engine.centerY);
if (menu.confirmed) handle(menu.selectedIndex);
```

### UIScrollPanel, UIGrid, UITooltip, UITabs
```ts
import { UIScrollPanel, UIGrid, UITooltip, UITabs } from "@engine";
const log  = new UIScrollPanel(messages, 10, 320, { border: "single", title: "Log" });
const inv  = new UIGrid(cells, 5, 4, 32, 32, { title: "Inventory" });
const tip  = new UITooltip({ maxWidth: 240 });
const tabs = new UITabs([
  { label: "Stats", render: (ctx, x, y) => drawStats(ctx, x, y) },
  { label: "Gear",  render: (ctx, x, y) => drawGear (ctx, x, y) },
], 400, 300, { title: "Character" });
// each frame:
log.update(engine);  log.draw(engine.renderer.ctx, 16, 16);
inv.update(engine);  inv.draw(engine.renderer.ctx, 400, 16);
tabs.update(engine); tabs.draw(engine.renderer.ctx, 800, 16);
tip.updateHover(engine, hx, hy, hw, hh, "Flavor");
tip.draw(engine.renderer.ctx, engine.width, engine.height);
```

### Custom UI: panel + text + bar
Immediate-mode — call each frame.
```ts
engine.ui.panel(16, 16, 220, 80, { bg: "rgba(0,0,0,0.7)", border: "rounded", borderColor: "#444" });
engine.ui.text (28, 28, "Health", { color: "#f44", font: '14px "Fira Code"' });
engine.ui.bar  (28, 48, 12, hp / maxHp, { fillColor: "#0f8", emptyColor: "#222", label: `${hp}/${maxHp}` });
```

## Mobile

### Touch gestures (tap, swipe, pinch)
```ts
import { Touch } from "@engine";
const touch = new Touch(engine.renderer.canvas, { unifyMouse: true, dragThreshold: 10, tapMaxDuration: 300 });
touch.onTap  ((g) => fireAt(g.x, g.y));
touch.onSwipe((g) => console.log("swipe", g.direction, g.distance));
touch.onPinch((g) => engine.camera.setZoom(engine.camera.zoom * g.scale));
// Per frame: touch.update() to drain gestures
```

### Virtual controls — visible only on touch
See `VirtualJoystick + VirtualDpad on mobile` under Input.

### Viewport orientation + safe-area insets
Emits `viewport:resized` / `viewport:orientation` on the shared bus.
```ts
import { events } from "@engine";
const { orientation, safeArea } = engine.viewport;
engine.ui.text(16 + safeArea.left, 16 + safeArea.top, "HUD");
events.on("viewport:orientation", (o) => console.log("now", o));
```

## Multiplayer

### MockAdapter (testing) → SocketAdapter (production)
Both implement `NetworkAdapter` — game code is identical.
```ts
import { MockAdapter, MockBus, SocketAdapter, type NetworkAdapter } from "@engine";
// Tests / AI peer:
const bus = MockBus.create();
const host:   NetworkAdapter = new MockAdapter({ bus, isHost: true });
const client: NetworkAdapter = new MockAdapter({ bus });
await host.connect(); await client.connect();
// Production (browser):
const net: NetworkAdapter = new SocketAdapter({ url: "wss://server", roomId: "abc" });
await net.connect();
net.onMessage((from, msg) => console.log(from, msg));
net.broadcast({ hello: "world" });
```

### Room creation + discovery via `listRooms`
Static method works pre-connect (HTTP). Instance method uses the live socket.
```ts
import { SocketAdapter } from "@engine";
const rooms = await SocketAdapter.listRooms("https://server.example.com", { gameType: "arena" });
const adapter = new SocketAdapter({
  url: "wss://server.example.com",
  roomId: rooms[0]?.id ?? "new-room",
  roomOpts: { name: "Maxwell's Room", gameType: "arena", isPublic: true, maxPeers: 4 },
});
await adapter.connect();
```

### TurnSync lockstep with desync detection
Game logic must be deterministic — identical inputs must yield identical state.
```ts
import { TurnSync } from "@engine";
const sync = new TurnSync<MyMove>({ adapter, playerIds: ["alice", "bob"], turnTimeout: 15000 });
sync.onTurnComplete(({ turn, moves }) => {
  applyMoves(world, moves);
  sync.submitStateHash(hashWorld(world));
});
sync.onDesync(({ turn, hashes }) => console.error("DESYNC", turn, hashes));
sync.submitMove(myMove); // local player acts
```

### Session resume on reconnect
```ts
const adapter = new SocketAdapter({ url: "wss://server", roomId: "abc", resumeOnReconnect: true });
```

## Performance

### Debug overlay / profiler
Backtick (`) toggles both. Per-system last/avg/max ms, FPS, archetype counts. Zero overhead when hidden.
```ts
engine.debug.setEnabled(true);
// engine.systems.getTimings() → ReadonlyMap<name, { last, avg, max }>
```

### Pool bullets / particles, spatial hash
See `Entity pool for bullets / particles` under Entities and `Spatial hash for N-body collision` under Gameplay Systems.

## Persistence

### `save` / `load`
Call `setStoragePrefix` once at init so keys are namespaced per game.
```ts
import { save, load, remove as removeStorage, setStoragePrefix } from "@engine";
setStoragePrefix("roguelike");
save("last-run", { floor: 3, hp: 40 });
const data = load<{ floor: number; hp: number }>("last-run");
removeStorage("last-run");
```

### Multi-slot saves with `SaveSlotManager`
Reserves an `"autosave"` slot that doesn't count toward `maxSlots`.
```ts
import { SaveSlotManager } from "@engine";
const saves = new SaveSlotManager<GameState>({ maxSlots: 3, version: "1.0.0" });
saves.save("slot-1", state, { name: "Forest Boss", sceneName: "forest", playtime: 1234 });
saves.setActive("slot-1");
for (const meta of saves.list()) console.log(meta.name, meta.timestamp);
const slot = saves.loadActive();
```

### Serialize full game state
Bundles Stats / Equipment / Inventory / Currency / Quests / Achievements.
```ts
import { serializeGameState, rehydrateGameState, save, load } from "@engine";
save("checkpoint", serializeGameState({ stats, equipment, inventory, wallet, quests, achievements }));
const snap = load<any>("checkpoint");
if (snap) rehydrateGameState(snap, {
  itemLookup: (id) => itemDb[id],
  equipmentBlocks: { weapon: ["offhand"] },
  quests, achievements,
});
```

### Leaderboard `submitScore` / `getHighScores`
```ts
import { submitScore, getHighScores, isHighScore } from "@engine";
if (isHighScore(score)) submitScore(score, playerName);
for (const e of getHighScores(10)) console.log(e.name, e.score, e.date);
```

## Save/Load with Compression

`SaveSlotManager` with `compress: true` uses lz-string compression on slot data. The index and active-slot tracker stay uncompressed for fast listing. Loading handles both compressed and uncompressed data transparently, so enabling compression on an existing game won't break old saves.

### Compressed multi-slot saves with autosave
```ts
import { SaveSlotManager } from "@engine";

interface GameState {
  floor: number;
  hp: number;
  inventory: string[];
  mapData: number[][];
}

const saves = new SaveSlotManager<GameState>({
  maxSlots: 5,
  version: "1.2.0",
  compress: true, // lz-string compression — good for large mapData
  onMigrate: (old) => {
    if (old.metadata.version === "1.0.0") {
      return { ...old, data: { ...old.data, inventory: [] } };
    }
    return null; // unreadable version
  },
});

// Manual save
saves.save("slot-1", gameState, {
  name: "Floor 5 - Before Boss",
  sceneName: "dungeon",
  playtime: engine.time.elapsed,
});

// Autosave (doesn't count toward maxSlots)
saves.autosave(gameState, { sceneName: "dungeon", playtime: engine.time.elapsed });

// List all slots for a save/load UI
for (const meta of saves.list()) {
  console.log(meta.name, new Date(meta.timestamp).toLocaleString());
}

// Load active slot
saves.setActive("slot-1");
const slot = saves.loadActive();
if (slot) {
  engine.loadScene(slot.metadata.sceneName ?? "dungeon", {
    data: slot.data,
  });
}
```

### Export/import for cloud sync
```ts
const json = saves.exportSlot("slot-1");
// Send `json` to a server / clipboard / file
// Later:
if (json) saves.importSlot("slot-1", json);
```

## Scene Transitions

`engine.loadScene` accepts a `transition` option that fades/wipes between scenes. The transition runs half out (old scene fades away), swaps the scene at the midpoint, then runs half in (new scene fades up). Available types: `fade`, `fadeWhite`, `wipe`, `dissolve`, `scanline`, `none`.

### Fade to black between scenes
```ts
await engine.loadScene("play", { transition: "fade", duration: 0.5 });
```

### White flash into game over
```ts
await engine.loadScene("gameOver", {
  transition: "fadeWhite",
  duration: 0.3,
  data: { score: 1500 },
});
// In gameOver scene setup:
const { score = 0 } = engine.sceneData;
```

### Dissolve with ASCII characters
The dissolve effect fills the screen with random box-drawing characters (`░▒▓█╬...`) that wipe across at varying thresholds per cell.
```ts
await engine.loadScene("dungeon", { transition: "dissolve", duration: 0.8 });
```

### CRT-style scanline transition
Horizontal scanlines sweep down the screen.
```ts
await engine.loadScene("title", { transition: "scanline", duration: 0.6 });
```

### Wipe (left-to-right curtain)
```ts
await engine.loadScene("nextLevel", { transition: "wipe", duration: 0.4 });
```

## Pause Menu Pattern

The engine has dedicated `pause()` / `resume()` methods. When paused, the game loop stops ticking systems and physics but still renders the current frame, so your pause overlay draws on top of the frozen scene.

### Basic pause toggle
```ts
import { defineSystem, UIMenu, sfx, events } from "@engine";

let pauseMenu: UIMenu | null = null;

export const pauseSystem = defineSystem({
  name: "pause",
  update(engine) {
    if (engine.keyboard.pressed("Escape")) {
      if (engine.isPaused) {
        engine.resume();
        pauseMenu = null;
      } else {
        engine.pause();
        pauseMenu = new UIMenu(["Resume", "Quit to Title"], {
          border: "double", title: "PAUSED", anchor: "center", onMove: () => sfx.menu(),
        });
      }
    }
    // Draw menu while paused (render still runs)
    if (engine.isPaused && pauseMenu) {
      engine.ui.panel(0, 0, engine.width, engine.height, { bg: "rgba(0,0,0,0.6)" });
      pauseMenu.update(engine);
      pauseMenu.draw(engine.ui, engine.centerX, engine.centerY);
      if (pauseMenu.confirmed) {
        if (pauseMenu.selectedIndex === 0) {
          engine.resume();
          pauseMenu = null;
        } else {
          engine.resume();
          engine.loadScene("title", { transition: "fade", duration: 0.3 });
        }
      }
    }
  },
});
```

### Soft pause with timeScale (gameplay slows but UI stays responsive)
Use `timeScale = 0` instead of `pause()` when you want systems to still run (e.g. animated backgrounds, particle effects at zero speed) but freeze game logic.
```ts
// Freeze game time (systems still tick, but dt is 0)
engine.timeScale = 0;
// Resume
engine.timeScale = 1;
```
