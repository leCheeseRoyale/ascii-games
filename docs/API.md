# ASCII Game Engine — API Reference

---

## 1. Engine Class

`import { Engine } from 'engine/core/engine'`

### Constructor

```ts
new Engine(canvas: HTMLCanvasElement, config?: Partial<EngineConfig>)
```

Creates the engine instance bound to a canvas element. Merges provided config with `DEFAULT_CONFIG`.

```ts
const canvas = document.getElementById('game') as HTMLCanvasElement;
const engine = new Engine(canvas, { width: 800, height: 600, debug: true });
```

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `config` | `EngineConfig` | Merged engine configuration |
| `world` | `GameWorld` | Miniplex ECS world instance |
| `systems` | `SystemRunner` | Manages registered systems |
| `scenes` | `SceneManager` | Manages registered scenes |
| `renderer` | `AsciiRenderer` | Canvas ASCII renderer |
| `camera` | `Camera` | Camera with pan, zoom, shake |
| `keyboard` | `Keyboard` | Keyboard input state |
| `mouse` | `Mouse` | Mouse input state |

### Getters

```ts
get time: GameTime
```
Returns current frame timing info (dt, elapsed, frame, fps).
```ts
const { dt, elapsed, fps } = engine.time;
```

```ts
get width: number
```
Returns the configured canvas width.
```ts
const w = engine.width;
```

```ts
get height: number
```
Returns the configured canvas height.
```ts
const h = engine.height;
```

```ts
get isPaused: boolean
```
Returns whether the engine loop is paused.
```ts
if (engine.isPaused) { /* show pause menu */ }
```

### Public Methods

```ts
spawn(components: Partial<Entity>): Entity
```
Creates a new entity in the world with the given components.
```ts
const bullet = engine.spawn({
  position: { x: 100, y: 200 },
  velocity: { vx: 5, vy: 0 },
  ascii: { char: '*', font: FONTS.normal, color: COLORS.accent }
});
```

```ts
destroy(entity: Entity): void
```
Removes an entity from the world.
```ts
engine.destroy(bullet);
```

```ts
addSystem(system: System): void
```
Registers and initializes a system in the engine.
```ts
engine.addSystem(defineSystem({ name: 'gravity', update: (e, dt) => { /* ... */ } }));
```

```ts
removeSystem(name: string): void
```
Removes a system by name, calling its cleanup if defined.
```ts
engine.removeSystem('gravity');
```

```ts
registerScene(scene: Scene): void
```
Registers a scene for later loading.
```ts
engine.registerScene(menuScene);
```

```ts
loadScene(name: string): Promise<void>
```
Transitions to a named scene (cleans up current, calls setup on new).
```ts
await engine.loadScene('gameplay');
```

```ts
start(sceneName: string): Promise<void>
```
Starts the engine loop and loads the initial scene.
```ts
await engine.start('menu');
```

```ts
stop(): void
```
Stops the engine loop and destroys input listeners.
```ts
engine.stop();
```

```ts
pause(): void
```
Pauses the game loop (rendering continues, updates stop).
```ts
engine.pause();
```

```ts
resume(): void
```
Resumes the game loop after pause.
```ts
engine.resume();
```

---

## 2. Scene API

`import { defineScene, SceneManager } from 'engine/core/scene'`

### Scene Interface

```ts
interface Scene {
  name: string;
  setup: (engine: Engine) => void | Promise<void>;
  update?: (engine: Engine, dt: number) => void;
  cleanup?: (engine: Engine) => void;
}
```

### defineScene()

```ts
defineScene(scene: Scene): Scene
```
Identity helper that returns the scene object (provides type checking).
```ts
const menuScene = defineScene({
  name: 'menu',
  setup(engine) {
    engine.spawn({ position: { x: 400, y: 300 }, ascii: { char: 'PLAY', font: FONTS.huge, color: COLORS.accent } });
  },
  update(engine, dt) {
    if (engine.keyboard.pressed('Enter')) engine.loadScene('gameplay');
  },
  cleanup(engine) {
    engine.world.clear();
  }
});
```

### SceneManager

```ts
class SceneManager
```

```ts
register(scene: Scene): void
```
Registers a scene by name.
```ts
sceneManager.register(menuScene);
```

```ts
load(name: string, engine: Engine): Promise<void>
```
Cleans up the current scene and sets up the new one.
```ts
await sceneManager.load('gameplay', engine);
```

