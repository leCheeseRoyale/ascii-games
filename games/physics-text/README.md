# Physics Text Template

Interactive ASCII art demo where every character is a physics entity that reacts to your cursor.

## API

`defineScene` + ECS (real-time).

## What It Demonstrates

- `spawnText()` for per-character spring-physics text
- Multi-layer ASCII art (stars, mountains, creature) with different spring strengths
- Cursor repulsion system -- characters flee the mouse, then spring home
- Ambient drift system -- sine-wave wobble on background elements
- Initial scatter animation -- characters start at random positions and settle
- Spring presets (stiff, bouncy, floaty) for different visual feels
- Canvas-only rendering (no React overlay)

## Who Should Use This

Developers exploring the engine's signature feature: interactive physics-driven text. Good starting point for title screens, visual demos, or any project where ASCII art should feel alive. Read the play scene top-to-bottom -- it is structured as a learning resource.
