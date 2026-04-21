---
name: game-ui
description: Use when the user wants to add menus, title screens, HUD elements, health bars, score displays, pause menus, game-over screens, dialog boxes, inventory UI, settings screens, key rebinding UI, or asks "add a menu", "show the score", "pause screen", "dialog box", "inventory screen", "settings menu", "how to show UI".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Game UI

Menus, HUD, dialogs, and everything the player sees besides the game world. Two options: **canvas UI** (drawn directly on the game canvas — recommended for most games) or **React overlay** (DOM-based, for complex HUDs).

## Title screen

### Canvas-based

```ts
export const titleScene = defineScene({
  name: 'title',
  setup(engine) {
    const menu = new UIMenu(engine, {
      x: engine.centerX - 60, y: engine.centerY,
      items: ['New Game', 'Continue', 'Settings'],
      font: FONTS.normal, color: '#888', selectedColor: COLORS.accent,
    })

    engine.addSystem(defineSystem({
      name: 'title-ui',
      update(engine, dt) {
        engine.ui.text(engine.centerX, 80, 'MY GAME', {
          font: FONTS.huge, color: COLORS.accent, align: 'center',
        })
        engine.ui.text(engine.centerX, 120, 'An ASCII Adventure', {
          font: FONTS.small, color: '#666', align: 'center',
        })

        menu.update(engine)

        if (menu.confirmed) {
          switch (menu.selectedIndex) {
            case 0: engine.loadScene('play', { transition: 'fade' }); break
            case 1: loadSavedGame(engine); break
            case 2: engine.loadScene('settings'); break
          }
        }
      },
    }))
  },
})
```

### React-based

The default React menu shows automatically if you don't suppress it. To customize, pass `screens` from `setupGame`:

```ts
import { MyMenu } from '@ui/screens/MyMenu'
return { startScene: 'play', screens: { menu: MyMenu } }
```

## Pause menu

```ts
let paused = false

export const pauseSystem = defineSystem({
  name: 'pause',
  update(engine, dt) {
    if (engine.keyboard.pressed('Escape')) {
      paused = !paused
      if (paused) engine.pause()
      else engine.resume()
    }

    if (paused) {
      engine.ui.panel(engine.centerX - 80, engine.centerY - 40, 160, 80, {
        bg: '#000000cc', border: 'double', title: 'PAUSED',
      })
      engine.ui.text(engine.centerX, engine.centerY + 10, 'Press ESC to resume', {
        font: FONTS.small, color: '#888', align: 'center',
      })
    }
  },
})
```

## Score display

### Canvas

```ts
// In a HUD system:
engine.ui.text(10, 10, `Score: ${score}`, {
  font: FONTS.normal, color: COLORS.accent,
})
```

### React

```ts
// In your game system:
useStore.getState().setScore(score)
// The default Score component displays it automatically
```

## Health bar

```ts
const player = engine.findByTag('player')
if (player?.health) {
  const ratio = player.health.current / player.health.max
  const color = ratio > 0.6 ? '#00ff88' : ratio > 0.3 ? '#ffaa00' : '#ff4444'

  engine.ui.text(10, 10, 'HP', { font: FONTS.small, color: '#888' })
  engine.ui.bar(30, 10, 15, ratio, { fillColor: color, emptyColor: '#333' })
  engine.ui.text(160, 10, `${player.health.current}/${player.health.max}`, {
    font: FONTS.small, color: '#888',
  })
}
```

## Dialog boxes

```ts
// Simple text
engine.dialog.show('The door is locked. You need a key.', {
  speaker: 'Narrator',
  typeSpeed: 40,
  border: 'rounded',
})

// With choices
const answer = await engine.dialog.choice('Open the chest?', [
  'Open it',
  'Leave it',
  'Check for traps first',
])
```

## Inventory screen

```ts
const inventoryPanel = new UIScrollPanel(engine, {
  x: 50, y: 50, width: 300, height: 250,
  items: inventory.slots
    .filter(s => s)
    .map(s => `${s.item.icon ?? '•'} ${s.item.name} x${s.count}`),
  font: FONTS.normal, color: '#cccccc', border: 'single',
})

// In update:
inventoryPanel.update(engine)  // Arrow keys, Page Up/Down, scroll wheel
```

### Grid-based inventory

