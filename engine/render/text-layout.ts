/**
 * Pretext integration for text measurement and layout.
 *
 * Wraps @chenglou/pretext with caching.
 * Modes:
 *   1. layoutTextBlock() -- fixed-width paragraph, returns lines
 *   2. layoutTextAroundObstacles() -- variable-width, flows around circles
 *   3. parseStyledText() -- parses rich text tags into styled segments
 *   4. layoutJustifiedBlock() -- justified text layout with per-word positioning
 */

import {
  clearCache as clearPretextCache,
  type LayoutCursor,
  layout,
  layoutNextLine,
  layoutWithLines,
  type PreparedTextWithSegments,
  prepareWithSegments,
  walkLineRanges,
} from "@chenglou/pretext";
import type { Obstacle, Position } from "@shared/types";

// ── LRU Cache ───────────────────────────────────────────────────

/** Maximum number of entries in each text cache. */
const MAX_CACHE_SIZE = 512;

/**
 * Simple LRU cache backed by a Map (Map preserves insertion order).
 * On access, entries are moved to the end. When full, the oldest is evicted.
 */
class LRUCache<V> {
  private map = new Map<string, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first entry)
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// ── Caches ───────────────────────────────────────────────────────

// Single merged cache. PreparedTextWithSegments is a superset of PreparedText
// (both layout() and walkLineRanges() accept it), so one entry covers every path.
const preparedCache = new LRUCache<PreparedTextWithSegments>(MAX_CACHE_SIZE);

// Cached single-line widths, keyed by (font, text). Populated by measureLineWidth
// and also used by CanvasUI for per-chunk width reuse across frames.
const widthCache = new LRUCache<number>(MAX_CACHE_SIZE);

export interface PrepareOptions {
  whiteSpace?: "normal" | "pre-wrap";
}

function cacheKey(text: string, font: string, opts?: PrepareOptions): string {
  if (!opts?.whiteSpace) return `${font}\x00${text}`;
  return `${font}\x00${opts.whiteSpace}\x00${text}`;
}

function getSegments(text: string, font: string, opts?: PrepareOptions): PreparedTextWithSegments {
  const k = cacheKey(text, font, opts);
  let p = preparedCache.get(k);
  if (!p) {
    p = prepareWithSegments(text, font, opts);
    preparedCache.set(k, p);
  }
  return p;
}

/** Clear all Pretext caches (both wrapper LRUs and Pretext internals). Call on font changes or to free memory. */
export function clearTextCache(): void {
  preparedCache.clear();
  widthCache.clear();
  clearPretextCache();
}

// ── Pretext helpers (not yet exported by @chenglou/pretext@0.0.4) ──

function measureNaturalWidth(prepared: PreparedTextWithSegments): number {
  let max = 0;
  walkLineRanges(prepared, Infinity, (line) => {
    if (line.width > max) max = line.width;
  });
  return max;
}

function measureLineStats(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
): { lineCount: number; maxLineWidth: number } {
  let maxLineWidth = 0;
  const lineCount = walkLineRanges(prepared, maxWidth, (line) => {
    if (line.width > maxLineWidth) maxLineWidth = line.width;
  });
  return { lineCount, maxLineWidth };
}

// ── Rich Text Parsing ───────────────────────────────────────────

/** A styled segment of text produced by parseStyledText(). */
export interface StyledSegment {
  text: string;
  color: string;
  font: string;
  opacity: number;
  bgColor: string | null;
}

