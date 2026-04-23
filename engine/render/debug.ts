/**
 * Debug overlay — collider outlines, entity inspector, error display, profiler.
 * Toggle with engine.debug.enabled or backtick key.
 *
 * The profiler section (per-system timing, frame budget, archetype counts) is
 * only rendered when enabled = true. Tracking in SystemRunner is gated by the
 * same flag, so there is zero overhead when the overlay is hidden.
 */

import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import type { GameWorld } from "../ecs/world";
import type { Camera } from "./camera";
import { spriteCacheSize } from "./sprite-cache";
import { getTextCacheStats, preparedCacheSize, widthCacheSize } from "./text-layout";

/** Archetype (component combination) to sample for the profiler counts panel. */
interface ArchetypeQuery {
  label: string;
  keys: (keyof Entity)[];
}

/** Default archetypes to show in the profiler. Chosen to cover common gameplay patterns. */
const DEFAULT_ARCHETYPES: ArchetypeQuery[] = [
  { label: "position+velocity", keys: ["position", "velocity"] },
  { label: "position+ascii", keys: ["position", "ascii"] },
  { label: "position+sprite", keys: ["position", "sprite"] },
  { label: "collider+tags", keys: ["collider", "tags"] },
  { label: "physics", keys: ["physics"] },
  { label: "tween", keys: ["tween"] },
  { label: "lifetime", keys: ["lifetime"] },
];

/** Target frame budget in ms for 60 fps. */
const FRAME_BUDGET_MS = 1000 / 60;

export class DebugOverlay {
  enabled = false;
  private errors: Array<{ message: string; remaining: number }> = [];
  private static MAX_ERRORS = 5;

  /** Engine backref — set by Engine after construction so we can access systems/world/scheduler. */
  private engine: Engine | null = null;

  /** Attach the engine. Called once by Engine constructor. */
  setEngine(engine: Engine): void {
    this.engine = engine;
    // Mirror current state in case enabled was toggled before setEngine.
    engine.systems.setTimingEnabled(this.enabled);
  }

  /** Toggle visibility. Enables/disables profiler timing to match, so overhead is zero when hidden. */
  toggle(): void {
    this.enabled = !this.enabled;
    this.engine?.systems.setTimingEnabled(this.enabled);
  }

  /** Explicitly set visibility. Keeps the profiler timing flag in sync. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.engine?.systems.setTimingEnabled(this.enabled);
  }

  /** Record an error to display on screen. */
  showError(message: string, duration = 5): void {
    // Deduplicate: if same message exists, reset its timer
    const existing = this.errors.find((e) => e.message === message);
    if (existing) {
      existing.remaining = duration;
      return;
    }
    this.errors.push({ message, remaining: duration });
    // Cap at MAX_ERRORS — drop oldest
    while (this.errors.length > DebugOverlay.MAX_ERRORS) {
      this.errors.shift();
    }
  }

  update(dt: number): void {
    for (const entry of this.errors) {
      entry.remaining -= dt;
    }
    this.errors = this.errors.filter((e) => e.remaining > 0);
  }

