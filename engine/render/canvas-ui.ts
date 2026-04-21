/**
 * Canvas UI primitives — immediate-mode draw queue for screen-space UI.
 *
 * Core classes: CanvasUI, UIMenu, DialogManager
 * Additional primitives: UIScrollPanel, UIGrid, UITooltip, UITabs
 *
 * All standalone classes follow the same pattern:
 *   - Standalone class with update(engine) + draw(ui, x, y)
 *   - Uses _queue.push() for deferred rendering
 *   - Stores _lastX/_lastY/_lastW/_lastH during draw() for hit testing in update()
 */

import type { TextEffectFn } from "@shared/types";
import type { Engine } from "../core/engine";
import {
  layoutTextBlock,
  measureLineWidth,
  parseStyledText,
  stripTags,
  measureHeight as tlMeasureHeight,
} from "./text-layout";

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_FONT = '16px "Fira Code", monospace';
const DEFAULT_COLOR = "#e0e0e0";
const DEFAULT_BG = "rgba(0,0,0,0.85)";
const DEFAULT_BORDER_COLOR = "#444444";

// ── Border sets ─────────────────────────────────────────────────

export type BorderStyle = "single" | "double" | "rounded" | "heavy" | "ascii" | "none" | "dashed";

export const BORDERS: Record<
  Exclude<BorderStyle, "none">,
  { h: string; v: string; tl: string; tr: string; bl: string; br: string }
> = {
  single: { h: "─", v: "│", tl: "┌", tr: "┐", bl: "└", br: "┘" },
  double: { h: "═", v: "║", tl: "╔", tr: "╗", bl: "╚", br: "╝" },
  rounded: { h: "─", v: "│", tl: "╭", tr: "╮", bl: "╰", br: "╯" },
  heavy: { h: "━", v: "┃", tl: "┏", tr: "┓", bl: "┗", br: "┛" },
  ascii: { h: "-", v: "|", tl: "+", tr: "+", bl: "+", br: "+" },
  dashed: { h: "╌", v: "╎", tl: "┌", tr: "┐", bl: "└", br: "┘" },
};

// ── Anchor resolution ───────────────────────────────────────────

export type Anchor =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "center"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

function resolveAnchor(
  x: number,
  y: number,
  w: number,
  h: number,
  anchor: Anchor,
): { x: number; y: number } {
  let ax = x;
  let ay = y;
  switch (anchor) {
    case "topLeft":
      break;
    case "topCenter":
      ax = x - w / 2;
      break;
    case "topRight":
      ax = x - w;
      break;
    case "center":
      ax = x - w / 2;
      ay = y - h / 2;
      break;
    case "bottomLeft":
      ay = y - h;
      break;
    case "bottomCenter":
      ax = x - w / 2;
      ay = y - h;
      break;
    case "bottomRight":
      ax = x - w;
      ay = y - h;
      break;
  }
  return { x: ax, y: ay };
}

// ── Border drawing ──────────────────────────────────────────────

function _drawBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: BorderStyle,
  borderColor: string,
  font: string,
  bg?: string,
): void {
  ctx.save();

  // Background fill
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
  }

  if (border === "none") {
    ctx.restore();
    return;
  }

  const b = BORDERS[border];
  ctx.font = font;
  ctx.fillStyle = borderColor;
  ctx.textBaseline = "top";

  const charW = _charWidth(ctx, font);
  const fontSize = parseFloat(font) || 16;
  const lineH = fontSize * 1.3;

  // Top border
  ctx.textAlign = "left";
  ctx.fillText(b.tl, x, y);
  ctx.textAlign = "right";
  ctx.fillText(b.tr, x + w, y);

  // Fill top horizontal
  const innerW = w - charW * 2;
  if (innerW > 0) {
    const hCount = Math.floor(innerW / charW);
    ctx.textAlign = "left";
    for (let i = 0; i < hCount; i++) {
      ctx.fillText(b.h, x + charW + i * charW, y);
    }
  }

  // Bottom border
  const bottomY = y + h - lineH;
  ctx.textAlign = "left";
  ctx.fillText(b.bl, x, bottomY);
  ctx.textAlign = "right";
  ctx.fillText(b.br, x + w, bottomY);

  // Fill bottom horizontal
  if (innerW > 0) {
    const hCount = Math.floor(innerW / charW);
    ctx.textAlign = "left";
    for (let i = 0; i < hCount; i++) {
      ctx.fillText(b.h, x + charW + i * charW, bottomY);
    }
  }

  // Side borders
  ctx.textAlign = "left";
  const rows = Math.floor((h - lineH * 2) / lineH);
  for (let i = 0; i < rows; i++) {
    const ry = y + lineH + i * lineH;
    ctx.fillText(b.v, x, ry);
    ctx.textAlign = "right";
    ctx.fillText(b.v, x + w, ry);
    ctx.textAlign = "left";
  }

  ctx.restore();
}

// ── Char width measurement ──────────────────────────────────────

function _charWidth(_ctx: CanvasRenderingContext2D, font: string): number {
  return measureLineWidth("M", font);
}

function _lineHeight(font: string): number {
  return (parseFloat(font) || 16) * 1.3;
}

// ── Option types ────────────────────────────────────────────────

export interface UITextOpts {
  color?: string;
  font?: string;
  glow?: string;
  align?: "left" | "center" | "right";
  opacity?: number;
}

/** A single chunk inside an `inlineRun` — one font/color/bg segment. */
export interface UIInlineChunk {
  text: string;
  font?: string;
  color?: string;
  /** Solid background behind this chunk (useful for chip/badge look). */
  bg?: string;
  /** Horizontal padding applied to both sides inside the background. */
  padX?: number;
}

export interface UIInlineRunOpts {
  font?: string;
  color?: string;
  /** Pixels between chunks. Defaults to 0. */
  gap?: number;
  /** Skip trailing chunks that would exceed this pixel width. */
  maxWidth?: number;
}

export interface UIPanelOpts {
  border?: BorderStyle;
  bg?: string;
  borderColor?: string;
  title?: string;
  anchor?: Anchor;
  font?: string;
}

export interface UITextPanelOpts {
  maxWidth?: number;
  border?: BorderStyle;
  anchor?: Anchor;
  color?: string;
  font?: string;
  padding?: number;
  bg?: string;
  borderColor?: string;
  glow?: string;
  title?: string;
}

export interface UIBarOpts {
  fillColor?: string;
  emptyColor?: string;
  label?: string;
  labelColor?: string;
  font?: string;
  fillChar?: string;
  emptyChar?: string;
}

export interface UIMenuOpts {
  border?: BorderStyle;
  title?: string;
  selectedColor?: string;
  borderColor?: string;
  bg?: string;
  anchor?: Anchor;
  font?: string;
  color?: string;
  onMove?: () => void;
}

export interface UIDialogOpts {
  speaker?: string;
  typeSpeed?: number;
  border?: BorderStyle;
  onChar?: (ch: string) => void;
  font?: string;
  color?: string;
  bg?: string;
  borderColor?: string;
  speakerColor?: string;
}

