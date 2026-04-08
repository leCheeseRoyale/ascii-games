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

export type TransitionType = "fade" | "fadeWhite" | "wipe" | "none";

export class Transition {
  type: TransitionType;
  duration: number;
  elapsed = 0;
  active = false;
  phase: "out" | "in" = "out"; // 'out' = fading to black, 'in' = fading from black
  private onMidpoint?: () => void | Promise<void>;
  private midpointPending = false;

  constructor(type: TransitionType = "fade", duration = 0.5) {
    this.type = type;
    this.duration = duration;
  }

  /** Start a transition. onMidpoint fires at the halfway point (swap scene here). */
  start(onMidpoint?: () => void | Promise<void>): void {
    this.active = true;
    this.elapsed = 0;
    this.phase = "out";
    this.midpointPending = false;
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
        result.then(() => {
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

    switch (this.type) {
      case "fade":
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        break;

      case "fadeWhite":
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        break;

      case "wipe":
        ctx.save();
        ctx.fillStyle = "#000000";
        if (this.phase === "out") {
          ctx.fillRect(0, 0, width * t, height);
        } else {
          ctx.fillRect(width * (1 - t), 0, width * t, height);
        }
        ctx.restore();
        break;

      case "none":
        break;
    }
  }
}
