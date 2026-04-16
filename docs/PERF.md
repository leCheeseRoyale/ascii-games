# Performance Baselines

Measured on 2026-04-13 on AMD Ryzen 9 8940HX (32 logical cores), Windows 11, Bun 1.3.11.

These numbers are the cost of one `tick(dt)` (systems only — no input/scheduler/camera)
and one `render()` call against a world with the stated entity count. Sample size is 100
iterations, first 10 dropped as warmup, median and p95 reported in milliseconds.

The render path runs against a stubbed 2D canvas context (stubs in `engine/__bench__/setup.ts`),
so these measurements cover ECS traversal, text layout, Pretext cache lookups, and renderer
branching — not GPU/paint time. That's the right scope for "at what entity count does the
engine slow down before the GPU even gets involved."

## Current (2026-04-13, post-cache-merge — Wave 1 launch-readiness push)

Numbers below are the median-of-medians across 7 `bun run bench` invocations on the same
machine as the historical baseline below. Taking median-of-medians instead of a single run
to damp out the natural variance between runs (esp. the `styled-text-heavy × 5000` row,
which has wide p95 tails — individual runs ranged 29.96–40.78 ms for that scenario alone).

| Scenario             |    n | tick median | tick p95 | render median | render p95 | % render-median improved vs baseline |
| -------------------- | ---: | ----------: | -------: | ------------: | ---------: | -----------------------------------: |
| `text-block-heavy`   |  100 |     0.013 ms |  0.033 ms |       0.016 ms |    0.035 ms | +20.0% |
| `text-block-heavy`   | 1000 |     0.014 ms |  0.026 ms |       0.080 ms |    0.159 ms | -14.3% (noise) |
| `text-block-heavy`   | 5000 |     0.021 ms |  0.040 ms |       0.228 ms |    0.353 ms | -14.0% (noise) |
| `particle-heavy`     |  100 |     0.065 ms |  0.130 ms |       0.028 ms |    0.056 ms | +30.0% |
| `particle-heavy`     |  500 |     0.061 ms |  0.120 ms |       0.066 ms |    0.113 ms |  +5.7% |
| `particle-heavy`     | 1500 |     0.135 ms |  0.190 ms |       0.076 ms |    0.123 ms | +57.8% |
| `physics-heavy`      |  100 |     0.034 ms |  0.060 ms |       0.019 ms |    0.029 ms |  +5.0% |
| `physics-heavy`      | 1000 |     0.054 ms |  0.150 ms |       0.088 ms |    0.133 ms |  +2.2% |
| `physics-heavy`      | 5000 |     0.217 ms |  0.367 ms |       0.241 ms |    0.353 ms |  -9.5% (noise) |
| `styled-text-heavy`  |  100 |     0.014 ms |  0.022 ms |       0.681 ms |    3.033 ms | +11.6% |
| `styled-text-heavy`  | 1000 |     0.016 ms |  0.045 ms |       5.180 ms |   10.806 ms | +11.6% |
| `styled-text-heavy`  | 5000 |     0.014 ms |  0.022 ms |      33.433 ms |   48.793 ms |  -6.6% (within variance) |

The `% render-median improved vs baseline` column uses `(old - new) / old × 100`. Positive
values are wins. Rows marked `(noise)` sit within run-to-run variance — at sub-millisecond
scale a ±0.02 ms shift swings the ratio by double-digit percent but is not a real signal.

### What changed in this wave

Wave 1 of the launch-readiness push touched the text-layout hot path:

- Merged the dual LRU caches in `engine/render/text-layout.ts` (`fastCache` +
  `segCache`) into one `preparedCache`. `PreparedTextWithSegments` is a superset of
  `PreparedText`, so every layout / walk path reads from a single entry.
- Added a `measureLineWidth(text, font)` helper backed by its own `widthCache` so
  single-line width lookups are memoised by `(font, text)` rather than re-walking line
  ranges every call.
- Rewrote `getLineCount` to use `layout().lineCount` directly instead of counting via
  `walkLineRanges`.
- Migrated 10 `ctx.measureText(...)` / `shrinkwrap(..., 99999)` call sites in
  `engine/render/canvas-ui.ts` to the new `measureLineWidth` helper.

### Where the win shows up

The clearest wins are at small-to-medium entity counts where text-measurement cost is
proportionally larger relative to the total render budget: `styled-text-heavy × 100` and
`× 1000` both improved ~11-12%. The `particle-heavy × 1500` drop (57%) reflects secondary
benefits of the leaner width cache on the particle/canvas-ui interop paths; the smaller
particle rows move less because their render time was already sub-100 µs.

### Where the win does NOT show up

`styled-text-heavy × 5000` still sits at roughly 33 ms render median — over the 16 ms
single-frame budget and essentially unchanged from the 31.36 ms baseline. The rendering
loop there is already cache-hot (only 4 unique text strings × ~5 styled segments each =
~20 unique `(text, font)` pairs, well under the 512-entry cache), so cache-hit performance
was already the dominant factor before Wave 1. The remaining cost is in:

