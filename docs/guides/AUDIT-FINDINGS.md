# Codebase Audit Findings

Consolidated results from 10 parallel code review agents, each using the corresponding development guide as its specification. Findings are deduplicated across reviewers.

## Critical (15 issues)

| # | Area | File | Issue |
|---|---|---|---|
| C1 | Engine Core | `engine/core/engine.ts:508-521` | `stop()` never calls `world.clear()` — entities leak across restarts |
| C2 | Engine Core | `engine/core/define-game.ts:344-355` | `endTurn()` runs after game-over, corrupting final `currentPlayer`/`turn` state |
| C3 | Rendering | `engine/render/ascii-renderer.ts:492` | `drawStyledRun` sets `globalAlpha = style.opacity` instead of multiplying with parent entity opacity |
| C4 | Rendering/UI | `engine/render/canvas-ui.ts:950` | `DialogManager._speakerColor` reads `selectedColor` instead of `speakerColor` — the `UIDialogOpts.speakerColor` option is completely ignored |
| C5 | Behaviors | `engine/behaviors/damage.ts:59` | `onDeath` callback runs inside `for...of` over live ECS query — calling `engine.destroy(entity)` corrupts the iterator |
| C6 | Physics | `engine/physics/physics-system.ts:114-115` | Bounce pass unconditionally sets `grounded = false` via `else` branch, overwriting any game-managed grounded state |
| C7 | Input | `engine/input/bindings.ts:201,251` | `capture()` uses `setInterval` (violates CLAUDE.md prohibition), polls `pressed()` outside the frame loop |
| C8 | Networking | `engine/net/game-server.ts:666-671` | `previousPeerId` has no length/charset validation — memory amplification DoS via oversized peer IDs |
| C9 | Networking | `engine/net/game-server.ts:603-607` | `roomId` has no length limit — stored in maps, echoed in listings, enables DoS |
| C10 | Networking | `engine/net/game-server.ts:684` | `clientName` stored unvalidated — unbounded string per connection |
| C11 | Templates | `games/asteroid-field/systems/lifetime.ts` | Custom lifetime system duplicates built-in `_lifetime` — both run, bullets expire at half designed lifetime |
| C12 | Templates | `games/asteroid-field/systems/collision.ts:67` | `break` instead of `continue` — terminates player collision loop instead of skipping invincible player |
| C13 | Scheduler | `engine/utils/scheduler.ts:54,58-67` | `sequence()` returns first step's ID; after it fires and is spliced, `cancel()` silently no-ops on remaining steps |
| C14 | UI Store | `ui/store.ts:92-113` | `extendStore` boolean guard breaks store re-extension after HMR re-mount cycle |
| C15 | CI | `.github/workflows/ci.yml:30-36` | `check:bounds` never runs in CI — import boundary violations go undetected |

## High / Important (36 issues)

### Engine Core & ECS
| # | File | Issue |
|---|---|---|
| H1 | `engine/physics/physics-system.ts:26-38` | Ground friction applied to collider-less entities even when airborne (`grounded` never set to `false`) |
| H2 | `engine/core/turn-manager.ts:139-145` | `reset()` doesn't emit `phase:exit` but `stop()` does — asymmetric cleanup on scene change |
| H3 | `engine/core/engine.ts:460-468` | Calling `runGame()` twice causes runtime/scene mismatch via stale closures |

### Behaviors
| # | File | Issue |
|---|---|---|
| H4 | `engine/behaviors/quests.ts:108-124` | `register()` silently resets existing quest progress on re-registration (no idempotency guard) |
| H5 | `engine/behaviors/crafting.ts:276-307` | `CraftResult.items` loses per-output count — multi-count outputs underreported |
| H6 | `engine/behaviors/achievements.ts:393-404` | Achievements with maxed progress don't auto-unlock when prerequisite is belatedly satisfied |
| H7 | `engine/behaviors/damage.ts:100-113` | `entity.damage` not deleted before `onDeath` callback — newly applied damage silently dropped |
| H8 | `engine/behaviors/wave-spawner.ts:115-122` | First enemy in each wave spawns with zero delay regardless of `spawnDelay` config |