// Tag regex matches: [#hex], [/], [b], [/b], [dim], [/dim], [bg:#hex], [/bg]
const TAG_RE = /\[(#[0-9a-fA-F]{3,8}|\/|b|\/b|dim|\/dim|bg:#[0-9a-fA-F]{3,8}|\/bg)\]/g;

/**
 * Parse styled text with inline tags into an array of segments.
 *
 * Supported tags:
 *   [#rrggbb]text[/]      -- color (existing syntax, also [#rgb])
 *   [b]text[/b]           -- bold (increases font weight)
 *   [dim]text[/dim]       -- dim (50% opacity)
 *   [bg:#rrggbb]text[/bg] -- background color behind text
 *
 * Tags can be nested. Unknown tags are treated as literal text.
 */
export function parseStyledText(
  text: string,
  baseFont: string,
  baseColor: string,
): StyledSegment[] {
  const segments: StyledSegment[] = [];
  if (!text) return segments;

  interface StyleState {
    color: string;
    font: string;
    opacity: number;
    bgColor: string | null;
  }
  const stack: StyleState[] = [];
  let current: StyleState = {
    color: baseColor,
    font: baseFont,
    opacity: 1,
    bgColor: null,
  };

  let lastIndex = 0;
  // Reset regex state for each call
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(text)) !== null) {
    // Flush text before this tag
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) {
        segments.push({
          text: chunk,
          color: current.color,
          font: current.font,
          opacity: current.opacity,
          bgColor: current.bgColor,
        });
      }
    }

    const tag = match[1];

    if (tag === "/") {
      // Close color tag
      if (stack.length > 0) {
        current = stack.pop()!;
      }
    } else if (tag.startsWith("#")) {
      // Color tag: [#hex]
      stack.push({ ...current });
      current = { ...current, color: tag };
    } else if (tag === "b") {
      stack.push({ ...current });
      current = { ...current, font: makeBold(current.font) };
    } else if (tag === "/b") {
      if (stack.length > 0) {
        current = stack.pop()!;
      }
    } else if (tag === "dim") {
      stack.push({ ...current });
      current = { ...current, opacity: current.opacity * 0.5 };
    } else if (tag === "/dim") {
      if (stack.length > 0) {
        current = stack.pop()!;
      }
    } else if (tag.startsWith("bg:#")) {
      stack.push({ ...current });
      current = { ...current, bgColor: tag.slice(3) };
    } else if (tag === "/bg") {
      if (stack.length > 0) {
        current = stack.pop()!;
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Flush remaining text
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk) {
      segments.push({
        text: chunk,
        color: current.color,
        font: current.font,
        opacity: current.opacity,
        bgColor: current.bgColor,
      });
    }
  }

  return segments;
}

/** Convert a CSS font string to bold variant. */
function makeBold(font: string): string {
  if (/\b(bold|[1-9]00)\b/.test(font)) {
    return font;
  }
  // Prepend 'bold' before the size
  return font.replace(/^(\s*)(\d)/, "$1bold $2");
}

/**
 * Strip all style tags from text, returning plain text.
 * Used for measurement with Pretext (which does not understand our tags).
 */
