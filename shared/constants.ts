/**
 * Game-wide constants and tuning values.
 */

export const COLORS = {
  bg: "#0a0a0a",
  fg: "#e0e0e0",
  dim: "#666666",
  accent: "#00ff88",
  warning: "#ffaa00",
  danger: "#ff4444",
  info: "#44aaff",
  purple: "#aa44ff",
  pink: "#ff44aa",
} as const;

/** Themed color palettes for quick styling. */
export const PALETTES = {
  retro: {
    bg: "#1a1a2e",
    fg: "#e0e0e0",
    primary: "#e94560",
    secondary: "#0f3460",
    accent: "#16213e",
    highlight: "#533483",
  },
  neon: {
    bg: "#0a0a0a",
    fg: "#ffffff",
    primary: "#ff00ff",
    secondary: "#00ffff",
    accent: "#ff6600",
    highlight: "#00ff00",
  },
  pastel: {
    bg: "#fefefe",
    fg: "#2d3436",
    primary: "#fd79a8",
    secondary: "#74b9ff",
    accent: "#55efc4",
    highlight: "#ffeaa7",
  },
  forest: {
    bg: "#0b1a0b",
    fg: "#c8e6c9",
    primary: "#4caf50",
    secondary: "#2e7d32",
    accent: "#ffeb3b",
    highlight: "#81c784",
  },
  ocean: {
    bg: "#0a192f",
    fg: "#ccd6f6",
    primary: "#64ffda",
    secondary: "#8892b0",
    accent: "#f06292",
    highlight: "#233554",
  },
  monochrome: {
    bg: "#111111",
    fg: "#eeeeee",
    primary: "#ffffff",
    secondary: "#aaaaaa",
    accent: "#666666",
    highlight: "#cccccc",
  },
} as const;

export const FONTS = {
  normal: '16px "Fira Code", monospace',
  large: '24px "Fira Code", monospace',
  huge: '48px "Fira Code", monospace',
  small: '12px "Fira Code", monospace',
  bold: '700 16px "Fira Code", monospace',
  boldLarge: '700 24px "Fira Code", monospace',
} as const;