```ts
update(engine: Engine, dt: number): void
```
Calls the current scene's update function if defined.
```ts
sceneManager.update(engine, dt);
```

```ts
current: Scene | null
```
The currently active scene, or null.

---

## 3. System API

`import { defineSystem, SystemRunner } from 'engine/ecs/systems'`

### System Interface

```ts
interface System {
  name: string;
  update: (engine: Engine, dt: number) => void;
  init?: (engine: Engine) => void;
  cleanup?: (engine: Engine) => void;
}
```

### defineSystem()

```ts
defineSystem(system: System): System
```
Identity helper that returns the system object (provides type checking).
```ts
const movementSystem = defineSystem({
  name: 'movement',
  update(engine, dt) {
    for (const e of engine.world.with('position', 'velocity')) {
      e.position.x += e.velocity.vx * dt;
      e.position.y += e.velocity.vy * dt;
    }
  }
});
```

### SystemRunner

```ts
class SystemRunner
```

```ts
add(system: System, engine: Engine): void
```
Adds a system and calls its `init()` if defined.
```ts
runner.add(movementSystem, engine);
```

```ts
remove(name: string, engine: Engine): void
```
Removes a system by name and calls its `cleanup()` if defined.
```ts
runner.remove('movement', engine);
```

```ts
update(engine: Engine, dt: number): void
```
Runs all registered systems in order.
```ts
runner.update(engine, dt);
```

```ts
clear(engine: Engine): void
```
Removes all systems, calling cleanup on each.
```ts
runner.clear(engine);
```

```ts
list(): string[]
```
Returns an array of registered system names.
```ts
console.log(runner.list()); // ['movement', 'collision', 'render']
```

---

## 4. ECS / World

`import { createWorld } from 'engine/ecs/world'`

### createWorld()

```ts
createWorld(): World<Entity>
```
Creates a new miniplex World typed to the engine's Entity type.
```ts
const world = createWorld();
```

### Type Aliases

```ts
type GameWorld = ReturnType<typeof createWorld>;  // World<Entity>
type GameEntity = Entity;
```

### World Methods (from miniplex)

```ts
world.add(entity: Partial<Entity>): Entity
```
Adds an entity to the world.
```ts
const e = world.add({ position: { x: 0, y: 0 } });
```

```ts
world.remove(entity: Entity): void
```
Removes an entity from the world.
```ts
world.remove(e);
```

```ts
world.clear(): void
```
Removes all entities from the world.
```ts
world.clear();
```

```ts
world.with(...components: string[]): Iterable<Entity>
```
Returns an archetype query — an iterable of all entities that have the specified components.
```ts
for (const e of world.with('position', 'velocity')) {
  e.position.x += e.velocity.vx;
}
```

---

## 5. Components Reference

`import type { ... } from 'shared/types'`

### Entity

```ts
type Entity = Partial<{
  position: Position;
  velocity: Velocity;
  acceleration: Acceleration;
  ascii: Ascii;
  textBlock: TextBlock;
  collider: Collider;
  health: Health;
  lifetime: Lifetime;
  player: Player;
  obstacle: Obstacle;
  particleEmitter: ParticleEmitter;
  tags: Tags;
}>
```

### Component Types

| Component | Shape | Description |
|-----------|-------|-------------|
| `Position` | `{ x: number, y: number }` | World position |
| `Velocity` | `{ vx: number, vy: number }` | Velocity vector |
| `Acceleration` | `{ ax: number, ay: number }` | Acceleration vector |
| `Ascii` | `{ char: string, font: string, color: string, glow?: string, opacity?: number, scale?: number }` | Visual representation |
| `TextBlock` | `{ text: string, font: string, maxWidth: number, lineHeight: number, color: string }` | Multi-line text block |
| `Collider` | `{ type: 'circle' \| 'rect', width: number, height: number, sensor?: boolean }` | Collision shape |
| `Health` | `{ current: number, max: number }` | Hit points |
| `Lifetime` | `{ remaining: number }` | Auto-destroy timer (seconds) |
| `Player` | `{ index: number }` | Player identifier |
| `Obstacle` | `{ radius: number }` | Text-flow obstacle radius |
| `ParticleEmitter` | `{ rate: number, spread: number, speed: number, lifetime: number, char: string, color: string, _acc: number }` | Particle spawning config |
| `Tags` | `{ values: Set<string> }` | Arbitrary string tags |

### Supporting Types

