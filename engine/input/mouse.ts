/**
 * Mouse state tracker.
 * Coordinates are relative to the canvas.
 */

export class Mouse {
  x = 0
  y = 0
  down = false
  justDown = false
  justUp = false

  private pendingDown = false
  private pendingUp = false
  private canvas: HTMLCanvasElement
  private onMove: (e: MouseEvent) => void
  private onDown: (e: MouseEvent) => void
  private onUp: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      this.x = e.clientX - r.left
      this.y = e.clientY - r.top
    }
    this.onDown = (e: MouseEvent) => {
      this.down = true
      this.pendingDown = true
      this.onMove(e)
    }
    this.onUp = () => {
      this.down = false
      this.pendingUp = true
    }
    canvas.addEventListener('mousemove', this.onMove)
    canvas.addEventListener('mousedown', this.onDown)
    window.addEventListener('mouseup', this.onUp)
  }

  update(): void {
    this.justDown = this.pendingDown
    this.justUp = this.pendingUp
    this.pendingDown = false
    this.pendingUp = false
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMove)
    this.canvas.removeEventListener('mousedown', this.onDown)
    window.removeEventListener('mouseup', this.onUp)
  }
}
