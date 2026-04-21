---
name: world-building
description: Use when the user wants to build game levels, create maps or dungeons, use tilemaps, generate procedural content, set up the camera, handle scene transitions, manage multiple levels or floors, pass data between scenes, or asks "how do I make a map", "generate a dungeon", "add levels", "camera follow", "scene transition", "multiple rooms".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# World building

Maps, dungeons, camera, scenes, and level progression.

## Tilemaps

The simplest way to create a map:

```ts
engine.spawn({
  position: { x: 0, y: 0 },
  tilemap: {
    data: [
      '################',
      '#..............#',
      '#...####...#...#',
      '#..............#',
      '#...#......#...#',
      '#..............#',
      '################',
    ],
    cellSize: 16,
    legend: {
      '#': { char: '#', color: '#666666' },
      '.': { char: '.', color: '#333333' },
    },
    offsetX: 0,
    offsetY: 0,
  },
})
```

## Generate a dungeon

Four algorithms available — pick based on what you want:

```ts
import { generateDungeon, generateBSP, generateCave, generateWalkerCave } from '@engine'

// Rooms connected by corridors (classic roguelike)
const { grid, rooms } = generateBSP({ cols: 60, rows: 30, seed: 42 })

// Random room placement (simpler, looser layout)
const { grid, rooms } = generateDungeon({ cols: 60, rows: 30, roomCount: 8, seed: 42 })

// Organic caves (cellular automata)
const { grid, rooms } = generateCave({ cols: 60, rows: 30, fillChance: 0.45, seed: 42 })

// Winding tunnels (drunkard's walk)
const { grid, rooms } = generateWalkerCave({ cols: 60, rows: 30, coverage: 0.35, seed: 42 })
```

### Wire dungeon to tilemap

```ts
import { gridMapToTilemapData } from '@engine'

const { grid, rooms } = generateBSP({ cols: 60, rows: 30, seed: 42 })

engine.spawn({
  position: { x: 0, y: 0 },
  tilemap: {
    data: gridMapToTilemapData(grid),
    cellSize: 16,
    legend: {
      '#': { char: '#', color: '#555', solid: true },
      '.': { char: '.', color: '#222' },
    },
  },
})

// Place player in first room
const start = rooms[0].center
engine.spawn(createPlayer(start.col * 16, start.row * 16))

// Place enemies in other rooms
for (let i = 1; i < rooms.length; i++) {
  const r = rooms[i].center
  engine.spawn(createEnemy(r.col * 16, r.row * 16))
}
```

## Noise-based terrain

For overworld maps, islands, or height-based terrain:

```ts
import { generateNoiseGrid } from '@engine'

const terrain = generateNoiseGrid(80, 40, {
  seed: 42, scale: 0.06, octaves: 4, persistence: 0.5,
  classify: (v) =>
    v > 0.65 ? '▲' :  // mountains
    v > 0.45 ? '♣' :  // trees
    v > 0.3  ? '.' :  // grass
               '~',   // water
})
```

## Camera

### Follow the player

```ts
// In scene setup:
const player = engine.spawn(createPlayer(100, 100))
engine.camera.follow(player, {
  smoothing: 0.15,
  deadzone: { width: 120, height: 80 },
})
```

### Set bounds (stop camera at map edges)

```ts
engine.camera.setBounds(0, 0, mapWidth, mapHeight)
```

### Lookahead (show more of what's ahead)

```ts
engine.camera.follow(player, {
  smoothing: 0.1,
  deadzone: { width: 80, height: 60 },
  lookahead: { x: 50, y: 30 },  // offset toward movement direction
})
```

## Multiple scenes

Most games have at least 3 scenes:

```ts
// game/scenes/title.ts
export const titleScene = defineScene({
  name: 'title',
  setup(engine) {
    // Draw title, "Press SPACE to start"
  },
  update(engine, dt) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade', duration: 0.5 })
    }
  },
})

// game/scenes/play.ts
export const playScene = defineScene({
  name: 'play',
  setup(engine) {
    // Spawn player, enemies, map
  },
  update(engine, dt) {
    if (playerDead) {
      engine.loadScene('game-over', { transition: 'fade', duration: 0.5 })
    }
  },
})

// game/scenes/game-over.ts
export const gameOverScene = defineScene({
  name: 'game-over',
  setup(engine) {
    // Show score, "Press SPACE to retry"
  },
  update(engine, dt) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade', duration: 0.5 })
    }
  },
})

// game/index.ts
export function setupGame(engine: Engine) {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'
}
```

## Pass data between scenes

```ts
// Sending:
engine.loadScene('play', {
  transition: 'fade',
  duration: 0.4,
  data: { floor: 2, hp: 50, inventory: [...] },
})

// Receiving (in scene setup):
const { floor = 1, hp = 100 } = engine.sceneData ?? {}
```

## Level progression (floors/stages)

```ts
// game/scenes/play.ts
let currentFloor = 1

export const playScene = defineScene({
  name: 'play',
  setup(engine) {
    currentFloor = engine.sceneData?.floor ?? 1

    // Generate dungeon with floor-based seed (same floor = same layout)
    const { grid, rooms } = generateBSP({
      cols: 60, rows: 30,
      seed: currentFloor * 1000,
    })

    // Harder enemies on later floors
    const enemyCount = 3 + currentFloor * 2
    // ... spawn enemies

    engine.toast.show(`Floor ${currentFloor}`, { color: '#ffcc00' })
  },
})

// When player finds stairs:
function descend() {
  engine.loadScene('play', {
    transition: 'fade',
    data: { floor: currentFloor + 1, hp: player.health.current },
  })
}
```

## Scene transitions

```ts
engine.loadScene('play', { transition: 'fade', duration: 0.5 })
engine.loadScene('play', { transition: 'fadeWhite', duration: 0.4 })
engine.loadScene('play', { transition: 'wipe', duration: 0.6 })
engine.loadScene('play', { transition: 'dissolve', duration: 0.8 })
engine.loadScene('play', { transition: 'scanline', duration: 0.5 })
```

## Reference templates

| Pattern | Look at |
|---|---|
| BSP dungeon + tilemap + FOV | `games/roguelike/scenes/play.ts` |
| Simple scene transitions | `games/asteroid-field/scenes/` (title → play → game-over) |
| Camera follow | `games/roguelike/scenes/play.ts` |
| Passing floor data | `games/roguelike/scenes/play.ts` |