```ts
const grid = new UIGrid(engine, {
  x: 100, y: 80,
  cols: 5, rows: 4,
  cellWidth: 40, cellHeight: 40,
  cells: inventory.slots.map(slot => slot ? {
    text: slot.item.icon ?? '?',
    label: slot.item.name,
    color: slot.item.rarity === 'rare' ? '#ffcc00' : '#ccc',
    bg: '#1a1a1a',
  } : { text: '', bg: '#111' }),
  border: 'single', selectedBorder: 'double',
})

// In update:
grid.update(engine)
if (grid.confirmed) {
  const slot = inventory.slots[grid.selectedIndex]
  if (slot) useItem(slot.item)
}
```

## Tooltip on hover

```ts
const tooltip = new UITooltip(engine, {
  font: FONTS.small, color: '#ccc', bg: '#222', border: 'rounded', maxWidth: 200,
})

// In update:
if (hoveredItem) {
  tooltip.show(engine.mouse.x + 10, engine.mouse.y + 10, hoveredItem.description)
} else {
  tooltip.hide()
}
tooltip.render(engine)
```

## Tabs (stats / inventory / quests)

```ts
const tabs = new UITabs(engine, {
  x: 40, y: 40, width: 350,
  tabs: ['Stats', 'Items', 'Quests'],
  font: FONTS.normal, color: '#888', activeColor: COLORS.accent,
})

tabs.update(engine)  // Tab key, arrows, mouse click

switch (tabs.activeIndex) {
  case 0: drawStats(engine); break
  case 1: drawInventory(engine); break
  case 2: drawQuests(engine); break
}
tabs.render(engine)
```

## Game-over screen

```ts
export const gameOverScene = defineScene({
  name: 'game-over',
  setup(engine) {
    engine.particles.explosion(engine.centerX, engine.centerY)

    const menu = new UIMenu(engine, {
      x: engine.centerX - 50, y: engine.centerY + 40,
      items: ['Retry', 'Title Screen'],
      font: FONTS.normal, color: '#888', selectedColor: COLORS.accent,
    })

    engine.addSystem(defineSystem({
      name: 'game-over-ui',
      update(engine, dt) {
        engine.ui.text(engine.centerX, engine.centerY - 40, 'GAME OVER', {
          font: FONTS.huge, color: COLORS.danger, align: 'center',
        })
        engine.ui.text(engine.centerX, engine.centerY, `Score: ${score}`, {
          font: FONTS.normal, color: '#ccc', align: 'center',
        })

        menu.update(engine)
        if (menu.confirmed) {
          if (menu.selectedIndex === 0) engine.loadScene('play', { transition: 'fade' })
          else engine.loadScene('title', { transition: 'fade' })
        }
      },
    }))
  },
})
```

## Styled text

Use tags for color and formatting anywhere text is drawn:

```ts
engine.ui.text(10, 10, '[#ff4444]Critical[/] hit for [b]25[/b] damage!', { ... })
engine.ui.text(10, 30, '[dim]Press SPACE to continue[/dim]', { ... })
engine.ui.text(10, 50, 'Found [bg:#333][#ffcc00]Golden Key[/][/bg]', { ... })
```

## Suppressing React (canvas-only game)

```ts
const Empty = () => null

export function setupGame(engine: Engine) {
  return {
    startScene: 'title',
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  }
}
```

## Settings screen with key rebinding

```ts
const actions = ['move-up', 'move-down', 'move-left', 'move-right', 'action-a', 'action-b']
let rebinding: string | null = null

const settingsMenu = new UIMenu(engine, {
  x: 100, y: 100,
  items: actions.map(a => {
    const binding = engine.input.get(a)
    return `${a}: ${binding?.keys?.[0] ?? '(none)'}`
  }),
  font: FONTS.normal, color: '#888', selectedColor: COLORS.accent,
})

// In update:
if (rebinding) {
  engine.ui.text(engine.centerX, 50, `Press a key for ${rebinding}...`, {
    font: FONTS.normal, color: '#ffcc00', align: 'center',
  })
} else {
  settingsMenu.update(engine)
  if (settingsMenu.confirmed) {
    rebinding = actions[settingsMenu.selectedIndex]
    engine.input.capture(rebinding, 10).then(result => {
      rebinding = null
      if (result) engine.input.save()
      // Refresh menu items
    })
  }
}
```

## Reference templates

| Pattern | Look at |
|---|---|
| UIMenu on title screen | `games/roguelike/scenes/title.ts` |
| Canvas HUD (health, stats, messages) | `games/roguelike/systems/hud.ts` |
| React HUD (score, health bar) | `games/asteroid-field/` (default screens) |
| Game-over with score | `games/roguelike/scenes/game-over.ts` |
