# Plan Z: Integration

## Purpose
After agents A-F complete, this step wires all new modules into the engine core and re-exports them.

**This plan runs AFTER all 6 agents finish.** It is not parallelizable with them.

## Step 1: Wire new systems into `engine/core/engine.ts` loadScene

Import the new systems at the top:
```ts
import { lifetimeSystem } from '../ecs/lifetime-system';
import { screenBoundsSystem } from '../ecs/screen-bounds-system';
```

Add them to BOTH branches of `loadScene` (after the existing `this.systems.add(animationSystem, this)`):
```ts
this.systems.add(lifetimeSystem, this);
this.systems.add(screenBoundsSystem, this);
```

## Step 2: Add debug overlay and toast to Engine

Import at top:
```ts
import { DebugOverlay } from '../render/debug';
import { ToastManager } from '../render/toast';
```

Add as public readonly properties in the class:
```ts
readonly debug: DebugOverlay;
readonly toast: ToastManager;
```

Initialize in constructor (after `this.transition = new Transition()`):
```ts
this.debug = new DebugOverlay();
this.toast = new ToastManager();
```

In the `update` method, add:
```ts
this.debug.update(dt);
this.toast.update(dt);
```

In the `render` method, after transition rendering, add:
```ts
this.toast.render(this.renderer.ctx, this.width, this.height);
this.debug.render(this.renderer.ctx, this.world, this.camera, this.width, this.height);
```

Wrap `this.systems.update(this, dt)` and `this.scenes.update(this, dt)` in a try/catch that calls `this.debug.showError(err.message)`:
```ts
try {
  this.systems.update(this, dt);
  this.scenes.update(this, dt);
} catch (err: any) {
  this.debug.showError(err?.message ?? String(err));
  console.error('Game error:', err);
}
```

## Step 3: Add keyboard toggle for debug mode

In the `update` method, add after `this.keyboard.update()`:
```ts
if (this.keyboard.pressed('Backquote')) {
  this.debug.enabled = !this.debug.enabled;
}
```

## Step 4: Update `engine/index.ts` re-exports

Add all new exports:

```ts
// Built-in systems (auto-registered, but exported for reference)
export { lifetimeSystem } from './ecs/lifetime-system';
export { screenBoundsSystem } from './ecs/screen-bounds-system';

// Audio (new exports)
export {
  getVolume, isMuted, mute, pauseMusic, playMusic,
  resumeMusic, setMusicVolume, setVolume, stopMusic, toggleMute, unmute,
} from './audio/audio';

// Storage / persistence
export {
  clearAll as clearStorage, clearHighScores, getHighScores, getTopScore,
  has as hasStorage, isHighScore, load, remove as removeStorage,
  save, type ScoreEntry, setStoragePrefix, submitScore,
} from './storage/index';

// Debug & toast
export { DebugOverlay } from './render/debug';
export { ToastManager } from './render/toast';
```

Also re-export new types from shared/types:
```ts
export type { OffScreenDestroy, ScreenClamp, ScreenWrap } from '@shared/types';
```

And add PALETTES to the constants re-export:
```ts
export { COLORS, FONTS, PALETTES } from '@shared/constants';
```

## Step 5: Verify everything

```bash
bun run check
bun run build
bun run lint:fix
bun dev  # manual test: game loads, backtick toggles debug, collider outlines appear
```

## Step 6: Update CLAUDE.md

Add sections covering:
- New Engine properties: `centerX`, `centerY`, `sceneTime`, `debug`, `toast`
- New Engine methods: `findByTag`, `destroyAll`, `randomEdgePosition`, `spawnEvery`
- Built-in systems: `_lifetime` and `_screenBounds` are now auto-registered
- New components: `screenWrap`, `screenClamp`, `offScreenDestroy`
- Audio: `playMusic`, `stopMusic`, `setVolume`, `mute`/`unmute`, `sfx.custom()`
- Persistence: `save`, `load`, `submitScore`, `getHighScores`
- Debug: backtick toggles debug overlay with collider outlines
- Toast: `engine.toast.show('+100', { color: '#ff0' })`
- Palettes: `PALETTES.neon`, `PALETTES.retro`, etc.
- Export: `bun run export` produces a single HTML file
- Templates: `platformer` template now available

## Step 7: Update tutorial

Add the new features to relevant sections of `docs/TUTORIAL.md`:
- Mention `engine.centerX`/`centerY` instead of `engine.width / 2`
- Mention built-in lifetime system (no longer need to write your own)
- Add persistence section (high scores that survive page reload)
- Add debug section (press backtick to see colliders)
- Add music section
- Add export section
- Mention platformer template