```ts
interface GameTime {
  dt: number;       // Delta time in seconds
  elapsed: number;  // Total elapsed time in seconds
  frame: number;    // Frame counter
  fps: number;      // Current FPS
}

interface InputState {
  keys: Set<string>;
  justPressed: Set<string>;
  justReleased: Set<string>;
  mouse: { x: number, y: number };
  mouseJustDown: boolean;
  mouseJustUp: boolean;
}

interface EngineConfig {
  width: number;
  height: number;
  targetFps: number;
  bgColor: string;
  font: string;
  fontSize: number;
  debug: boolean;
}
```

`DEFAULT_CONFIG` is exported as the default `EngineConfig` values.

---

## 6. Rendering

### AsciiRenderer

`import { AsciiRenderer } from 'engine/render/ascii-renderer'`

```ts
class AsciiRenderer
```

#### Constructor

```ts
new AsciiRenderer(canvas: HTMLCanvasElement)
```
Initializes the 2D rendering context on the given canvas.
```ts
const renderer = new AsciiRenderer(canvas);
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `canvas` | `HTMLCanvasElement` | The bound canvas element |
| `ctx` | `CanvasRenderingContext2D` | The 2D drawing context |
| `width` | `number` | Current canvas width |
| `height` | `number` | Current canvas height |

#### Methods

```ts
resize(): void
```
Resizes the canvas to match its display size.
```ts
renderer.resize();
```

```ts
render(world: GameWorld, config: EngineConfig, camera: Camera): void
```
Clears the canvas and draws all text blocks (with obstacle flow) and ASCII entities.
```ts
renderer.render(engine.world, engine.config, engine.camera);
```

### Text Layout Functions

`import { layoutTextBlock, layoutTextAroundObstacles, measureHeight, getLineCount, shrinkwrap, clearTextCache } from 'engine/render/text-layout'`

#### RenderedLine Type

```ts
interface RenderedLine {
  text: string;
  x: number;
  y: number;
  width: number;
}
```

```ts
layoutTextBlock(text: string, font: string, maxWidth: number, lineHeight: number): { text: string, width: number }[]
```
Wraps text into lines that fit within maxWidth. Returns array of line objects.
```ts
const lines = layoutTextBlock('Hello world', FONTS.normal, 400, 20);
// [{ text: 'Hello world', width: 132 }]
```

```ts
layoutTextAroundObstacles(
  text: string, font: string, startX: number, startY: number,
  maxWidth: number, lineHeight: number,
  obstacles: { x: number, y: number, radius: number }[]
): RenderedLine[]
```
Wraps text, flowing around circular obstacles. Returns positioned lines.
```ts
const lines = layoutTextAroundObstacles('Long text...', FONTS.normal, 0, 0, 800, 20, [{ x: 400, y: 100, radius: 50 }]);
```

```ts
measureHeight(text: string, font: string, maxWidth: number, lineHeight: number): number
```
Returns the total pixel height the text would occupy when wrapped.
```ts
const h = measureHeight('Some text', FONTS.normal, 400, 20); // 40
```

```ts
getLineCount(text: string, font: string, maxWidth: number): number
```
Returns the number of wrapped lines the text would produce.
```ts
const n = getLineCount('Some text', FONTS.normal, 400); // 2
```

```ts
shrinkwrap(text: string, font: string, maxWidth: number): number
```
Returns the minimum width needed to render the text (tightest wrap).
```ts
const minW = shrinkwrap('Hello', FONTS.normal, 400); // 60
```

```ts
clearTextCache(): void
```
Clears the internal measurement cache (Map). Call on font/size changes.
```ts
clearTextCache();
```

---

## 7. Camera

`import { Camera } from 'engine/render/camera'`

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | Camera X position |
| `y` | `number` | Camera Y position |
| `zoom` | `number` | Zoom level (1 = default) |
| `shakeX` | `number` | Current horizontal shake offset |
| `shakeY` | `number` | Current vertical shake offset |

### Methods

```ts
moveTo(x: number, y: number): void
```
Instantly moves the camera to the given position.
```ts
camera.moveTo(400, 300);
```

```ts
panTo(x: number, y: number, smoothing?: number): void
```
Smoothly pans toward a target position. Default smoothing is applied if omitted.
```ts
camera.panTo(player.position.x, player.position.y, 0.1);
```

```ts
follow(x: number, y: number, smoothing?: number): void
```
Follows a target position with smoothing (same as panTo, semantic alias).
```ts
camera.follow(player.position.x, player.position.y, 0.05);
```

```ts
setZoom(z: number): void
```
Sets the camera zoom level.
```ts
camera.setZoom(2.0);
```

```ts
shake(magnitude?: number): void
```
Triggers a screen shake effect with optional magnitude.
```ts
camera.shake(10);
```

```ts
update(dt: number): void
```
Updates shake decay and any pending pan interpolation. Called automatically by the engine loop.
```ts
camera.update(dt);
```

---

## 8. Particles

`import { ParticlePool } from 'engine/render/particles'`

### Particle Type

```ts
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  color: string;
  life: number;
  maxLife: number;
  font: string;
}
```

### ParticlePool

```ts
class ParticlePool
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `particles` | `Particle[]` | Active particle array |