export function stripTags(text: string): string {
  // Use a fresh regex or reset, since TAG_RE is global and has state
  return text.replace(/\[(#[0-9a-fA-F]{3,8}|\/|b|\/b|dim|\/dim|bg:#[0-9a-fA-F]{3,8}|\/bg)\]/g, "");
}

// ── Public API ───────────────────────────────────────────────────

export interface RenderedLine {
  text: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Measure text height without building lines. Very cheap after first prepare().
 */
export function measureHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
): number {
  return layout(getSegments(text, font), maxWidth, lineHeight).height;
}

/**
 * Get line count for text at a given width.
 */
export function getLineCount(text: string, font: string, maxWidth: number): number {
  return layout(getSegments(text, font), maxWidth, 1).lineCount;
}

/**
 * Find the widest line width when text is laid out at maxWidth (shrinkwrap).
 * Returns a ceiled integer suitable for container sizing.
 */
export function shrinkwrap(text: string, font: string, maxWidth: number): number {
  const { maxLineWidth } = measureLineStats(getSegments(text, font), maxWidth);
  return Math.ceil(maxLineWidth);
}

/**
 * Measure the width of a single line of text with no wrapping.
 * Returns the raw fractional pixel width (no rounding) for precise positioning.
 */
export function measureLineWidth(text: string, font: string): number {
  const k = cacheKey(text, font);
  const cached = widthCache.get(k);
  if (cached !== undefined) return cached;
  const w = measureNaturalWidth(getSegments(text, font));
  widthCache.set(k, w);
  return w;
}

/**
 * Layout a text block at fixed width. Returns lines with text + width.
 */
export function layoutTextBlock(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
): { text: string; width: number }[] {
  const prepared = getSegments(text, font);
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight);
  return lines.map((l) => ({ text: l.text, width: l.width }));
}

// ── Justified Text Layout ───────────────────────────────────────

/** A positioned word within a justified line. */
export interface JustifiedWord {
  text: string;
  x: number;
  width: number;
}

/** A justified line containing individually positioned words. */
export interface JustifiedLine {
  words: JustifiedWord[];
  y: number;
  isLastLine: boolean;
}

/**
 * Layout text with justified alignment. Each word is individually positioned
 * so extra space is distributed evenly between words.
 *
 * The last line of each paragraph remains left-aligned (standard justification).
 */
export function layoutJustifiedBlock(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  startX = 0,
): JustifiedLine[] {
  const lines = layoutTextBlock(text, font, maxWidth, lineHeight);
  const result: JustifiedLine[] = [];

  const spaceWidth = measureLineWidth(" ", font);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    const lineText = line.text;

    const nonSpaceWords = lineText.split(/\s+/).filter((w) => w.length > 0);

    if (nonSpaceWords.length <= 1 || isLast) {
      let x = startX;
      const justifiedWords: JustifiedWord[] = [];
      for (const w of nonSpaceWords) {
        const width = measureLineWidth(w, font);
        justifiedWords.push({ text: w, x, width });
        x += width + spaceWidth;
      }
      result.push({ words: justifiedWords, y: i * lineHeight, isLastLine: isLast });
    } else {
      const wordWidths: number[] = [];
      for (const w of nonSpaceWords) {
        wordWidths.push(measureLineWidth(w, font));
      }

      const totalWordWidth = wordWidths.reduce((a, b) => a + b, 0);
      const gapCount = nonSpaceWords.length - 1;
      const extraSpace = maxWidth - totalWordWidth;
      const gapWidth = gapCount > 0 ? extraSpace / gapCount : 0;

      let x = startX;
      const justifiedWords: JustifiedWord[] = [];
      for (let wi = 0; wi < nonSpaceWords.length; wi++) {
        justifiedWords.push({ text: nonSpaceWords[wi], x, width: wordWidths[wi] });
        x += wordWidths[wi] + gapWidth;
      }

      result.push({ words: justifiedWords, y: i * lineHeight, isLastLine: false });
    }
  }

  return result;
}

// ── Word Wrap Improvements ──────────────────────────────────────

/**
 * Insert soft hyphens into long words to enable better line breaking.
 * Uses a simple algorithm: insert \u00AD (soft hyphen) every `maxChars`
 * characters in words longer than `maxChars`. Pretext natively handles
 * soft hyphens during line breaking.
 *
 * This is a preprocessing step -- call before passing text to layout functions.
 */
export function insertSoftHyphens(text: string, maxChars = 12): string {
  return text.replace(/\S+/g, (word) => {
    if (word.length <= maxChars) return word;
    // Don't hyphenate URLs -- use zero-width breaks instead
    if (/^https?:\/\//.test(word)) {
      return breakLongString(word, maxChars);
    }
    // Insert soft hyphens at intervals
    let result = "";
    for (let i = 0; i < word.length; i++) {
      result += word[i];
      if (i > 0 && i < word.length - 1 && (i + 1) % maxChars === 0) {
        result += "\u00AD";
      }
    }
    return result;
  });
}

/**
 * Force-break a long unbreakable string by inserting zero-width spaces.
 * Used for URLs and other content that cannot be hyphenated.
 */
function breakLongString(str: string, maxChars: number): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += str[i];
    if (i > 0 && i < str.length - 1 && (i + 1) % maxChars === 0) {
      result += "\u200B"; // zero-width space (Pretext recognizes as break opportunity)
    }
  }
  return result;
}

// ── Obstacle Layout ─────────────────────────────────────────────

/**
 * Layout text flowing around circular obstacles.
 * Returns positioned lines with x/y offsets.
 *
 * Uses layoutNextLine() -- each line gets a different width
 * depending on obstacle positions.
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
  const prepared = getSegments(text, font);
  const result: RenderedLine[] = [];
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = startY;

  while (true) {
    // Calculate available width at this y, accounting for obstacles
    let leftEdge = startX;
    let rightEdge = startX + maxWidth;

    for (const obs of obstacles) {
      const oy = obs.position.y;
      const ox = obs.position.x;
      const r = obs.obstacle.radius;

      // Does this line vertically overlap the obstacle?
      if (y + lineHeight > oy - r && y < oy + r) {
        const dy = Math.abs(y + lineHeight / 2 - oy);
        if (dy < r) {
          const intrusion = Math.sqrt(r * r - dy * dy);
          const obsLeft = ox - intrusion;
          const obsRight = ox + intrusion;

          const spaceLeft = obsLeft - startX;
          const spaceRight = startX + maxWidth - obsRight;

          if (spaceLeft >= spaceRight) {
            rightEdge = Math.min(rightEdge, obsLeft);
          } else {
            leftEdge = Math.max(leftEdge, obsRight);
          }
        }
      }
    }

    const availWidth = Math.max(rightEdge - leftEdge, 30);
    const line = layoutNextLine(prepared, cursor, availWidth);
    if (line === null) break;

    result.push({ text: line.text, x: leftEdge, y, width: line.width });
    cursor = line.end;
    y += lineHeight;
  }

  return result;
}
