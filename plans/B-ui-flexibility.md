# Plan B: UI Flexibility

## Problem
The UI layer is hardcoded for one game shape:
- `ui/store.ts` has fixed fields: `score`, `highScore`, `health`, `maxHealth`, 4 screen states
- `ui/App.tsx` renders exactly 4 hardcoded screens: `MainMenu`, `HUD`, `PauseMenu`, `GameOverScreen`
- `ui/hud/HUD.tsx` always shows Score + HealthBar
- Any new game type (puzzle, RPG, narrative) requires gutting and rewriting these files

## Solution: Split store into engine core + game extension, make screens pluggable

### Part 1: Split the Zustand store

**`ui/store.ts`** becomes a thin core with only engine-level state:

```ts
export type GameScreen = string;  // was: "menu" | "playing" | "paused" | "gameOver"

export interface CoreStore {
  // Engine-managed (always present)
  screen: GameScreen;
  fps: number;
  entityCount: number;
  sceneName: string;

  // Actions
  setScreen: (screen: GameScreen) => void;
  setDebugInfo: (fps: number, entityCount: number) => void;
  setSceneName: (name: string) => void;
}
```

**`ui/game-store.ts`** (new file) — a game-extensible store:

```ts
import { create } from 'zustand';

export interface DefaultGameStore {
  score: number;
  highScore: number;
  health: number;
  maxHealth: number;
  setScore: (score: number) => void;
  setHealth: (current: number, max: number) => void;
  reset: () => void;
}

/** Default game store — games can replace this entirely. */
export const useGameStore = create<DefaultGameStore>((set, get) => ({
  score: 0,
  highScore: 0,
  health: 100,
  maxHealth: 100,
  setScore: (score) => {
    const hs = Math.max(score, get().highScore);
    set({ score, highScore: hs });
  },
  setHealth: (current, max) => set({ health: current, maxHealth: max }),
  reset: () => set({ score: 0, health: 100, maxHealth: 100 }),
}));
```

**Keep backward compatibility**: Re-export a combined `useStore` that merges both:

```ts
// ui/store.ts — bottom of file
// Legacy compat: useStore still works for existing game code
export const useStore = /* combined selector that reads from both stores */
```

Actually, simpler approach — keep `useStore` as-is but make it extensible via a `gameState` bag:

```ts
export interface GameStore {
  // Core (engine-managed)
  screen: string;
  fps: number;
  entityCount: number;
  sceneName: string;

  // Default game fields (backward compat)
  score: number;
  highScore: number;
  health: number;
  maxHealth: number;

  // Game extension point
  gameState: Record<string, any>;
  setGameState: (key: string, value: any) => void;
  getGameState: <T>(key: string) => T | undefined;

  // All existing actions preserved
  setScreen: (screen: string) => void;
  setScore: (score: number) => void;
  setHealth: (current: number, max: number) => void;
  setDebugInfo: (fps: number, entityCount: number) => void;
  setSceneName: (name: string) => void;
  reset: () => void;
}
```

This way existing code (`useStore.getState().setScore(10)`) works unchanged, while new games can use `setGameState('lives', 3)` and `getGameState<number>('lives')`.

### Part 2: Pluggable screen components

**`ui/App.tsx`** currently hardcodes which React component renders for each screen. Change it to a registry pattern:

```ts
// ui/screen-registry.ts (new file)
import type { ComponentType } from 'react';

type ScreenRegistry = Map<string, ComponentType>;

const registry: ScreenRegistry = new Map();

export function registerScreen(name: string, component: ComponentType): void {
  registry.set(name, component);
}

export function getScreen(name: string): ComponentType | undefined {
  return registry.get(name);
}

export function getAllScreens(): ScreenRegistry {
  return registry;
}
```

**`ui/App.tsx`** becomes:

```tsx
import { useStore } from '@ui/store';
import { GameCanvas } from './GameCanvas';
import { getScreen } from './screen-registry';

export function App() {
  const screen = useStore(s => s.screen);
  const ScreenComponent = getScreen(screen);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
      <GameCanvas />
      {ScreenComponent && <ScreenComponent />}
    </div>
  );
}
```

**Register defaults** in a new `ui/defaults.ts`:

```ts
import { registerScreen } from './screen-registry';
import { MainMenu } from './screens/MainMenu';
import { GameOverScreen } from './screens/GameOverScreen';
import { PauseMenu } from './screens/PauseMenu';
import { HUD } from './hud/HUD';

// Default screens — games can override any of these
registerScreen('menu', MainMenu);
registerScreen('playing', HUD);
registerScreen('paused', () => <><HUD /><PauseMenu /></>);
registerScreen('gameOver', GameOverScreen);
```

**`ui/main.tsx`** (or wherever React mounts) imports `ui/defaults.ts` to register the defaults. Games can call `registerScreen()` to override any screen before the engine starts.

### Part 3: Make HUD composable

Instead of HUD always rendering Score + HealthBar, make it slot-based:

```ts
// ui/hud/HUD.tsx
import { getHUDComponents } from './hud-registry';
import { Debug } from './Debug';

export function HUD({ debug = false }: { debug?: boolean }) {
  const components = getHUDComponents();
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '12px 20px', pointerEvents: 'none', zIndex: 10 }}>
        {components.map((C, i) => <C key={i} />)}
      </div>
      {debug && <Debug />}
    </>
  );
}
```

```ts
// ui/hud/hud-registry.ts (new file)
import type { ComponentType } from 'react';

let hudComponents: ComponentType[] = [];

export function registerHUDComponent(component: ComponentType): void {
  hudComponents.push(component);
}

export function setHUDComponents(components: ComponentType[]): void {
  hudComponents = components;
}

export function getHUDComponents(): ComponentType[] {
  return hudComponents;
}
```

Default registration in `ui/defaults.ts`:
```ts
registerHUDComponent(Score);
registerHUDComponent(HealthBar);
```

### Part 4: Wire game setup into UI registration

**`ui/GameCanvas.tsx`** already calls `setupGame(engine)`. Extend `setupGame` to optionally return UI config:

```ts
// game/index.ts can now return:
export function setupGame(engine: Engine): string | { startScene: string; screens?: Record<string, ComponentType>; hud?: ComponentType[] } {
  // simple case (backward compat):
  return 'title';

  // or rich case:
  return {
    startScene: 'title',
    screens: { menu: MyCustomMenu, gameOver: MyGameOver },
    hud: [LivesCounter, LevelIndicator],
  };
}
```

GameCanvas reads the return value and registers screens/HUD before starting.

## Files touched
- `ui/store.ts` — widen `GameScreen` to `string`, add `gameState` bag + accessors
- `ui/screen-registry.ts` — new file, screen component registry
- `ui/hud/hud-registry.ts` — new file, HUD component registry
- `ui/defaults.ts` — new file, registers default screens + HUD components
- `ui/App.tsx` — use registry instead of hardcoded screens
- `ui/hud/HUD.tsx` — use registry instead of hardcoded Score + HealthBar
- `ui/GameCanvas.tsx` — handle extended setupGame return type, register game screens
- `ui/main.tsx` — import defaults

## Files NOT touched (important for parallelism)
- `shared/types.ts` — Agent A owns this
- `engine/` — no engine changes needed
- `game/` — existing game code stays identical (backward compat)
- `scripts/` — Agent C owns this

## Verification
- `bun run check` passes
- `bun run build` succeeds
- `bun dev` — asteroid-field game looks and plays identically (defaults registered)
- Verify: calling `registerScreen('playing', MyHUD)` replaces the default HUD
- Verify: `useStore.getState().setGameState('lives', 3)` works