### Rendering
| # | File | Issue |
|---|---|---|
| H9 | `engine/render/ascii-renderer.ts:341-353` | `justify` + styled tags: styles silently discarded — justify path strips tags before rendering |
| H10 | `engine/render/ascii-renderer.ts:408-413` | Newline chars not skipped during `lineCharStart` advancement — char-to-style mapping shifts |
| H11 | `engine/render/canvas-ui.ts:1267-1355` | `UIScrollPanel.draw` lacks outer `ctx.save()`/`ctx.restore()` — leaks canvas state to callers |

### Multiplayer / Networking
| # | File | Issue |
|---|---|---|
| H12 | `engine/net/game-server.ts:516-519` | Rate-limit violation counter resets on ANY non-violating window — circuit breaker easily bypassed |
| H13 | `engine/net/socket-adapter.ts:470-471` | Ping handler sends frame typed `"ping"` instead of `"pong"` — protocol violation, doubles keepalive traffic |
| H14 | `engine/core/create-multiplayer-game.ts:228-254` | `waitForPlayers` leaks `onPeerJoin` subscription and hangs 30s on adapter disconnect |
| H15 | `engine/core/create-multiplayer-game.ts:278` | Expected player count not configurable — always uses `players.default ?? players.min ?? 2` |
| H16 | `engine/net/turn-sync.ts:384-399` | Desync detection silently skipped for rebased turns when TurnSync is stopped |

### Physics / Input / Audio
| # | File | Issue |
|---|---|---|
| H17 | `engine/input/bindings.ts:59-62,213-216` | Escape hardcoded as capture cancel key and excluded from detection — permanently non-rebindable |
| H18 | `engine/audio/audio.ts:111` | Local `audio` variable shadows the exported `audio` controller inside `playMusic()` |
| H19 | `engine/audio/audio.ts:116-125` | Autoplay-retry listeners hold stale element reference after `stopMusic()` |
| H20 | `engine/physics/spatial-hash.ts:185-226` | `pairsFromHash` emits duplicate pairs for `insertWithBounds` entities — collision handlers fire multiple times |
| H21 | `engine/input/mouse.ts:30-34` | `Mouse` class never stores `e.button` — non-left-click bindings (`mouseButtons: [1]`, `[2]`) silently never fire |

### UI & Store
| # | File | Issue |
|---|---|---|
| H22 | `ui/hud/HUD.tsx:27` | Unstable/empty key for anonymous HUD components causes duplicate-key warnings and wrong reconciliation |
| H23 | `ui/screens/GameOverScreen.tsx:17-19` | `reset()` zeroes score before engine's game-over scene reads it from store |
| H24 | `engine/render/canvas-ui.ts:1196-1264` | Stale zero-initialized hit bounds in `UIScrollPanel`/`UIGrid`/`UITabs` on first frame before draw |
| H25 | `engine/render/canvas-ui.ts:1491-1497` | `UIGrid` ArrowDown navigates into unpopulated sparse-grid rows, clamps to wrong cell |
| H26 | `engine/render/canvas-ui.ts:1116-1121` | Typewriter skips `\n` deduction when `charsRemaining` hits exactly zero at line boundary |
| H27 | `ui/screens/MainMenu.tsx:21-25` | Space keypress leaks into engine state on React-to-scene transition — can skip title scene |

### Templates
| # | File | Issue |
|---|---|---|
| H28 | `games/platformer/systems/collection.ts:22-39` | Same star can award score to multiple players in one frame — double-count on destroy |
| H29 | `games/roguelike/systems/fov.ts:132-145` | try/catch swallows all errors on `engine.destroy()` — stale entities accumulate silently |