#### Methods

```ts
burst(opts: {
  x: number,
  y: number,
  count: number,
  chars: string[],
  color: string,
  speed?: number,
  spread?: number,
  lifetime?: number,
  font?: string
}): void
```
Spawns a burst of particles at a position.
```ts
pool.burst({
  x: 100, y: 200, count: 20,
  chars: ['*', '.', '+'],
  color: COLORS.accent,
  speed: 100, spread: Math.PI * 2, lifetime: 0.8
});
```

```ts
update(dt: number): void
```
Updates all particle positions and removes dead particles.
```ts
pool.update(dt);
```

```ts
render(ctx: CanvasRenderingContext2D): void
```
Draws all living particles to the canvas context.
```ts
pool.render(renderer.ctx);
```

```ts
clear(): void
```
Removes all particles.
```ts
pool.clear();
```

---

## 9. Input

### Keyboard

`import { Keyboard } from 'engine/input/keyboard'`

Automatically prevents default behavior for Arrow keys, Space, and Tab.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `keys` | `Set<string>` | Currently held key codes |
| `justPressed` | `Set<string>` | Keys pressed this frame |
| `justReleased` | `Set<string>` | Keys released this frame |

#### Methods

```ts
held(code: string): boolean
```
Returns true if the key is currently held down.
```ts
if (engine.keyboard.held('ArrowRight')) player.position.x += speed * dt;
```

```ts
pressed(code: string): boolean
```
Returns true if the key was just pressed this frame.
```ts
if (engine.keyboard.pressed('Space')) shoot();
```

```ts
released(code: string): boolean
```
Returns true if the key was just released this frame.
```ts
if (engine.keyboard.released('KeyE')) interact();
```

```ts
update(): void
```
Clears justPressed/justReleased sets. Called automatically by the engine.

```ts
destroy(): void
```
Removes all event listeners. Called by `engine.stop()`.

### Mouse

`import { Mouse } from 'engine/input/mouse'`

#### Constructor

