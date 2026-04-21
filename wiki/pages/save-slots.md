---
title: Save Slots
created: 2026-04-21
updated: 2026-04-21
type: component
tags: [storage, save, persistence]
sources: [engine/storage/save-slots.ts, engine/storage/storage.ts]
---

# Save Slots

`SaveSlotManager` provides multi-slot save management on top of the engine's low-level `save()`/`load()` localStorage primitives. It handles named slots, metadata, autosave, active-slot tracking, compression, version migration, and JSON export/import.

The manager is fully opt-in. Games that only need simple key-value persistence can use `save()`/`load()` directly from `engine/storage/storage.ts`.

## Setup

```ts
import { SaveSlotManager } from '@engine'

interface GameState { level: number; hp: number; inventory: string[] }

const saves = new SaveSlotManager<GameState>({
  maxSlots: 3,           // named slot limit (default 5, autosave excluded)
  version: '1.2.0',      // schema version stamped on metadata
  compress: false,        // lz-string UTF-16 compression (default false)
  onMigrate: (old) => {   // called when loaded version differs
    if (old.metadata.version === '1.0.0') {
      return { ...old, data: { ...old.data, inventory: [] } }
    }
    return null  // treat as unreadable
  },
})
```

## SaveSlotMetadata

Each slot stores lightweight metadata for UIs: `slotId`, `name` (defaults to "Slot N"), `timestamp` (ms since epoch, auto-set on write), `playtime` (seconds, caller tracks), optional `sceneName`, `thumbnail` (base64 PNG), `custom` (game-specific Record), and `version` (schema version).

## CRUD Operations

```ts
// Save to a named slot
saves.save('slot-1', gameState, { name: 'Forest Boss', sceneName: 'forest', playtime: 1234 })

// Load a slot (returns SaveSlot<T> | null)
const slot = saves.load('slot-1')
if (slot) {
  const { metadata, data } = slot
}

// Delete a slot (clears active if it matches)
saves.delete('slot-1')

// Check existence, rename, count, full/clear
saves.exists('slot-1')
saves.rename('slot-1', 'New Name')
saves.count()       // named slots only
saves.isFull()      // count >= maxSlots
saves.clear()       // delete everything including autosave
```

## Active Slot and Autosave

Track a "current save" with `setActive('slot-1')` / `getActive()` / `saveActive(data)` / `loadActive()`.

A reserved autosave slot does not count toward `maxSlots` and is excluded from `list()`:

```ts
saves.autosave(gameState, { sceneName: 'dungeon-3' })
const auto = saves.loadAutosave()
```

## Compression

When `compress: true`, slot data is lz-string compressed before writing. The index and active tracker stay uncompressed for fast listing. Loading handles both compressed and uncompressed data transparently, so enabling compression on an existing game does not break old saves.

## Export / Import

For cloud sync or manual backup. `exportSlot` returns a JSON string (or `null` if missing). `importSlot` enforces `maxSlots`, validates the shape, and rewrites the `slotId` in metadata to match the target.

```ts
const json = saves.exportSlot('slot-1')  // JSON string | null
saves.importSlot('slot-2', json!)        // returns boolean success
```

## Migration

When a loaded slot's `version` differs from the manager's configured `version`, the `onMigrate` callback fires. Return a migrated `SaveSlot<T>`, or `null` to treat the slot as corrupt. Without `onMigrate`, the slot loads as-is.

For the underlying localStorage primitives, see [[engine-overview]]. For other engine utilities, see [[utility-reference]].
