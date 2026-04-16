# TODO — engine health and readiness

Concrete backlog distilled from the session's reviews, pretext audit, DX review, and stress-test planning. Ordered by impact on "can someone actually ship a finished, polished game with this?" Not exhaustive — specific game features or game-specific tooling aren't here.

Every item has: one-line goal, why it matters, rough sketch of the fix.

---

## P0 — trust + correctness (do these first)

### 1. Add a smoke-build check to CI so `bun run build` can never silently break again ✓ DONE
`bun run build` was broken this session by a Vite html-inline-proxy bug (Windows case-mismatch). The fix was a 5-line change, but the signal — that no one had run `bun run build` in a while — is the real problem. Add a CI job that runs `bun run check && bun run test && bun run lint && bun run build && bun run export` on every PR. Fails on any non-zero exit.

Shipped: `.github/workflows/ci.yml` runs check + test + lint + build + export on every push to `main` and on every PR.

### 2. Add a per-template smoke test ✓ DONE
The platformer template was completely broken (`createPlatform()` deleted, nothing regenerated). A user running `bun run init:game platformer` got a stub with no platformer mechanics. Fix: a test per template that boots its `setupGame(engine)`, advances the scene 60 frames in `mockEngine()`, asserts no uncaught errors and that expected entity tags exist. Catches template rot.

Shipped: `engine/__tests__/templates/*.smoke.test.ts` covers blank, platformer, asteroid-field, roguelike. Shared harness at `engine/__tests__/templates/_engine.ts`.

### 3. Ship the 4 pretext performance wins from the audit ✓ DONE
See `pretext:pretext` audit notes and `docs/PROJECT-GUIDE.md` Rendering section:
- Replace `getLineCount` to use `layout().lineCount` instead of walking lines (`engine/render/text-layout.ts:270`)
- Merge the dual LRU (`fastCache` + `segCache`) into a single `PreparedTextWithSegments` cache — halves cold-path cost and removes double-prepare
- Add a `measureLineWidth(text, font)` helper to replace the 10+ call sites doing `shrinkwrap(text, font, Infinity)` or `shrinkwrap(..., 99999)`
- Route `CanvasUI.inlineRun` chunk widths through the same cache instead of raw `ctx.measureText` per frame

None is large; together they remove real per-frame overhead.

Shipped: all four in Wave 1 launch-readiness push — see `docs/PERF.md` (2026-04-13).

### 4. Write renderer + ECS perf benchmarks ✓ DONE
Right now nobody knows at what entity count the engine slows down. Add `engine/__bench__/` with benchmark files covering 100 / 1000 / 5000 entities in various component mixes (textBlock-heavy, particle-heavy, physics-heavy, styled-text-heavy). Use `bun bench` or plain `performance.now()` wrapped in assertions (catch regressions, not absolute speed). Publish baseline numbers in `docs/PERF.md`. Without this, scaling questions are unanswerable.

Shipped: `engine/__bench__/` has text-block / particle / physics / styled-text bench files driven by `run.ts` (`bun run bench`). Baseline numbers live in `docs/PERF.md`.

---

## P1 — structural gaps surfaced by the reviews

### 5. Build one flagship game using only the public `@engine` API — ship it
Templates are not the same as finished games. Commit to one completable game (30-60 minutes of play, menu + play + save + endings) built by consuming only what a user can consume. The goal is to prune the API: anything you reached for and wished didn't exist is a removal candidate; anything you wished existed is a real feature request. The Hearthstone stress-test happening now is a planning version of this; the full-build version is what actually forces the pruning.

### 6. Consider a `PlayerState` facade
The decision matrix in `plugins/ascii-games-dev/skills/ascii-games-dev/SKILL.md` exists because stats+modifiers / equipment / inventory / wallet / quests / achievements overlap in confusing ways. `serializeGameState` bundles them for persistence but there's no runtime aggregate. Games reinvent the wiring every time. Sketch: `createPlayerState({ stats, equipment, inventory, wallet, quests, achievements })` that returns one object hung on the player entity, plus listeners that keep equipment's modifiers in sync with stats automatically. Optional — games that want à-la-carte keep the current flat API.

### 7. Canvas UI: add `isPointInside(x, y)` to every hit-testable element
Every UI primitive (`UIMenu`, `UIScrollPanel`, `UIGrid`, `UITabs`, `UITooltip`, buttons in `inlineRun`) stores `_lastX/_lastY/_lastW/_lastH` during draw for hit-testing, but exposes no query helper. Games reinvent mouse-over detection every time. Add `.isPointInside(x, y): boolean` and `.getHoveredItem(x, y): ItemRef | null` where relevant. Small change, compounding DX win.

