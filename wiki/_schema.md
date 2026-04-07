# ASCII Game Engine Wiki — Schema

## Domain
Internal knowledge base for the **ASCII Game Engine** codebase — a template repository
for building ASCII-art-styled browser games using Pretext, miniplex ECS, React, and Bun.

Covers: architecture, engine internals, rendering pipeline, ECS patterns, Pretext integration,
game development patterns, React UI layer, tooling, and design decisions.

## Conventions
- File names: lowercase, hyphens, no spaces (e.g., `ecs-architecture.md`)
- Every wiki page starts with YAML frontmatter
- Use `[[wikilinks]]` to link between pages (minimum 2 outbound links per page)
- When updating a page, always bump the `updated` date
- Every new page must be added to `_index.md` under the correct section
- Every action must be appended to `_log.md`

## Frontmatter
```yaml
---
title: Page Title
created: 2026-04-07
updated: 2026-04-07
type: architecture | component | system | pattern | reference | guide
tags: [from taxonomy below]
sources: [file paths in the codebase]
---
```

## Tag Taxonomy
- Core: engine, game-loop, lifecycle, config
- ECS: entity, component, system, world, query
- Rendering: renderer, canvas, pretext, text-layout, camera, particles
- Input: keyboard, mouse, input
- Physics: collision, overlap
- Audio: audio, sfx, oscillator
- UI: react, zustand, store, hud, screen
- Patterns: scene, factory, bridge, event-bus
- Game: asteroid-field, spawner, scoring, difficulty
- Tools: scaffolding, bun, vite, typescript
- Docs: api, developer-guide

## Page Thresholds
- **Create a page** for each major subsystem, architectural pattern, or non-obvious concept
- **DON'T create a page** for trivial utility functions or one-line wrappers
- **Split a page** when it exceeds ~200 lines

## Page Types
- **architecture**: How subsystems are designed and why
- **component**: A specific ECS component type or engine module
- **system**: A game system or engine system
- **pattern**: A reusable design pattern with code examples
- **reference**: Quick-lookup tables, type definitions, API surfaces
- **guide**: How-to walkthroughs
