# React Bridge

The hard boundary between the game loop and React UI.

## Architecture

The game loop and React live in separate worlds. The zustand store is the ONLY bridge between them. There is no shared mutable state, no direct function calls across the boundary.

```
Game Loop ──writes──▶ zustand store ◀──reads── React UI
React UI ──emits───▶ event bus ────▶ Game Loop
```

## Data Flow: Game → UI

The game loop writes to the store using the imperative getState() API:

```ts
import { useStore } from '@/ui/store'

// Inside a system — no React hooks, no subscriptions
useStore.getState().setScore(score)
useStore.getState().setHealth(player.health.current)
useStore.getState().setScreen('gameOver')
```

React reads via hooks with selectors:

```ts
const score = useStore(s => s.score)
const health = useStore(s => s.health)
const screen = useStore(s => s.screen)
```

Zustand only re-renders components whose selected slice changed.

## Data Flow: UI → Game

React never writes to the ECS. Instead, it emits events through the shared event bus:

```ts
import { events } from '@/shared/events'

// In a React onClick handler
events.emit('game:start')
events.emit('game:resume')
events.emit('game:restart')
```

The GameCanvas component listens for these events and translates them into engine calls (loadScene, resume, etc).

## GameScreen Overlay Routing

The `GameScreen` type controls which overlay React renders:

| Screen      | Overlay           |
|-------------|-------------------|
| `'menu'`    | MainMenu          |
| `'playing'` | HUD               |
| `'paused'`  | PauseMenu         |
| `'gameOver'`| GameOverScreen    |

App.tsx switches on `useStore(s => s.screen)` to pick the overlay. The GameCanvas always renders underneath — it never unmounts.

## GameCanvas.tsx — Engine Lifecycle Owner

GameCanvas is the single component that owns the Engine instance:

1. **Mount**: Creates Engine with canvas ref, calls `setupGame(engine)` to register scenes, calls `engine.start(sceneName)` with the returned initial scene name.
2. **Events**: Listens for `game:start` → `loadScene('play')`, `game:resume` → `resume()` + `setScreen('playing')`, `game:restart` → `loadScene('play')`.
3. **Unmount**: Calls `engine.stop()` for cleanup.

The canvas fills the viewport via CSS. No other component touches the Engine.

## Hard Rules

1. **Game never imports from `ui/`** — it only calls `useStore.getState().setX()` to push data out.
2. **React never writes to ECS** — it only emits events via the event bus.
3. **No direct references** — game systems don't hold React refs; React components don't hold entity references.
4. **One bridge** — zustand is it. No other shared mutable state.

## Why This Works

- Game loop runs at 60fps in requestAnimationFrame. React re-renders only when store slices change.
- No React rendering in the hot path. getState() is synchronous and free.
- Event bus is fire-and-forget. UI doesn't block on game response.
- Clean separation means either side can be tested independently.

## See Also

- [[engine-overview]] — The Engine class that GameCanvas manages
- [[scene-lifecycle]] — How scenes load and transition
- [[zustand-store]] — Full store shape and actions
