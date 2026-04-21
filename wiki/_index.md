# ASCII Game Engine Wiki — Index

> Content catalog. Every wiki page listed under its type with a one-line summary.
> Last updated: 2026-04-21 | Total pages: 45

## Architecture

- [[engine-overview]] — Top-level Engine class: 4-layer separation, frame lifecycle, public API
- [[game-loop]] — Fixed-timestep RAF loop: accumulator pattern, spiral-of-death clamping, pause
- [[ecs-architecture]] — Entity-Component-System with miniplex: World, queries, spawning, mutation rules
- [[scene-lifecycle]] — Scene interface, SceneManager, transitions (cleanup → clear → setup)
- [[system-runner]] — System interface, ordered execution, init/cleanup hooks
- [[renderer]] — AsciiRenderer: Canvas 2D pipeline, DPR resize, render order, auto-rendering
- [[camera]] — 2D camera: moveTo, panTo, follow, setZoom, shake with lerp interpolation
- [[entity-parenting]] — Parent-child entity hierarchy: offset-based positioning, attach/detach/destroyWithChildren
- [[react-bridge]] — Hard boundary between game loop and React; zustand as the only bridge
- [[design-decisions]] — Key architectural choices and rationale (miniplex, zustand, Pretext, etc.)
- [[define-game]] — Declarative game API: boardgame.io-style turns, phases, moves, game-over
- [[multiplayer]] — Lockstep networking: NetworkAdapter, SocketAdapter, GameServer, TurnSync, createMultiplayerGame

## Components

- [[component-reference]] — All 30+ ECS component types with fields, descriptions, and usage
- [[pretext-integration]] — @chenglou/pretext wrapper: caching, measureHeight, layout, shrinkwrap
- [[text-flow-pattern]] — Text flowing around circular obstacles via per-line variable-width layout
- [[particles]] — ParticlePool: flat array, object pooling, burst/update/render, manual render warning
- [[input-system]] — Keyboard and Mouse classes: per-frame state tracking, justPressed/justReleased
- [[collision-detection]] — overlaps() and overlapAll(): circle-circle, rect-rect, mixed detection
- [[audio-system]] — Procedural oscillator beeps: beep(), sfx presets, Web Audio auto-unlock
- [[zustand-store]] — GameStore shape, actions, GameScreen type, getState vs hook patterns
- [[image-system]] — ImageComponent, async image loading with caching, layer-sorted bitmap rendering
- [[transitions]] — Scene transition overlays: fade, fadeWhite, wipe with midpoint scene swap
- [[art-assets]] — ArtAsset, AnimatedArtAsset, SpriteSheet: reusable ASCII art data structures
- [[sprite-cache]] — LRU offscreen canvas cache for sprite rendering performance
- [[save-slots]] — SaveSlotManager: multi-slot persistence with compression and migration

## Systems

- [[player-input-system]] — WASD/arrows movement, Space to shoot, screen wrapping, Cooldown
- [[collision-system]] — Bullet×asteroid and player×asteroid detection, particles, score, health, death
- [[physics-system]] — Built-in physics: gravity, friction, drag, bounce, maxSpeed, grounded detection
- [[animation-system]] — Frame-by-frame animation for ascii/sprite entities: loop, onComplete, play/stop
- [[tween-system]] — Continuous numeric property interpolation: dot-path targeting, 4 easings, auto-cleanup
- [[spring-system]] — Spring force toward target positions: presets (stiff, bouncy, floaty), spawnText integration
- [[trail-system]] — Fading afterimage spawner: interval, lifetime, color, opacity per entity
- [[measure-system]] — Auto-collider from Pretext measurement, VisualBounds dirty-tracking
- [[collision-events]] — Declarative engine.onCollide(tagA, tagB, cb) with bitmask collision groups
- [[platform-system]] — One-way platform collisions: pass through from below, land from above
- [[ambient-drift-system]] — Gentle sinusoidal position variation for idle/decorative entities
- [[cursor-repel-system]] — Push entities away from mouse cursor with linear force falloff

## Patterns

- [[entity-factory-pattern]] — Why Partial<Entity>, component composition, createPlayer/Asteroid/Bullet
- [[scaffolding-tools]] — Bun scripts: new:scene, new:system, new:entity, init:game, AI generators
- [[interactive-text]] — Decompose text/sprites into per-character physics entities with spring homes

## References

- [[utility-reference]] — Math (Vec2, lerp, rng), Timer (Cooldown, tween), Color (hsl, rainbow), Constants, Pathfinding, Dungeon, Noise
- [[juice-helpers]] — flash, blink, knockback, timeScale: one-liner game-feel feedback helpers
- [[behaviors]] — Modular gameplay systems: AI, inventory, crafting, loot, damage, quests, achievements, stats
- [[testing]] — Test infrastructure (bun:test), verification workflow, mockEngine, template smoke tests

## Guides

- [[asteroid-field-game]] — Complete example game walkthrough: 3 scenes, 5 systems, 3 factories, all mechanics
