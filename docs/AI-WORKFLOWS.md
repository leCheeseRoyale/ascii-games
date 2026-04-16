# AI-assisted workflows

Three CLI scripts use Claude to scaffold game content: sprites, mechanics, and juice.

## Setup

1. Get an API key at https://console.anthropic.com/settings/keys
2. Create a `.env.local` file in the repo root (it is already in `.gitignore`):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   The shell env var `ANTHROPIC_API_KEY` is also accepted.

3. Try any command with `--dry-run` first — it prints the system + user prompts without calling the API.

## Commands

### `bun run ai:sprite "<prompt>"`

Generates an ASCII sprite entity factory.

```bash
bun run ai:sprite "space invader" --frames=2
bun run ai:sprite "small glowing potion bottle" --model=haiku
```

Output: `game/entities/<slug>.ts` — an `export function create<Name>(x, y): Partial<Entity>`.

### `bun run ai:mechanic "<description>"`

Generates a game system via `defineSystem(...)`.

```bash
bun run ai:mechanic "enemy that patrols then chases player when close"
bun run ai:mechanic "turret that fires at nearest enemy every 2s"
```

Output: `game/systems/<slug>.ts` — reuses `createPatrolBehavior`/`createChaseBehavior`/etc. where it fits.

### `bun run ai:juice "<event>"`

Generates a feedback helper that layers particles + sfx + camera shake + floating text.

```bash
bun run ai:juice "player getting hit by bullet"
bun run ai:juice "boss death"
```

Output: `game/helpers/<slug>.ts` — an `export function onX(engine, x, y)` call from your collision/event handler.

### `ai:game` — generate a full game from a pitch

Generates a complete `defineGame<TState>({...})` module (state + moves + turns + endIf + render + `setupGame`) from a natural-language pitch.

```bash
bun run ai:game "2-player strategy where you place walls to maze a runner"
bun run ai:game "hotseat battle: place cards on a 3x3 grid, highest sum in a row wins"
```

Output: a complete defineGame module at `game/<slug>.ts`. Wire it as your starting scene in `game/index.ts` (the script prints the import lines to paste).

Token-cost note: higher than the other AI scripts — expect ~10–20k tokens per call with sonnet because the full engine + new-game skill context ships in the system prompt and a full game module comes back.

## Flags (all scripts)

| Flag | Default | Notes |
|---|---|---|
| `--model=opus\|sonnet\|haiku` | `sonnet` | See model table below |
| `--out=<path>` | `game/<kind>/<slug>.ts` | Override file path |
| `--force` | off | Overwrite an existing file |
| `--dry-run` | off | Print prompts; don't call API |
| `--frames=N` | `1` | **ai:sprite only** — animation frame count |

## Models

As of 2026, input-token pricing on console.anthropic.com (output is 5× these):

| Alias | Model id | Input $/Mtok | Use when |
|---|---|---|---|
| `opus` | `claude-opus-4-7` | ~$15 | Complex mechanics, careful polish |
| `sonnet` (default) | `claude-sonnet-4-6` | ~$3 | General scaffolding — best default |
| `haiku` | `claude-haiku-4-5-20251001` | ~$0.80 | Tiny sprites, repeatable boilerplate |

Rough tokens per call (incl. skill context):

- `ai:sprite` ~ 2–4k in, <1k out
- `ai:mechanic` ~ 5–10k in, 1–2k out
- `ai:juice` ~ 3–5k in, <1k out

So a typical sonnet call runs a fraction of a cent. Opus runs on a mechanic call is still < $0.20.

## Customizing

Each script stitches its prompt from these skill files:

- `plugins/ascii-games-dev/skills/ascii-games-dev/SKILL.md` — always included
- `plugins/ascii-games-dev/skills/mechanic/SKILL.md` — added by `ai:mechanic`
- `plugins/ascii-games-dev/skills/juice/SKILL.md` — added by `ai:juice`

Edit the skill files to change what the AI knows about the engine. The scripts also include
a short inline reference block (component shapes, system API signatures) — edit those in
`scripts/ai-sprite.ts`, `scripts/ai-mechanic.ts`, `scripts/ai-juice.ts` for tighter output.
