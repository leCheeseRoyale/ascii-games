/**
 * ASCII Renderer — draws entities as text on Canvas 2D.
 *
 * Render pipeline:
 *   1. Clear canvas
 *   2. Apply camera transform
 *   3. Collect all renderables + sort by layer
 *   4. Draw each: text blocks, ASCII entities, sprites
 *   5. Draw particles (engine-owned)
 *   6. Restore transform
 *
 * Entities auto-render when they have:
 *   - position + ascii  → single character
 *   - position + sprite → multi-line ASCII art
 *   - position + textBlock → paragraph (with optional obstacle flow)
 */

import type { EngineConfig, Entity, Obstacle, Position } from "@shared/types";
import type { GameWorld } from "../ecs/world";
import type { Camera } from "./camera";
import type { CanvasUI } from "./canvas-ui";
import type { ParticlePool } from "./particles";
import { getCachedSprite } from "./sprite-cache";
import {
  layoutJustifiedBlock,
  layoutTextAroundObstacles,
  layoutTextBlock,
  measureLineWidth,
  parseStyledText,
  type StyledSegment,
  stripTags,
} from "./text-layout";

interface Renderable {
  entity: Partial<Entity>;
  layer: number;
  type: "ascii" | "sprite" | "textBlock" | "image" | "tilemap";
}

