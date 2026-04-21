# Wiki Log

> Chronological record of all wiki actions. Append-only.

## [2026-04-07] create | Wiki initialized
- Domain: ASCII Game Engine codebase knowledge base
- Structure created with _schema.md, _index.md, _log.md

## [2026-04-07] ingest | Full codebase ingested into wiki
- Ingested 51 source files (engine/, game/, ui/, shared/) + 5 markdown docs
- Created 23 wiki pages across 5 categories:
  - Architecture (9): engine-overview, game-loop, ecs-architecture, scene-lifecycle, system-runner, renderer, camera, react-bridge, design-decisions
  - Components (7): component-reference, pretext-integration, text-flow-pattern, particles, input-system, collision-detection, audio-system, zustand-store
  - Systems (2): player-input-system, collision-system
  - Patterns (2): entity-factory-pattern, scaffolding-tools
  - References (1): utility-reference
  - Guides (1): asteroid-field-game
- Updated _index.md with all 23 pages

## [2026-04-07] update | Physics, Animation, and Entity Parenting
- Added 3 new wiki pages: physics-system, animation-system, entity-parenting
- Updated component-reference with 6 new component types: Physics, Animation, AnimationFrame, Parent, Child, ImageComponent
- Updated engine-overview with new built-in systems, frame lifecycle, and API methods
- Updated system-runner with built-in system execution order
- Updated _index.md (total pages: 23 → 26)

## [2026-04-07] update | Image System, Transitions, and Tween System
- Added 3 new wiki pages: image-system, transitions, tween-system
- image-system: ImageComponent interface, image-loader API (loadImage, preloadImages, getCachedImage, clearImageCache), layer-sorted rendering
- transitions: TransitionType enum, Transition class lifecycle, engine.loadScene integration with midpoint callback
- tween-system: Tween/TweenEntry interfaces, dot-path targeting, 4 easing functions, destroyOnComplete, engine.tweenEntity helper
- Updated _index.md (total pages: 26 → 29)
- Cleared _queue.md (no pending updates)

## [2026-04-21] update | v0.3 feature pass across 3 existing pages
- Updated component-reference: expanded Entity listing to all 30+ components, added group/mask/auto fields to Collider, added 4 new component entries (Spring, Trail, VisualBounds, TextEffectComponent)
- Updated renderer: added Sprite Bitmap Cache, Text Effects, and Art Assets sections; added links to sprite-cache and art-assets pages
- Updated scaffolding-tools: added frontmatter, 5 new templates (platformer, roguelike, physics-text, tic-tac-toe, connect-four), AI scaffolding commands (ai:game, ai:sprite, ai:mechanic, ai:juice), link to define-game

## [2026-04-21] create | v0.3 new pages — systems, features, patterns
- Added 13 new wiki pages:
  - Architecture (1): define-game
  - Components (3): art-assets, sprite-cache, save-slots
  - Systems (7): spring-system, trail-system, measure-system, collision-events, platform-system, ambient-drift-system, cursor-repel-system
  - Patterns (1): interactive-text
  - References (1): juice-helpers
- Updated _index.md (total pages: 29 → 42)

## [2026-04-21] consolidate | Absorbed docs/guides/ into wiki, deleted guide files
- Audited 11 guide files (~400KB) against 42 wiki pages
- Created 3 new wiki pages:
  - References (2): behaviors, testing
  - Architecture (1): multiplayer
- Updated 2 existing pages:
  - scaffolding-tools: added build/export commands, quality/CI commands, AI tool flags
  - utility-reference: added pathfinding, dungeon generation, noise, cutscene sections
  - zustand-store: added gameState bag and StoreSlice extension pattern
- Deleted all 11 files in docs/guides/ (content fully absorbed or superseded by wiki)
- Updated _index.md (total pages: 42 → 45)
