/**
 * ASCII Renderer — draws entities as text on Canvas 2D.
 *
 * Render order:
 *   1. Clear canvas
 *   2. Apply camera transform
 *   3. Render text blocks (with obstacle flow-around)
 *   4. Render ASCII entities (single chars)
 *   5. Restore transform
 *
 * All text measurement goes through text-layout.ts (Pretext).
 */

import type { GameWorld } from '../ecs/world'
import type { EngineConfig, Position, Obstacle } from '@shared/types'
import type { Camera } from './camera'
import { layoutTextBlock, layoutTextAroundObstacles } from './text-layout'

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

  render(world: GameWorld, config: EngineConfig, camera: Camera): void {
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

    // Collect obstacles for text flow
    const obstacles: { position: Position; obstacle: Obstacle }[] = []
    for (const e of world.with('position', 'obstacle')) {
      obstacles.push({ position: e.position, obstacle: e.obstacle })
    }

    // 3. Text blocks
    for (const e of world.with('position', 'textBlock')) {
      const { x, y } = e.position
      const tb = e.textBlock
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

    // 4. ASCII entities
    for (const e of world.with('position', 'ascii')) {
      const { x, y } = e.position
      const a = e.ascii
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

    // 5. Restore
    ctx.restore()
  }
}
