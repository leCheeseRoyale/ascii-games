# Zustand Store

The central state bridge between the game loop and React UI.

## GameScreen Type

```ts
type GameScreen = 'menu' | 'playing' | 'paused' | 'gameOver'
```

Controls which overlay React renders in App.tsx.

## GameStore Shape

```ts
interface GameStore {
  // UI state
  screen: GameScreen
  sceneName: string

  // Game state (written by game loop, read by React)
  score: number
  highScore: number
  health: number
  maxHealth: number

  // Debug info
  fps: number
  entityCount: number

  // Actions
  setScreen: (screen: GameScreen) => void
  setScore: (score: number) => void
  setHealth: (health: number, maxHealth?: number) => void
  setDebugInfo: (fps: number, entityCount: number) => void
  setSceneName: (name: string) => void
  reset: () => void
}
```

## Initial State

```ts
{
  screen: 'menu',
  sceneName: '',
  score: 0,
  highScore: 0,
  health: 3,
  maxHealth: 3,
  fps: 0,
  entityCount: 0,
}
```

## Actions

### setScreen(screen)
Sets the current screen. React's App.tsx switches overlays based on this value.

### setScore(score)
Sets the score and automatically tracks the high score:
```ts
setScore: (score) => set({ score, highScore: Math.max(score, get().highScore) })
```

### setHealth(health, maxHealth?)
Updates current health and optionally maxHealth.

### setDebugInfo(fps, entityCount)
Called every frame by the engine to update debug overlay values.

### setSceneName(name)
Tracks which scene is currently loaded.

### reset()
Resets game state for a new game but preserves highScore:
```ts
reset: () => set({
  score: 0,
  health: 3,
  maxHealth: 3,
  screen: 'menu',
  // highScore intentionally NOT reset
})
```

## Access Patterns

### From Game Loop (outside React)

Use the imperative `getState()` API — no hooks, no subscriptions:

```ts
import { useStore } from '@/ui/store'

// In a system update function
useStore.getState().setScore(newScore)
useStore.getState().setHealth(player.health.current)
useStore.getState().setScreen('gameOver')
```

This is synchronous and has zero overhead. It does not trigger React renders — React only re-renders when a subscribed selector's value changes.

### From React Components

Use the hook with a selector to subscribe to specific slices:

```ts
// Only re-renders when score changes
const score = useStore(s => s.score)

// Only re-renders when screen changes
const screen = useStore(s => s.screen)

// Multiple values — re-renders when either changes
const { health, maxHealth } = useStore(s => ({
  health: s.health,
  maxHealth: s.maxHealth,
}))
```

## Game-Specific State

The `gameState` bag and `StoreSlice` pattern allow games to extend the store without modifying core types.

**Quick approach** -- key-value bag (no type safety):

```ts
store.setGameState('ammo', 30)
store.getGameState<number>('ammo')
```

**Typed approach** -- `StoreSlice` returned from `setupGame`:

```ts
const gameSlice: StoreSlice<MyGameState> = {
  initialState: { ammo: 30, wave: 1 },
  actions: (set, get) => ({
    setAmmo: (n: number) => set({ ammo: n }),
    nextWave: () => set({ wave: get().wave + 1 }),
  }),
}

export function setupGame(engine: Engine) {
  return { startScene: 'play', store: gameSlice }
}
```

`GameCanvas` calls `extendStore()` automatically when `setupGame` returns a `store` field. Access typed state via `typedStore<MyGameState>()`.

## Why Zustand

- Works outside React (getState/setState are plain functions)
- No Provider wrapper needed
- Selectors prevent unnecessary re-renders
- Tiny bundle size
- Simple API — just a function that returns an object

## See Also

- [[react-bridge]] — How the store bridges game loop and React
- [[asteroid-field-game]] — Example game that uses the store
