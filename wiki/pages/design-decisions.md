# Design Decisions

Key architectural choices and the reasoning behind them.

## miniplex over bitECS

**Choice**: miniplex for the ECS implementation.
**Why**: Developer experience matters more than raw performance at this scale.

- miniplex uses plain JS objects as entities — you can console.log them, spread them, inspect them in devtools.
- bitECS uses typed arrays and numeric IDs — faster for 100k+ entities, but the DX is painful for a creative/prototyping engine.
- ASCII games rarely need more than a few hundred entities. The performance ceiling of miniplex is never hit.
- miniplex queries (`world.with('position', 'velocity')`) read like English.

## zustand over React Context

**Choice**: zustand for the UI state store.
**Why**: It works outside React.

- The game loop runs in requestAnimationFrame, outside the React tree. It needs to write state without hooks.
- zustand's `useStore.getState().setX()` works anywhere — no Provider, no hook rules.
- React Context would require passing callbacks through refs or global variables to bridge the gap.
- zustand selectors prevent unnecessary re-renders. Context re-renders all consumers on any change.
- Tiny bundle (~1KB).

## Pretext over DOM Measurement

**Choice**: Custom Pretext text layout engine.
**Why**: 60fps text layout requires avoiding DOM measurement.

- Canvas `measureText()` is fast for single calls but becomes a bottleneck when measuring hundreds of text entities per frame.
- DOM-based measurement (creating elements, reading offsetWidth) is orders of magnitude slower and causes forced reflows.
- Pretext pre-computes character metrics for the monospace font and caches layout results.
- Since we use a monospace font, character width is constant — layout becomes pure arithmetic.

## No Full Game Engine (Pixi, Kaplay, etc.)

**Choice**: Raw canvas2d with fillText.
**Why**: Existing engines fight against ASCII rendering.

- Pixi.js is built around sprites and textures. Text rendering is secondary and goes through bitmap fonts or DOM overlays.
- Kaplay (formerly Kaboom) has text support but assumes sprite-based games.
- Our ENTIRE rendering pipeline is `ctx.fillText()`. A full engine would add weight and abstraction for features we don't use.
- Canvas2d fillText is surprisingly fast for ASCII art when you manage the state machine well (batch by font, color, etc.).

## Fira Code as Default Font

**Choice**: Fira Code as the default monospace font.
**Why**: Free, monospace, widely available, and pretty.

- Monospace is essential — character grid alignment depends on equal-width characters.
- Fira Code has programming ligatures that look great in ASCII art contexts.
- It's available on Google Fonts — easy to load with @font-face.
- Fallback chain: Fira Code → monospace system font → any monospace.

## Particles Outside ECS

**Choice**: Particles use a dedicated pool, not ECS entities.
**Why**: Performance.

- A single explosion can create 50+ particles. If each were an ECS entity, a busy frame could add hundreds of entities and immediately remove them.
- Entity creation/destruction has overhead in miniplex (archetype recalculation, query updates).
- The particle pool uses a flat array with index recycling. No allocation during gameplay.
- Particles only need position, velocity, color, and lifetime — no collision, no complex queries.

## Fixed Timestep

**Choice**: Fixed timestep for physics, variable for rendering.
**Why**: Physics stability.

- Variable dt causes physics instability: fast frames = small steps = tunneling; slow frames = big steps = objects teleporting.
- Fixed timestep (e.g., 1/60s) ensures deterministic physics regardless of frame rate.
- Rendering interpolates between physics states for smooth visuals on high-refresh displays.
- Classic game loop pattern: accumulate real time, step physics in fixed increments, render with interpolation.

## Optional Rapier2D (Lazy WASM Load)

**Choice**: Rapier2D physics is optional, loaded lazily via WASM.
**Why**: Most ASCII games don't need real physics.

- Rapier2D adds ~200KB of WASM. Loading it unconditionally penalizes simple games.
- Lazy loading means the WASM is only fetched when a scene actually uses physics.
- Simple collision detection (circle-circle, AABB) is built into the engine for the common case.
- Rapier is there for games that want rigid body dynamics, joints, or complex shapes.

## See Also

- [[engine-overview]] — The resulting engine architecture
- [[ecs-architecture]] — How miniplex is used
- [[pretext-integration]] — The text layout system
