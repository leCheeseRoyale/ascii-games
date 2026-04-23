/**
 * UITextField — canvas-based text input widget.
 *
 * Uses Pretext for pixel-accurate cursor positioning and click-to-place.
 * Supports text selection, clipboard copy/paste, and a hidden DOM input
 * fallback for mobile on-screen keyboards.
 *
 * Usage:
 *   const field = new UITextField({ width: 240, placeholder: "Name..." });
 *   field.update(engine);
 *   field.draw(engine.ui, x, y);
 *   if (field.confirmed) handle(field.value);
 */

import type { Engine } from "../core/engine";
import type { CanvasUI } from "./canvas-ui";
import { measureLineWidth } from "./text-layout";

const DEFAULT_FONT = '16px "Fira Code", monospace';
const DEFAULT_COLOR = "#e0e0e0";
const DEFAULT_BG = "rgba(0,0,0,0.6)";
const DEFAULT_BORDER_COLOR = "#888888";
const DEFAULT_CURSOR_COLOR = "#00ff88";
const DEFAULT_SELECTION_BG = "rgba(0, 255, 136, 0.35)";

export interface UITextFieldOpts {
  width?: number;
  font?: string;
  color?: string;
  bg?: string;
  borderColor?: string;
  cursorColor?: string;
  selectionBg?: string;
  placeholder?: string;
  maxLength?: number;
  /** Initial value. Default "". */
  value?: string;
}

let sharedHiddenInput: HTMLInputElement | null = null;

function getHiddenInput(): HTMLInputElement {
  if (!sharedHiddenInput) {
    sharedHiddenInput = document.createElement("input");
    sharedHiddenInput.type = "text";
    sharedHiddenInput.style.position = "fixed";
    sharedHiddenInput.style.opacity = "0";
    sharedHiddenInput.style.pointerEvents = "none";
    sharedHiddenInput.style.left = "-9999px";
    sharedHiddenInput.style.top = "-9999px";
    sharedHiddenInput.style.width = "0px";
    sharedHiddenInput.style.height = "0px";
    sharedHiddenInput.style.fontSize = "16px"; // prevent zoom on iOS
    document.body.appendChild(sharedHiddenInput);
  }
  return sharedHiddenInput;
}

export class UITextField {
  value: string;
  cursor = 0;
  active = false;
  confirmed = false;
  cancelled = false;

  private width: number;
  private font: string;
  private color: string;
  private bg: string;
  private borderColor: string;
  private cursorColor: string;
  private selectionBg: string;
  private placeholder: string | undefined;
  private maxLength: number | undefined;

  // Cursor blink
  private blinkAcc = 0;
  private blinkVisible = true;

  // Selection
  private selStart = -1;
  private selEnd = -1;
  private isDragging = false;

  // Hit-test bounds (set during draw)
  private _lastX = 0;
  private _lastY = 0;
  private _lastH = 0;
  private _innerX = 0;

  constructor(opts?: UITextFieldOpts) {
    this.width = opts?.width ?? 200;
    this.font = opts?.font ?? DEFAULT_FONT;
    this.color = opts?.color ?? DEFAULT_COLOR;
    this.bg = opts?.bg ?? DEFAULT_BG;
    this.borderColor = opts?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.cursorColor = opts?.cursorColor ?? DEFAULT_CURSOR_COLOR;
    this.selectionBg = opts?.selectionBg ?? DEFAULT_SELECTION_BG;
    this.placeholder = opts?.placeholder;
    this.maxLength = opts?.maxLength;
    this.value = opts?.value ?? "";
    this.cursor = this.value.length;
  }

