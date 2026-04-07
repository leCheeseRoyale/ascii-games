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

import type { GameWorld } from '../ecs/world'
import type { EngineConfig, Position, Obstacle, Entity } from '@shared/types'
import type { Camera } from './camera'
import type { ParticlePool } from './particles'
import { layoutTextBlock, layoutTextAroundObstacles } from './text-layout'

interface Renderable {
  entity: Partial<Entity>
  layer: number
  type: 'ascii' | 'sprite' | 'textBlock' | 'image'
}

export class AsciiRenderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  /** Resize canvas to fill its container. Call on mount + window resize. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr
      this.canvas.height = h * dpr
      this.ctx.scale(dpr, dpr)
    }
  }

  get width(): number { return this.canvas.clientWidth }
  get height(): number { return this.canvas.clientHeight }

  render(world: GameWorld, config: EngineConfig, camera: Camera, particles?: ParticlePool): void {
    const { ctx } = this
    const w = this.width
    const h = this.height

    // 1. Clear
    ctx.fillStyle = config.bgColor
    ctx.fillRect(0, 0, w, h)

    // 2. Camera transform
    ctx.save()
    ctx.translate(-camera.x + w / 2, -camera.y + h / 2)
    ctx.translate(camera.shakeX, camera.shakeY)
    if (camera.zoom !== 1) {
      ctx.translate(camera.x, camera.y)
      ctx.scale(camera.zoom, camera.zoom)
      ctx.translate(-camera.x, -camera.y)
    }

    // 3. Collect all renderables and sort by layer
    const renderables: Renderable[] = []

    for (const e of world.with('position', 'ascii')) {
      renderables.push({ entity: e, layer: e.ascii.layer ?? 0, type: 'ascii' })
    }
    for (const e of world.with('position', 'sprite')) {
      renderables.push({ entity: e, layer: e.sprite.layer ?? 0, type: 'sprite' })
    }
    for (const e of world.with('position', 'textBlock')) {
      renderables.push({ entity: e, layer: e.textBlock.layer ?? 0, type: 'textBlock' })
    }
    for (const e of world.with('position', 'image')) {
      renderables.push({ entity: e, layer: e.image.layer ?? 0, type: 'image' })
    }

    renderables.sort((a, b) => a.layer - b.layer)

    // Collect obstacles for text flow
    const obstacles: { position: Position; obstacle: Obstacle }[] = []
    for (const e of world.with('position', 'obstacle')) {
      obstacles.push({ position: e.position, obstacle: e.obstacle })
    }

    // 4. Draw each renderable
    for (const r of renderables) {
      switch (r.type) {
        case 'image': this.drawImage(r.entity); break
        case 'ascii': this.drawAscii(r.entity); break
        case 'sprite': this.drawSprite(r.entity); break
        case 'textBlock': this.drawTextBlock(r.entity, obstacles); break
      }
    }

    // 5. Draw particles (engine-owned, auto-rendered)
    if (particles) {
      particles.render(ctx)
    }

    // 6. Restore
    ctx.restore()
  }

  private drawImage(entity: Partial<Entity>): void {
    const { ctx } = this
    const { x, y } = entity.position!
    const img = entity.image!

    const w = img.width || img.image.naturalWidth
    const h = img.height || img.image.naturalHeight

    ctx.save()
    ctx.globalAlpha = img.opacity ?? 1

    if (img.rotation) {
      ctx.translate(x, y)
      ctx.rotate(img.rotation)
      if (img.anchor === 'topLeft') {
        ctx.drawImage(img.image, 0, 0, w, h)
      } else {
        ctx.drawImage(img.image, -w / 2, -h / 2, w, h)
      }
    } else {
      if (img.anchor === 'topLeft') {
        ctx.drawImage(img.image, x, y, w, h)
      } else {
        ctx.drawImage(img.image, x - w / 2, y - h / 2, w, h)
      }
    }

    ctx.restore()
  }

  private drawAscii(entity: Partial<Entity>): void {
    const { ctx } = this
    const { x, y } = entity.position!
    const a = entity.ascii!

    ctx.save()
    ctx.globalAlpha = a.opacity ?? 1
    ctx.font = a.scale
      ? `${parseFloat(a.font) * a.scale}px ${a.font.replace(/^[\d.]+px\s*/, '')}`
      : a.font
    if (a.glow) {
      ctx.shadowColor = a.glow
      ctx.shadowBlur = 8
    }
    ctx.fillStyle = a.color
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(a.char, x, y)
    ctx.restore()
  }

  private drawSprite(entity: Partial<Entity>): void {
    const { ctx } = this
    const { x, y } = entity.position!
    const s = entity.sprite!

    ctx.save()
    ctx.globalAlpha = s.opacity ?? 1
    ctx.font = s.font
    if (s.glow) {
      ctx.shadowColor = s.glow
      ctx.shadowBlur = 8
    }
    ctx.fillStyle = s.color
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    // Measure approximate line height from font size
    const fontSize = parseFloat(s.font) || 16
    const lineHeight = fontSize * 1.2
    const totalHeight = s.lines.length * lineHeight
    const startY = y - totalHeight / 2 + lineHeight / 2

    for (let i = 0; i < s.lines.length; i++) {
      ctx.fillText(s.lines[i], x, startY + i * lineHeight)
    }
    ctx.restore()
  }

  private drawTextBlock(entity: Partial<Entity>, obstacles: { position: Position; obstacle: Obstacle }[]): void {
    const { ctx } = this
    const { x, y } = entity.position!
    const tb = entity.textBlock!

    ctx.font = tb.font
    ctx.fillStyle = tb.color
    ctx.textBaseline = 'top'

    if (obstacles.length > 0) {
      const lines = layoutTextAroundObstacles(
        tb.text, tb.font, x, y, tb.maxWidth, tb.lineHeight, obstacles
      )
      for (const line of lines) {
        ctx.fillText(line.text, line.x, line.y)
      }
    } else {
      const lines = layoutTextBlock(tb.text, tb.font, tb.maxWidth, tb.lineHeight)
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i].text, x, y + i * tb.lineHeight)
      }
    }
  }
}