```ts
new Mouse(canvas: HTMLCanvasElement)
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | Mouse X relative to canvas |
| `y` | `number` | Mouse Y relative to canvas |
| `down` | `boolean` | Whether mouse button is held |
| `justDown` | `boolean` | Mouse pressed this frame |
| `justUp` | `boolean` | Mouse released this frame |

#### Methods

```ts
update(): void
```
Clears justDown/justUp flags. Called automatically by the engine.

```ts
destroy(): void
```
Removes all event listeners. Called by `engine.stop()`.

```ts
if (engine.mouse.justDown) {
  engine.spawn({
    position: { x: engine.mouse.x, y: engine.mouse.y },
    ascii: { char: 'X', font: FONTS.normal, color: COLORS.danger }
  });
}
```

---

## 10. Collision

`import { overlaps, overlapAll } from 'engine/physics/collision'`

### Collidable Interface

```ts
interface Collidable {
  position: Position;
  collider: Collider;
}
```

### overlaps()

```ts
overlaps(a: Collidable, b: Collidable): boolean
```
Tests if two collidable entities overlap. Supports circle-circle, rect-rect, and circle-rect combinations.
```ts
if (overlaps(player, enemy)) {
  player.health.current -= 1;
}
```

### overlapAll()

```ts
overlapAll<T extends Collidable>(entity: Collidable, others: T[]): T[]
```
Returns all entities from `others` that overlap with `entity`.
```ts
const hits = overlapAll(bullet, [...engine.world.with('position', 'collider')]);
for (const hit of hits) engine.destroy(hit);
```

---

## 11. Audio

`import { beep, sfx } from 'engine/audio/audio'`

### ToneOpts

```ts
interface ToneOpts {
  freq?: number;
  duration?: number;
  type?: OscillatorType;  // 'sine' | 'square' | 'sawtooth' | 'triangle'
  volume?: number;
}
```

### beep()

```ts
beep(opts?: ToneOpts): void
```
Plays a short synthesized tone using Web Audio oscillators.
```ts
beep({ freq: 440, duration: 0.1, type: 'square', volume: 0.3 });
```

### sfx

Pre-configured sound effects object.

```ts
const sfx: {
  shoot: () => void;
  hit: () => void;
  pickup: () => void;
  explode: () => void;
  menu: () => void;
  death: () => void;
}
```

```ts
sfx.shoot();
sfx.explode();
sfx.pickup();
```

---

## 12. Utils

### Math

`import { vec2, add, sub, scale, len, normalize, dist, dot, lerp, clamp, rng, rngInt, pick, chance } from 'engine/utils/math'`

#### Vec2 Type

```ts
interface Vec2 {
  x: number;
  y: number;
}
```

```ts
vec2(x?: number, y?: number): Vec2
```
Creates a 2D vector. Defaults to (0, 0).
```ts
const v = vec2(10, 20);
```

```ts
add(a: Vec2, b: Vec2): Vec2
```
Returns the sum of two vectors.
```ts
const c = add(vec2(1, 2), vec2(3, 4)); // { x: 4, y: 6 }
```

```ts
sub(a: Vec2, b: Vec2): Vec2
```
Returns the difference of two vectors.
```ts
const d = sub(vec2(5, 5), vec2(2, 1)); // { x: 3, y: 4 }
```

```ts
scale(v: Vec2, s: number): Vec2
```
Scales a vector by a scalar.
```ts
const scaled = scale(vec2(3, 4), 2); // { x: 6, y: 8 }
```

```ts
len(v: Vec2): number
```
Returns the magnitude (length) of a vector.
```ts
len(vec2(3, 4)); // 5
```

```ts
normalize(v: Vec2): Vec2
```
Returns the unit vector (length 1) in the same direction.
```ts
normalize(vec2(3, 4)); // { x: 0.6, y: 0.8 }
```

```ts
dist(a: Vec2, b: Vec2): number
```
Returns the Euclidean distance between two points.
```ts
dist(vec2(0, 0), vec2(3, 4)); // 5
```

```ts
dot(a: Vec2, b: Vec2): number
```
Returns the dot product of two vectors.
```ts
dot(vec2(1, 0), vec2(0, 1)); // 0
```

```ts
lerp(a: number, b: number, t: number): number
```
Linearly interpolates between a and b by t (0–1).
```ts
lerp(0, 100, 0.5); // 50
```

```ts
clamp(v: number, min: number, max: number): number
```
Clamps a value between min and max.
```ts
clamp(150, 0, 100); // 100
```

```ts
rng(min: number, max: number): number
```
Returns a random float in [min, max).
```ts
const speed = rng(50, 150);
```

```ts
rngInt(min: number, max: number): number
```
Returns a random integer in [min, max].
```ts
const dmg = rngInt(1, 10);
```

```ts
pick<T>(arr: T[]): T
```
Returns a random element from an array.
```ts
const char = pick(['*', '+', '.', 'o']);
```

```ts
chance(p: number): boolean
```
Returns true with probability p (0–1).
```ts
if (chance(0.1)) spawnPowerup();
```

### Timer

`import { Cooldown, tween, easeOut } from 'engine/utils/timer'`

#### Cooldown Class

```ts
class Cooldown {
  constructor(duration: number);
  ready: boolean;
  fire(): boolean;
  update(dt: number): void;
  reset(): void;
}
```

```ts
const shootCooldown = new Cooldown(0.25);
// In update:
shootCooldown.update(dt);
if (engine.keyboard.held('Space') && shootCooldown.fire()) {
  shoot();
}
```

```ts
fire(): boolean
```
Returns true and resets the timer if the cooldown is ready; false otherwise.

```ts
update(dt: number): void
```
Advances the cooldown timer by dt seconds.

```ts
reset(): void
```
Resets the cooldown to its full duration.

`ready: boolean` — True when the cooldown has elapsed.

#### tween()

```ts
tween(elapsed: number, a: number, b: number, duration: number): number
```
Linear interpolation from a to b over duration based on elapsed time.
```ts
const x = tween(elapsed, 0, 400, 2.0); // 0→400 over 2 seconds
```

#### easeOut()

```ts
easeOut(elapsed: number, a: number, b: number, duration: number): number
```
Ease-out interpolation from a to b over duration (decelerating).
```ts
const scale = easeOut(elapsed, 2.0, 1.0, 0.5); // 2→1 with ease-out over 0.5s
```

### Color

`import { hsl, hsla, rainbow, lerpColor } from 'engine/utils/color'`

```ts
hsl(h: number, s: number, l: number): string
```
Returns an HSL color string.
```ts
hsl(120, 100, 50); // 'hsl(120, 100%, 50%)'
```

```ts
hsla(h: number, s: number, l: number, a: number): string
```
Returns an HSLA color string with alpha.
```ts
hsla(0, 100, 50, 0.5); // 'hsla(0, 100%, 50%, 0.5)'
```

```ts
rainbow(elapsed: number, speed?: number, s?: number, l?: number): string
```
Returns a cycling rainbow HSL color based on elapsed time.
```ts
entity.ascii.color = rainbow(engine.time.elapsed, 2, 100, 60);
```

```ts
lerpColor(a: string, b: string, t: number): string
```
Interpolates between two color strings by t (0–1).
```ts
const c = lerpColor('#ff0000', '#00ff00', 0.5);
```

---

## 13. Store (Zustand)

`import { useStore } from 'ui/store'`

### GameScreen Type

```ts
type GameScreen = 'menu' | 'playing' | 'paused' | 'gameOver';
```

### GameStore

```ts
interface GameStore {
  // State
  screen: GameScreen;
  score: number;
  highScore: number;
  health: number;
  maxHealth: number;
  fps: number;
  entityCount: number;
  sceneName: string;

