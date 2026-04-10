/**
 * Debug overlay — collider outlines, entity inspector, error display.
 * Toggle with engine.debug.enabled or backtick key.
 */

import type { Entity } from "@shared/types";
import type { GameWorld } from "../ecs/world";
import type { Camera } from "./camera";

export class DebugOverlay {
  enabled = false;
  private lastError: string | null = null;
  private errorTime = 0;

  /** Record an error to display on screen. */
  showError(message: string): void {
    this.lastError = message;
    this.errorTime = 5; // show for 5 seconds
  }

  update(dt: number): void {
    if (this.errorTime > 0) {
      this.errorTime -= dt;
      if (this.errorTime <= 0) this.lastError = null;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    camera: Camera,
    w: number,
    h: number,
  ): void {
    // Always render errors, even if debug mode is off
    if (this.lastError) {
      this.renderError(ctx, w, h);
    }

    if (!this.enabled) return;

    ctx.save();
    // Apply camera transform (same as main renderer)
    ctx.translate(-camera.x + w / 2, -camera.y + h / 2);
    ctx.translate(camera.shakeX, camera.shakeY);
    if (camera.zoom !== 1) {
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
    }

    this.renderColliders(ctx, world);
    ctx.restore();

    this.renderEntityCount(ctx, world, w, h);
  }

  private renderColliders(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    for (const e of world.with("position", "collider")) {
      const { x, y } = e.position;
      const c = e.collider;

      if (c.type === "circle") {
        const r = c.width / 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x - c.width / 2, y - c.height / 2, c.width, c.height);
      }
    }

    ctx.globalAlpha = 1;
  }

  private renderEntityCount(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    _w: number,
    h: number,
  ): void {
    const entities = [...world.with("position")];
    const withCollider = entities.filter((e) => (e as Partial<Entity>).collider).length;

    ctx.save();
    ctx.font = '12px "Fira Code", monospace';
    ctx.fillStyle = "#00ff88";
    ctx.globalAlpha = 0.8;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Entities: ${entities.length} | Colliders: ${withCollider}`, 10, h - 10);
    ctx.restore();
  }

  private renderError(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
    ctx.save();

    // Semi-transparent red banner at top
    ctx.fillStyle = "rgba(255, 0, 0, 0.85)";
    ctx.fillRect(0, 0, w, 40);

    ctx.font = '14px "Fira Code", monospace';
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.lastError ?? "", w / 2, 20);

    ctx.restore();
  }
}
