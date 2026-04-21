/**
 * Sprite Bitmap Cache — pre-renders ASCII sprite art to offscreen canvases.
 *
 * Static sprites are rendered once per unique content/style combination, then
 * drawn as a single `drawImage()` call per frame. This avoids repeated
 * `fillText()` calls and enables per-character features (colorMap, space
 * transparency) without per-frame cost.
 *
 * Cache key includes: lines content, font, color, colorMap, and glow.
 * Opacity is NOT baked in — it's applied at draw time via `ctx.globalAlpha`
 * so tweening opacity doesn't thrash the cache.
 */

import { measureLineWidth } from "./text-layout";

export interface CachedSprite {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
  key: string;
}

const cache = new Map<string, CachedSprite>();
const MAX_CACHE_SIZE = 128;

function buildCacheKey(
  lines: string[],
  font: string,
  color: string,
  colorMap?: Record<string, string>,
  glow?: string,
): string {
  let key = `${font}\x00${color}\x00${glow ?? ""}`;
  if (colorMap) {
    const sorted = Object.keys(colorMap).sort();
    for (const k of sorted) key += `\x00${k}=${colorMap[k]}`;
  }
  key += `\x00${lines.join("\n")}`;
  return key;
}

export function getCachedSprite(
  lines: string[],
  font: string,
  color: string,
  colorMap?: Record<string, string>,
  glow?: string,
): CachedSprite {
  const key = buildCacheKey(lines, font, color, colorMap, glow);
  const existing = cache.get(key);
  if (existing) {
    // Move to end for LRU ordering (Map preserves insertion order)
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  // Measure dimensions using Pretext
  const fontSize = parseFloat(font) || 16;
  const lineHeight = fontSize * 1.2;

  let maxWidth = 0;
  for (const line of lines) {
    const w = measureLineWidth(line, font);
    if (w > maxWidth) maxWidth = w;
  }

  const totalHeight = lines.length * lineHeight;
  const padding = glow ? 16 : 0;
  const canvasW = Math.ceil(maxWidth) + padding * 2;
  const canvasH = Math.ceil(totalHeight) + padding * 2;

  // Avoid zero-size canvases
  if (canvasW <= 0 || canvasH <= 0) {
    const empty: CachedSprite = {
      canvas: document.createElement("canvas"),
      width: 0,
      height: 0,
      key,
    };
    cache.set(key, empty);
    return empty;
  }

  // Create offscreen canvas (fall back to regular canvas if OffscreenCanvas unsupported)
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  try {
    canvas = new OffscreenCanvas(canvasW, canvasH);
    ctx = canvas.getContext("2d")!;
  } catch {
    canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    ctx = canvas.getContext("2d")!;
  }

  ctx.font = font;
  ctx.textBaseline = "top";

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
  }

  // Render each character individually using Pretext-measured positions.
  // This enables: space transparency, colorMap per character, precise positioning.
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineY = padding + li * lineHeight;

    // Center each line within the bitmap (matching drawSprite's centered layout)
    const lineWidth = measureLineWidth(line, font);
    let x = padding + (maxWidth - lineWidth) / 2;

    for (const char of line) {
      const charWidth = measureLineWidth(char, font);
      if (char === " ") {
        // Space transparency — skip drawing, just advance cursor
        x += charWidth;
        continue;
      }

      ctx.fillStyle = colorMap?.[char] ?? color;
      ctx.fillText(char, x, lineY);
      x += charWidth;
    }
  }

  const cached: CachedSprite = { canvas, width: canvasW, height: canvasH, key };

  // LRU eviction — drop oldest entry when at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, cached);

  return cached;
}

/** Clear cached sprite bitmaps. Pass a key to remove one entry, or omit to clear all. */
export function invalidateSpriteCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/** Current number of entries in the sprite bitmap cache. */
export function spriteCacheSize(): number {
  return cache.size;
}
