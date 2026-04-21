# Quickstart — Your First Game in 15 Minutes

A speed-run from zero to a playable modification. Uses the `blank` template (real-time, one movable player) because it's the shortest path from "it runs" to "I made a change that works."

**Prerequisites:** Node.js and [Bun](https://bun.sh).

---

## 1. Install and run (2 min)

```bash
npx create-ascii-game my-game
cd my-game
bun dev
```

Open the URL Vite prints. You should see the title screen — press **Space** to enter play, then move the `@` with WASD or arrows. Press **Esc** to return to the title.

*Why this works:* `create-ascii-game` scaffolds a fresh project from the `blank` template. `bun dev` starts Vite with hot reload.

**Tip:** Press backtick (`` ` ``) to toggle the debug overlay — shows collider bounds, entity counts, system timing, and engine warnings.

---

## What's possible

Before diving into the walkthrough, here is a taste of the engine's most distinctive feature -- **every character is a physics entity** that reacts to your cursor:

```ts
import { SpringPresets, createCursorRepelSystem } from '@engine'

// Spawn text where each letter has its own spring physics
engine.spawnText({
  text: "HELLO WORLD",
  font: '24px "Fira Code", monospace',
  position: { x: 400, y: 300 },
  color: "#00ffaa",
  spring: SpringPresets.bouncy,
})

// One line: characters flee the cursor and spring back
engine.addSystem(createCursorRepelSystem())
```

Move your mouse and the characters scatter, then reassemble. Try `bun run init:game physics-text` for a full interactive demo, or see the [Tutorial -- Interactive ASCII Art](TUTORIAL.md#13-interactive-ascii-art) section and the [Cookbook](COOKBOOK.md#text-aware-physics--auto-colliders) for recipes.

---

## 2. Orient yourself (1 min)

Three directories matter:

- `engine/` — the framework. Don't edit.
- `game/` — your code (scenes, systems, entities). **This is what you edit.**
- `ui/` — React HUD overlay, bridged by a zustand store.

Full tour: [`PROJECT-GUIDE.md`](PROJECT-GUIDE.md).

---

## 3. Change how the player looks (1 min)

Open `game/config.ts` and change the player color. Save — the browser reloads and the `@` changes color immediately.

```diff
  player: {
    speed: 200,
-   color: '#00ff88',
-   glow: '#00ff8844',
+   color: '#ff4488',
+   glow: '#ff448844',
  },
```

*Why this works:* `game/scenes/play.ts` reads `GAME.player.color` when it spawns the player. Vite's HMR reloads the scene on save.

---

## 4. Spawn a pickup and collide with it (5 min)

**4a.** Create a pickup factory. New file `game/entities/pickup.ts`:

```ts
import { FONTS, createTags } from '@engine'
import type { Entity } from '@engine'

export function createPickup(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: { char: '*', font: FONTS.large, color: '#ffcc00', glow: '#ffcc0066' },
    collider: 'auto',  // sized from text measurement
    tags: createTags('pickup'),
  }
}
```

> `collider: 'auto'` measures the entity's text via Pretext and creates a matching hitbox automatically. You can still specify exact dimensions when you need custom sizing: `collider: { type: 'rect', width: 40, height: 20 }`.

**4b.** Give the player a collider and spawn a pickup. Edit `game/scenes/play.ts`:

```diff
- import { defineScene, FONTS, COLORS } from '@engine'
+ import { defineScene, FONTS, COLORS, createTags, overlaps, sfx } from '@engine'
  import type { Engine } from '@engine'
  import { useStore } from '@ui/store'
  import { GAME } from '../config'
+ import { createPickup } from '../entities/pickup'
```

In `setup()`, add a collider to the player and spawn one pickup:

```diff
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY },
      velocity: { vx: 0, vy: 0 },
      ascii: { char: '@', font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
+     collider: 'auto',
-     tags: { values: new Set(['player']) },
+     tags: createTags('player'),
      screenWrap: { margin: 10 },
    })
+
+   engine.spawn(createPickup(engine.centerX + 100, engine.centerY))
```

In `update()`, detect the hit and destroy the pickup:

```diff
    if (engine.keyboard.pressed('Escape')) {
      engine.loadScene('title')
    }
+
+   const player = engine.findByTag('player')
+   if (!player) return
+   for (const item of engine.findAllByTag('pickup')) {
+     if (overlaps(player, item)) {
+       sfx.pickup()
+       engine.destroy(item)
+     }
+   }
  }