  /** Handle keyboard input and click-to-focus. Call once per frame. */
  update(engine: Engine): void {
    this.confirmed = false;
    this.cancelled = false;

    // Click to focus / blur / place cursor
    if (engine.mouse.justDown) {
      const inside = this.isPointInside(engine.mouse.x, engine.mouse.y);
      const wasActive = this.active;
      this.active = inside;
      if (inside) {
        const shift = engine.keyboard.held("ShiftLeft") || engine.keyboard.held("ShiftRight");
        this._placeCursorAt(engine.mouse.x, shift);
        this.isDragging = true;
        if (!wasActive) {
          this._focusHiddenInput();
        }
      } else if (wasActive) {
        this._blurHiddenInput();
        this._clearSelection();
      }
    }

    if (engine.mouse.down && this.isDragging && this.active) {
      this._placeCursorAt(engine.mouse.x, true);
    }

    if (engine.mouse.justUp) {
      this.isDragging = false;
    }

    if (!this.active) return;

    // Sync from hidden input (catches mobile keyboard input)
    this._syncFromHiddenInput();

    // Cursor blink
    this.blinkAcc += engine.time.dt;
    if (this.blinkAcc >= 0.5) {
      this.blinkAcc -= 0.5;
      this.blinkVisible = !this.blinkVisible;
    }

    // Process typed characters
    for (const ch of engine.keyboard.typedChars) {
      if (ch === "\b") {
        this._handleBackspace();
      } else if (ch === "\r") {
        this.confirmed = true;
        this.active = false;
        this._blurHiddenInput();
      } else if (ch === "\u001B") {
        this.cancelled = true;
        this.active = false;
        this._blurHiddenInput();
        this._clearSelection();
      } else if (ch >= " " || ch === "\t") {
        this._insertText(ch);
      }
    }

    // Arrow keys with shift selection
    const shiftHeld = engine.keyboard.held("ShiftLeft") || engine.keyboard.held("ShiftRight");
    if (engine.keyboard.pressed("ArrowLeft")) {
      if (shiftHeld) {
        if (this.selStart === -1) this.selStart = this.cursor;
        this.cursor = Math.max(0, this.cursor - 1);
        this.selEnd = this.cursor;
      } else {
        if (this.selStart !== -1) {
          this.cursor = Math.min(this.selStart, this.selEnd);
          this._clearSelection();
        } else {
          this.cursor = Math.max(0, this.cursor - 1);
        }
      }
      this.blinkVisible = true;
      this.blinkAcc = 0;
    }
    if (engine.keyboard.pressed("ArrowRight")) {
      if (shiftHeld) {
        if (this.selStart === -1) this.selStart = this.cursor;
        this.cursor = Math.min(this.value.length, this.cursor + 1);
        this.selEnd = this.cursor;
      } else {
        if (this.selStart !== -1) {
          this.cursor = Math.max(this.selStart, this.selEnd);
          this._clearSelection();
        } else {
          this.cursor = Math.min(this.value.length, this.cursor + 1);
        }
      }
      this.blinkVisible = true;
      this.blinkAcc = 0;
    }
    if (engine.keyboard.pressed("Home")) {
      if (shiftHeld) {
        if (this.selStart === -1) this.selStart = this.cursor;
        this.cursor = 0;
        this.selEnd = this.cursor;
      } else {
        this.cursor = 0;
        this._clearSelection();
      }
      this.blinkVisible = true;
      this.blinkAcc = 0;
    }
    if (engine.keyboard.pressed("End")) {
      if (shiftHeld) {
        if (this.selStart === -1) this.selStart = this.cursor;
        this.cursor = this.value.length;
        this.selEnd = this.cursor;
      } else {
        this.cursor = this.value.length;
        this._clearSelection();
      }
      this.blinkVisible = true;
      this.blinkAcc = 0;
    }

    // Clipboard shortcuts
    if (
      engine.keyboard.held("ControlLeft") ||
      engine.keyboard.held("ControlRight") ||
      engine.keyboard.held("MetaLeft") ||
      engine.keyboard.held("MetaRight")
    ) {
      if (engine.keyboard.pressed("KeyA")) {
        this.selStart = 0;
        this.selEnd = this.value.length;
        this.cursor = this.value.length;
      }
      if (engine.keyboard.pressed("KeyC")) {
        this._copySelection();
      }
      if (engine.keyboard.pressed("KeyX")) {
        this._copySelection();
        this._deleteSelection();
      }
      if (engine.keyboard.pressed("KeyV")) {
        // Paste is handled by the hidden input + input event
      }
    }

    // Push current value to hidden input so mobile backspace works correctly
    this._syncToHiddenInput();
  }

