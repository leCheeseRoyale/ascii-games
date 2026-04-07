/**
 * Game-wide constants and tuning values.
 */

export const COLORS = {
  bg: '#0a0a0a',
  fg: '#e0e0e0',
  dim: '#666666',
  accent: '#00ff88',
  warning: '#ffaa00',
  danger: '#ff4444',
  info: '#44aaff',
  purple: '#aa44ff',
  pink: '#ff44aa',
} as const

export const FONTS = {
  normal: '16px "Fira Code", monospace',
  large: '24px "Fira Code", monospace',
  huge: '48px "Fira Code", monospace',
  small: '12px "Fira Code", monospace',
  bold: '700 16px "Fira Code", monospace',
  boldLarge: '700 24px "Fira Code", monospace',
} as const
