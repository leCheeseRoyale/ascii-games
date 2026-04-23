# Wiring Guide — How to Connect a New Game

Step-by-step reference for the two most common agent tasks: wiring a `defineGame` module and wiring an ECS game.

---

## Option A: `defineGame` (turn-based / board / puzzle)

### 1. Create the game module

```ts
// game/my-game.ts
import { defineGame, type Engine, type MoveInputCtx } from "@engine";
const Empty = () => null;

type State = { /* your game state */ };
type Player = "A" | "B"; // or string | number

export const myGame = defineGame<State, Player>({
  name: "my-game",
  players: { min: 2, max: 2, default: 2 },
  setup: (ctx) => ({ /* initial state */ }),
  turns: { order: ["A", "B"], autoEnd: true },
  moves: {
    myMove(ctx, ...args) {
      // mutate ctx.state directly
      // return "invalid" to reject
    },
  },
  endIf(ctx) {
    // return { winner } / { draw: true } / undefined
  },
  render(ctx) {
    // draw with ctx.engine.ui.*, read input, dispatch ctx.moves.*
  },
});
```

### 2. Wire as the entry point

```ts
// game/index.ts
import type { Engine } from "@engine";
import { myGame } from "./my-game";

const Empty = () => null;

export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(myGame),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
```

### 3. Or: use AI to generate from a pitch

```bash
bun run ai:game "2-player strategy where you place walls to maze a runner"
# → game/maze-runner.ts
# Prints import lines to paste into game/index.ts
```

### `render()` common patterns

```ts
render(ctx) {
  const e = ctx.engine;

  // Draw a panel
  e.ui.panel(x, y, w, h, { border: "double", bg: "#0a0a0a" });

  // Draw text
  e.ui.text(x, y, "Hello", { font: '20px "Fira Code", monospace', color: "#e0e0e0" });

  // Draw a bar
  e.ui.bar(x, y, width, hp / maxHp, { fillColor: "#0f8", emptyColor: "#222" });

  // Handle mouse click
  if (e.mouse.justDown && !ctx.result) {
    const col = Math.floor((e.mouse.x - offsetX) / cellSize);
    if (col >= 0 && col < numCols) ctx.moves.place(col);
  }

  // Handle keyboard
  if (e.keyboard.pressed("KeyR")) ctx.moves.reset();
  if (e.keyboard.pressed("Escape")) e.loadScene("title");

  // Show game-over status
  if (ctx.result) {
    const msg = ctx.result.draw ? "Draw!" : `${ctx.result.winner} wins!`;
    e.ui.text(e.width / 2, 20, msg, { align: "center", font: '24px "Fira Code", monospace', color: "#ff0" });
  }
},
```

### Phases (multi-phase turns)

```ts
phases: {
  order: ["place", "resolve"],
  place: {
    moves: ["placeTile"],  // only these moves allowed
    endIf: (ctx) => allTilesPlaced(ctx) ? "resolve" : null,
  },
  resolve: {
    onEnter: (ctx) => { /* score the round */ },
    endIf: (ctx) => "place", // always go back
  },
},
```

---

## Option B: `defineScene` + `defineSystem` (real-time / ECS)

### 1. Create entity factories

```ts
// game/entities/player.ts
import { createTags, FONTS, type Entity } from "@engine";
import { GAME } from "../config";

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: "@", font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
    collider: "auto" as const,
    physics: { gravity: 0, friction: 0.85 },
    tags: createTags("player"),
  };
}
```

### 2. Create systems

```ts
// game/systems/player-input.ts
import { defineSystem, type Engine } from "@engine";
import { GAME } from "../config";

export const playerInputSystem = defineSystem({
  name: "playerInput",
  update(engine: Engine) {
    for (const e of engine.world.with("position", "velocity", "tags")) {
      if (!e.tags.values.has("player")) continue;
      const speed = GAME.player.speed;
      // Set velocity only — _physics handles position integration
      e.velocity.vx = (engine.keyboard.held("KeyD") ? speed : 0) - (engine.keyboard.held("KeyA") ? speed : 0);
      e.velocity.vy = (engine.keyboard.held("KeyS") ? speed : 0) - (engine.keyboard.held("KeyW") ? speed : 0);
    }
  },
});
```

### 3. Create scenes

```ts
// game/scenes/play.ts
import { defineScene, type Engine } from "@engine";
import { useStore } from "@ui/store";
import { createPlayer } from "../entities/player";
import { playerInputSystem } from "../systems/player-input";
import { collisionSystem } from "../systems/collision";

export const playScene = defineScene({
  name: "play",
  setup(engine: Engine) {
    useStore.getState().setScreen("playing");
    useStore.getState().setScore(0);
    engine.spawn(createPlayer(engine.centerX, engine.centerY));
    engine.addSystem(playerInputSystem);
    engine.addSystem(collisionSystem);
  },
  update(engine: Engine, dt: number) {
    if (engine.keyboard.pressed("Escape")) engine.loadScene("title");
  },
});
```

### 4. Wire the entry point

```ts
// game/index.ts
import type { Engine } from "@engine";
import { playScene } from "./scenes/play";
import { titleScene } from "./scenes/title";

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  return "title";
}
```

### 5. Add config

```ts
// game/config.ts
export const GAME = {
  title: "My Game",
  description: "A cool game",
  player: { speed: 200, color: "#00ff88", glow: "#00ff8844" },
} as const;
```

---

## Common Wiring Tasks

### Add a new scene to an existing game

1. `bun run new:scene <name>` → creates `game/scenes/<name>.ts`
2. Import in `game/index.ts`: `import { myScene } from './scenes/<name>'`
3. Register: `engine.registerScene(myScene)`
4. Navigate to it: `engine.loadScene('<name>', { transition: "fade", duration: 0.4 })`

### Add a new system

1. `bun run new:system <name>` → creates `game/systems/<name>.ts`
2. Import in your scene: `import { mySystem } from '../systems/<name>'`
3. Add in scene setup: `engine.addSystem(mySystem)`

### Add a new entity factory

1. `bun run new:entity <name>` → creates `game/entities/<name>.ts`
2. Import where needed: `import { createMyEntity } from '../entities/<name>'`
3. Spawn: `engine.spawn(createMyEntity(x, y))`

### Add score to the React HUD

```ts
// In game code (scene update, system, etc.):
import { useStore } from "@ui/store";
useStore.getState().setScore(score);
// The default HUD component in ui/ already displays score
```

### Suppress React HUD for canvas-only games

```ts
// game/index.ts
const Empty = () => null;
export function setupGame(engine: Engine) {
  return {
    startScene: "play",
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
```

### Pass data between scenes

```ts
// Sender:
engine.loadScene("gameOver", { transition: "fade", data: { score: 100, won: true } });
// Receiver (in scene setup):
const { score = 0, won = false } = engine.sceneData;
```

### Add turn-based phases (roguelike-style)

```ts
// In scene setup:
engine.turns.configure({ phases: ["player", "enemy", "resolve"] });
engine.turns.start();

// Systems get a phase:
defineSystem({ name: "enemyAI", phase: "enemy", update(engine, dt) { /* ... */ } });

// Advance from within a system:
engine.turns.endPhase();
```
