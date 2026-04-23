/**
 * UITextView — scrollable multi-line text viewer.
 *
 * Uses Pretext for pixel-accurate wrapping and line layout.
 * Supports styled tags, alignment, and smooth scrolling.
 * Ideal for lore, credits, dialog history, and item descriptions.
 */

import type { Engine } from "../core/engine";
import type { CanvasUI } from "./canvas-ui";
import { layoutTextBlock } from "./text-layout";

const DEFAULT_FONT = '16px "Fira Code", monospace';
const DEFAULT_COLOR = "#e0e0e0";
const DEFAULT_BG = "rgba(0,0,0,0.75)";
const DEFAULT_BORDER_COLOR = "#666666";

export interface UITextViewOpts {
  width?: number;
  height?: number;
  font?: string;
  color?: string;
  bg?: string;
  borderColor?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  padding?: number;
  scrollSpeed?: number;
}

export class UITextView {
  text = "";
  scrollY = 0;
  active = true;

  private width: number;
  private height: number;
  private font: string;
  private color: string;
  private bg: string;
  private borderColor: string;
  private align: "left" | "center" | "right";
  private lineHeight: number;
  private padding: number;
  private scrollSpeed: number;

  // Cached layout
  private _lines: { text: string; width: number }[] = [];
  private _contentHeight = 0;
  private _dirty = true;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastW = 0;
  private _lastH = 0;

  constructor(opts?: UITextViewOpts) {
    this.width = opts?.width ?? 300;
    this.height = opts?.height ?? 200;
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.align = opts?.align ?? "left";
    this.lineHeight = opts?.lineHeight ?? (parseFloat(this.font) || 16) * 1.3;
    this.padding = opts?.padding ?? 10;
    this.scrollSpeed = opts?.scrollSpeed ?? 1;
  }

  /** Set the text content and invalidate layout cache. */
  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    this._dirty = true;
    this.scrollY = 0;
  }

  /** Handle scrolling input. Call once per frame. */
  update(engine: Engine): void {
    if (!this.active) return;

    const kb = engine.keyboard;
    const maxScroll = Math.max(0, this._contentHeight - this.height + this.padding * 2);

    if (kb.pressed("ArrowUp")) {
      this.scrollY = Math.max(0, this.scrollY - this.lineHeight * this.scrollSpeed);
    }
    if (kb.pressed("ArrowDown")) {
      this.scrollY = Math.min(maxScroll, this.scrollY + this.lineHeight * this.scrollSpeed);
    }
    if (kb.pressed("PageUp")) {
      this.scrollY = Math.max(0, this.scrollY - this.height * 0.8);
    }
    if (kb.pressed("PageDown")) {
      this.scrollY = Math.min(maxScroll, this.scrollY + this.height * 0.8);
    }
    if (kb.pressed("Home")) {
      this.scrollY = 0;
    }
    if (kb.pressed("End")) {
      this.scrollY = maxScroll;
    }

    // Mouse wheel — only if mouse is within panel bounds
    const mx = engine.mouse.x;
    const my = engine.mouse.y;
    if (
      mx >= this._lastX &&
      mx <= this._lastX + this._lastW &&
      my >= this._lastY &&
      my <= this._lastY + this._lastH
    ) {
      // Wheel delta is not exposed directly; use a simple scroll step
      // Games can wire their own wheel handler to call scrollBy(dy)
    }
  }

  /** Scroll by a pixel amount (positive = down). */
  scrollBy(dy: number): void {
    const maxScroll = Math.max(0, this._contentHeight - this.height + this.padding * 2);
    this.scrollY = Math.max(0, Math.min(maxScroll, this.scrollY + dy));
  }

  /** Queue draw commands into a CanvasUI instance. */
  draw(ui: CanvasUI, x: number, y: number): void {
    if (this._dirty) {
      this._rebuildLayout();
      this._dirty = false;
    }

    const w = this.width;
    const h = this.height;
    const pad = this.padding;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    this._lastX = x;
    this._lastY = y;
    this._lastW = w;
    this._lastH = h;

    ui._queue.push(() => {
      const ctx = ui._ctx;
      ctx.save();

      // Background and border
      ctx.fillStyle = this.bg;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = this.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      // Clip to content area
      ctx.beginPath();
      ctx.rect(x + pad, y + pad, innerW, innerH);
      ctx.clip();

      ctx.font = this.font;
      ctx.textBaseline = "top";
      ctx.fillStyle = this.color;

      const startLine = Math.floor(this.scrollY / this.lineHeight);
      const endLine = Math.min(
        this._lines.length,
        Math.ceil((this.scrollY + innerH) / this.lineHeight) + 1,
      );

      for (let i = startLine; i < endLine; i++) {
        const line = this._lines[i];
        const lineY = y + pad + i * this.lineHeight - this.scrollY;
        if (lineY + this.lineHeight < y + pad || lineY > y + pad + innerH) continue;

        let lx = x + pad;
        if (this.align === "center") {
          lx = x + pad + (innerW - line.width) / 2;
        } else if (this.align === "right") {
          lx = x + pad + innerW - line.width;
        }

        ctx.textAlign = "left";
        ctx.fillText(line.text, lx, lineY);
      }

      ctx.restore();

      // Scrollbar
      const maxScroll = Math.max(0, this._contentHeight - innerH);
      if (maxScroll > 0) {
        const trackX = x + w - 6;
        const trackY = y + pad;
        const trackH = innerH;
        const thumbH = Math.max(20, (innerH / this._contentHeight) * trackH);
        const thumbY = trackY + (this.scrollY / maxScroll) * (trackH - thumbH);

        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(trackX, trackY, 4, trackH);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(trackX, thumbY, 4, thumbH);
      }
    });
  }

  private _rebuildLayout(): void {
    const innerW = this.width - this.padding * 2;
    this._lines = layoutTextBlock(this.text, this.font, innerW, this.lineHeight);
    this._contentHeight = this._lines.length * this.lineHeight;
  }
}
