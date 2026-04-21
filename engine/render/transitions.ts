/**
 * Screen transitions — fade between scenes.
 *
 * Usage:
 *   engine.loadScene('play', { transition: 'fade', duration: 0.5 })
 *
 * Or manually:
 *   const t = new Transition('fade', 0.5)
 *   t.start()
 *   // in render: t.render(ctx, width, height)
 */

export type TransitionType = "fade" | "fadeWhite" | "wipe" | "dissolve" | "scanline" | "none";

/** Safety cap so a hung scene loader doesn't freeze the transition forever (ms). */
const MIDPOINT_TIMEOUT_MS = 5000;

export class Transition {
  type: TransitionType;
  duration: number;
  elapsed = 0;
  active = false;
  phase: "out" | "in" = "out"; // 'out' = fading to black, 'in' = fading from black
  error: Error | null = null;
  private onMidpoint?: () => void | Promise<void>;
  private midpointPending = false;
  private midpointTimeoutMs: number;

  constructor(
    type: TransitionType = "fade",
    duration = 0.5,
    midpointTimeoutMs = MIDPOINT_TIMEOUT_MS,
  ) {
    this.type = type;
    this.duration = duration;
    this.midpointTimeoutMs = midpointTimeoutMs;
  }

  /** Start a transition. onMidpoint fires at the halfway point (swap scene here). */
  start(onMidpoint?: () => void | Promise<void>): void {
    this.active = true;
    this.elapsed = 0;
    this.phase = "out";
    this.midpointPending = false;
    this.error = null;
    this.onMidpoint = onMidpoint;
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.midpointPending) return;
    this.elapsed += dt;

    if (this.phase === "out" && this.elapsed >= this.duration) {
      const result = this.onMidpoint?.();
      if (result instanceof Promise) {
        this.midpointPending = true;
        const timeout = new Promise<void>((resolve) =>
          setTimeout(() => {
            if (this.midpointPending) {
              console.warn(
                `[transition] onMidpoint exceeded ${this.midpointTimeoutMs}ms — forcing phase=in`,
              );
            }
            resolve();
          }, this.midpointTimeoutMs),
        );
        Promise.race([
          result.catch((err) => {
            console.error("[transition] onMidpoint rejected:", err);
            this.error = err instanceof Error ? err : new Error(String(err));
          }),
          timeout,
        ]).then(() => {
          this.midpointPending = false;
          this.phase = "in";
          this.elapsed = 0;
        });
      } else {
        this.phase = "in";
        this.elapsed = 0;
      }
    }

    if (this.phase === "in" && this.elapsed >= this.duration) {
      this.active = false;
    }
  }

  /** Render the transition overlay. Call AFTER scene render. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.active) return;

    const t = Math.min(this.elapsed / this.duration, 1);
    let alpha: number;

    if (this.phase === "out") {
      alpha = t; // 0 → 1
    } else {
      alpha = 1 - t; // 1 → 0
    }

    ctx.save();
    switch (this.type) {
      case "fade":
      case "fadeWhite": {
        const rgb = this.type === "fade" ? "0, 0, 0" : "255, 255, 255";
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case "wipe":
        ctx.fillStyle = "#000000";
        if (this.phase === "out") {
          ctx.fillRect(0, 0, width * t, height);
        } else {
          ctx.fillRect(width * (1 - t), 0, width * t, height);
        }
        break;

      case "dissolve": {
        ctx.font = '16px "Fira Code", monospace';
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillStyle = "#000000";
        const dChars = "░▒▓█╬╠╣╦╩╗╔╚╝─│┌┐└┘";
        const cellW = 14;
        const cellH = 18;
        const gridW = Math.ceil(width / cellW);
        const gridH = Math.ceil(height / cellH);

        for (let gx = 0; gx < gridW; gx++) {
          for (let gy = 0; gy < gridH; gy++) {
            const seed = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
            const threshold = Math.abs(seed % 1);
            if (threshold < alpha) {
              const ci = Math.abs(Math.floor(Math.sin(seed * 2.1) * dChars.length)) % dChars.length;
              ctx.globalAlpha = Math.min(1, (alpha - threshold) * 3);
              ctx.fillText(dChars[ci], gx * cellW, gy * cellH);
            }
          }
        }
        break;
      }

      case "scanline": {
        ctx.fillStyle = "#000000";
        const lineH = 3;
        const numLines = Math.ceil(height / lineH);
        for (let i = 0; i < numLines; i++) {
          const lineT = alpha * 1.5 - (i / numLines) * 0.5;
          if (lineT > 0) {
            ctx.globalAlpha = Math.min(1, lineT * 2);
            ctx.fillRect(0, i * lineH, width, lineH);
          }
        }
        break;
      }

      case "none":
        break;
    }
    ctx.restore();
  }
}
