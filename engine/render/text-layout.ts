/**
 * Pretext integration for text measurement and layout.
 *
 * Wraps @chenglou/pretext with caching.
 * Two modes:
 *   1. layoutTextBlock() — fixed-width paragraph, returns lines
 *   2. layoutTextAroundObstacles() — variable-width, flows around circles
 */

import {
  prepare,
  layout,
  prepareWithSegments,
  layoutWithLines,
  layoutNextLine,
  walkLineRanges,
  type PreparedText,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext'
import type { Position, Obstacle } from '@shared/types'

// ── Caches ───────────────────────────────────────────────────────

const fastCache = new Map<string, PreparedText>()
const segCache = new Map<string, PreparedTextWithSegments>()

function cacheKey(text: string, font: string): string {
  return font + '\x00' + text
}

function getPrepared(text: string, font: string): PreparedText {
  const k = cacheKey(text, font)
  let p = fastCache.get(k)
  if (!p) { p = prepare(text, font); fastCache.set(k, p) }
  return p
}

function getSegments(text: string, font: string): PreparedTextWithSegments {
  const k = cacheKey(text, font)
  let p = segCache.get(k)
  if (!p) { p = prepareWithSegments(text, font); segCache.set(k, p) }
  return p
}

/** Clear all Pretext caches. Call on font changes. */
export function clearTextCache(): void {
  fastCache.clear()
  segCache.clear()
}

// ── Public API ───────────────────────────────────────────────────

export interface RenderedLine {
  text: string
  x: number
  y: number
  width: number
}

/**
 * Measure text height without building lines. Very cheap after first prepare().
 */
export function measureHeight(text: string, font: string, maxWidth: number, lineHeight: number): number {
  return layout(getPrepared(text, font), maxWidth, lineHeight).height
}

/**
 * Get line count for text at a given width.
 */
export function getLineCount(text: string, font: string, maxWidth: number): number {
  let count = 0
  walkLineRanges(getSegments(text, font), maxWidth, () => { count++ })
  return count
}

/**
 * Find the tightest width that fits the text (shrinkwrap).
 */
export function shrinkwrap(text: string, font: string, maxWidth: number): number {
  const prepared = getSegments(text, font)
  let max = 0
  walkLineRanges(prepared, maxWidth, line => { if (line.width > max) max = line.width })
  return Math.ceil(max)
}

/**
 * Layout a text block at fixed width. Returns lines with text + width.
 */
export function layoutTextBlock(
  text: string, font: string, maxWidth: number, lineHeight: number
): { text: string; width: number }[] {
  const prepared = getSegments(text, font)
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight)
  return lines.map(l => ({ text: l.text, width: l.width }))
}

/**
 * Layout text flowing around circular obstacles.
 * Returns positioned lines with x/y offsets.
 *
 * Uses layoutNextLine() — each line gets a different width
 * depending on obstacle positions. This is the magic.
 */
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
