/**
 * ASCII Sprite Library — pre-made ASCII art for common game objects.
 *
 * Usage:
 *   import { ASCII_SPRITES, asciiBox } from '@engine'
 *
 *   engine.spawn({
 *     position: { x: 100, y: 100 },
 *     sprite: { lines: ASCII_SPRITES.characters.player, font: FONTS.normal, color: '#0f0' },
 *   })
 */

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