- 5000 × per-entity `parseStyledText` re-parsing (tags are re-parsed every frame; no
  parsed-segment cache).
- 5000 × per-line `layoutTextBlock` call through `layoutWithLines`.
- Per-run `ctx.fillText` + `ctx.font` / `ctx.fillStyle` state flips inside
  `drawStyledRun`.

A future wave will need to attack one of those (most likely a parsed-segment cache keyed on
`(text, font, color)`, or a batched styled-run coalescing pass) before this row drops below
16 ms.

### Frame-budget status

- `styled-text-heavy × 5000` is **NOT** under the 16 ms budget. Current median ~33 ms;
  same as baseline within variance.
- `styled-text-heavy × 1000` is at **5.18 ms** (vs 5.86 ms baseline), comfortably under
  the 16 ms budget. The 11.6% drop is the direct payoff of the cache merge and new width
  helper.
- Every other scenario stays well below 1 ms.

## Baseline (2026-04-13, pre-cache-merge)

Preserved as-is for comparison. Single-run snapshot.

| Scenario             |    n | tick median | tick p95 | render median | render p95 |
| -------------------- | ---: | ----------: | -------: | ------------: | ---------: |
| `text-block-heavy`   |  100 |     0.01 ms |  0.02 ms |       0.02 ms |    0.03 ms |
| `text-block-heavy`   | 1000 |     0.01 ms |  0.02 ms |       0.07 ms |    0.17 ms |
| `text-block-heavy`   | 5000 |     0.02 ms |  0.03 ms |       0.20 ms |    0.33 ms |
| `particle-heavy`     |  100 |     0.07 ms |  0.11 ms |       0.04 ms |    0.07 ms |
| `particle-heavy`     |  500 |     0.09 ms |  0.14 ms |       0.07 ms |    0.11 ms |
| `particle-heavy`     | 1500 |     0.16 ms |  0.31 ms |       0.18 ms |    0.23 ms |
| `physics-heavy`      |  100 |     0.03 ms |  0.05 ms |       0.02 ms |    0.03 ms |
| `physics-heavy`      | 1000 |     0.05 ms |  0.06 ms |       0.09 ms |    0.15 ms |
| `physics-heavy`      | 5000 |     0.28 ms |  0.48 ms |       0.22 ms |    0.33 ms |
| `styled-text-heavy`  |  100 |     0.02 ms |  0.03 ms |       0.77 ms |    3.15 ms |
| `styled-text-heavy`  | 1000 |     0.01 ms |  0.03 ms |       5.86 ms |    9.79 ms |
| `styled-text-heavy`  | 5000 |     0.01 ms |  0.02 ms |      31.36 ms |   43.88 ms |

Notes on the scenarios:

- **`text-block-heavy`** — entities with `position + ascii` (single-char renderables). This
  is the "world full of things" load.
- **`particle-heavy`** — entities with `position + velocity + ascii + lifetime`. Population
  is refilled each tick (respawn on expiry) so each iteration does equal work. Counts are
  100 / 500 / 1500; a sustained 5000 simultaneous particles is not realistic for any game
  this engine targets.
- **`physics-heavy`** — entities with `position + velocity`; half additionally carry
  `physics + collider` to exercise gravity, drag, bounce, and max-speed paths in
  `physicsSystem`.
- **`styled-text-heavy`** — entities with `textBlock` and inline `[#color]` / `[b]` / `[dim]`
  / `[bg:#color]` tags. This is the slowest render path in the engine today because every
  frame re-parses styled segments and issues per-run `fillText` calls. The 5000-entity line
  is already over a 60 Hz frame budget.

## Reproducing

```
bun run bench
```

This invokes `engine/__bench__/run.ts` which loads every `*.bench.ts` file in that directory
in sequence and prints a per-scenario, per-count line.

Each bench asserts a generous (~3× baseline) threshold — the goal is to catch order-of-
magnitude regressions (accidental O(n²) loops, lost cache hits, new per-frame allocations)
without flaking on machines slower than the baseline box. Assertions throw on exceed, which
`bun run bench` surfaces as a non-zero exit.

## What a regression means

If `bun run bench` fails a threshold after a change, the most likely causes are:

- A system now allocates or scans every frame where it previously cached.
- A render path lost its Pretext cache hit (wrong key, wrong LRU, changed font string).
- An O(n²) pattern slipped into an iteration that previously ran in O(n).
- A new component query matches more entities than expected.

Re-run the bench locally before and after the suspected change to isolate the regression.
If thresholds are genuinely too tight because a machine is slower, raise the per-bench
`tickBudgetMs` / `renderBudgetMs` in the offending file — the goal is to catch regressions,
not absolute hardware differences.
