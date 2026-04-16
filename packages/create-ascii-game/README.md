# create-ascii-game

Scaffold a new ASCII game in seconds. Clone, strip, install — ready to hack.

## Usage

```bash
# New project
npx create-ascii-game my-game

# Start from a template
npx create-ascii-game my-game --template asteroid-field

# Scaffold into the current directory
npx create-ascii-game .
```

Then:

```bash
cd my-game
bun dev   # or: npx vite
```

First run auto-detects no `game/` folder and shows the template picker. You can also pick one any time:

```bash
bun run init:game <blank|asteroid-field|platformer|roguelike>
```

## Templates

| Name              | What you get                                                   |
| ----------------- | -------------------------------------------------------------- |
| `blank`           | Empty scene, wired engine — start from scratch                 |
| `asteroid-field`  | Classic arcade shooter — physics, wrap, particle explosions    |
| `platformer`      | Side-scrolling jump-and-run — gravity, collisions, camera      |
| `roguelike`       | Turn-based grid crawler — tilemap, pathfinding, fog of war     |

## Requirements

- [git](https://git-scm.com/) (the scaffolder clones the engine repo)
- [bun](https://bun.sh/) (recommended) or npm

## Links

- Engine source, templates, and docs: <https://github.com/leCheeseRoyale/ascii-games>
- Issues and discussions: <https://github.com/leCheeseRoyale/ascii-games/issues>

## License

MIT