export interface UIChoiceOpts extends UIDialogOpts {
  selectedColor?: string;
}

// ── Draw function type ──────────────────────────────────────────

type DrawFn = () => void;

// ═══════════════════════════════════════════════════════════════════
// CanvasUI — Immediate-mode canvas UI with draw queue
// ═══════════════════════════════════════════════════════════════════

export class CanvasUI {
  /** Draw queue — closures pushed by UI methods, flushed by render(). */
  _queue: DrawFn[] = [];
  private ctx: CanvasRenderingContext2D;
  private _time = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** Called by engine each frame to advance internal time. */
  update(dt: number): void {
    this._time += dt;
  }

  // ── Text ────────────────────────────────────────────────────────

  /** Draw text at (x, y) in screen space. Supports styled tags: [#hex], [b], [dim], [bg:#hex]. */
  text(x: number, y: number, text: string, opts?: UITextOpts): void {
    const font = opts?.font ?? DEFAULT_FONT;
    const color = opts?.color ?? DEFAULT_COLOR;
    const glow = opts?.glow;
    const align = opts?.align ?? "left";
    const opacity = opts?.opacity;

    this._queue.push(() => {
      const ctx = this.ctx;
      ctx.save();

      if (opacity !== undefined) {
        ctx.globalAlpha = opacity;
      }

      ctx.font = font;
      ctx.textBaseline = "top";

      const hasTags = /\[(#[0-9a-fA-F]{3,8}|\/|b|\/b|dim|\/dim|bg:#[0-9a-fA-F]{3,8}|\/bg)\]/.test(
        text,
      );

      if (!hasTags) {
        ctx.textAlign = align;
        if (glow) {
          ctx.shadowColor = glow;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      } else {
        const segments = parseStyledText(text, font, color);
        const stripped = stripTags(text);
        let startX = x;
        if (align === "center") {
          startX = x - measureLineWidth(stripped, font) / 2;
        } else if (align === "right") {
          startX = x - measureLineWidth(stripped, font);
        }

        ctx.textAlign = "left";
        let cursor = startX;

        for (const seg of segments) {
          if (!seg.text) continue;
          const baseAlpha = ctx.globalAlpha;

          if (seg.bgColor) {
            const segW = measureLineWidth(seg.text, seg.font);
            const fontSize = parseFloat(seg.font) || 16;
            ctx.fillStyle = seg.bgColor;
            ctx.globalAlpha = baseAlpha * seg.opacity;
            ctx.fillRect(cursor, y, segW, fontSize * 1.2);
          }

          ctx.globalAlpha = baseAlpha * seg.opacity;
          ctx.font = seg.font;
          if (glow) {
            ctx.shadowColor = glow;
            ctx.shadowBlur = 8;
          }
          ctx.fillStyle = seg.color;
          ctx.fillText(seg.text, cursor, y);
          cursor += measureLineWidth(seg.text, seg.font);
          ctx.globalAlpha = baseAlpha;
        }
      }

      ctx.restore();
    });
  }

  // ── Effect Text ─────────────────────────────────────────────────

  /** Draw text with per-character effects (wave, shake, rainbow, etc). */
  effectText(x: number, y: number, text: string, effectFn: TextEffectFn, opts?: UITextOpts): void {
    const font = opts?.font ?? DEFAULT_FONT;
    const color = opts?.color ?? DEFAULT_COLOR;
    const glow = opts?.glow;
    const align = opts?.align ?? "left";
    const time = this._time;

    this._queue.push(() => {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = font;
      ctx.textBaseline = "top";

      const chars = [...text];
      const totalW = measureLineWidth(text, font);
      let startX = x;
      if (align === "center") startX = x - totalW / 2;
      else if (align === "right") startX = x - totalW;

      // Measure each char width for positioning.
      // Canvas measureText is required for per-char positioning — this
      // is a hot path for text effects, but it does NOT trigger DOM reflow.
      const charWidths: number[] = [];
      for (const ch of chars) {
        charWidths.push(ctx.measureText(ch).width);
      }

      let cx = startX;
      for (let i = 0; i < chars.length; i++) {
        const transform = effectFn(i, chars.length, time);
        const dx = transform.dx ?? 0;
        const dy = transform.dy ?? 0;
        const charColor = transform.color ?? color;
        const charOpacity = transform.opacity;
        const charScale = transform.scale;
        const charChar = transform.char ?? chars[i];

        ctx.save();

        if (charOpacity !== undefined) {
          ctx.globalAlpha = charOpacity;
        }
        if (charScale !== undefined) {
          const mid = cx + charWidths[i] / 2;
          ctx.translate(mid, y);
          ctx.scale(charScale, charScale);
          ctx.translate(-mid, -y);
        }

        if (glow) {
          ctx.shadowColor = glow;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = charColor;
        ctx.textAlign = "left";
        ctx.fillText(charChar, cx + dx, y + dy);
        ctx.restore();

        cx += charWidths[i];
      }

      ctx.restore();
    });
  }

  // ── Panel ───────────────────────────────────────────────────────

  /** Draw a bordered panel with optional background and title. */
  panel(x: number, y: number, w: number, h: number, opts?: UIPanelOpts): void {
    const border = opts?.border ?? "single";
    const bg = opts?.bg ?? DEFAULT_BG;
    const borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    const title = opts?.title;
    const anchor = opts?.anchor ?? "topLeft";
    const font = opts?.font ?? DEFAULT_FONT;

    this._queue.push(() => {
      const resolved = resolveAnchor(x, y, w, h, anchor);
      _drawBorder(this.ctx, resolved.x, resolved.y, w, h, border, borderColor, font, bg);

      if (title && border !== "none") {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = borderColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const titleX = resolved.x + w / 2;
        const titleW = measureLineWidth(title, font) + _charWidth(ctx, font);
        // Clear the border behind the title
        ctx.fillStyle = bg ?? DEFAULT_BG;
        ctx.fillRect(titleX - titleW / 2, resolved.y, titleW, _lineHeight(font));
        // Draw title text
        ctx.fillStyle = borderColor;
        ctx.fillText(` ${title} `, titleX, resolved.y);
        ctx.restore();
      }
    });
  }

  // ── Text Panel ──────────────────────────────────────────────────

  /** Auto-sized panel that shrinkwraps to fit text content. */
  textPanel(x: number, y: number, text: string, opts?: UITextPanelOpts): void {
    const maxWidth = opts?.maxWidth ?? 400;
    const border = opts?.border ?? "single";
    const anchor = opts?.anchor ?? "topLeft";
    const color = opts?.color ?? DEFAULT_COLOR;
    const font = opts?.font ?? DEFAULT_FONT;
    const padding = opts?.padding ?? 12;
    const bg = opts?.bg ?? DEFAULT_BG;
    const borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    const glow = opts?.glow;
    const title = opts?.title;

    this._queue.push(() => {
      const ctx = this.ctx;
      const lh = _lineHeight(font);
      const innerMaxW = maxWidth - padding * 2;

      const lines = layoutTextBlock(text, font, innerMaxW, lh);
      let contentW = 0;
      for (const l of lines) {
        if (l.width > contentW) contentW = l.width;
      }
      contentW = Math.min(Math.ceil(contentW), innerMaxW);
      const contentH = lines.length * lh;
      const titleH = title ? lh + 4 : 0;

      if (title) {
        const tw = measureLineWidth(` ${title} `, font);
        if (tw > contentW) contentW = Math.min(tw, innerMaxW);
      }

      const panelW = contentW + padding * 2;
      const panelH = contentH + titleH + padding * 2;

      const resolved = resolveAnchor(x, y, panelW, panelH, anchor);
      const rx = resolved.x;
      const ry = resolved.y;

      // Draw panel border + bg
      _drawBorder(ctx, rx, ry, panelW, panelH, border, borderColor, font, bg);

      ctx.save();
      ctx.font = font;
      ctx.textBaseline = "top";

      let contentY = ry + padding;

      // Draw title (matches UIMenu style: centered label + horizontal separator)
      if (title) {
        ctx.fillStyle = borderColor;
        ctx.textAlign = "center";
        ctx.fillText(title, rx + panelW / 2, contentY);
        contentY += lh + 4;
        if (border !== "none") {
          const b = BORDERS[border];
          const cw = _charWidth(ctx, font);
          ctx.textAlign = "left";
          const hCount = Math.floor((panelW - padding * 2) / cw);
          for (let i = 0; i < hCount; i++) {
            ctx.fillText(b.h, rx + padding + i * cw, contentY - 2);
          }
        }
      }

      // Draw text
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 8;
      }

      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i].text, rx + padding, contentY + i * lh);
      }

      ctx.restore();
    });
  }

  // ── Bar ─────────────────────────────────────────────────────────

  /** Draw an ASCII progress bar. width = number of chars, ratio = 0-1. */
  bar(x: number, y: number, width: number, ratio: number, opts?: UIBarOpts): void {
    const fillColor = opts?.fillColor ?? "#00ff88";
    const emptyColor = opts?.emptyColor ?? "#333333";
    const label = opts?.label;
    const labelColor = opts?.labelColor ?? DEFAULT_COLOR;
    const font = opts?.font ?? DEFAULT_FONT;
    const fillChar = opts?.fillChar ?? "█";
    const emptyChar = opts?.emptyChar ?? "░";

    this._queue.push(() => {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      const cw = _charWidth(ctx, font);
      const clamped = Math.max(0, Math.min(1, ratio));
      const filled = Math.round(width * clamped);

      let cx = x;

      // Draw filled portion
      ctx.fillStyle = fillColor;
      for (let i = 0; i < filled; i++) {
        ctx.fillText(fillChar, cx, y);
        cx += cw;
      }

      // Draw empty portion
      ctx.fillStyle = emptyColor;
      for (let i = filled; i < width; i++) {
        ctx.fillText(emptyChar, cx, y);
        cx += cw;
      }

      // Draw label after bar
      if (label) {
        ctx.fillStyle = labelColor;
        ctx.fillText(` ${label}`, cx, y);
      }

      ctx.restore();
    });
  }

  /**
   * Draw a single line of mixed-font/color text — "[HP]" in one font next
   * to a value in another, badges, chips, inline icons. Each chunk keeps
   * its own font/color/background/padding, all baseline-aligned.
   *
   * No wrapping — the caller picks the line; if the total width exceeds
   * `maxWidth` (when provided), extra chunks are skipped rather than
   * overflowing. Returns the total drawn width in pixels.
   */
  inlineRun(x: number, y: number, chunks: UIInlineChunk[], opts?: UIInlineRunOpts): number {
    const baseFont = opts?.font ?? DEFAULT_FONT;
    const baseColor = opts?.color ?? DEFAULT_COLOR;
    const gap = opts?.gap ?? 0;
    const maxWidth = opts?.maxWidth ?? Infinity;

    // Measure first so we can render within a single queued closure and
    // also decide which chunks fit when maxWidth is constrained. Widths go
    // through measureLineWidth so identical chunks aren't re-measured each frame.
    let running = 0;
    const kept: Array<
      UIInlineChunk & { width: number; resolvedFont: string; resolvedColor: string }
    > = [];
    for (const chunk of chunks) {
      const font = chunk.font ?? baseFont;
      const w = measureLineWidth(chunk.text, font) + (chunk.padX ?? 0) * 2;
      if (running + w > maxWidth) break;
      kept.push({
        ...chunk,
        width: w,
        resolvedFont: font,
        resolvedColor: chunk.color ?? baseColor,
      });
      running += w + gap;
    }

    this._queue.push(() => {
      const c = this.ctx;
      c.save();
      c.textBaseline = "top";
      c.textAlign = "left";
      let cx = x;
      for (const ck of kept) {
        if (ck.bg) {
          c.fillStyle = ck.bg;
          c.fillRect(cx, y, ck.width, _lineHeight(ck.resolvedFont));
        }
        c.font = ck.resolvedFont;
        c.fillStyle = ck.resolvedColor;
        c.fillText(ck.text, cx + (ck.padX ?? 0), y);
        cx += ck.width + gap;
      }
      c.restore();
    });

    return Math.max(0, running - (kept.length > 0 ? gap : 0));
  }

  // ── Measurement helpers ─────────────────────────────────────────

  /** Measure text width using Pretext (cached, no DOM). */
  measureWidth(text: string, font: string): number {
    return measureLineWidth(text, font);
  }

  /** Measure text height using Pretext (cached, no DOM). */
  measureHeight(text: string, font: string, maxWidth: number, lineHeight: number): number {
    return tlMeasureHeight(text, font, maxWidth, lineHeight);
  }

  /** Get the width of a single monospace character for a given font. */
  charWidth(font: string): number {
    return _charWidth(this.ctx, font);
  }

  // ── Render ──────────────────────────────────────────────────────

  /** Flush the draw queue — called once per frame after world render. */
  render(): void {
    for (const fn of this._queue) {
      fn();
    }
    this._queue.length = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// UIMenu — Keyboard-navigable menu
// ═══════════════════════════════════════════════════════════════════

export class UIMenu {
  items: string[];
  selectedIndex = 0;
  confirmed = false;
  cancelled = false;
  active = true;

  private border: BorderStyle;
  private title: string | undefined;
  private selectedColor: string;
  private borderColor: string;
  private bg: string;
  private anchor: Anchor;
  private font: string;
  private color: string;
  private onMove: (() => void) | undefined;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;
  private _itemsStartY = 0;
  private _itemHeight = 0;

  constructor(items: string[], opts?: UIMenuOpts) {
    this.items = items;
    this.border = opts?.border ?? "single";
    this.title = opts?.title;
    this.selectedColor = opts?.selectedColor ?? "#00ff88";
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.anchor = opts?.anchor ?? "topLeft";
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.onMove = opts?.onMove;
  }

  /** Handle keyboard input (ArrowUp/Down, Enter/Space, Escape). */
  update(engine: Engine): void {
    if (!this.active) return;

    this.confirmed = false;
    this.cancelled = false;

    const kb = engine.keyboard;

    if (kb.pressed("ArrowUp") || kb.pressed("KeyW")) {
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this.onMove?.();
    }
    if (kb.pressed("ArrowDown") || kb.pressed("KeyS")) {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.onMove?.();
    }
    if (kb.pressed("Enter") || kb.pressed("Space")) {
      this.confirmed = true;
    }
    if (kb.pressed("Escape")) {
      this.cancelled = true;
    }
  }

  /** Queue draw commands into a CanvasUI instance. */
  draw(ui: CanvasUI, x: number, y: number): void {
    const font = this.font;
    const border = this.border;
    const bg = this.bg;
    const borderColor = this.borderColor;
    const anchor = this.anchor;
    const title = this.title;
    const items = this.items;
    const selectedIndex = this.selectedIndex;
    const selectedColor = this.selectedColor;
    const color = this.color;

    ui._queue.push(() => {
      const ctx = (ui as any).ctx as CanvasRenderingContext2D;
      ctx.save();
      ctx.font = font;

      const cw = _charWidth(ctx, font);
      const lh = _lineHeight(font);
      const pad = 12;
      const titleH = title ? lh + 4 : 0;

      // Find widest item (uses cached Pretext shrinkwrap)
      let maxItemW = 0;
      for (const item of items) {
        const w = measureLineWidth(`  ${item}  `, font);
        if (w > maxItemW) maxItemW = w;
      }
      if (title) {
        const tw = measureLineWidth(` ${title} `, font);
        if (tw > maxItemW) maxItemW = tw;
      }

      const panelW = maxItemW + pad * 2;
      const panelH = pad * 2 + titleH + items.length * lh;

      const resolved = resolveAnchor(x, y, panelW, panelH, anchor);
      const rx = resolved.x;
      const ry = resolved.y;

      this._lastX = rx;
      this._lastY = ry;
      this._lastW = panelW;
      this._lastH = panelH;
      this._itemsStartY = ry + pad + titleH;
      this._itemHeight = lh;

      // Draw border + bg
      _drawBorder(ctx, rx, ry, panelW, panelH, border, borderColor, font, bg);

      let contentY = ry + pad;

      // Draw title
      if (title) {
        ctx.fillStyle = borderColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title, rx + panelW / 2, contentY);
        contentY += lh + 4;

        // Separator under title
        if (border !== "none") {
          const b = BORDERS[border];
          ctx.fillStyle = borderColor;
          ctx.textAlign = "left";
          const hCount = Math.floor((panelW - pad * 2) / cw);
          for (let i = 0; i < hCount; i++) {
            ctx.fillText(b.h, rx + pad + i * cw, contentY - 2);
          }
        }
      }

      // Draw items
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (let i = 0; i < items.length; i++) {
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? "► " : "  ";
        ctx.fillStyle = isSelected ? selectedColor : color;
        ctx.fillText(`${prefix}${items[i]}`, rx + pad, contentY + i * lh);
      }

      ctx.restore();
    });
  }

  /** True if (x, y) falls inside the last drawn menu panel. */
  isPointInside(x: number, y: number): boolean {
    return (
      x >= this._lastX &&
      x <= this._lastX + this._lastW &&
      y >= this._lastY &&
      y <= this._lastY + this._lastH
    );
  }

  /** Returns the item index under (x, y), or null if outside the item list. */
  getHoveredItem(x: number, y: number): number | null {
    if (!this.isPointInside(x, y) || this._itemHeight === 0) return null;
    const relY = y - this._itemsStartY;
    if (relY < 0) return null;
    const idx = Math.floor(relY / this._itemHeight);
    if (idx < 0 || idx >= this.items.length) return null;
    return idx;
  }

  reset(): void {
    this.selectedIndex = 0;
    this.confirmed = false;
    this.cancelled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// DialogManager — Typewriter dialog with choices
// ═══════════════════════════════════════════════════════════════════

export class DialogManager {
  /** Whether a dialog is currently showing. */
  active = false;

  private _text = "";
  private _speaker = "";
  private _typeSpeed = 40;
  private _border: BorderStyle = "double";
  private _onChar: ((ch: string) => void) | undefined;
  private _font = DEFAULT_FONT;
  private _color = DEFAULT_COLOR;
  private _bg = DEFAULT_BG;
  private _borderColor = DEFAULT_BORDER_COLOR;
  private _speakerColor = "#00ff88";
  private _resolve: ((value: number) => void) | null = null;

  // Typewriter state
  private _revealed = 0;
  private _acc = 0;
  private _done = false;

  // Choice state
  private _choices: string[] = [];
  private _choiceIndex = 0;
  private _isChoice = false;

  // Pre-computed panel dimensions (computed from full text upfront)
  private _panelW = 0;
  private _panelH = 0;
  private _lines: { text: string; width: number }[] = [];

  /** Show a dialog. Returns a Promise that resolves when dismissed. */
  show(text: string, opts?: UIDialogOpts): Promise<void> {
    return new Promise<void>((resolve) => {
      this._setup(text, opts);
      this._isChoice = false;
      this._choices = [];
      this._resolve = () => resolve();
    });
  }

  /** Show a choice dialog. Returns a Promise<number> with the selected index. */
  choice(text: string, choices: string[], opts?: UIChoiceOpts): Promise<number> {
    return new Promise<number>((resolve) => {
      this._setup(text, opts);
      this._isChoice = true;
      this._choices = choices;
      this._choiceIndex = 0;
      this._resolve = resolve;
    });
  }

  private _setup(text: string, opts?: UIDialogOpts): void {
    this.active = true;
    this._text = text;
    this._speaker = opts?.speaker ?? "";
    this._typeSpeed = opts?.typeSpeed ?? 40;
    this._border = opts?.border ?? "double";
    this._onChar = opts?.onChar;
    this._font = opts?.font ?? DEFAULT_FONT;
    this._color = opts?.color ?? DEFAULT_COLOR;
    this._bg = opts?.bg ?? DEFAULT_BG;
    this._borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this._speakerColor = opts?.speakerColor ?? (opts as UIChoiceOpts | undefined)?.selectedColor ?? "#00ff88";

    this._revealed = 0;
    this._acc = 0;
    this._done = this._typeSpeed <= 0;
    if (this._done) {
      this._revealed = text.length;
    }

    // Panel size depends on screen width — layout is computed lazily on first draw.
    this._layoutWidth = -1;
  }

  /** Width the cached layout was computed at; -1 means "not computed yet". */
  private _layoutWidth = -1;

  private _precomputeLayout(screenW: number): void {
    const lh = _lineHeight(this._font);
    // Never exceed 500px of text, but also never blow past the viewport on a
    // narrow/mobile display — 90% of screen width leaves some side margin.
    const maxWidth = Math.min(500, Math.max(160, Math.floor(screenW * 0.9)));
    const padding = 16;
    const innerMaxW = maxWidth - padding * 2;

    this._lines = layoutTextBlock(this._text, this._font, innerMaxW, lh);
    let contentW = 0;
    for (const l of this._lines) {
      if (l.width > contentW) contentW = l.width;
    }
    contentW = Math.min(Math.ceil(contentW), innerMaxW);
    let contentH = this._lines.length * lh;

    // Speaker label
    if (this._speaker) {
      contentH += lh + 4;
    }

    // Choices
    if (this._isChoice && this._choices.length > 0) {
      contentH += lh * 0.5; // gap
      contentH += this._choices.length * lh;
    }

    // Prompt hint
    contentH += lh;

    this._panelW = contentW + padding * 2;
    this._panelH = contentH + padding * 2;
    this._layoutWidth = screenW;
  }

  /** Called by engine each frame. Advances typewriter and handles input. */
  update(dt: number, engine: Engine): void {
    if (!this.active) return;

    const kb = engine.keyboard;

    // Typewriter advance
    if (!this._done) {
      if (this._typeSpeed > 0) {
        this._acc += dt;
        const charsPerSec = this._typeSpeed;
        const interval = 1 / charsPerSec;

        while (this._acc >= interval && this._revealed < this._text.length) {
          this._revealed++;
          this._acc -= interval;
          const ch = this._text[this._revealed - 1];
          if (this._onChar && ch !== " " && ch !== "\n") {
            this._onChar(ch);
          }
        }
      }

      if (this._revealed >= this._text.length) {
        this._done = true;
      }

      // Skip to end on press
      if (kb.pressed("Enter") || kb.pressed("Space")) {
        this._revealed = this._text.length;
        this._done = true;
      }
    } else {
      // Text fully revealed — handle dismiss/choice
      if (this._isChoice) {
        if (kb.pressed("ArrowUp") || kb.pressed("KeyW")) {
          this._choiceIndex = (this._choiceIndex - 1 + this._choices.length) % this._choices.length;
        }
        if (kb.pressed("ArrowDown") || kb.pressed("KeyS")) {
          this._choiceIndex = (this._choiceIndex + 1) % this._choices.length;
        }
        if (kb.pressed("Enter") || kb.pressed("Space")) {
          this._dismiss(this._choiceIndex);
        }
      } else {
        if (kb.pressed("Enter") || kb.pressed("Space")) {
          this._dismiss(0);
        }
      }
    }
  }

  private _dismiss(value: number): void {
    this.active = false;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(value);
  }

  /** Queue draw commands for the dialog into the CanvasUI. Called by engine in render. */
  draw(ui: CanvasUI, screenW: number, screenH: number): void {
    if (!this.active) return;

    // Recompute layout when the viewport changes width (device rotate, window resize).
    if (this._layoutWidth !== screenW) this._precomputeLayout(screenW);

    const revealed = this._revealed;
    const speaker = this._speaker;
    const border = this._border;
    const bg = this._bg;
    const borderColor = this._borderColor;
    const speakerColor = this._speakerColor;
    const color = this._color;
    const font = this._font;
    const panelW = this._panelW;
    const panelH = this._panelH;
    const lines = this._lines;
    const done = this._done;
    const isChoice = this._isChoice;
    const choices = this._choices;
    const choiceIndex = this._choiceIndex;

    ui._queue.push(() => {
      const ctx = (ui as any).ctx as CanvasRenderingContext2D;
      ctx.save();

      const lh = _lineHeight(font);
      const padding = 16;

      // Center panel near bottom of screen
      const px = screenW / 2 - panelW / 2;
      const py = screenH - panelH - 40;

      // Draw panel border + bg
      _drawBorder(ctx, px, py, panelW, panelH, border, borderColor, font, bg);

      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      let contentY = py + padding;

      // Speaker label
      if (speaker) {
        ctx.fillStyle = speakerColor;
        ctx.fillText(speaker, px + padding, contentY);
        contentY += lh + 4;
      }

      // Render revealed text
      ctx.fillStyle = color;
      let charsRemaining = revealed;
      for (const line of lines) {
        if (charsRemaining <= 0) break;
        const lineText = line.text;
        if (charsRemaining >= lineText.length) {
          ctx.fillText(lineText, px + padding, contentY);
          // Account for line text plus the newline/space that separates lines
          charsRemaining -= lineText.length;
          // If there's a newline in the original text, account for it
          if (charsRemaining > 0) charsRemaining--;
        } else {
          ctx.fillText(lineText.slice(0, charsRemaining), px + padding, contentY);
          charsRemaining = 0;
        }
        contentY += lh;
      }

      // If fully revealed, show choices or prompt
      if (done) {
        if (isChoice && choices.length > 0) {
          contentY += lh * 0.5;
          for (let i = 0; i < choices.length; i++) {
            const isSelected = i === choiceIndex;
            const prefix = isSelected ? "► " : "  ";
            ctx.fillStyle = isSelected ? speakerColor : color;
            ctx.fillText(`${prefix}${choices[i]}`, px + padding, contentY);
            contentY += lh;
          }
        } else {
          // Blinking "press to continue" hint
          const blink = Math.floor(Date.now() / 500) % 2 === 0;
          if (blink) {
            ctx.fillStyle = borderColor;
            ctx.textAlign = "right";
            ctx.fillText("▼", px + panelW - padding, py + panelH - padding - lh);
          }
        }
      }

      ctx.restore();
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. UIScrollPanel
// ═══════════════════════════════════════════════════════════════════

export interface UIScrollPanelOpts {
  font?: string;
  color?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  padding?: number;
  title?: string;
  anchor?: Anchor;
  scrollbarTrack?: string;
  scrollbarThumb?: string;
  scrollbarColor?: string;
  lineHeight?: number;
}

export class UIScrollPanel {
  items: string[];
  scrollOffset = 0;
  viewportRows: number;
  width: number;
  active = true;

  private font: string;
  private color: string;
  private border: BorderStyle;
  private borderColor: string;
  private bg: string;
  private padding: number;
  private title: string | undefined;
  private anchor: Anchor;
  private scrollbarTrack: string;
  private scrollbarThumb: string;
  private scrollbarColor: string;
  private lineHeight: number;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;

  constructor(items: string[], viewportRows: number, width: number, opts?: UIScrollPanelOpts) {
    this.items = items;
    this.viewportRows = viewportRows;
    this.width = width;
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.border = opts?.border ?? "single";
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.padding = opts?.padding ?? 8;
    this.title = opts?.title;
    this.anchor = opts?.anchor ?? "topLeft";
    this.scrollbarTrack = opts?.scrollbarTrack ?? "░";
    this.scrollbarThumb = opts?.scrollbarThumb ?? "█";
    this.scrollbarColor = opts?.scrollbarColor ?? DEFAULT_COLOR;
    this.lineHeight = opts?.lineHeight ?? _lineHeight(this.font);
  }

  setItems(items: string[]): void {
    this.items = items;
    this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll);
  }

  private get maxScroll(): number {
    return Math.max(0, this.items.length - this.viewportRows);
  }

  update(engine: Engine): void {
    if (!this.active) return;

    const kb = engine.keyboard;

    if (kb.pressed("ArrowUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
    }
    if (kb.pressed("ArrowDown")) {
      this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset + 1);
    }
    if (kb.pressed("PageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - this.viewportRows);
    }
    if (kb.pressed("PageDown")) {
      this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset + this.viewportRows);
    }
    if (kb.pressed("Home")) {
      this.scrollOffset = 0;
    }
    if (kb.pressed("End")) {
      this.scrollOffset = this.maxScroll;
    }

    // Mouse wheel — only if mouse is within panel bounds
    const mx = engine.mouse.x;
    const my = engine.mouse.y;
    if (
      engine.mouse.wheelDelta !== 0 &&
      mx >= this._lastX &&
      mx <= this._lastX + this._lastW &&
      my >= this._lastY &&
      my <= this._lastY + this._lastH
    ) {
      const dir = Math.sign(engine.mouse.wheelDelta);
      this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset + dir));
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    const pad = this.padding;
    const lh = this.lineHeight;
    const titleH = this.title ? lh + 4 : 0;
    const totalH = pad * 2 + titleH + this.viewportRows * lh;
    const totalW = this.width;

    const resolved = resolveAnchor(x, y, totalW, totalH, this.anchor);
    const rx = resolved.x;
    const ry = resolved.y;

    // Store for hit testing
    this._lastX = rx;
    this._lastY = ry;
    this._lastW = totalW;
    this._lastH = totalH;

    // Draw border + background
    _drawBorder(ctx, rx, ry, totalW, totalH, this.border, this.borderColor, this.font, this.bg);

    // Draw title
    ctx.save();
    ctx.font = this.font;
    const contentX = rx + pad;
    let contentY = ry + pad;

    if (this.title) {
      ctx.fillStyle = this.borderColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(this.title, rx + totalW / 2, contentY);
      contentY += lh + 4;
    }

    // Clip to content area
    const clipW = totalW - pad * 2 - _charWidth(ctx, this.font) - 4; // room for scrollbar
    ctx.save();
    ctx.beginPath();
    ctx.rect(contentX, contentY, clipW, this.viewportRows * lh);
    ctx.clip();

    // Draw visible items
    ctx.fillStyle = this.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 0; i < this.viewportRows; i++) {
      const idx = i + this.scrollOffset;
      if (idx >= this.items.length) break;
      ctx.fillText(this.items[idx], contentX, contentY + i * lh);
    }

    ctx.restore(); // undo clip

    // Draw scrollbar
    if (this.items.length > this.viewportRows) {
      const cw = _charWidth(ctx, this.font);
      const sbX = rx + totalW - pad - cw;
      const sbH = this.viewportRows * lh;
      const thumbRatio = this.viewportRows / this.items.length;
      const thumbH = Math.max(lh, sbH * thumbRatio);
      const trackSpace = sbH - thumbH;
      const thumbY =
        contentY + (this.maxScroll > 0 ? (this.scrollOffset / this.maxScroll) * trackSpace : 0);

      ctx.fillStyle = this.scrollbarColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Track
      const trackRows = Math.floor(sbH / lh);
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < trackRows; i++) {
        ctx.fillText(this.scrollbarTrack, sbX, contentY + i * lh);
      }

      // Thumb
      ctx.globalAlpha = 1;
      const thumbRows = Math.max(1, Math.floor(thumbH / lh));
      const thumbStartRow = Math.floor((thumbY - contentY) / lh);
      for (let i = 0; i < thumbRows; i++) {
        const row = thumbStartRow + i;
        if (row < trackRows) {
          ctx.fillText(this.scrollbarThumb, sbX, contentY + row * lh);
        }
      }
    }

    ctx.restore();
    ctx.restore();
  }

  /** True if (x, y) falls inside the last drawn scroll panel. */
  isPointInside(x: number, y: number): boolean {
    return (
      x >= this._lastX &&
      x <= this._lastX + this._lastW &&
      y >= this._lastY &&
      y <= this._lastY + this._lastH
    );
  }

  reset(): void {
    this.scrollOffset = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. UIGrid
// ═══════════════════════════════════════════════════════════════════

export interface UIGridCell {
  text?: string;
  icon?: string;
  color?: string;
  bg?: string;
  empty?: boolean;
}

export interface UIGridOpts {
  font?: string;
  color?: string;
  emptyColor?: string;
  emptyChar?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  selectedBorderColor?: string;
  selectedBg?: string;
  padding?: number;
  title?: string;
  anchor?: Anchor;
}

export class UIGrid {
  cells: UIGridCell[];
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  selectedIndex = 0;
  confirmed = false;
  active = true;

  private font: string;
  private color: string;
  private emptyColor: string;
  private emptyChar: string;
  private border: BorderStyle;
  private borderColor: string;
  private bg: string;
  private selectedBorderColor: string;
  private selectedBg: string;
  private padding: number;
  private title: string | undefined;
  private anchor: Anchor;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;

  constructor(
    cells: UIGridCell[],
    cols: number,
    rows: number,
    cellWidth: number,
    cellHeight: number,
    opts?: UIGridOpts,
  ) {
    this.cells = cells;
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.emptyColor = opts?.emptyColor ?? "#666666";
    this.emptyChar = opts?.emptyChar ?? "·";
    this.border = opts?.border ?? "single";
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.selectedBorderColor = opts?.selectedBorderColor ?? "#00ff88";
    this.selectedBg = opts?.selectedBg ?? "rgba(0,255,136,0.15)";
    this.padding = opts?.padding ?? 8;
    this.title = opts?.title;
    this.anchor = opts?.anchor ?? "topLeft";
  }

  get selectedRow(): number {
    return Math.floor(this.selectedIndex / this.cols);
  }

  get selectedCol(): number {
    return this.selectedIndex % this.cols;
  }

  get selectedCell(): UIGridCell | undefined {
    return this.cells[this.selectedIndex];
  }

  setCell(index: number, cell: UIGridCell): void {
    if (index >= 0 && index < this.cells.length) {
      this.cells[index] = cell;
    }
  }

  update(engine: Engine): void {
    if (!this.active) return;

    this.confirmed = false;
    const kb = engine.keyboard;

    if (kb.pressed("ArrowLeft")) {
      const col = this.selectedCol;
      if (col > 0) this.selectedIndex--;
    }
    if (kb.pressed("ArrowRight")) {
      const col = this.selectedCol;
      if (col < this.cols - 1) this.selectedIndex++;
    }
    if (kb.pressed("ArrowUp")) {
      const row = this.selectedRow;
      if (row > 0) this.selectedIndex -= this.cols;
    }
    if (kb.pressed("ArrowDown")) {
      const nextIdx = this.selectedIndex + this.cols;
      if (nextIdx < this.cells.length) this.selectedIndex = nextIdx;
    }

    // Clamp to valid range
    this.selectedIndex = Math.max(0, Math.min(this.cells.length - 1, this.selectedIndex));

    if (kb.pressed("Enter") || kb.pressed("Space")) {
      this.confirmed = true;
    }

    // Mouse click
    if (engine.mouse.justDown) {
      const mx = engine.mouse.x;
      const my = engine.mouse.y;
      if (
        mx >= this._lastX &&
        mx <= this._lastX + this._lastW &&
        my >= this._lastY &&
        my <= this._lastY + this._lastH
      ) {
        const pad = this.padding;
        const lh = _lineHeight(this.font);
        const titleH = this.title ? lh + 4 : 0;
        const gridStartX = this._lastX + pad;
        const gridStartY = this._lastY + pad + titleH;

        const relX = mx - gridStartX;
        const relY = my - gridStartY;

        if (relX >= 0 && relY >= 0) {
          const col = Math.floor(relX / this.cellWidth);
          const row = Math.floor(relY / this.cellHeight);
          if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            const idx = row * this.cols + col;
            if (idx < this.cells.length) {
              this.selectedIndex = idx;
              this.confirmed = true;
            }
          }
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const pad = this.padding;
    const lh = _lineHeight(this.font);
    const titleH = this.title ? lh + 4 : 0;
    const gridW = this.cols * this.cellWidth;
    const gridH = this.rows * this.cellHeight;
    const totalW = pad * 2 + gridW;
    const totalH = pad * 2 + titleH + gridH;

    const resolved = resolveAnchor(x, y, totalW, totalH, this.anchor);
    const rx = resolved.x;
    const ry = resolved.y;

    // Store for hit testing
    this._lastX = rx;
    this._lastY = ry;
    this._lastW = totalW;
    this._lastH = totalH;

    // Draw outer border + background
    _drawBorder(ctx, rx, ry, totalW, totalH, this.border, this.borderColor, this.font, this.bg);

    ctx.save();
    ctx.font = this.font;

    // Draw title
    let contentY = ry + pad;
    if (this.title) {
      ctx.fillStyle = this.borderColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(this.title, rx + totalW / 2, contentY);
      contentY += lh + 4;
    }

    const gridStartX = rx + pad;
    const gridStartY = contentY;

    // Draw cells
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const idx = row * this.cols + col;
        if (idx >= this.cells.length) continue;

        const cell = this.cells[idx];
        const cx = gridStartX + col * this.cellWidth;
        const cy = gridStartY + row * this.cellHeight;
        const isSelected = idx === this.selectedIndex;

        // Cell background
        if (isSelected && this.selectedBg) {
          ctx.fillStyle = this.selectedBg;
          ctx.fillRect(cx, cy, this.cellWidth, this.cellHeight);
        } else if (cell.bg) {
          ctx.fillStyle = cell.bg;
          ctx.fillRect(cx, cy, this.cellWidth, this.cellHeight);
        }

        // Cell border
        ctx.strokeStyle = isSelected ? this.selectedBorderColor : this.borderColor;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(cx, cy, this.cellWidth, this.cellHeight);

        // Cell content
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const centerX = cx + this.cellWidth / 2;
        const centerY = cy + this.cellHeight / 2;

        if (cell.empty) {
          ctx.fillStyle = this.emptyColor;
          ctx.fillText(this.emptyChar, centerX, centerY);
        } else {
          const display = cell.icon ?? cell.text ?? "";
          ctx.fillStyle = cell.color ?? this.color;
          ctx.fillText(display, centerX, centerY);
        }
      }
    }

    ctx.restore();
  }

  /** True if (x, y) falls inside the last drawn grid panel (including title). */
  isPointInside(x: number, y: number): boolean {
    return (
      x >= this._lastX &&
      x <= this._lastX + this._lastW &&
      y >= this._lastY &&
      y <= this._lastY + this._lastH
    );
  }

  /** Returns the cell index under (x, y), or null if outside the cell grid. */
  getHoveredItem(x: number, y: number): number | null {
    if (!this.isPointInside(x, y)) return null;
    const pad = this.padding;
    const lh = _lineHeight(this.font);
    const titleH = this.title ? lh + 4 : 0;
    const gridStartX = this._lastX + pad;
    const gridStartY = this._lastY + pad + titleH;
    const relX = x - gridStartX;
    const relY = y - gridStartY;
    if (relX < 0 || relY < 0) return null;
    const col = Math.floor(relX / this.cellWidth);
    const row = Math.floor(relY / this.cellHeight);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    const idx = row * this.cols + col;
    if (idx >= this.cells.length) return null;
    return idx;
  }

  reset(): void {
    this.selectedIndex = 0;
    this.confirmed = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. UITooltip
// ═══════════════════════════════════════════════════════════════════

export interface UITooltipOpts {
  font?: string;
  color?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  maxWidth?: number;
  padding?: number;
  offset?: { x: number; y: number };
}

export class UITooltip {
  visible = false;
  text = "";

  private font: string;
  private color: string;
  private border: BorderStyle;
  private borderColor: string;
  private bg: string;
  private maxWidth: number;
  private padding: number;
  private offset: { x: number; y: number };

  // Position where tooltip should appear
  private _targetX = 0;
  private _targetY = 0;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;

  constructor(opts?: UITooltipOpts) {
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.border = opts?.border ?? "single";
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.maxWidth = opts?.maxWidth ?? 250;
    this.padding = opts?.padding ?? 8;
    this.offset = opts?.offset ?? { x: 12, y: 12 };
  }

  show(text: string, x: number, y: number): void {
    this.visible = true;
    this.text = text;
    this._targetX = x;
    this._targetY = y;
  }

  hide(): void {
    this.visible = false;
  }

  /** Convenience: show tooltip when mouse is over a rectangular region. */
  updateHover(
    engine: Engine,
    hitX: number,
    hitY: number,
    hitW: number,
    hitH: number,
    text: string,
  ): void {
    const mx = engine.mouse.x;
    const my = engine.mouse.y;
    if (mx >= hitX && mx <= hitX + hitW && my >= hitY && my <= hitY + hitH) {
      this.show(text, mx, my);
    } else {
      this.hide();
    }
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number): void {
    if (!this.visible || !this.text) return;

    const pad = this.padding;
    const lh = _lineHeight(this.font);

    const lines = layoutTextBlock(this.text, this.font, this.maxWidth, lh);
    let contentW = 0;
    for (const l of lines) {
      if (l.width > contentW) contentW = l.width;
    }
    contentW = Math.min(Math.ceil(contentW), this.maxWidth);
    const contentH = lines.length * lh;

    const totalW = contentW + pad * 2;
    const totalH = contentH + pad * 2;

    // Position near target with offset, auto-flip to stay on screen
    let tx = this._targetX + this.offset.x;
    let ty = this._targetY + this.offset.y;

    // Flip horizontally if extending beyond right edge
    if (tx + totalW > screenW) {
      tx = this._targetX - this.offset.x - totalW;
    }
    // Flip vertically if extending beyond bottom edge
    if (ty + totalH > screenH) {
      ty = this._targetY - this.offset.y - totalH;
    }
    // Clamp to screen
    if (tx < 0) tx = 0;
    if (ty < 0) ty = 0;

    this._lastX = tx;
    this._lastY = ty;
    this._lastW = totalW;
    this._lastH = totalH;

    // Draw background + border
    _drawBorder(ctx, tx, ty, totalW, totalH, this.border, this.borderColor, this.font, this.bg);

    // Draw text
    ctx.save();
    ctx.font = this.font;
    ctx.fillStyle = this.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i].text, tx + pad, ty + pad + i * lh);
    }

    ctx.restore();
  }

  /** True if (x, y) falls inside the last drawn tooltip rectangle. */
  isPointInside(x: number, y: number): boolean {
    if (!this.visible) return false;
    return (
      x >= this._lastX &&
      x <= this._lastX + this._lastW &&
      y >= this._lastY &&
      y <= this._lastY + this._lastH
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. UITabs
// ═══════════════════════════════════════════════════════════════════

export interface UITabDef {
  label: string;
  render: (
    ctx: CanvasRenderingContext2D,
    contentX: number,
    contentY: number,
    contentW: number,
    contentH: number,
  ) => void;
}

export interface UITabsOpts {
  font?: string;
  color?: string;
  activeColor?: string;
  border?: BorderStyle;
  borderColor?: string;
  bg?: string;
  activeTabBg?: string;
  padding?: number;
  title?: string;
  anchor?: Anchor;
}

export class UITabs {
  tabs: UITabDef[];
  activeIndex = 0;
  active = true;
  width: number;
  height: number;

  private font: string;
  private color: string;
  private activeColor: string;
  private border: BorderStyle;
  private borderColor: string;
  private bg: string;
  private activeTabBg: string;
  private padding: number;
  private title: string | undefined;
  private anchor: Anchor;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;

  // Tab positions for click detection
  private _tabPositions: { x: number; w: number }[] = [];

  constructor(tabs: UITabDef[], width: number, height: number, opts?: UITabsOpts) {
    this.tabs = tabs;
    this.width = width;
    this.height = height;
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.activeColor = opts?.activeColor ?? "#00ff88";
    this.border = opts?.border ?? "single";
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.activeTabBg = opts?.activeTabBg ?? "rgba(0,255,136,0.15)";
    this.padding = opts?.padding ?? 8;
    this.title = opts?.title;
    this.anchor = opts?.anchor ?? "topLeft";
  }

  get activeTab(): UITabDef {
    return this.tabs[this.activeIndex];
  }

  switchTo(index: number): void {
    if (index >= 0 && index < this.tabs.length) {
      this.activeIndex = index;
    }
  }

  update(engine: Engine): void {
    if (!this.active) return;

    const kb = engine.keyboard;

    // Tab / Shift+Tab or ArrowRight / ArrowLeft for tab switching
    if (kb.pressed("Tab") && !kb.held("ShiftLeft") && !kb.held("ShiftRight")) {
      this.activeIndex = (this.activeIndex + 1) % this.tabs.length;
    }
    if (kb.pressed("Tab") && (kb.held("ShiftLeft") || kb.held("ShiftRight"))) {
      this.activeIndex = (this.activeIndex - 1 + this.tabs.length) % this.tabs.length;
    }
    if (kb.pressed("ArrowRight")) {
      this.activeIndex = (this.activeIndex + 1) % this.tabs.length;
    }
    if (kb.pressed("ArrowLeft")) {
      this.activeIndex = (this.activeIndex - 1 + this.tabs.length) % this.tabs.length;
    }

    // Mouse click on tab labels
    if (engine.mouse.justDown && this._tabPositions.length > 0) {
      const mx = engine.mouse.x;
      const my = engine.mouse.y;
      const lh = _lineHeight(this.font);
      const tabBarY = this._lastY + this.padding + (this.title ? lh + 4 : 0);

      if (my >= tabBarY && my <= tabBarY + lh) {
        for (let i = 0; i < this._tabPositions.length; i++) {
          const tp = this._tabPositions[i];
          if (mx >= tp.x && mx <= tp.x + tp.w) {
            this.activeIndex = i;
            break;
          }
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const pad = this.padding;
    const lh = _lineHeight(this.font);
    const totalW = this.width;
    const totalH = this.height;

    const resolved = resolveAnchor(x, y, totalW, totalH, this.anchor);
    const rx = resolved.x;
    const ry = resolved.y;

    this._lastX = rx;
    this._lastY = ry;
    this._lastW = totalW;
    this._lastH = totalH;

    // Draw outer border + background
    _drawBorder(ctx, rx, ry, totalW, totalH, this.border, this.borderColor, this.font, this.bg);

    ctx.save();
    ctx.font = this.font;

    let contentY = ry + pad;

    // Draw title
    if (this.title) {
      ctx.fillStyle = this.borderColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(this.title, rx + totalW / 2, contentY);
      contentY += lh + 4;
    }

    // Draw tab bar
    const tabBarY = contentY;
    const cw = _charWidth(ctx, this.font);
    this._tabPositions = [];

    let tabX = rx + pad;
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      const label = ` ${tab.label} `;
      const labelW = measureLineWidth(label, this.font);
      const isActive = i === this.activeIndex;

      // Tab background
      if (isActive) {
        ctx.fillStyle = this.activeTabBg;
        ctx.fillRect(tabX, tabBarY, labelW, lh);
      }

      // Tab label
      ctx.fillStyle = isActive ? this.activeColor : this.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(label, tabX, tabBarY);

      this._tabPositions.push({ x: tabX, w: labelW });
      tabX += labelW + cw; // gap between tabs
    }

    // Separator line under tabs
    const sepY = tabBarY + lh;
    if (this.border !== "none") {
      const b = BORDERS[this.border];
      ctx.fillStyle = this.borderColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const innerStart = rx + pad;
      const innerEnd = rx + totalW - pad;
      const hCount = Math.floor((innerEnd - innerStart) / cw);

      for (let i = 0; i < hCount; i++) {
        const sx = innerStart + i * cw;
        // Leave gap under active tab
        const activeTabPos = this._tabPositions[this.activeIndex];
        if (activeTabPos && sx >= activeTabPos.x && sx < activeTabPos.x + activeTabPos.w) {
          continue; // gap under active tab
        }
        ctx.fillText(b.h, sx, sepY);
      }
    }

    // Content area
    const contentAreaY = sepY + lh;
    const contentAreaX = rx + pad;
    const contentAreaW = totalW - pad * 2;
    const contentAreaH = totalH - (contentAreaY - ry) - pad;

    // Clip content area and call render callback
    ctx.save();
    ctx.beginPath();
    ctx.rect(contentAreaX, contentAreaY, contentAreaW, contentAreaH);
    ctx.clip();

    if (this.tabs[this.activeIndex]) {
      this.tabs[this.activeIndex].render(
        ctx,
        contentAreaX,
        contentAreaY,
        contentAreaW,
        contentAreaH,
      );
    }

    ctx.restore(); // undo clip
    ctx.restore(); // undo outer save
  }

  /** True if (x, y) falls inside the last drawn tabs panel. */
  isPointInside(x: number, y: number): boolean {
    return (
      x >= this._lastX &&
      x <= this._lastX + this._lastW &&
      y >= this._lastY &&
      y <= this._lastY + this._lastH
    );
  }

  reset(): void {
    this.activeIndex = 0;
  }
}