  render(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    camera: Camera,
    w: number,
    h: number,
  ): void {
    // Always render errors, even if debug mode is off
    if (this.errors.length > 0) {
      this.renderErrors(ctx, w);
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

    // Profiler overlay — top-right corner, doesn't overlap with bottom-left entity count
    // or the top error banners (profiler only shows when errors.length is small and
    // leaves the first 32px for an error; otherwise the two can visually stack).
    if (this.engine) {
      this.renderProfiler(ctx, this.engine, w);
    }
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

  private renderErrors(ctx: CanvasRenderingContext2D, w: number): void {
    ctx.save();
    ctx.font = '14px "Fira Code", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < this.errors.length; i++) {
      const entry = this.errors[i];
      const alpha = Math.min(1, entry.remaining / 1.0);
      const y = i * 32;

      // Semi-transparent red banner
      ctx.fillStyle = `rgba(255, 0, 0, ${0.85 * alpha})`;
      ctx.fillRect(0, y, w, 32);

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillText(entry.message, w / 2, y + 16);
    }

    ctx.restore();
  }

  /**
   * Renders the profiler panel (frame timing, per-system timings, archetype
   * counts, memory hints) in the top-right corner.
   */
  private renderProfiler(ctx: CanvasRenderingContext2D, engine: Engine, w: number): void {
    const timings = engine.systems.getTimings();
    const entries = [...timings.entries()].sort((a, b) => b[1].avg - a[1].avg);

    // Panel geometry — fixed width, height grows with rows.
    const panelW = 320;
    const padX = 10;
    const padY = 8;
    const lineH = 14;
    const sectionGap = 6;

    // Sum of system timings — used for the frame budget bar.
    let sumAvgMs = 0;
    for (const [, t] of entries) sumAvgMs += t.avg;

    // Calculate total lines/sections for panel height.
    // Sections: header (1), frame (2), entities (1), blank (1),
    //           systems header (2), systems rows (N or 1 empty),
    //           archetypes header (1), archetype rows (M),
    //           memory header (1), memory rows (3)
    const systemsRows = Math.max(1, entries.length);
    const archetypeRows = DEFAULT_ARCHETYPES.length;
    const memoryRows = 3;
    const cacheRows = 3;
    const totalLines =
      1 + // title bar
      2 + // FPS + frame bar
      1 + // entities
      1 + // gap
      2 + // systems header (separator + column header)
      systemsRows +
      1 + // gap
      1 + // archetypes separator
      archetypeRows +
      1 + // gap
      1 + // memory separator
      memoryRows +
      1 + // gap
      1 + // cache separator
      cacheRows;

    const panelH = padY * 2 + totalLines * lineH + sectionGap * 2;
    const x = w - panelW - 10;
    const y = 10;

    ctx.save();
    // Semi-transparent black background, subtle border.
    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = "rgba(0, 255, 136, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

    ctx.font = '11px "Fira Code", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#00ff88";

    let cy = y + padY;
    const tx = x + padX;
    const innerW = panelW - padX * 2;

    // --- Header / FPS + frame bar ---
    ctx.fillStyle = "#88ffcc";
    ctx.fillText("\u2500\u2500\u2500 Engine Debug \u2500\u2500\u2500\u2500\u2500\u2500", tx, cy);
    cy += lineH;

    const fps = engine.time.fps || 0;
    const frameMs = fps > 0 ? 1000 / fps : 0;
    const budgetPct = FRAME_BUDGET_MS > 0 ? Math.min(999, (frameMs / FRAME_BUDGET_MS) * 100) : 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`FPS: ${fps}  Frame: ${frameMs.toFixed(2)}ms  ${budgetPct.toFixed(0)}%`, tx, cy);
    cy += lineH;

    // Budget bar: shows frameMs / 16.67ms; red if >100%.
    this.drawBudgetBar(ctx, tx, cy, innerW, 8, frameMs / FRAME_BUDGET_MS);
    cy += lineH;

    // Entities summary.
    const entityCount = [...engine.world.with("position")].length;
    ctx.fillStyle = "#cccccc";
    ctx.fillText(`Entities: ${entityCount}`, tx, cy);
    cy += lineH + sectionGap;

    // --- System timings section ---
    ctx.fillStyle = "#88ffcc";
    ctx.fillText("\u2500\u2500\u2500 System Timings \u2500\u2500\u2500\u2500", tx, cy);
    cy += lineH;

    ctx.fillStyle = "#888888";
    ctx.fillText(this.formatTimingRow("Name", "Last", "Avg", "Max"), tx, cy);
    cy += lineH;

    if (entries.length === 0) {
      ctx.fillStyle = "#666666";
      ctx.fillText(" (no samples yet)", tx, cy);
      cy += lineH;
    } else {
      for (const [name, t] of entries) {
        // Red if a single system takes >25% of the budget — likely hot.
        const hot = t.avg > FRAME_BUDGET_MS * 0.25;
        ctx.fillStyle = hot ? "#ff6666" : "#dddddd";
        ctx.fillText(
          this.formatTimingRow(
            name,
            `${t.last.toFixed(2)}ms`,
            `${t.avg.toFixed(2)}ms`,
            `${t.max.toFixed(2)}ms`,
          ),
          tx,
          cy,
        );
        cy += lineH;
      }
    }
    cy += sectionGap;

    // --- Archetypes section ---
    ctx.fillStyle = "#88ffcc";
    ctx.fillText(
      "\u2500\u2500\u2500 Archetypes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      tx,
      cy,
    );
    cy += lineH;

    ctx.fillStyle = "#dddddd";
    for (const arch of DEFAULT_ARCHETYPES) {
      const count = this.countArchetype(engine.world, arch.keys);
      ctx.fillText(`${arch.label}: ${count}`, tx, cy);
      cy += lineH;
    }
    cy += sectionGap;

    // --- Memory hint section ---
    ctx.fillStyle = "#88ffcc";
    ctx.fillText("\u2500\u2500\u2500 Memory / Queues \u2500\u2500", tx, cy);
    cy += lineH;

    const totalEntities = [...engine.world.entities].length;
    const tweenCount = [...engine.world.with("tween")].length;
    const schedulerCount = engine.scheduler.count ?? 0;

    ctx.fillStyle = "#dddddd";
    ctx.fillText(`entities total: ${totalEntities}`, tx, cy);
    cy += lineH;
    ctx.fillText(`tween entities: ${tweenCount}`, tx, cy);
    cy += lineH;
    ctx.fillText(`scheduler tasks: ${schedulerCount}`, tx, cy);
    cy += lineH + sectionGap;

    // --- Pretext cache section ---
    ctx.fillStyle = "#88ffcc";
    ctx.fillText("\u2500\u2500\u2500 Pretext Caches \u2500\u2500\u2500", tx, cy);
    cy += lineH;

    const cacheStats = getTextCacheStats();
    ctx.fillStyle = "#dddddd";
    ctx.fillText(
      `prepared: ${preparedCacheSize()} / 512  +${cacheStats.prepared.hits} -${cacheStats.prepared.misses}`,
      tx,
      cy,
    );
    cy += lineH;
    ctx.fillText(
      `width:    ${widthCacheSize()} / 512  +${cacheStats.width.hits} -${cacheStats.width.misses}`,
      tx,
      cy,
    );
    cy += lineH;
    ctx.fillText(`sprite:   ${spriteCacheSize()} / 128`, tx, cy);

    // Sum row is useful context — append to budget line if space permits; instead
    // we fold it into the budget bar's tooltip via a subtle overlay label.
    if (sumAvgMs > 0) {
      ctx.fillStyle = "#777777";
      ctx.textAlign = "right";
      ctx.fillText(
        `\u03A3 systems avg: ${sumAvgMs.toFixed(2)}ms`,
        x + panelW - padX,
        y + padY + lineH * 2 + sectionGap,
      );
      ctx.textAlign = "left";
    }

    ctx.restore();
  }