export class AsciiRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private sceneTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  /** Resize canvas to fill its container. Call on mount + window resize. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  get width(): number {
    return this.canvas.clientWidth;
  }
  get height(): number {
    return this.canvas.clientHeight;
  }

  render(
    world: GameWorld,
    config: EngineConfig,
    camera: Camera,
    particles?: ParticlePool,
    sceneTime?: number,
    ui?: CanvasUI,
  ): void {
    this.sceneTime = sceneTime ?? 0;
    const { ctx } = this;
    const w = this.width;
    const h = this.height;

    // 1. Clear
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, w, h);

    // 2. Camera transform
    ctx.save();
    ctx.translate(-camera.x + w / 2, -camera.y + h / 2);
    ctx.translate(camera.shakeX, camera.shakeY);
    if (camera.zoom !== 1) {
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
    }

    // 3. Collect all renderables and sort by layer
    const renderables: Renderable[] = [];

    for (const e of world.with("position", "ascii")) {
      renderables.push({ entity: e, layer: e.ascii.layer ?? 0, type: "ascii" });
    }
    for (const e of world.with("position", "sprite")) {
      renderables.push({ entity: e, layer: e.sprite.layer ?? 0, type: "sprite" });
    }
    for (const e of world.with("position", "textBlock")) {
      renderables.push({ entity: e, layer: e.textBlock.layer ?? 0, type: "textBlock" });
    }
    for (const e of world.with("position", "image")) {
      renderables.push({ entity: e, layer: e.image.layer ?? 0, type: "image" });
    }
    for (const e of world.with("position", "tilemap")) {
      renderables.push({ entity: e, layer: e.tilemap.layer ?? -10, type: "tilemap" });
    }

    renderables.sort((a, b) => a.layer - b.layer);

    // Collect obstacles for text flow
    const obstacles: { position: Position; obstacle: Obstacle }[] = [];
    for (const e of world.with("position", "obstacle")) {
      obstacles.push({ position: e.position, obstacle: e.obstacle });
    }

    // 4. Draw each renderable
    for (const r of renderables) {
      switch (r.type) {
        case "image":
          this.drawImage(r.entity);
          break;
        case "ascii":
          this.drawAscii(r.entity);
          break;
        case "sprite":
          this.drawSprite(r.entity);
          break;
        case "textBlock":
          this.drawTextBlock(r.entity, obstacles);
          break;
        case "tilemap":
          this.drawTilemap(r.entity);
          break;
      }
    }

    // 5. Draw particles (engine-owned, auto-rendered)
    if (particles) {
      particles.render(ctx);
    }

    // 6. Debug overlay (colliders, velocity arrows, position dots)
    if (config.debug) {
      this.renderDebug(world);
    }

    // 7. Restore
    ctx.restore();

    // 8. Screen-space UI (after camera restore so it draws in screen space)
    if (ui) {
      ui.render();
    }
  }

  private drawTilemap(entity: Partial<Entity>): void {
    const { ctx } = this;
    const { x: ox, y: oy } = entity.position!;
    const tm = entity.tilemap!;
    const font = tm.font ?? '16px "Fira Code", monospace';
    const cs = tm.cellSize;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let row = 0; row < tm.data.length; row++) {
      const line = tm.data[row];
      for (let col = 0; col < line.length; col++) {
        const char = line[col];
        if (char === " ") continue;

        const entry = tm.legend[char];
        const px = ox + tm.offsetX + col * cs + cs / 2;
        const py = oy + tm.offsetY + row * cs + cs / 2;

        if (entry?.bg) {
          ctx.fillStyle = entry.bg;
          ctx.fillRect(px - cs / 2, py - cs / 2, cs, cs);
        }

        ctx.fillStyle = entry?.color ?? "#ffffff";
        ctx.fillText(char, px, py);
      }
    }

    ctx.restore();
  }

  private drawImage(entity: Partial<Entity>): void {
    const { ctx } = this;
    const { x, y } = entity.position!;
    const img = entity.image!;

    const w = img.width || img.image.naturalWidth;
    const h = img.height || img.image.naturalHeight;

    ctx.save();
    ctx.globalAlpha = img.opacity ?? 1;

    if (img.rotation) {
      ctx.translate(x, y);
      ctx.rotate(img.rotation);
      if (img.anchor === "topLeft") {
        ctx.drawImage(img.image, 0, 0, w, h);
      } else {
        ctx.drawImage(img.image, -w / 2, -h / 2, w, h);
      }
    } else {
      if (img.anchor === "topLeft") {
        ctx.drawImage(img.image, x, y, w, h);
      } else {
        ctx.drawImage(img.image, x - w / 2, y - h / 2, w, h);
      }
    }

    ctx.restore();
  }

  private drawAscii(entity: Partial<Entity>): void {
    const { ctx } = this;
    const { x, y } = entity.position!;
    const a = entity.ascii!;
    const effectFn = entity.textEffect?.fn;

    ctx.save();
    ctx.globalAlpha = a.opacity ?? 1;
    const font = a.scale
      ? `${parseFloat(a.font) * a.scale}px ${a.font.replace(/^[\d.]+px\s*/, "")}`
      : a.font;
    ctx.font = font;

    if (!effectFn) {
      if (a.glow) {
        ctx.shadowColor = a.glow;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = a.color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(a.char, x, y);
      ctx.restore();
      return;
    }

    const chars = [...a.char];
    const charWidths: number[] = [];
    for (const ch of chars) {
      charWidths.push(ctx.measureText(ch).width);
    }
    const totalW = charWidths.reduce((sum, w) => sum + w, 0);
    let cx = x - totalW / 2;

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (let i = 0; i < chars.length; i++) {
      const transform = effectFn(i, chars.length, this.sceneTime);
      const dx = transform.dx ?? 0;
      const dy = transform.dy ?? 0;

      ctx.save();
      if (transform.opacity !== undefined) {
        ctx.globalAlpha = (a.opacity ?? 1) * transform.opacity;
      }
      if (transform.scale !== undefined) {
        const mid = cx + charWidths[i] / 2;
        ctx.translate(mid, y);
        ctx.scale(transform.scale, transform.scale);
        ctx.translate(-mid, -y);
      }
      if (a.glow) {
        ctx.shadowColor = a.glow;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = transform.color ?? a.color;
      ctx.fillText(transform.char ?? chars[i], cx + dx, y + dy);
      ctx.restore();

      cx += charWidths[i];
    }

    ctx.restore();
  }

  private drawSprite(entity: Partial<Entity>): void {
    const { ctx } = this;
    const { x, y } = entity.position!;
    const s = entity.sprite!;

    // Entities with textEffect need per-character transforms each frame — skip the cache.
    if (entity.textEffect) {
      this.drawSpritePerChar(entity);
      return;
    }

    const cached = getCachedSprite(s.lines, s.font, s.color, s.colorMap, s.glow);

    ctx.save();
    if (s.opacity !== undefined && s.opacity < 1) {
      ctx.globalAlpha = s.opacity;
    }

    // Draw centered on entity position (bitmap origin is top-left of the padded canvas)
    ctx.drawImage(cached.canvas, x - cached.width / 2, y - cached.height / 2);
    ctx.restore();
  }

  /**
   * Fallback per-character sprite rendering for entities with textEffect.
   * Also supports colorMap and space transparency.
   */
  private drawSpritePerChar(entity: Partial<Entity>): void {
    const { ctx } = this;
    const { x, y } = entity.position!;
    const s = entity.sprite!;
    const effectFn = entity.textEffect?.fn;

    const fontSize = parseFloat(s.font) || 16;
    const lineHeight = fontSize * 1.2;
    const totalHeight = s.lines.length * lineHeight;
    const startY = y - totalHeight / 2;

    // Find max line width for centering
    let maxWidth = 0;
    for (const line of s.lines) {
      const w = measureLineWidth(line, s.font);
      if (w > maxWidth) maxWidth = w;
    }

    ctx.save();
    ctx.globalAlpha = s.opacity ?? 1;
    ctx.font = s.font;
    ctx.textBaseline = "top";

    let charIdx = 0;
    // Count total non-space characters for effect function
    let totalChars = 0;
    if (effectFn) {
      for (const line of s.lines) {
        for (const ch of line) {
          if (ch !== " ") totalChars++;
        }
      }
    }

    for (let li = 0; li < s.lines.length; li++) {
      const line = s.lines[li];
      const lineY = startY + li * lineHeight;
      const lineWidth = measureLineWidth(line, s.font);
      let cx = x - lineWidth / 2;

      for (const char of line) {
        const charWidth = measureLineWidth(char, s.font);
        if (char === " ") {
          cx += charWidth;
          continue;
        }

        if (effectFn) {
          const transform = effectFn(charIdx, totalChars, this.sceneTime);
          const dx = transform.dx ?? 0;
          const dy = transform.dy ?? 0;

          ctx.save();
          if (transform.opacity !== undefined) {
            ctx.globalAlpha = (s.opacity ?? 1) * transform.opacity;
          }
          if (transform.scale !== undefined) {
            const mid = cx + charWidth / 2;
            const midY = lineY + lineHeight / 2;
            ctx.translate(mid, midY);
            ctx.scale(transform.scale, transform.scale);
            ctx.translate(-mid, -midY);
          }
          if (s.glow) {
            ctx.shadowColor = s.glow;
            ctx.shadowBlur = 8;
          }
          ctx.fillStyle = transform.color ?? s.colorMap?.[char] ?? s.color;
          ctx.fillText(transform.char ?? char, cx + dx, lineY + dy);
          ctx.restore();
        } else {
          if (s.glow) {
            ctx.shadowColor = s.glow;
            ctx.shadowBlur = 8;
          }
          ctx.fillStyle = s.colorMap?.[char] ?? s.color;
          ctx.fillText(char, cx, lineY);
        }

        charIdx++;
        cx += charWidth;
      }
    }

    ctx.restore();
  }

  private drawTextBlock(
    entity: Partial<Entity>,
    obstacles: { position: Position; obstacle: Obstacle }[],
  ): void {
    const { ctx } = this;
    const { x, y } = entity.position!;
    const tb = entity.textBlock!;
    const align = tb.align ?? "left";

    ctx.save();
    ctx.font = tb.font;
    ctx.fillStyle = tb.color;
    ctx.textBaseline = "top";

    // Check if text contains style tags
    const hasStyleTags = /\[(#[0-9a-fA-F]{3,8}|b|\/b|dim|\/dim|bg:#[0-9a-fA-F]{3,8}|\/bg)\]/.test(
      tb.text,
    );
    const plainText = hasStyleTags ? stripTags(tb.text) : tb.text;

    if (align === "justify" && obstacles.length === 0 && !hasStyleTags) {
      // Justified layout: draw word-by-word with distributed spacing
      const justifiedLines = layoutJustifiedBlock(
        plainText,
        tb.font,
        tb.maxWidth,
        tb.lineHeight,
        x,
      );
      for (const jline of justifiedLines) {
        for (const word of jline.words) {
          ctx.fillText(word.text, word.x, y + jline.y);
        }
      }
    } else if (obstacles.length > 0) {
      const lines = layoutTextAroundObstacles(
        plainText,
        tb.font,
        x,
        y,
        tb.maxWidth,
        tb.lineHeight,
        obstacles,
      );
      for (const line of lines) {
        ctx.fillText(line.text, line.x, line.y);
      }
    } else if (hasStyleTags) {
      // Styled text: parse tags and render segments with per-character styling.
      // Layout is done on plain text, then we map styled segments onto each line.
      const lines = layoutTextBlock(plainText, tb.font, tb.maxWidth, tb.lineHeight);
      const segments = parseStyledText(tb.text, tb.font, tb.color);

      // Build a flat char-to-style map from segments
      let charIndex = 0;
      const plainChars = plainText.length;
      const charStyles: StyledSegment[] = new Array(plainChars);
      for (const seg of segments) {
        for (let ci = 0; ci < seg.text.length && charIndex < plainChars; ci++) {
          charStyles[charIndex] = seg;
          charIndex++;
        }
      }

      // Render each line with styles applied per character run
      let lineCharStart = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i].text;
        const lineY = y + i * tb.lineHeight;
        let lineX = x;

        if (align === "center") {
          lineX = x + (tb.maxWidth - lines[i].width) / 2;
        } else if (align === "right") {
          lineX = x + tb.maxWidth - lines[i].width;
        }

        this.drawStyledRun(
          ctx,
          lineText,
          lineX,
          lineY,
          charStyles,
          lineCharStart,
          tb.font,
          tb.color,
          tb.lineHeight,
        );
        lineCharStart += lineText.length;
        // Skip whitespace between lines (word wrap consumes trailing spaces)
        while (lineCharStart < plainChars && (plainText[lineCharStart] === " " || plainText[lineCharStart] === "\n")) {
          lineCharStart++;
        }
      }
    } else {
      const lines = layoutTextBlock(plainText, tb.font, tb.maxWidth, tb.lineHeight);
      for (let i = 0; i < lines.length; i++) {
        const lineY = y + i * tb.lineHeight;
        let lineX = x;

        if (align === "center") {
          lineX = x + (tb.maxWidth - lines[i].width) / 2;
        } else if (align === "right") {
          lineX = x + tb.maxWidth - lines[i].width;
        }

        ctx.fillText(lines[i].text, lineX, lineY);
      }
    }
    ctx.restore();
  }

  /**
   * Draw a run of text with per-character styles from charStyles array.
   * Groups consecutive characters with the same style into single fillText calls.
   */
  private drawStyledRun(
    ctx: CanvasRenderingContext2D,
    lineText: string,
    startX: number,
    y: number,
    charStyles: StyledSegment[],
    charOffset: number,
    baseFont: string,
    baseColor: string,
    lineHeight: number,
  ): void {
    const baseAlpha = ctx.globalAlpha;
    let drawX = startX;
    let runStart = 0;

    while (runStart < lineText.length) {
      // Get style for this character
      const style = charStyles[charOffset + runStart] ?? {
        text: "",
        color: baseColor,
        font: baseFont,
        opacity: 1,
        bgColor: null,
      };

      // Find end of run with same style
      let runEnd = runStart + 1;
      while (runEnd < lineText.length) {
        const nextStyle = charStyles[charOffset + runEnd];
        if (
          !nextStyle ||
          nextStyle.color !== style.color ||
          nextStyle.font !== style.font ||
          nextStyle.opacity !== style.opacity ||
          nextStyle.bgColor !== style.bgColor
        ) {
          break;
        }
        runEnd++;
      }

      const runText = lineText.slice(runStart, runEnd);
      ctx.font = style.font;
      const runWidth = measureLineWidth(runText, style.font);

      // Draw background if present
      if (style.bgColor) {
        const prevFill = ctx.fillStyle;
        const prevAlpha = ctx.globalAlpha;
        ctx.fillStyle = style.bgColor;
        ctx.globalAlpha = baseAlpha * style.opacity;
        ctx.fillRect(drawX, y, runWidth, lineHeight);
        ctx.fillStyle = prevFill;
        ctx.globalAlpha = prevAlpha;
      }

      // Draw text
      ctx.globalAlpha = baseAlpha * style.opacity;
      ctx.fillStyle = style.color;
      ctx.fillText(runText, drawX, y);

      drawX += runWidth;
      runStart = runEnd;
    }
  }

  /** Draw debug overlays: collider outlines, velocity arrows, position dots. */
  private renderDebug(world: GameWorld): void {
    const { ctx } = this;
    ctx.save();

    // --- Collider outlines ---
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (const e of world.with("position", "collider")) {
      const { x, y } = e.position;
      const { type, width, height } = e.collider;
      if (type === "circle") {
        ctx.beginPath();
        ctx.arc(x, y, width / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x - width / 2, y - height / 2, width, height);
      }
    }

    // --- Velocity arrows ---
    ctx.strokeStyle = "#ffff00";
    ctx.globalAlpha = 0.4;
    for (const e of world.with("position", "velocity")) {
      const { vx, vy } = e.velocity;
      if (vx === 0 && vy === 0) continue;
      const { x, y } = e.position;
      const ex = x + vx * 0.1;
      const ey = y + vy * 0.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // --- Entity position dots ---
    ctx.fillStyle = "#ff00ff";
    ctx.globalAlpha = 0.3;
    for (const e of world.with("position")) {
      ctx.beginPath();
      ctx.arc(e.position.x, e.position.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
