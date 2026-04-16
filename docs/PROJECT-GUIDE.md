# Project Guide

Navigation and reference for working on this codebase. Project-specific context for Claude Code.

## What This Is

An ASCII game engine and framework. Users create games by picking a template (`bun run init:game`) which copies starter code into `game/`, then iterate on it. The engine is a reusable library; game code lives separately.

## Commands

```
bun dev              # Start dev server (auto-runs template picker if game/ is missing)
bun dev:fast         # Start Vite directly (skip auto-detect)
bun run check        # TypeScript type-check (no emit)
bun run test         # Run test suite (bun:test, 1140+ tests)
bun run build        # Production build
bun run preview      # Preview production build
bun run lint         # Biome linter
bun run lint:fix     # Auto-fix lint issues
bun run knip         # Find unused deps/exports/files
bun run gen:api      # Regenerate docs/API-generated.md from code
bun run new:scene <name>   # Scaffold a scene
bun run new:system <name>  # Scaffold a system
bun run new:entity <name>  # Scaffold an entity factory
bun run init:game          # Interactive template picker
bun run init:game <name>   # Init game from template (blank|asteroid-field|platformer|roguelike)
bun run export             # Build single-file HTML (dist/game.html)
bun run list:games         # List available game templates
```

## Architecture

```
engine/   -- Framework code. Do NOT put game logic here.
game/     -- User game code (gitignored, created from templates via init:game).
games/    -- Source-of-truth game templates (blank, asteroid-field, platformer, roguelike).
ui/       -- React UI layer. Mounted independently of the canvas.
shared/   -- Types, constants, events shared across all layers.
scripts/  -- Bun scaffolding scripts.
docs/     -- API reference. docs/API-generated.md is auto-generated, don't edit it.
```

**Path aliases:** `@engine`, `@game`, `@ui`, `@shared` -- use these for imports.

### Data flow & boundaries

```
game/ --uses--> engine/   (game code calls engine API)
game/ --writes-> ui/store  (zustand store is the ONLY bridge to React)
ui/   --reads--> ui/store  (React reads store reactively via hooks)
```

- **Never import `ui/` from `engine/` or `game/`** (except the zustand store).
- **Never import `engine/` or `game/` from `ui/`** components.
- Game state lives on entities or in the zustand store -- never in React component state.

### Entry point flow

`game/index.ts` exports `setupGame(engine)` which registers scenes and returns either the starting scene name (string) or an object: `{ startScene, screens?, hud?, store? }`. The engine calls this on startup. See any `games/*/index.ts` for examples.

**Canvas-only UI games:** Default React screens (`MainMenu`, `HUD`, `PauseMenu`, `GameOverScreen`) auto-register for screen states `menu`/`playing`/`paused`/`gameOver`. If your game draws all UI on the canvas (via `engine.ui.*`, `UIMenu`, `engine.dialog`), return `{ startScene, screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: [] }` with `const Empty = () => null` to suppress the React overlay. See `games/roguelike/index.ts`.

## ECS Model

Entities are plain objects with optional component fields. Components are plain TypeScript objects -- no classes, no decorators. All component shapes are defined in `shared/types.ts`.

- **World**: miniplex `World<Entity>`, accessed via `engine.world`
- **Querying**: `engine.world.with('position', 'velocity')`, `.without('health')`, `engine.findByTag('player')`
- **Spawning**: `engine.spawn({...})` (not `engine.world.add`)
- **Removing**: `engine.destroy(entity)`, `engine.destroyAll('enemy')`, `engine.destroyWithChildren(entity)`

### Built-in systems (auto-registered, never add manually)