  /** Draws a horizontal bar showing fraction (0..1+) of the frame budget used. */
  private drawBudgetBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    fraction: number,
  ): void {
    // Clamp only the drawn width — color/label still reflects overage.
    const drawn = Math.max(0, Math.min(1, fraction));
    const over = fraction > 1;

    ctx.save();
    // Track
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(x, y, width, height);
    // Fill — green under budget, amber near limit, red over.
    let color: string;
    if (over) color = "#ff4444";
    else if (fraction > 0.85) color = "#ffcc44";
    else color = "#44cc88";
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * drawn, height);
    // 100% tick mark (shows at very end of bar — always 100% of drawn track).
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();
    ctx.restore();
  }

  /** Count entities matching all given component keys. */
  private countArchetype(world: GameWorld, keys: (keyof Entity)[]): number {
    if (keys.length === 0) return 0;
    // miniplex's with() is variadic over component keys. We type the chain as
    // the same queryable shape so we don't need `any`.
    type Queryable = { with<K extends keyof Entity>(key: K): Queryable } & Iterable<Entity>;
    const [first, ...rest] = keys;
    let query = (world as unknown as Queryable).with(first);
    for (const k of rest) {
      query = query.with(k);
    }
    let n = 0;
    for (const _ of query) n++;
    return n;
  }

  /** Format a four-column row, padded to fit the panel width. */
  private formatTimingRow(name: string, last: string, avg: string, max: string): string {
    const nameCol = this.padEnd(name, 14);
    const lastCol = this.padStart(last, 8);
    const avgCol = this.padStart(avg, 8);
    const maxCol = this.padStart(max, 8);
    return `${nameCol}${lastCol}${avgCol}${maxCol}`;
  }

  private padEnd(s: string, n: number): string {
    if (s.length >= n) return `${s.slice(0, n - 1)}\u2026`; // ellipsis for overflow
    return `${s}${" ".repeat(n - s.length)}`;
  }

  private padStart(s: string, n: number): string {
    if (s.length >= n) return s;
    return `${" ".repeat(n - s.length)}${s}`;
  }
}
