/**
 * Art asset types and helpers — structured ASCII art data, separate from game logic.
 *
 * An ArtAsset bundles visual data (lines, colors, font) into a reusable object.
 * Define art assets in dedicated files and import them into scenes.
 *
 * Usage:
 *   import { artFromString, type ArtAsset } from '@engine'
 *
 *   const dragon: ArtAsset = artFromString(`
 *      /\_/\
 *     ( o.o )
 *      > ^ <
 *   `)
 *
 *   // Spawn as a static sprite entity
 *   engine.spawnArt(dragon, { position: { x: 100, y: 200 } })
 *
 *   // Spawn as interactive physics characters
 *   engine.spawnInteractiveArt(dragon, { position: { x: 100, y: 200 }, spring: SpringPresets.bouncy })
 */

// ── Types ────────────────────────────────────────────────────────

/** A reusable bundle of ASCII art visual data. */
export interface ArtAsset {
  lines: string[];
  colorMap?: Record<string, string>;
  /** Font string. Defaults to engine default if omitted. */
  font?: string;
  /** Base text color. Defaults to "#e0e0e0". */
  color?: string;
  /** Optional glow color. */
  glow?: string;
}

/** An animated sequence of ArtAssets with timing info. */
export interface AnimatedArtAsset {
  frames: ArtAsset[];
  /** Seconds per frame. */
  frameDuration: number;
  /** Whether the animation loops. Defaults to true. */
  loop?: boolean;
}

/**
 * A complete character sprite sheet — all animation states for one character.
 * Each state maps to an AnimatedArtAsset (frames + timing).
 * Use with `engine.playAnimation()` or the `StateMachine` component.
 */
export interface SpriteSheet {
  /** Character name. */
  name: string;
  /** Width in characters of the widest frame (for consistent hitbox sizing). */
  width: number;
  /** Height in lines of the tallest frame. */
  height: number;
  /** Base color for all frames. */
  color: string;
  /** Shared colorMap applied to all frames (individual frames can override). */
  colorMap?: Record<string, string>;
  /** Animation states keyed by name (e.g., "idle", "walk", "attack", "hurt"). */
  states: Record<string, AnimatedArtAsset>;
}

/**
 * Build AnimationFrame[] from a SpriteSheet state, ready for engine.playAnimation().
 */
export function spriteSheetFrames(
  sheet: SpriteSheet,
  stateName: string,
): { frames: AnimationFrame[]; frameDuration: number; loop: boolean } | null {
  const state = sheet.states[stateName];
  if (!state) return null;
  return {
    frames: state.frames.map((f) => ({ lines: f.lines, color: f.color })),
    frameDuration: state.frameDuration,
    loop: state.loop !== false,
  };
}

// Re-export AnimationFrame for convenience
import type { AnimationFrame } from "@shared/types";

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Strip leading/trailing blank lines and remove common indentation from a
 * multiline string, returning cleaned lines.
 */
function cleanLines(rawLines: string[]): string[] {
  let lines = [...rawLines];

  // Strip leading blank lines
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  // Strip trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) return [];

  // Dedent by smallest common whitespace prefix (ignoring blank lines)
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const match = line.match(/^(\s*)/);
    if (match && match[1].length < minIndent) {
      minIndent = match[1].length;
    }
  }
  if (minIndent > 0 && minIndent < Infinity) {
    lines = lines.map((l) => l.slice(minIndent));
  }

  return lines;
}

/**
 * Create an ArtAsset from a multiline string.
 * Strips leading/trailing blank lines and common indentation.
 *
 * ```ts
 * const ship = artFromString(`
 *     /\\
 *    /  \\
 *   /    \\
 *   ------
 * `, { '*': '#ffcc00' })
 * ```
 */
export function artFromString(
  text: string,
  colorMap?: Record<string, string>,
): ArtAsset {
  const rawLines = text.split("\n");
  const trimmedLines = cleanLines(rawLines);
  return { lines: trimmedLines, ...(colorMap ? { colorMap } : {}) };
}