### 8. Document real-time netcode as "relay only," then ship a transform interpolation helper
`SocketAdapter` is pure relay. No interpolation, prediction, or rollback. Competitive real-time games will hit this wall. Two actions:
- Add a section to `docs/PROJECT-GUIDE.md` Multiplayer: "What TurnSync doesn't give you. What SocketAdapter doesn't give you. Use these libraries if you need X." Set expectations.
- Ship a lightweight `createTransformInterpolator({ entity, snapshotStream })` that lerps between received snapshots for smooth remote-entity rendering. 80% of the real-time ask, minus prediction/rollback. Flag prediction/rollback as "out of scope."

### 9. Session resume: add a server-authoritative state snapshot helper
`SocketAdapter.resumeOnReconnect` preserves peerId but not game state. On reconnect, the game has to reconcile from scratch. Add a `GameServer` helper that lets the host peer publish a room-state snapshot every N seconds, and a `SocketAdapter` hook that requests the latest snapshot on (re)connect. Completely optional, but turns session resume from "shallow" to "useful." Skip if most target games don't need it.

### 10. Stop rewriting the same `{ tags: { values: new Set(['foo']) } }` spread
Every entity factory does this. Add `createTags('foo', 'bar')` to `@engine` returning the component. Minor ergonomic win, also reduces the noExplicitAny surface because typed.

---

## P2 — quality of life and long-tail coverage

### 11. Type the ECS transient-state escape hatch
111 `noExplicitAny` warnings are mostly `const e = entity as any` in systems that read/write transient `_fieldName` fields (e.g., `_patrol`, `_invincibleTimer`, `_wander`). Introduce a generic `TransientFields<T>` type and document the pattern so games can extend Entity with their own private fields (`declare module '@shared/types' { interface Entity { _myField?: ... } }`) instead of `as any`. Doesn't reduce every warning but makes the escape hatch legit.

### 12. Hit-test and style helpers are underdocumented
`engine.mouse.{x,y,down,justDown}` is fine, but examples of "click a card in the hand" or "hover over a menu item" are absent from COOKBOOK. Add one or two recipes.

### 13. Multi-gamepad + vibration
Current `Gamepad` class tracks one pad by index. Multi-local-player requires multi-pad. Refactor to `Gamepads` that exposes indexed pads (`engine.gamepads[0]`, `[1]`, …). Add `vibrate(strongMagnitude, weakMagnitude, ms)` using the `GamepadHapticActuator` API where supported. Small team local-multiplayer becomes possible.

### 14. Mobile: haptics (`navigator.vibrate`) + orientation-lock helpers
Viewport events + safe-area insets shipped this session, but vibration and `screen.orientation.lock()` are absent. Both are small additions that make games feel native on mobile.

### 15. Profiler export + in-game toggle
Backtick toggles the debug overlay. Add a "dump last 10s of timings to JSON" command (also backtick-triggered with a modifier) so devs can profile offline.

### 16. Content pipeline starters
Cards, dialogue trees, level data, item registries — games hand-code these in TypeScript. Consider: `loadContent<T>(glob: string): Promise<Record<string, T>>` that reads all `.json` matching a glob and hot-reloads in dev. Keeps content separate from code, enables non-programmer authoring.

### 17. Localization
No `i18n` story. For any game that ships beyond English, this becomes a blocker. Minimum: an `engine.i18n` namespace exposing `t(key, vars)` + a locale store + a loader for JSON tables. Match the existing `setStoragePrefix` / `setLocale` (pretext) pattern.

