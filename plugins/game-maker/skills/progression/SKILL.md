---
name: progression
description: Use when the user wants to save their game, load progress, add high scores, track leaderboards, create save slots, export their game as HTML, handle persistence, auto-save, or asks "save the game", "high scores", "save slots", "load progress", "export my game", "share my game", "leaderboard", "remember progress".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Progression — save, load, share

Everything about persisting player progress and shipping your game.

## Setup (do this first)

Set a storage prefix so your game's saves don't collide with other games:

```ts
// game/index.ts
import { setStoragePrefix } from '@engine'

setStoragePrefix('my-game')  // all saves prefixed with 'my-game:'
```

## Quick save/load (simplest)

```ts
import { save, load } from '@engine'

// Save anything
save('progress', { level: 3, score: 1500, hp: 8 })

// Load it back
const data = load<{ level: number; score: number; hp: number }>('progress')
if (data) {
  currentLevel = data.level
  score = data.score
}
```

## High scores

```ts
import { submitScore, getHighScores } from '@engine'

// On game over:
submitScore('my-game', finalScore, { playerName: 'Player 1' })

// On title screen:
const scores = getHighScores('my-game')
for (const entry of scores) {
  engine.ui.text(100, y, `${entry.name}: ${entry.score}`, { ... })
}
```

## Save slots (RPG-style)

For games with multiple save files:

```ts
import { SaveSlotManager, serializeGameState, rehydrateGameState } from '@engine'

const saves = new SaveSlotManager({
  maxSlots: 5,
  version: '1',
  compress: true,  // smaller saves using lz-string
})

// Save current state to slot
saves.save('slot1', {
  level: currentLevel,
  hp: player.health.current,
  inventory: serializeInventory(inventory),
  score: score,
}, { name: 'Floor 3 - Boss room', sceneName: 'play' })

// Load from slot
const slot = saves.load('slot1')
if (slot) {
  currentLevel = slot.data.level
  // ... restore state
}

// List all saves (for a save menu)
const allSlots = saves.list()  // sorted by timestamp, newest first
for (const meta of allSlots) {
  // meta.slotId, meta.name, meta.timestamp, meta.playtime, meta.sceneName
}

// Autosave (separate from regular slots, doesn't count toward limit)
saves.autosave(gameState, { name: 'Autosave', sceneName: engine.scenes.current?.name })
```

### Save slot UI

```ts
const slotMenu = new UIMenu(engine, {
  x: 100, y: 100,
  items: saves.list().map(s =>
    `${s.name} — ${new Date(s.timestamp).toLocaleDateString()}`
  ).concat(['New Save', 'Back']),
  font: FONTS.normal, color: '#888', selectedColor: COLORS.accent,
})
```

## Auto-save on scene transitions

```ts
// In scene cleanup or before loading a new scene:
saves.autosave({
  level: currentLevel,
  hp: player.health.current,
  score: score,
}, { sceneName: 'play' })
```

## Version migration

When you change your save format, old saves still work:

```ts
const saves = new SaveSlotManager({
  maxSlots: 5,
  version: '2',  // bumped from '1'
  onMigrate(oldData, fromVersion) {
    if (fromVersion === '1') {
      // Add new fields that didn't exist in v1
      oldData.data.inventory = oldData.data.inventory ?? []
      return oldData
    }
    return null  // unknown version — treat as corrupt
  },
})
```

## Export/import saves (cloud sync, sharing)

```ts
// Export save as JSON string (user can copy/paste)
const json = saves.exportSlot('slot1')

// Import from pasted JSON
saves.importSlot('slot1', json)
```

Good for: sharing saves between devices, manual cloud backup, debugging.

## What to save (and what NOT to)

**Save:**
- Player stats (HP, level, XP, score)
- Inventory contents
- Quest/achievement progress
- Current floor/level number
- Unlocked items or features
- Settings (volume, keybindings)

**Don't save:**
- Entity positions or velocities (regenerate from level seed)
- Particle state
- Camera position
- Tween/animation progress
- Anything that can be recalculated from saved data

## Exporting your game

```bash
bun run build      # production build → dist/
bun run export     # single-file → dist/game.html
```

`dist/game.html` is one file you can:
- Upload to itch.io
- Host on any static file server
- Email to someone
- Open directly in a browser

## Keybinding persistence

```ts
// Save player's custom keybindings
engine.input.save('my-keybindings')

// Load on startup
engine.input.load('my-keybindings')
```

## Volume/mute persistence

```ts
import { save, load, setVolume, getVolume, isMuted, mute, unmute } from '@engine'

// Save audio settings
save('audio', { volume: getVolume(), muted: isMuted() })

// Load on startup
const audio = load<{ volume: number; muted: boolean }>('audio')
if (audio) {
  setVolume(audio.volume)
  if (audio.muted) mute()
}
```

## Reference templates

| Pattern | Look at |
|---|---|
| Save/load floor progression | `games/roguelike/scenes/play.ts` |
| High score on game-over | `games/roguelike/scenes/game-over.ts` |
| Continue from saved state | `games/roguelike/scenes/title.ts` |