### Utilities & Storage
| # | File | Issue |
|---|---|---|
| H30 | `engine/utils/pathfinding.ts:96,153` | `maxIterations` exhaustion returns `null` — indistinguishable from "no path exists" |
| H31 | `engine/utils/dungeon.ts:438` | `floodFillRooms` BFS uses `Array.shift()` — O(n^2) on large maps |
| H32 | `engine/utils/scheduler.ts:74-82` | Repeating timers fire at most once per `update()` regardless of `dt` magnitude |
| H33 | `engine/utils/cutscene.ts:118-128` | `waitForInput` leaves unresolved Promises after scene change — memory leak |
| H34 | `engine/storage/high-scores.ts:42` | `submitScore` return value inconsistent with `isHighScore` on tie boundary |

### Tooling & Config
| # | File | Issue |
|---|---|---|
| H35 | `scripts/gen-api.ts:128` | `rm -rf` shell command breaks on Windows |
| H36 | `package.json:32-41` | `@anthropic-ai/sdk`, `vite`, `@vitejs/plugin-react` in `dependencies` not `devDependencies` |
| H37 | `engine/package.json:7-22` | Engine exports raw `.ts` files — will break npm publishing |
| H38 | `.github/workflows/ci.yml:16` | `bun-version: latest` is non-reproducible |
| H39 | `scripts/check-boundaries.ts:46-55` | `ui/` denial list missing bare `"@game"` entry |
| H40 | `tsconfig.json:24` | `scripts/` excluded from type-checking |

## Test Coverage Gaps (14 gaps)

| Priority | Missing Tests | File |
|---|---|---|
| Critical | Tween system (auto-registered built-in, untested) | `engine/ecs/tween-system.ts` |
| Critical | Animation system (auto-registered built-in, untested) | `engine/ecs/animation-system.ts` |
| High | Parent system (auto-registered built-in) | `engine/ecs/parent-system.ts` |
| High | Tilemap subsystem (pure functions, no tests) | `engine/tiles/tilemap.ts` |
| High | High-scores storage | `engine/storage/high-scores.ts` |
| High | Text effects (13 pure functions + compose) | `engine/render/text-effects.ts` |
| High | Cutscene builder | `engine/utils/cutscene.ts` |
| High | Scheduler multi-fire assertion is `>= 1` not `>= 3` | `engine/__tests__/utils/scheduler.test.ts:80` |
| High | `mockEngine` missing `findByTag`/timer methods | `engine/__tests__/helpers.ts` |
| Medium | ASCII sprites (pure data transforms) | `engine/data/ascii-sprites.ts` |
| Medium | Gauge + typewriter systems | `engine/ecs/gauge-system.ts`, `engine/ecs/typewriter-system.ts` |
| Medium | Interaction system | `engine/ecs/interaction-system.ts` |
| Medium | `check-boundaries.ts` script logic | `scripts/check-boundaries.ts` |
| Medium | GameLoop (accumulator, spiral-of-death clamp) | `engine/core/game-loop.ts` |

## Medium / Low (12 issues)

| File | Issue |
|---|---|
| `engine/behaviors/quests.ts:127-143` | Circular prerequisites silently lock quests permanently |
| `engine/render/toast.ts:75` | Comment says "fade in" but logic is fade-out; division by zero when `duration = 0` |
| `engine/render/canvas-ui.ts:132-170` | Border char alignment sub-pixel gaps on non-integer charWidth fonts |
| `engine/render/transitions.ts:83-87` | `duration = 0` skips the `in` phase entirely (sequential `if` not `else if`) |
| `engine/net/mock-adapter.ts:268-276` | Latency simulation doesn't clone message before setTimeout |
| `engine/net/socket-adapter.ts:376-380` | `_peers` cleared before `onDisconnect` fires — farewell sends silently dropped |
| `engine/core/create-multiplayer-game.ts:60` | `token` field declared but never forwarded or implemented |
| `engine/core/state-hash.ts` | 32-bit FNV hash — collision risk for long games or adversarial peers |
| `games/roguelike/systems/combat.ts:30` | Floating text shows score (50) but message shows XP (variable) — UX mismatch |
| `engine/storage/save-slots.ts:154` | Auto-generated slot names collide after delete + re-add |
| `scripts/check-boundaries.ts:9` | Header comment misrepresents engine allowed imports |
| `packages/create-ascii-game/index.mjs:47` | Help text shows 3 of 6 templates |