  // Actions
  setScreen: (screen: GameScreen) => void;
  setScore: (score: number) => void;
  setHealth: (health: number, maxHealth: number) => void;
  setDebugInfo: (fps: number, entityCount: number) => void;
  setSceneName: (name: string) => void;
  reset: () => void;
}
```

### useStore

```ts
const useStore: UseBoundStore<StoreApi<GameStore>>
```

```ts
// In a React component:
const score = useStore(s => s.score);
const setScreen = useStore(s => s.setScreen);

// Outside React:
useStore.getState().setScore(100);
useStore.getState().reset();
```

---

## 14. Events

`import { events } from 'shared/events'`

### EventBus (singleton: `events`)

```ts
events.on<T>(event: string, fn: (data: T) => void): () => void
```
Subscribes to an event. Returns an unsubscribe function.
```ts
const unsub = events.on<{ damage: number }>('playerHit', (data) => {
  console.log('Took', data.damage, 'damage');
});
// Later:
unsub();
```

```ts
events.emit<T>(event: string, data?: T): void
```
Emits an event to all subscribers.
```ts
events.emit('playerHit', { damage: 10 });
events.emit('gameOver');
```

```ts
events.clear(): void
```
Removes all event subscriptions.
```ts
events.clear();
```

### Common Event Names

These are conventions — the EventBus accepts any string key:

- `'playerHit'` — Player took damage
- `'enemyKilled'` — Enemy destroyed
- `'gameOver'` — Game ended
- `'scoreChanged'` — Score updated
- `'sceneLoaded'` — New scene activated

---

## 15. Constants

`import { COLORS, FONTS } from 'shared/constants'`

### COLORS

```ts
const COLORS = {
  bg:      '#0a0a0a',
  fg:      '#e0e0e0',
  dim:     '#666666',
  accent:  '#00ff88',
  warning: '#ffaa00',
  danger:  '#ff4444',
  info:    '#44aaff',
  purple:  '#aa44ff',
  pink:    '#ff44aa'
};
```

```ts
entity.ascii.color = COLORS.accent;
```

### FONTS

All fonts use the `Fira Code` monospace family at different sizes/weights.

```ts
const FONTS = {
  normal:    '...',  // Fira Code, normal size
  large:     '...',  // Fira Code, large
  huge:      '...',  // Fira Code, huge
  small:     '...',  // Fira Code, small
  bold:      '...',  // Fira Code, bold normal
  boldLarge: '...',  // Fira Code, bold large
};
```

```ts
engine.spawn({
  position: { x: 100, y: 50 },
  ascii: { char: 'TITLE', font: FONTS.huge, color: COLORS.accent }
});
```
