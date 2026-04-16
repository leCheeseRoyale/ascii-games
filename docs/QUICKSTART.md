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
import { FONTS } from '@engine'
import type { Entity } from '@engine'

export function createPickup(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: { char: '*', font: FONTS.large, color: '#ffcc00', glow: '#ffcc0066' },
    collider: { type: 'circle', width: 20, height: 20 },
    tags: { values: new Set(['pickup']) },
  }
}
```

**4b.** Give the player a collider and spawn a pickup. Edit `game/scenes/play.ts`:

```diff
- import { defineScene, FONTS, COLORS } from '@engine'
+ import { defineScene, FONTS, COLORS, overlaps, sfx } from '@engine'
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
+     collider: { type: 'circle', width: 20, height: 20 },
      tags: { values: new Set(['player']) },
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

## Next steps

- [`TUTORIAL.md`](TUTORIAL.md) — a longer-form walkthrough that builds a complete game.
- [`PROJECT-GUIDE.md`](PROJECT-GUIDE.md) — architecture, conventions, and critical gotchas.
- [`API-generated.md`](API-generated.md) — full auto-generated API reference.
- [`API.md`](API.md) — curated hand-written API notes.
- [`DEVELOPER.md`](DEVELOPER.md) — contributing to the engine itself.
