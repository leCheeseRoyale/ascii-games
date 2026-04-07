---
title: Text Flow Around Obstacles
created: 2026-04-07
updated: 2026-04-07
type: pattern
tags: [rendering, text, layout, obstacles, algorithm]
sources: [engine/render/text-layout.ts]
---

# Text Flow Around Obstacles

This is the key Pretext differentiator: variable-width text layout at 60fps with zero DOM. Text flows around circular obstacles like a word processor wraps around images, but rendered entirely on canvas.

See also: [[pretext-integration]], [[renderer]]

## The Algorithm

For each line of text, the engine calculates available horizontal space by checking whether any obstacle circle intrudes at that line's Y coordinate. The narrowed width is passed to Pretext's `layoutNextLine()`, which lays out exactly one line within the constraint.

### Step-by-step

1. Start with a cursor at `{segmentIndex: 0, graphemeIndex: 0}` and initial Y position
2. For the current Y, check each obstacle:
   - Does the line vertically overlap the obstacle circle? (`y + lineHeight > oy - r && y < oy + r`)
   - If yes, compute `dy = abs(lineCenterY - obstacleY)`
   - If `dy < r`, compute horizontal intrusion: `intrusion = sqrt(r² - dy²)`
   - The obstacle occupies `[ox - intrusion, ox + intrusion]` horizontally
   - Compare space to the left vs right of the obstacle; shrink whichever side has less space
3. Calculate `availWidth = max(rightEdge - leftEdge, 30)` (minimum 30px to prevent zero-width)
4. Call `layoutNextLine(prepared, cursor, availWidth)` — returns one line of text that fits
5. Record the line with its X offset (which may be shifted right if obstacle is on the left)
6. Advance cursor to `line.end`, advance Y by `lineHeight`, repeat

### Full Implementation

```typescript
export function layoutTextAroundObstacles(
  text: string,
  font: string,
  startX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  obstacles: { position: Position; obstacle: Obstacle }[],
): RenderedLine[] {
  const prepared = getSegments(text, font)
  const result: RenderedLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let y = startY

  while (true) {
    // Calculate available width at this y, accounting for obstacles
    let leftEdge = startX
    let rightEdge = startX + maxWidth

    for (const obs of obstacles) {
      const oy = obs.position.y
      const ox = obs.position.x
      const r = obs.obstacle.radius

      // Does this line vertically overlap the obstacle?
      if (y + lineHeight > oy - r && y < oy + r) {
        const dy = Math.abs(y + lineHeight / 2 - oy)
        if (dy < r) {
          const intrusion = Math.sqrt(r * r - dy * dy)
          const obsLeft = ox - intrusion
          const obsRight = ox + intrusion

          const spaceLeft = obsLeft - startX
          const spaceRight = (startX + maxWidth) - obsRight

          if (spaceLeft >= spaceRight) {
            rightEdge = Math.min(rightEdge, obsLeft)
          } else {
            leftEdge = Math.max(leftEdge, obsRight)
          }
        }
      }
    }

    const availWidth = Math.max(rightEdge - leftEdge, 30)
    const line = layoutNextLine(prepared, cursor, availWidth)
    if (line === null) break

    result.push({ text: line.text, x: leftEdge, y, width: line.width })
    cursor = line.end
    y += lineHeight
  }

  return result
}
```

## Key Design Decisions

**Left-or-right choice**: When an obstacle intrudes, the algorithm picks the side with more space. If `spaceLeft >= spaceRight`, text is confined to the left (right edge shrinks). Otherwise, text shifts right of the obstacle (left edge moves right). This creates natural flow.

**Minimum width of 30px**: Prevents degenerate cases where obstacles nearly overlap or consume all horizontal space. At minimum, one or two characters can still fit per line.

**Circle geometry**: The `sqrt(r² - dy²)` formula gives the horizontal half-chord of a circle at distance `dy` from center. This produces smooth curved intrusion — lines near the center of the obstacle lose more width than lines near the top/bottom.

## Performance

- `prepare()` is cached (see [[pretext-integration]]) — only paid once per unique text+font
- `layoutNextLine()` is cheap — just arithmetic on pre-measured grapheme data
- The obstacle check is O(obstacles × lines) — typically negligible with a handful of obstacles
- Total layout cost: microseconds per frame, easily maintaining 60fps

## Visual Effect

```
Without obstacle:          With circular obstacle:
┌──────────────────┐       ┌──────────────────┐
│ Lorem ipsum dolor│       │ Lorem ipsum      │
│ sit amet, consec-│       │ dolor sit    ●   │
│ tetur adipiscing │       │ amet, con-  ●●●  │
│ elit. Sed do     │       │ sectetur   ●●●●● │
│ eiusmod tempor   │       │ adipisc-    ●●●  │
│ incididunt ut    │       │ ing elit.    ●   │
│                  │       │ Sed do eiusmod   │
└──────────────────┘       └──────────────────┘
```

Lines near the obstacle center are narrower; lines above/below are full width.