### 18. `AchievementTracker` and `QuestTracker` use their own event buses
Both self-contained, but games that want cross-cutting listeners have to subscribe twice. Consider unifying their events onto the main `events` emitter (behind feature flags so existing users aren't broken).

### 19. Shop / skill-tree / status-effect UI primitives
Every RPG-ish game reimplements these. Decide: ship primitives (e.g., `UIShop(inventory, wallet, stock)`, `UISkillTree(tree)`, `UIStatusBar(stats)`) or explicitly document that games build them from `UIMenu` + `UIGrid`. Either answer is fine; the current situation ("the engine supports it but you build it yourself every time") is the worst of both.

### 20. Asset preloader has no progress-bar UI primitive
`preloadAssets(..., { onProgress })` exists. Add `UILoadingBar(preloadPromise)` that hooks onProgress and renders a canvas UI progress bar. Every game with assets builds this by hand.

---

## From the Hearthstone stress test

Surfaced by planning a full Hearthstone MVP against the current engine. See `C:\Users\Maxwell\ai\hearthstone-ascii\GAPS.md` for the full 15-gap breakdown. Zero blockers; the items worth pulling in:

### 21. `TurnSync` asymmetric-move mode (P1)
`TurnSync` requires every player to submit a move every turn. Correct for lockstep simulation, wrong for card games, strategy games, or anything with a single active player per turn. Off-turn clients currently have to synthesise `{ kind: 'noop' }` moves, doubling wire traffic. Add `new TurnSync({ asymmetric: true })` that completes on the active player's move alone. Small change, unlocks a whole class of game.

### 22. `serializeGameState` `custom` hook (P1 — trivial)
The snapshot bundles six built-in subsystems but games can't add their own. Card game state (board, hand, deck, graveyard, mana, hero HP) has to use `save/load` directly and loses the migration hook. Add `SerializedGameState.custom?: Record<string, unknown>` and a matching param on `serializeGameState(sources, custom?)`. One line; high value.

### 23. Decision matrix: make "Enemy AI" row spatial-only (hygiene)
The decision matrix in `plugins/ascii-games-dev/skills/ascii-games-dev/SKILL.md` points to `createPatrolBehavior / createChaseBehavior / createFleeBehavior / createWanderBehavior` for enemy AI, but all four assume `position + velocity`. A card-game, puzzle-game, or RPG-turn-based AI gets zero leverage. Re-word the row: "Enemy AI (spatial)" with a separate "Discrete-state AI — you build this yourself; engine provides no scaffolding."

### 24. Multiplayer determinism soak test (P0 — ties to #4) ✓ DONE
Per-test coverage is strong, but no test exercises 100+ sequential turns with chained triggers, cascading deathrattles, and seeded shuffles on two clients. The assumption that miniplex query order is cross-peer stable under complex mutation chains is unverified. Ship a soak harness: two `MockAdapter` peers, seeded deck, scripted match, assert state hash equality at every `endTurn` over 100 full matches. Required before claiming 1.0.

Shipped: `engine/__tests__/net/soak.test.ts` — 11 scenarios, 1100 turns, deliberate-desync check verified.

### 25. Targeting arrow primitive (P2 — polish with real leverage)
Every card game, many tactics games, any UI with "drag to connect" needs an arrow from source to cursor + valid-target highlighting. Currently games hand-roll ~150 LOC. Add `engine.ui.arrow(fromX, fromY, toX, toY, opts)` + a `TargetPicker` helper that surfaces `validTargetIds`/`hovered`/`commit`. ~40 LOC in engine, ~100 LOC saved per game.

### 26. Matchmaking queue (P2)
`SocketAdapter.listRooms` + manual join works for small scale. At 100+ concurrent clients, two peers racing to create rooms both miss each other's brand-new room. Either a `/queue` endpoint on `GameServer` or a documented `matchmaker` pattern using a well-known room. Optional per game, but card games, shooters, and arena games all ask for it.

### 27. `UITextPanelOpts.title?: string` (P2 — trivial)
`textPanel` is the only one of the Dialog/Menu/Grid/Scroll/Tabs family that doesn't accept `title`. Inconsistent. One-line addition.

---

## Rolling hygiene

- Re-run `bun run gen:api` in CI so `docs/API-generated.md` can't drift
- Schedule a per-quarter pass through `knip` to prune unused exports
- `games/` templates should be treated as first-class code with tests, not examples
- Consider moving `games/roguelike/utils/dungeon.ts` (duplicated with `engine/utils/dungeon.ts`) into the engine — templates that diverge are usually a signal the engine missed a feature

---

## Explicitly deferred / out of scope

- AI scaffolding beyond `patrol/chase/flee/wander` — GOAP, behavior trees, utility AI. Only pursue if a real game needs it. Games that do this well all implement their own anyway.
- Prediction/rollback netcode. Different project. Recommend a third-party library when a game asks.
- A GUI level editor / card authoring tool. Game-specific; not engine responsibility.
- SSR or non-browser rendering. The engine is canvas-in-browser — don't pretend otherwise.

---

## How to read this list

P0 items are maintenance debt that eroded trust this session. If they recur, the engine loses users faster than features gain them. Do these.

P1 items are shape decisions. Each one removes a "wait, how do I…" moment for new games. Worth a week each.

P2 items are polish. Do them as specific games ask for them, not speculatively.
