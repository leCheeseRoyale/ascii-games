# Plan E2: Debug & Visual Polish

## Problem
When collisions don't work, there's no way to see hitboxes. When systems throw errors, the game silently breaks. There's no easy way to show floating score popups or notifications.

## Items addressed
- #5/#6: Collider visualization and entity inspector
- #7: Error overlay on canvas
- #28: Toast/notification system

## New file: `engine/render/debug.ts`

A debug overlay renderer that can be toggled on/off. Draws over the game after normal rendering.

```ts
/**
 * Debug overlay — collider outlines, entity inspector, error display.
 * Toggle with engine.debug.enabled or backtick key.
 */

import type { Entity } from '@shared/types';
import type { GameWorld } from '../ecs/world';
import type { Camera } from './camera';

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

  render(ctx: CanvasRenderingContext2D, world: GameWorld, camera: Camera, w: number, h: number): void {
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
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    for (const e of world.with('position', 'collider')) {
      const { x, y } = e.position;
      const c = e.collider;

      if (c.type === 'circle') {
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

  private renderEntityCount(ctx: CanvasRenderingContext2D, world: GameWorld, w: number, h: number): void {
    const entities = [...world.with('position')];
    const withCollider = entities.filter(e => (e as Partial<Entity>).collider).length;

    ctx.save();
    ctx.font = '12px "Fira Code", monospace';
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Entities: ${entities.length} | Colliders: ${withCollider}`, 10, h - 10);
    ctx.restore();
  }

  private renderError(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();

    // Semi-transparent red banner at top
    ctx.fillStyle = 'rgba(255, 0, 0, 0.85)';
    ctx.fillRect(0, 0, w, 40);

    ctx.font = '14px "Fira Code", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.lastError ?? '', w / 2, 20);

    ctx.restore();
  }
}
```

## New file: `engine/render/toast.ts`

Floating notifications that appear and fade out.

```ts
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
  show(text: string, opts: {
    x?: number;
    y?: number;
    color?: string;
    duration?: number;
    font?: string;
    vy?: number;
  } = {}): void {
    this.toasts.push({
      text,
      x: opts.x ?? -1, // -1 means "center of screen" — resolved at render time
      y: opts.y ?? -1,
      color: opts.color ?? '#ffffff',
      life: opts.duration ?? 1.5,
      maxLife: opts.duration ?? 1.5,
      font: opts.font ?? '16px "Fira Code", monospace',
      vy: opts.vy ?? -30,
    });
  }

  /** Show a toast at an entity's position. */
  showAt(text: string, entityX: number, entityY: number, opts: {
    color?: string;
    duration?: number;
    font?: string;
  } = {}): void {
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
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, x, y);
      ctx.restore();
    }
  }

  clear(): void {
    this.toasts.length = 0;
  }
}
```

## Rules
- ONLY create new files in `engine/render/`
- Do NOT modify `engine/render/ascii-renderer.ts` — the integration agent will add debug/toast render calls there
- Do NOT touch `engine/core/engine.ts` — integration agent will add `debug` and `toast` properties
- Do NOT touch `engine/index.ts`
- Import types from `@shared/types` and relative paths for engine internals
- Run `bun run check` and `bun run build` to verify

## Verification
- `bun run check` passes
- `bun run build` succeeds
- New classes compile: `DebugOverlay`, `ToastManager`
- Classes are not yet wired into the engine (integration step handles that)
