/**
 * ASCII Sprite Library — pre-made ASCII art and loading helpers.
 *
 * Usage:
 *   import { ASCII_SPRITES, asciiBox, parseAsciiArt, createAsciiSprite } from '@engine'
 *
 *   // Pre-made sprites
 *   engine.spawn({
 *     position: { x: 100, y: 100 },
 *     sprite: { lines: ASCII_SPRITES.characters.player, font: FONTS.normal, color: '#0f0' },
 *   })
 *
 *   // Load ASCII art from a text file (Vite ?raw import) or string
 *   import parrot1 from './assets/parrot1.txt?raw'
 *   const lines = parseAsciiArt(parrot1)
 *   engine.spawn({
 *     position: { x: 400, y: 300 },
 *     ...createAsciiSprite(parrot1, { colorMap: { '@': '#f44', '~': '#4a4' } }),
 *   })
 */

import type { AnimationFrame, Sprite } from "@shared/types";

// ── Characters ─────────────────────────────────────────────────

export const ASCII_SPRITES = {
  characters: {
    player: ["  O  ", " /|\\ ", " / \\ "],
    playerArmed: ["  O  ", " /|╪ ", " / \\ "],
    enemy: [" \\o/ ", "  |  ", " / \\ "],
    ghost: [" .-. ", "| O O|", "|   |", " ^^^ "],
    robot: [" [=] ", " /|\\ ", " d b "],
    wizard: ["  ^  ", " /|\\ ", " / \\ ", "  ~  "],
    skeleton: ["  .  ", " /|\\ ", " | | "],
    bat: [" /V\\ ", "  w  "],
    slime: [" ~~~ ", "(o o)", " ~~~ "],
    fish: ["><>"],
    bird: ["  v  ", " \\|/ "],
  },

  effects: {
    explosion1: [" \\|/ ", "-- --", " /|\\ "],
    explosion2: ["*\\|/*", "--*--", "*/|\\*"],
    sparkle: [" * ", "*+*", " * "],
    smoke: [" ~ ", "~~~", " ~ "],
    impact: [" . ", "-+-", " ' "],
    ripple: ["  .  ", " .-. ", "( . )", " '-' ", "  '  "],
    portal: [" /\\ ", "(  )", " \\/ "],
  },

  ui: {
    heart: [" ** ** ", "******", " **** ", "  **  "],
    heartSmall: ["<3"],
    skull: [" ___ ", "|o o|", "| ^ |", " --- "],
    star: [" * ", "***", " * "],
    diamond: [" /\\ ", "<  >", " \\/ "],
    shield: [" /=\\ ", "| + |", " \\_/ "],
    sword: ["  |  ", "--+--", "  |  ", "  |  "],
    potion: [" _ ", "[_]", "| |", "|_|"],
    key: ["o--", "  |"],
    coin: ["(O)"],
    chest: [" ___ ", "[___]", "|   |", "|___|"],
    flag: ["|\\ ", "| >", "|/ ", "|  "],
    arrow: {
      up: [" ^ ", " | "],
      down: [" | ", " v "],
      left: ["<--"],
      right: ["-->"],
    },
  },

  borders: {
    single: {
      h: "─",
      v: "│",
      tl: "┌",
      tr: "┐",
      bl: "└",
      br: "┘",
      t: "┬",
      b: "┴",
      l: "├",
      r: "┤",
      x: "┼",
    },
    double: {
      h: "═",
      v: "║",
      tl: "╔",
      tr: "╗",
      bl: "╚",
      br: "╝",
      t: "╦",
      b: "╩",
      l: "╠",
      r: "╣",
      x: "╬",
    },
    rounded: {
      h: "─",
      v: "│",
      tl: "╭",
      tr: "╮",
      bl: "╰",
      br: "╯",
      t: "┬",
      b: "┴",
      l: "├",
      r: "┤",
      x: "┼",
    },
    heavy: {
      h: "━",
      v: "┃",
      tl: "┏",
      tr: "┓",
      bl: "┗",
      br: "┛",
      t: "┳",
      b: "┻",
      l: "┣",
      r: "┫",
      x: "╋",
    },
    dashed: {
      h: "╌",
      v: "╎",
      tl: "┌",
      tr: "┐",
      bl: "└",
      br: "┘",
      t: "┬",
      b: "┴",
      l: "├",
      r: "┤",
      x: "┼",
    },
  },

  blocks: {
    full: "█",
    dark: "▓",
    medium: "▒",
    light: "░",
    top: "▀",
    bottom: "▄",
    left: "▌",
    right: "▐",
  },
} as const;

// ── Helpers ────────────────────────────────────────────────────

type BorderStyle = keyof typeof ASCII_SPRITES.borders;

/**
 * Generate an ASCII box (border rectangle) as a string array.
 *
 *   asciiBox(5, 3)         → ['┌───┐', '│   │', '└───┘']
 *   asciiBox(5, 3, 'double') → ['╔═══╗', '║   ║', '╚═══╝']
 */
export function asciiBox(width: number, height: number, style: BorderStyle = "single"): string[] {
  const b = ASCII_SPRITES.borders[style];
  const inner = width - 2;
  if (inner < 0 || height < 2) return [];

  const lines: string[] = [];
  lines.push(b.tl + b.h.repeat(inner) + b.tr);
  for (let i = 0; i < height - 2; i++) {
    lines.push(b.v + " ".repeat(inner) + b.v);
  }
  lines.push(b.bl + b.h.repeat(inner) + b.br);
  return lines;
}

// ── ASCII Art Loading ─────────────────────────────────────────

/**
 * Parse raw ASCII art text into a sprite-ready lines array.
 * Trims leading/trailing blank lines, preserves internal whitespace.
 *
 *   import parrotTxt from './assets/parrot.txt?raw'
 *   const lines = parseAsciiArt(parrotTxt)
 */
export function parseAsciiArt(text: string): string[] {
  const lines = text.split("\n");
  // Strip trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  // Strip leading empty lines
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  return lines;
}

/**
 * Create a Sprite component from raw ASCII art text.
 * Spread the result into engine.spawn():
 *
 *   engine.spawn({
 *     position: { x: 400, y: 300 },
 *     ...createAsciiSprite(parrotTxt, {
 *       font: '10px "Fira Code", monospace',
 *       colorMap: { '@': '#ff4444', '~': '#44aa44', '*': '#ffcc00' },
 *     }),
 *   })
 */
export function createAsciiSprite(
  text: string,
  opts?: {
    font?: string;
    color?: string;
    colorMap?: Record<string, string>;
    glow?: string;
    opacity?: number;
    layer?: number;
  },
): { sprite: Sprite } {
  return {
    sprite: {
      lines: parseAsciiArt(text),
      font: opts?.font ?? '12px "Fira Code", monospace',
      color: opts?.color ?? "#e0e0e0",
      colorMap: opts?.colorMap,
      glow: opts?.glow,
      opacity: opts?.opacity,
      layer: opts?.layer,
    },
  };
}

/**
 * Create animation frames from multiple ASCII art texts.
 * Each frame swaps the sprite lines — the color map carries over from
 * the sprite component.
 *
 *   const frames = createAsciiFrames([parrot1, parrot2], 0.15)
 *   engine.playAnimation(entity, frames, 0.15, true)
 */
export function createAsciiFrames(texts: string[], frameDuration = 0.15): AnimationFrame[] {
  return texts.map((text) => ({
    lines: parseAsciiArt(text),
    duration: frameDuration,
  }));
}
