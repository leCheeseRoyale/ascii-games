/**
 * Toast notification system — floating text that fades out.
 * Usage: toast.show('+100', { color: '#ffcc00', y: 300 })
 */

interface ToastMessage {
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
  font: string;
  vy: number;
}

export class ToastManager {
  private toasts: ToastMessage[] = [];

  /**
   * Show a toast notification.
   * @param text Text to display
   * @param opts Position, color, duration, font
   */
  show(
    text: string,
    opts: {
      x?: number;
      y?: number;
      color?: string;
      duration?: number;
      font?: string;
      vy?: number;
    } = {},
  ): void {
    this.toasts.push({
      text,
      x: opts.x ?? -1, // -1 means "center of screen" — resolved at render time
      y: opts.y ?? -1,
      color: opts.color ?? "#ffffff",
      life: opts.duration ?? 1.5,
      maxLife: opts.duration ?? 1.5,
      font: opts.font ?? '16px "Fira Code", monospace',
      vy: opts.vy ?? -30,
    });
  }

  /** Show a toast at an entity's position. */
  showAt(
    text: string,
    entityX: number,
    entityY: number,
    opts: {
      color?: string;
      duration?: number;
      font?: string;
    } = {},
  ): void {
    this.show(text, { ...opts, x: entityX, y: entityY - 20 });
  }

  update(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) {
        this.toasts.splice(i, 1);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, screenW: number, screenH: number): void {
    for (const t of this.toasts) {
      const alpha = Math.min(1, t.life / (t.maxLife * 0.3)); // fade in last 30%
      const x = t.x === -1 ? screenW / 2 : t.x;
      const y = t.y === -1 ? screenH / 3 : t.y;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = t.font;
      ctx.fillStyle = t.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.text, x, y);
      ctx.restore();
    }
  }

  clear(): void {
    this.toasts.length = 0;
  }
}
