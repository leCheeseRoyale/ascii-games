/**
 * Entity measurement — derives pixel dimensions from text components using Pretext.
 *
 * Used by:
 *   - engine.spawn() to resolve `collider: "auto"`
 *   - _measure system to keep visualBounds in sync when text changes
 *   - engine.spawnText() to compute per-character home positions
 */

import type {
  Ascii,
  Collider,
  Entity,
  Sprite,
  TextBlock,
  VisualBounds,
} from "@shared/types";
import {
  layoutTextBlock,
  measureHeight,
  measureLineWidth,
  shrinkwrap,
} from "./text-layout";

/**
 * Replicate the font-scaling logic from ascii-renderer.ts for consistent measurement.
 */
export function resolvedAsciiFont(ascii: Pick<Ascii, "font" | "scale">): string {
  if (!ascii.scale || ascii.scale === 1) return ascii.font;
  const size = parseFloat(ascii.font) * ascii.scale;
  const family = ascii.font.replace(/^[\d.]+px\s*/, "");
  return `${size}px ${family}`;
}

export function measureAsciiVisual(
  ascii: Pick<Ascii, "char" | "font" | "scale">,
): { width: number; height: number } {
  const font = resolvedAsciiFont(ascii);
  const width = measureLineWidth(ascii.char, font);
  const height = parseFloat(font) || 16;
  return { width, height };
}

export function measureSpriteVisual(
  sprite: Pick<Sprite, "lines" | "font">,
): { width: number; height: number } {
  let maxW = 0;
  for (const line of sprite.lines) {
    const w = measureLineWidth(line, sprite.font);
    if (w > maxW) maxW = w;
  }
  const fontSize = parseFloat(sprite.font) || 16;
  const height = sprite.lines.length * (fontSize * 1.2);
  return { width: maxW, height };
}

export function measureTextBlockVisual(
  tb: Pick<TextBlock, "text" | "font" | "maxWidth" | "lineHeight">,
): { width: number; height: number } {
  const width = shrinkwrap(tb.text, tb.font, tb.maxWidth);
  const height = measureHeight(tb.text, tb.font, tb.maxWidth, tb.lineHeight);
  return { width, height };
}

export function buildDirtyKey(entity: Partial<Entity>): string | null {
  if (entity.ascii) {
    return `a\x00${entity.ascii.char}\x00${entity.ascii.font}\x00${entity.ascii.scale ?? 1}`;
  }
  if (entity.sprite) {
    return `s\x00${entity.sprite.lines.join("\n")}\x00${entity.sprite.font}`;
  }
  if (entity.textBlock) {
    const tb = entity.textBlock;
    return `t\x00${tb.text}\x00${tb.font}\x00${tb.maxWidth}\x00${tb.lineHeight}`;
  }
  return null;
}

function measureVisual(
  entity: Partial<Entity>,
): { width: number; height: number } | null {
  if (entity.ascii) return measureAsciiVisual(entity.ascii);
  if (entity.sprite) return measureSpriteVisual(entity.sprite);
  if (entity.textBlock) return measureTextBlockVisual(entity.textBlock);
  return null;
}

export function buildVisualBounds(entity: Partial<Entity>): VisualBounds | null {
  const dims = measureVisual(entity);
  if (!dims) return null;
  const key = buildDirtyKey(entity);
  if (!key) return null;
  return {
    width: dims.width,
    height: dims.height,
    halfW: dims.width / 2,
    halfH: dims.height / 2,
    _key: key,
  };
}

/**
 * Resolve `collider: "auto"` to a concrete Collider based on text measurements.
 * Mutates the entity in place. Also attaches `visualBounds`.
 */
export function resolveAutoCollider(components: Partial<Entity>): void {
  if ((components as any).collider !== "auto") return;

  const bounds = buildVisualBounds(components);
  if (!bounds) {
    components.collider = { type: "rect", width: 16, height: 16, _auto: true };
    return;
  }

  components.visualBounds = bounds;

  const isMultiLine =
    (components.sprite && components.sprite.lines.length > 1) ||
    components.textBlock != null;
  const isSingleChar =
    components.ascii != null && [...components.ascii.char].length === 1;

  if (isSingleChar) {
    const d = Math.max(bounds.width, bounds.height);
    components.collider = { type: "circle", width: d, height: d, _auto: true };
  } else if (isMultiLine) {
    components.collider = {
      type: "rect",
      width: bounds.width,
      height: bounds.height,
      _auto: true,
    };
  } else {
    components.collider = {
      type: "rect",
      width: bounds.width,
      height: bounds.height,
      _auto: true,
    };
  }
}

export interface CharacterPosition {
  char: string;
  homeX: number;
  homeY: number;
  width: number;
  height: number;
}

/**
 * Compute per-character home positions for a text string using Pretext line breaks
 * and per-character width measurement. This is the bridge from Pretext layout to
 * per-character physics entities.
 */
export function measureCharacterPositions(
  text: string,
  font: string,
  baseX: number,
  baseY: number,
  maxWidth: number,
  lineHeight: number,
): CharacterPosition[] {
  const lines = layoutTextBlock(text, font, maxWidth, lineHeight);
  const result: CharacterPosition[] = [];
  const charHeight = parseFloat(font) || 16;

  for (let li = 0; li < lines.length; li++) {
    const lineY = baseY + li * lineHeight;
    let xc = baseX;

    for (const char of lines[li].text) {
      if (char === " ") {
        xc += measureLineWidth(" ", font);
        continue;
      }
      const cw = measureLineWidth(char, font);
      result.push({
        char,
        homeX: xc + cw / 2,
        homeY: lineY + lineHeight / 2,
        width: cw,
        height: charHeight,
      });
      xc += cw;
    }
  }
  return result;
}

/**
 * Compute per-character home positions for a multi-line sprite.
 */
export function measureSpriteCharacterPositions(
  lines: string[],
  font: string,
  centerX: number,
  centerY: number,
): CharacterPosition[] {
  const result: CharacterPosition[] = [];
  const fontSize = parseFloat(font) || 16;
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = centerY - totalHeight / 2;
  const charHeight = fontSize;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineWidth = measureLineWidth(line, font);
    let xc = centerX - lineWidth / 2;
    const lineY = startY + li * lineHeight;

    for (const char of line) {
      if (char === " ") {
        xc += measureLineWidth(" ", font);
        continue;
      }
      const cw = measureLineWidth(char, font);
      result.push({
        char,
        homeX: xc + cw / 2,
        homeY: lineY + lineHeight / 2,
        width: cw,
        height: charHeight,
      });
      xc += cw;
    }
  }
  return result;
}
