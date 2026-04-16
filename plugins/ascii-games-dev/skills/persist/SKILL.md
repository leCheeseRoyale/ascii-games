---
name: persist
description: Activates when the user invokes `/ascii-games-dev:persist` or asks to "add save/load", "wire persistence", "save the game", "add save slots", or mentions `SaveSlotManager`/`serializeGameState` in the ascii-games engine. Wires single-key, multi-slot, or export/import persistence with a versioned migration stub.
argument-hint: [single | slots | export]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Wire persistence

User input in `$ARGUMENTS`: `single`, `slots`, or `export`. If missing, ask which:

- `single` — one global save key (arcade games, high score only)
- `slots` — named slots with metadata + autosave (RPGs, roguelikes)
- `export` — same as slots + JSON export/import for cloud sync or sharing

## Workflow

### 1. Ground in references

- `docs/API-generated.md` — confirm storage exports
- `engine/storage/storage.ts` — low-level `save` / `load` / `has` / `remove` / `clearAll`
- `engine/storage/save-slots.ts` — `SaveSlotManager`
- `engine/storage/game-state.ts` — `serializeGameState` / `rehydrateGameState`
- `engine/storage/high-scores.ts` — leaderboard helpers
- `games/roguelike/scenes/play.ts` — idiomatic save/load in a scene

### 2. Call `setStoragePrefix` once at init

All saves land in localStorage. Without a prefix, saves collide if the user plays two games on the same origin. Add to `game/index.ts`:

```ts
import { setStoragePrefix } from '@engine'

setStoragePrefix('my-game')   // produces keys like 'my-game.savedata'
```

### 3. Mode-specific wiring

#### Mode: `single`

Lightest setup. Pick a key, save on events the game cares about (game-over, pause, etc.):

```ts
import { save, load } from '@engine'

type SaveShape = { lastScore: number; highScore: number }

const data = load<SaveShape>('run') ?? { lastScore: 0, highScore: 0 }

// On game-over:
save('run', { lastScore: finalScore, highScore: Math.max(data.highScore, finalScore) })
```

If the game just wants a leaderboard, use `submitScore` / `getHighScores` from `@engine` instead of rolling your own.

#### Mode: `slots`

Multi-slot with metadata, autosave, migration. Typical for roguelikes:

```ts
// game/save.ts
import { SaveSlotManager, serializeGameState, rehydrateGameState } from '@engine'
import type { SerializedGameState } from '@engine'

export const saves = new SaveSlotManager<SerializedGameState>({
  maxSlots: 5,
  version: 1,
  onMigrate: (data, fromVersion) => {
    // Add future migrations here. Return the upgraded data.
    return data
  },
})

export function captureSnapshot(): SerializedGameState {
  return serializeGameState({
    stats: player.stats,
    equipment: player.equipment,
    inventory: player.inventory,
    wallet: player.wallet,
    quests,          // QuestTracker instance
    achievements,    // AchievementTracker instance
  })
}

export function applySnapshot(data: SerializedGameState) {
  const restored = rehydrateGameState(data, {
    itemLookup: (id) => ITEM_REGISTRY[id],
    equipmentBlocks: { weapon: ['offhand'] },
    quests,
    achievements,
  })
  if (restored.stats) player.stats = restored.stats
  if (restored.inventory) player.inventory = restored.inventory
  // …etc
}
```

Give the user a UI hook if they have React HUD — expose `saves.list()` and write to the store. If canvas-only, a `UIMenu` over `saves.list()` is the idiomatic pattern.

Call `saves.save('autosave', captureSnapshot(), { sceneName: engine.scenes.current?.name })` on scene transitions or every N turns.

#### Mode: `export`

Extends `slots` with cloud/share capability:

```ts
// Export to a string the user can paste anywhere.
const text = saves.exportSlot('slot1')

// Import from pasted text.
saves.importSlot('slot1', text)
```

Typical UI: a "Copy save to clipboard" button on a slots menu, plus a paste-in dialog. Document that the export is **not encrypted or signed** — players can edit it. For competitive games, consider server-authoritative saves instead.

### 4. Add to `.gitignore`

If the save includes anything sensitive (rare — localStorage isn't checked in), it's already fine. No action needed for standard setups.

### 5. Verify

- `bun run check`
- `bun run test` — storage helpers have their own coverage; if you added a migration, add a test for it in `engine/__tests__/storage/save-slots.test.ts` style
- Manual smoke: run the game, trigger save, reload, confirm state carries over

### 6. Report to user

- Files created/modified (paths)
- Which storage mode was used and why
- The migration stub if `slots` — mention how to add future migrations
- Reminder about `setStoragePrefix` (if added for the first time)

## Things NOT to do

- Don't skip `setStoragePrefix` — saves will collide across games on the same origin.
- Don't serialize raw entity objects — they contain internal engine state. Use `serializeGameState` or the per-component serializers (`serializeStats`, `serializeInventory`, `serializeEquipment`, `serializeWallet`).
- Don't persist transient state (current damage flash timer, particle positions, etc.). Only durable player state.
- Don't skip the migration hook in `slots` mode even if you don't need one yet. The stub costs nothing and future-you will thank you.
- Don't assume save data is trustworthy — validate shape on load for games that care (competitive, anti-cheat-adjacent).