```

Save. Walk into the `*` — it should vanish with a sound.

*Why this works:* `overlaps()` needs both entities to have a `collider`. `findAllByTag` + `destroy` are the standard spawn/despawn pattern.

---

## 5. Score it (2 min)

Update the zustand store so the HUD reacts. Still in `game/scenes/play.ts`:

```diff
    for (const item of engine.findAllByTag('pickup')) {
      if (overlaps(player, item)) {
        sfx.pickup()
+       const store = useStore.getState()
+       store.setScore(store.score + 10)
+       engine.floatingText(item.position!.x, item.position!.y, '+10', '#ffcc00')
        engine.destroy(item)
      }
    }
```

Collect the pickup — the HUD score in the top-right ticks up by 10 and a "+10" floats off the pickup.

*Why this works:* The default HUD subscribes to `useStore(s => s.score)`. Writing via `setScore()` triggers a React re-render. `engine.floatingText` is a one-shot visual. Store shape: [`ui/store.ts`](../ui/store.ts).

---

## 6. Persist a high score (2 min)

`save` / `load` wrap `localStorage` under a game-scoped prefix.

```diff
- import { defineScene, FONTS, COLORS, overlaps, sfx } from '@engine'
+ import { defineScene, FONTS, COLORS, overlaps, sfx, save, load } from '@engine'
```

In `setup()`, rehydrate the high score once:

```diff
  setup(engine: Engine) {
    useStore.getState().setScreen('playing')
+   const best = load<number>('highscore') ?? 0
+   if (best > useStore.getState().highScore) {
+     useStore.setState({ highScore: best })
+   }
```

In `update()`, write whenever a new best is reached:

```diff
    for (const item of engine.findAllByTag('pickup')) {
      if (overlaps(player, item)) {
        sfx.pickup()
        const store = useStore.getState()
        store.setScore(store.score + 10)
        engine.floatingText(item.position!.x, item.position!.y, '+10', '#ffcc00')
        engine.destroy(item)
+       save('highscore', useStore.getState().highScore)
      }
    }
```

Collect a pickup, reload the tab — the high score survives.

*Why this works:* `useStore.setScore` already tracks `highScore = max(score, highScore)`. `save('highscore', ...)` writes JSON to `localStorage` under a key prefixed by your game id.

---

## 7. Ship it (1 min)

```bash
bun run export
```

This produces `dist/game.html` — one self-contained file with HTML, CSS, and JS inlined. Open it in any browser. Upload it anywhere static. Done.

---

## Juice in one line

The engine has built-in helpers for common game-feel effects. Each is a single line:

```ts
engine.flash("#ff0000")          // screen flash (damage, powerup)
engine.blink(entity, 0.5)       // i-frame blinking
engine.knockback(e, x, y, 300)  // impulse away from point
engine.timeScale = 0.3           // slow motion (1 = normal)
engine.onCollide("a", "b", fn)  // declarative collision callback
trail: { lifetime: 0.3 }        // afterimage component (add at spawn)
```

Full recipes in [COOKBOOK.md](COOKBOOK.md#game-feel--juice).

---

## AI-assisted development

The engine includes AI scaffolding commands (requires `ANTHROPIC_API_KEY`):

```bash
bun run ai:game "your pitch"       # generates a complete game module
bun run ai:sprite "description"    # generates entity art
bun run ai:mechanic "description"  # generates a behavior system
bun run ai:juice "event"           # generates juice/feedback helper
```

See [Game Authoring Workflows](guides/game-authoring-workflows.md) for details.

---

## What's next

- [`TUTORIAL.md`](TUTORIAL.md) — a full guided build from blank template to complete game.
- [`COOKBOOK.md`](COOKBOOK.md) — copy-paste recipes for common patterns.
- [`guides/`](guides/) — deep dives on specific systems:
  - [Engine Core & Architecture](guides/engine-core-architecture.md)
  - [Physics, Input & Audio](guides/physics-input-audio.md)
  - [Rendering Pipeline](guides/rendering-pipeline.md)
  - [Behaviors System](guides/behaviors-system.md)
  - [UI & Store Bridge](guides/ui-and-store-bridge.md)
  - [Multiplayer & Networking](guides/multiplayer-networking.md)
- [`AGENTS.md`](../AGENTS.md) — terse API cheat sheet for quick reference.
- [`PROJECT-GUIDE.md`](PROJECT-GUIDE.md) — architecture, conventions, and critical gotchas.
- [`API-generated.md`](API-generated.md) — full auto-generated API reference.
