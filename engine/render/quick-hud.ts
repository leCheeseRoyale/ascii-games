/**
 * Quick HUD — one-liner score/health/lives display on the canvas.
 *
 * Usage in a scene update:
 *   drawQuickHud(engine.ui, engine.width, engine.height, {
 *     score: 1250,
 *     health: { current: 3, max: 5 },
 *     lives: 3,
 *     level: 2,
 *   });
 *
 * Renders formatted text to a corner of the screen via CanvasUI.text().
 */

import type { CanvasUI } from "./canvas-ui";

export interface QuickHudOpts {
  score?: number;
  health?: { current: number; max: number };
  lives?: number;
  level?: number;
  custom?: string;
  font?: string;
  color?: string;
  position?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
}

export function drawQuickHud(
  ui: CanvasUI,
  screenWidth: number,
  screenHeight: number,
  opts: QuickHudOpts,
): void {
  const font = opts.font ?? '14px "Fira Code", monospace';
  const color = opts.color ?? "#e0e0e0";
  const pad = 12;

  const parts: string[] = [];
  if (opts.score !== undefined) parts.push(`SCORE: ${opts.score.toString().padStart(5, "0")}`);
  if (opts.health) parts.push(`HP: ${opts.health.current}/${opts.health.max}`);
  if (opts.lives !== undefined) parts.push("♥".repeat(opts.lives));
  if (opts.level !== undefined) parts.push(`LV ${opts.level}`);
  if (opts.custom) parts.push(opts.custom);

  if (parts.length === 0) return;

  const text = parts.join("  ");
  const pos = opts.position ?? "topLeft";

  const lineH = (parseFloat(font) || 14) * 1.3;

  let x: number;
  let y: number;
  let align: "left" | "right";

  switch (pos) {
    case "topLeft":
      x = pad;
      y = pad;
      align = "left";
      break;
    case "topRight":
      x = screenWidth - pad;
      y = pad;
      align = "right";
      break;
    case "bottomLeft":
      x = pad;
      y = screenHeight - pad - lineH;
      align = "left";
      break;
    case "bottomRight":
      x = screenWidth - pad;
      y = screenHeight - pad - lineH;
      align = "right";
      break;
  }

  ui.text(x, y, text, { font, color, align });
}