`_parent`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds`, `_emitter`, `_stateMachine`

Key implications:
- `_physics` handles `position += velocity * dt`. Do NOT write custom movement that duplicates this -- it causes double-speed.
- `_lifetime` auto-destroys entities when `lifetime.remaining` hits 0.
- `_screenBounds` handles `screenWrap`, `screenClamp`, and `offScreenDestroy` components.

### Scenes & systems

Scenes define `setup()`, `update()`, `cleanup()`. Use `defineScene()` and `defineSystem()` from `@engine`. Systems are added in scene setup via `engine.addSystem()`. Systems can declare a `phase` for turn-based games -- they only run during that phase. Systems can also declare a `priority: number` for ordering — see "System ordering" under Key APIs.

Scene transitions: `engine.loadScene('play', { transition: 'fade' })`. Available: `fade`, `fadeWhite`, `wipe`, `dissolve`, `scanline`.

## Key APIs to Know

For full API details, see `docs/API-generated.md` or read `engine/index.ts` exports.

**System ordering:** `System.priority` (number, default `0`) controls execution order — lower runs first. `SystemPriority` const exposes the built-in slots: `parent=10, physics=20, tween=30, animation=40, emitter=50, stateMachine=60, lifetime=70, screenBounds=80`. Custom systems default to 0 and run before all built-ins; set e.g. `priority: SystemPriority.physics + 1` to run after physics but before tweens. Ties preserve registration order. See `engine/ecs/systems.ts`.

**Viewport:** `engine.viewport` auto-instantiated. Fields: `width`, `height`, `orientation: "portrait" | "landscape"`, `safeArea: { top, right, bottom, left }` (reads CSS `env(safe-area-inset-*)` via a hidden probe). Emits `viewport:resized` and `viewport:orientation` on the shared event bus. Call `viewport.refresh()` after toggling fullscreen / pinch-zoom. See `engine/render/viewport.ts`.

**Input:** `engine.keyboard.held/pressed/released(key)`, `engine.mouse.*`, `engine.gamepad.*` (with `GAMEPAD_BUTTONS` constants). Gamepad button/axis state is cleared on disconnect so a removed controller can't leave held-button ghost inputs. See `engine/input/gamepad.ts`.

**Touch input (mobile):** `new Touch(canvas, { unifyMouse?, dragThreshold?, tapMaxDuration?, swipeMinVelocity? })` — unified pointer/touch/mouse event handling. Query `touches` / `primary` / `gestures` per frame (call `update()` to clear gesture queue). Subscriptions: `onTap`, `onSwipe`, `onPinch`, `onBegin`, `onMove`, `onEnd`. Gestures recognized: tap (duration + drag threshold), swipe (velocity + dominant axis → `"up"/"down"/"left"/"right"`), pinch (two-finger scale ratio). Canvas-relative coordinates scaled by `canvas.width / rect.width` so CSS-scaled canvases (common on mobile) report positions in canvas pixel space. Not auto-wired on engine — games instantiate as needed. See `engine/input/touch.ts`.

**Virtual controls (mobile UI):** `new VirtualJoystick({ anchor, size?, deadzone?, touch, visibleOnlyOnTouch? })` — analog stick returning `x/y` in -1..1 with deadzone rescaling, plus `magnitude` (0..1) and `direction` (radians). `new VirtualDpad({ anchor, size?, buttonSize?, touch })` — four-direction flags (`up/down/left/right`), supports multi-touch. Both call `.render(ctx, w, h)` in your render loop and `.update()` per frame. Hide when `visibleOnlyOnTouch: true` and no active touches (cleaner desktop UI).

**Room discovery:** `SocketAdapter.listRooms(url, filter?)` (static, HTTP `GET /rooms`) lists public rooms before connecting. Instance `adapter.listRooms(filter?)` works while connected (WebSocket frame). Filter by `gameType`. Rooms created with `roomOpts: { name, gameType, isPublic, maxPeers, metadata }` on connect — first joiner sets them, locked after. Private rooms (`isPublic: false`) are excluded from listings but still joinable by ID. Server CORS: `corsAllowOrigin: "*"` by default, set `""` to disable. Disable listing entirely with `enableRoomListing: false`.

**Timing:** `engine.after(delay, fn)`, `engine.every(interval, fn)`, `engine.spawnEvery(interval, factory)`, `engine.sequence([...])`, `Cooldown` class. Never use `setInterval`/`setTimeout`.

**Rendering:** Engine auto-renders entities with `position` + any renderable (`ascii`, `sprite`, `textBlock`, `image`). Set `layer` for z-ordering. The engine handles Pretext caching -- don't call `prepare()` directly.

**Scene transitions (internals):** `new Transition(type, duration, midpointTimeoutMs?)` — the optional `midpointTimeoutMs` (default `5000`) caps how long `loadScene`'s midpoint callback can hang before the transition force-advances to the fade-in phase. Async scene setup is wrapped in `Promise.race` + `.catch` so a rejecting or hanging loader logs the error instead of freezing the screen. See `engine/render/transitions.ts`.

**Canvas UI:** `engine.ui.text()`, `.panel()`, `.textPanel()`, `.bar()`, `.effectText()`. `UIMenu` for keyboard-navigable menus. `engine.dialog.show/choice()` for dialog boxes — dialog `maxWidth = min(500, floor(screenW * 0.9))` and re-lays out when the viewport width changes so mobile/portrait orientations aren't cut off. Additional primitives: `UIScrollPanel` (scrollable list, mouse wheel), `UIGrid` (inventory-style grid), `UITooltip` (auto-flipping hover text), `UITabs` (tabbed panel with render callbacks). `engine.ui.inlineRun(x, y, chunks, opts?)` draws a single line of mixed-font/color text — badges, chips, `[HP]` labels next to values — each `UIInlineChunk = { text, font?, color?, bg?, padX? }` keeps its own styling, baseline-aligned. Returns total drawn width; trailing chunks that exceed `opts.maxWidth` are skipped rather than overflowing. All draw in screen space. See `engine/render/canvas-ui.ts`.

**Styled text:** `engine.ui.text()` and `textBlock` components support inline tags `[#color]text[/]`, `[b]bold[/b]`, `[dim]dim[/dim]`, `[bg:#color]bg[/bg]`. `TextBlock` supports `align: 'left'|'center'|'right'|'justify'`. Use `insertSoftHyphens(text)` before rendering to enable hyphenation on long words.

**Proc-gen:** `generateDungeon()` (room-and-corridor), `generateBSP()`, `generateCave()` (cellular automata), `generateWalkerCave()` (drunkard's walk) — all return `{ grid: GridMap<string>, rooms: RoomInfo[] }`. Use `gridMapToTilemapData()` to convert to `createTilemap()` format. `createNoise2D()` + `generateNoiseGrid()` for seeded 2D noise. All deterministic with `seed` option.

**Behaviors (opt-in reusable AI/game systems):**
- `createPatrolBehavior/ChaseBehavior/FleeBehavior/WanderBehavior` — return `StateMachineState` for the state machine system.
- `createWaveSpawner(config)` — returns a system for escalating enemy waves with callbacks.
- `createDamageSystem(config)` — processes transient `damage` components with invincibility frames + death callback. Emits `combat:damage-taken` (`{ entity, amount, source?, type?, remainingHp }`) and `combat:entity-defeated` (`{ entity, source?, type? }`). Neither fires while the target is invincible. See `engine/behaviors/damage.ts` + `shared/events.ts`.
- `createDamageFlash(entity, engine)` — one-shot visual hit feedback.

**Inventory:** `createInventory({ maxSlots, maxWeight })` returns an `InventoryComponent`. Attach to an entity as `inventory:`. Pure helpers: `addItem`, `removeItem`, `hasItem`, `countItem`, `totalWeight`, `isFull`, `clearInventory`, `transferItem`, `getSlot`, `findSlot`. `serializeInventory(inv)` / `deserializeInventory(data, itemLookup)` round-trip item ids + counts; unknown ids are skipped silently so saves survive removed items. Items are `{ id, name, icon?, stackable?, maxStack?, weight?, ...customData }`. Pass optional `engine + entity` to emit `inventory:add`/`:remove`/`:full` events. Stacking merges items with matching `id`; overflow creates new slots. See `engine/behaviors/inventory.ts`.

**Equipment:** `createEquipment(slotIds, blocks?)` returns an `EquipmentComponent`. `EquippableItem` extends `InventoryItem` with `equipSlot`, `twoHanded?`, `modifiers?` (auto-applied to `Stats` on equip, removed on unequip), and `requirements?` (stat gating). Helpers: `canEquip`, `equipItem` (returns displaced items for two-handed / filled slots), `unequipItem`, `clearEquipment`, `getEquipped`, `isSlotAvailable`, `serializeEquipment/deserializeEquipment`. `deserializeEquipment(data, itemLookup, stats?, blocks?)` — pass `stats` to re-apply modifiers on load (omit when stats were already serialized with their modifiers), pass `blocks` to restore two-handed slot blocking (static config, not part of the snapshot). Modifier IDs are namespaced as `equip:<slotId>:<i>` with source `equipment:<slotId>` so re-equips don't collide. Events: `equipment:equip`/`:unequip` when `engine+entity` passed.

**Game state snapshot:** `serializeGameState({ stats?, equipment?, inventory?, wallet?, quests?, achievements? })` bundles per-player state into one JSON-safe blob — any field can be omitted. `rehydrateGameState(data, { itemLookup?, equipmentBlocks?, quests?, achievements? })` rebuilds components; quest and achievement trackers are rehydrated in place so their event listeners survive. Stats modifiers are saved alongside base stats, so equipment bonuses round-trip correctly — equipment is deserialized *without* reapplying modifiers since they already live on the restored stats. See `engine/storage/game-state.ts`.

**Currency:** `createWallet(initial?, { caps?, trackHistory?, maxHistory? })` returns a `CurrencyWallet`. Multi-currency (gold/gems/tokens/etc.). Helpers: `getBalance`, `canAfford`, `addCurrency`, `spendCurrency`, `spendMulti` (atomic multi-currency spend), `transferCurrency` (between wallets, respects caps), `setBalance`, `setCap`, `getHistory`, `clearHistory`, `serializeWallet/deserializeWallet`. Balances default to 0, never negative. Events: `currency:gained`/`:spent`/`:insufficient` when `engine+entity` passed. History is a ring buffer evicting oldest.

**Crafting:** `new RecipeBook()` registers `Recipe` definitions (`{ id, ingredients, outputs, skill?, skillLevel?, xp?, successChance?, category? }`). Lookup by `get`, `all`, `byCategory`, `findByOutput`, `findByIngredient`. `canCraft(recipe, inventory, skills?)` returns `{ ok, reason?, missing? }`. `craft(recipe, inventory, itemLookup, { skills?, rng?, engine?, entity? })` returns `{ success, items, consumed, xpGained?, reason? }`. Ingredients with `consumed: false` are tool-style (required, not removed). Multi-output recipes roll per-item `chance` independently. Failed `successChance` still consumes ingredients. Events: `craft:complete`/`:failed` when `engine+entity` passed. XP is advisory — caller applies it to their stats/skills system.

**Loot tables:** `rollLoot(table, { seed?, flags? })` returns `LootDrop[]`. Tables define weighted entries with optional `condition`, `chance`, `count: [min,max]`, `table` (nested), and `guaranteed` drops. `withReplacement: false` prevents duplicates. Deterministic with `seed`. `createSeededRandom()` exposes the xorshift32 RNG for game-custom rolls.

**Quest tracker:** `new QuestTracker()` — manages quest definitions with objectives, progress tracking, completion callbacks. Quests start `locked` (unmet prereqs), `available`, or go `active` → `completed` / `failed`. `progress(questId, objectiveId, amount?)` auto-completes objectives and quests. Optional objectives (`required: false`) don't block completion. `serialize/deserialize` for save/load. Event listeners for `start/progress/complete/fail`. Self-contained — uses its own event bus, not the global one.

**Spatial hash:** `new SpatialHash(cellSize)` — O(1) collision broad-phase. `insert(entity)`, `insertWithBounds(entity, w, h)`, `remove(entity)`, `queryPoint/Rect/Circle(...)`, `rebuild(entities)`. `pairsFromHash(hash)` yields unique entity pairs for N-body collision without O(n²). Use instead of `overlapAll()` when entity count exceeds ~100.

**Entity pool:** `createEntityPool(engine, factory, { size, max, reset? })` — reuse entities for bullets/particles. `pool.acquire(overrides?)` gets or creates. `pool.release(entity)` deactivates. Pool-wide: `warmup(count)`, `releaseAll()`, `destroy()`. Default reset clears velocity/lifetime/opacity.

**Stats + modifiers:** `createStats({ hp: 100, atk: 10 })` returns a `Stats` bag. `getStat(stats, 'atk')` computes `(base + sum(flat)) * (1 + sum(percent)) * product(multipliers)`. `addModifier(stats, { id, stat, type, value, duration?, source?, stacking? })` applies buffs/debuffs. Types: `"flat"`, `"percent"`, `"multiplier"`. `tickModifiers(stats, dt)` advances timers and returns expired. `removeModifiersBySource(stats, 'poison')` cleans up. `serializeStats/deserializeStats` for save.

**Camera follow/bounds:** `engine.camera.follow(entity, { smoothing, deadzone, lookahead, offset })` — lerp toward entity each frame. `setBounds({ minX, minY, maxX, maxY })` clamps camera to world bounds. `worldToScreen(x, y)` / `screenToWorld(x, y)` for coordinate conversion. Deadzone rectangle keeps camera still while target is centered. Lookahead offsets target by velocity × factor.

**Achievements:** `new AchievementTracker()` — milestone tracking with conditions (`progress`, `event`, or `custom` predicate), prerequisites, hidden flag, points. `progress(id, amount)` and `recordEvent(name)` auto-unlock at target. `save()`/`load()` to localStorage under key `"achievements"` by default. Event listeners for `unlock`/`progress`. Self-contained event bus.

**Asset preloader:** `preloadAssets([{ type: 'image'|'audio'|'text'|'json', url, id? }], { onProgress, concurrency, timeout, continueOnError })` — bulk load with progress callbacks. Returns `{ success, assets, failures, duration }`. `getAsset(id)` retrieves from internal cache. `clearAssetCache()` frees memory. Use in scene setup for upfront loading screens.

**Dialog trees:** `runDialogTree(engine, tree, initialFlags?)` — branching conversations beyond single `engine.dialog.show()`. A tree is `{ start, nodes }` where each node has `id, text, speaker?, choices?, next?, onEnter?, onExit?, condition?`. Choices can have `condition` (hide) and `action` callbacks. Use `ctx.goto(id)` from callbacks to jump nodes. Returns final flags for saving conversation outcomes.

**Input bindings:** `new InputBindings(keyboard, gamepad?, mouse?)` maps semantic action names (e.g. `"move-up"`) to physical inputs. `bindings.pressed("move-up")` checks all mapped keys/buttons. `bindings.capture(action)` arms next-input listener for rebinding UIs. `findConflicts()` returns `Array<{ input, actions[] }>` for duplicate bindings across channels (keys prefixed `key:`/`pad:`/`mouse:`) — use to warn before saving ambiguous configs. `save()`/`load()` persist to storage. `DEFAULT_BINDINGS` + `createDefaultBindings()` provide move/action/pause presets. Games can still use `engine.keyboard.*` directly if they don't need remapping. See `engine/input/bindings.ts`.

**Profiler:** Toggle with backtick key (same as debug overlay). Shows per-system timings (last/avg/max ms), frame budget bar, FPS, entity counts. Instrumentation is gated — zero overhead when overlay is hidden.

**Particles & feedback:** `engine.particles.burst/explosion/sparkle/smoke()`, `engine.camera.shake()`, `engine.floatingText()`, `sfx.*()` (ZzFX audio).

**Tweening:** `engine.tweenEntity(entity, 'position.x', from, to, duration, ease?)` -- dot-path property animation.

**Collision:** `overlaps(a, b)` and `overlapAll(entity, archetype)` from `@engine`.

**Persistence:** Low-level: `save/load/remove/has/clearAll` from `@engine` — localStorage with a game-scoped prefix. Call `setStoragePrefix()` once at init. Leaderboards: `submitScore`, `getHighScores`, `isHighScore`, `getTopScore`, `clearHighScores`. Multi-slot saves: `new SaveSlotManager<T>({ maxSlots, version, onMigrate })` — adds named slots, metadata (`name`, `timestamp`, `playtime`, `sceneName`, `thumbnail`, `custom`), active-slot tracking, reserved `autosave` slot, JSON `exportSlot/importSlot` for cloud sync, version migration hook. Purpose-built serializers: `serializeStats`, `serializeEquipment`, `serializeInventory`, `serializeWallet`, `QuestTracker.serialize`, `AchievementTracker.save`, `InputBindings.save`. For combined player state, use `serializeGameState`/`rehydrateGameState` (see Game state snapshot above).

**Multiplayer (client/server):** `NetworkAdapter` interface is the transport abstraction — all adapters implement it. Implementations: `MockAdapter` (in-memory, for tests), `SocketAdapter` (browser WebSocket client), `GameServer` (Bun-based server with room management). `TurnSync<TMove>` is a lockstep helper that collects moves from all players each turn and fires `onTurnComplete` with the full `{playerId: move}` map — works over any adapter. Deterministic game logic required. **Security defaults** on `GameServer`: binds to `127.0.0.1` (loopback only — set `hostname: "0.0.0.0"` explicitly to expose on LAN), `maxConnections: 200`, `maxMessageSize: 64KB`, `maxMessagesPerSecond: 100` per client, `maxClientsPerRoom: 8`, `maxRooms: 100`. Abuse controls: `httpRateLimit: 60` per-IP requests per `httpRateLimitWindowMs: 60_000` (429 on the `/rooms` endpoint when exceeded), and `wsRateViolationLimit: 50` — after that many consecutive `maxMessagesPerSecond` violations the socket is disconnected rather than silently dropped. All limits configurable. Import `GameServer` only in server processes — it uses `Bun.serve`, not browser APIs.

**Session resume:** `new SocketAdapter({ resumeOnReconnect: true })` (default `false`) sends `previousPeerId` in the join frame on every (re)connect; the server reuses that id when it's still free so game state keyed by peerId survives reconnects. The `welcome` server frame now carries `resumed: boolean` so clients can distinguish fresh joins from resumed sessions. See `engine/net/socket-adapter.ts` + `engine/net/game-server.ts`.

**TurnSync desync detection:** `turnSync.submitStateHash(hash)` broadcasts this peer's deterministic post-turn hash (any stable fold of state — `JSON.stringify` + crc32, custom hash, etc.). When hashes arrive from every player, `TurnSync` compares them and fires `onDesync((e) => ...)` if any differ. Opt-in — don't call `submitStateHash` if you don't need desync detection. See `engine/net/turn-sync.ts`.

**State machines:** Add `stateMachine` component with `{ current, states, next? }`. Use `transition(entity, 'newState')` to trigger changes. Auto-processed by `_stateMachine` system.

**Events:** `events.emit/on/off()` from `@engine`. Engine events: `engine:started/stopped/paused/resumed`, `scene:loaded`. Game events: `game:start/resume/restart/pause`. Turn events: `turn:start/end`, `phase:enter/exit`. Viewport: `viewport:resized`, `viewport:orientation`. Combat: `combat:damage-taken`, `combat:entity-defeated`. Behavior events documented per section above (inventory, equipment, currency, craft). See `shared/events.ts` for the full typed list.

**Utilities:** `rng`, `rngInt`, `pick`, `chance`, `clamp`, `lerp`, `vec2`, `dist`, `add`, `sub`, `normalize`, `scale`, `len`, `dot` -- all from `@engine`. Color: `hsl()`, `lerpColor()`, `rainbowColor()`, `PALETTES.*`.

## Error Handling

The engine is forgiving with AI-generated code:
- `engine.spawn()` validates components — warns about invalid position/velocity, zero-dimension colliders, missing required fields. Warnings appear in the debug overlay (press backtick `) and console.
- Systems are wrapped in try-catch — a single broken system logs an error but won't crash the game loop.
- Physics auto-recovers from `NaN` positions/velocities with error logging.
- Scene load failures show a helpful error with available scene names.

## Testing

Run `bun run test` for the full suite (1140+ tests across 43 files covering math, color, timers, grid, pathfinding, noise, dungeon generation, collision, spatial hash, storage, save slots, scheduler, preloader, ECS systems, entity pool, turn manager, scenes, text layout, camera, AI behaviors, damage, wave spawner, inventory, equipment, currency, crafting, loot tables, quests, dialog trees, input bindings, stats, achievements, profiler, networking — MockAdapter, SocketAdapter, GameServer, TurnSync, room listing, touch input, virtual controls). Tests use `bun:test` built-in runner. Test files use relative imports and live under `engine/__tests__/`. The `mockEngine()` helper in `engine/__tests__/helpers.ts` is a lightweight engine stub for system tests.

## Critical Gotchas

- **Don't manually integrate velocity.** `_physics` does this. Writing `position.x += velocity.vx * dt` in a system causes double-speed movement.
- **Don't add built-in systems manually.** All 8 are auto-registered on scene load.
- **Don't mutate the world during iteration** without collecting entities into an array first.
- **Don't put game logic in `engine/`.** It's a reusable framework.
- **Don't create classes for entities.** They're plain objects with component fields.
- **Entity factories return `Partial<Entity>`**, not full entities. `engine.spawn()` handles the rest.
- **`game/` is gitignored.** It's generated from templates. The source of truth for templates is `games/`.