  /** Queue draw commands into a CanvasUI instance. */
  draw(ui: CanvasUI, x: number, y: number): void {
    const fontSize = parseFloat(this.font) || 16;
    const padding = 8;
    const h = fontSize * 1.4 + padding * 2;

    this._lastX = x;
    this._lastY = y;
    this._lastH = h;
    this._innerX = x + padding;

    ui._queue.push(() => {
      const ctx = ui._ctx;
      ctx.save();

      // Background
      ctx.fillStyle = this.bg;
      ctx.fillRect(x, y, this.width, h);

      // Border (highlight when active)
      ctx.strokeStyle = this.active ? this.cursorColor : this.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, this.width - 1, h - 1);

      // Clip text to field interior
      ctx.beginPath();
      ctx.rect(x + padding, y + padding, this.width - padding * 2, h - padding * 2);
      ctx.clip();

      const textY = y + padding + fontSize * 0.1;
      const innerX = x + padding;

      if (this.value.length === 0 && this.placeholder) {
        ctx.font = this.font;
        ctx.fillStyle = "#666666";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(this.placeholder, innerX, textY);
      } else {
        // Selection highlight
        if (this.selStart !== -1 && this.selEnd !== -1) {
          const s = Math.min(this.selStart, this.selEnd);
          const e = Math.max(this.selStart, this.selEnd);
          const selX = innerX + measureLineWidth(this.value.slice(0, s), this.font);
          const selW = measureLineWidth(this.value.slice(s, e), this.font);
          ctx.fillStyle = this.selectionBg;
          ctx.fillRect(selX, textY, selW, fontSize);
        }

        ctx.font = this.font;
        ctx.fillStyle = this.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(this.value, innerX, textY);
      }

      // Cursor
      if (this.active && this.blinkVisible && this.selStart === -1) {
        const cursorX = innerX + measureLineWidth(this.value.slice(0, this.cursor), this.font);
        ctx.fillStyle = this.cursorColor;
        ctx.fillRect(cursorX, textY, 2, fontSize);
      }

      ctx.restore();
    });
  }

  /** Set value programmatically and move cursor to end. */
  setValue(v: string): void {
    this.value = v;
    this.cursor = v.length;
    this._clearSelection();
  }

  /** True if (mx, my) falls inside the field bounds. */
  isPointInside(mx: number, my: number): boolean {
    return (
      mx >= this._lastX &&
      mx <= this._lastX + this.width &&
      my >= this._lastY &&
      my <= this._lastY + this._lastH
    );
  }

  private _placeCursorAt(mouseX: number, extendSelection: boolean): void {
    const relX = mouseX - this._innerX;
    let bestPos = 0;
    let bestDist = Infinity;

    for (let i = 0; i <= this.value.length; i++) {
      const w = measureLineWidth(this.value.slice(0, i), this.font);
      const dist = Math.abs(w - relX);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = i;
      }
    }

    if (extendSelection) {
      if (this.selStart === -1) this.selStart = this.cursor;
      this.cursor = bestPos;
      this.selEnd = this.cursor;
    } else {
      this.cursor = bestPos;
      this._clearSelection();
    }
    this.blinkVisible = true;
    this.blinkAcc = 0;
  }

  private _clearSelection(): void {
    this.selStart = -1;
    this.selEnd = -1;
  }

  private _hasSelection(): boolean {
    return this.selStart !== -1 && this.selEnd !== -1 && this.selStart !== this.selEnd;
  }

  private _deleteSelection(): void {
    if (!this._hasSelection()) return;
    const s = Math.min(this.selStart, this.selEnd);
    const e = Math.max(this.selStart, this.selEnd);
    this.value = this.value.slice(0, s) + this.value.slice(e);
    this.cursor = s;
    this._clearSelection();
  }

  private _selectedText(): string {
    if (!this._hasSelection()) return "";
    const s = Math.min(this.selStart, this.selEnd);
    const e = Math.max(this.selStart, this.selEnd);
    return this.value.slice(s, e);
  }

  private _handleBackspace(): void {
    if (this._hasSelection()) {
      this._deleteSelection();
    } else if (this.cursor > 0) {
      this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
      this.cursor--;
    }
  }

  private _insertText(ch: string): void {
    if (this._hasSelection()) {
      this._deleteSelection();
    }
    if (this.maxLength == null || this.value.length < this.maxLength) {
      this.value = this.value.slice(0, this.cursor) + ch + this.value.slice(this.cursor);
      this.cursor++;
    }
  }

  private _copySelection(): void {
    const text = this._selectedText();
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  private _focusHiddenInput(): void {
    const input = getHiddenInput();
    input.value = this.value;
    requestAnimationFrame(() => input.focus());
  }

  private _blurHiddenInput(): void {
    const input = getHiddenInput();
    input.blur();
  }

  private _syncFromHiddenInput(): void {
    const input = getHiddenInput();
    if (input.value !== this.value) {
      this.value = input.value;
      this.cursor = this.value.length;
      this._clearSelection();
    }
  }

  private _syncToHiddenInput(): void {
    const input = getHiddenInput();
    if (input.value !== this.value) {
      input.value = this.value;
    }
  }
}
