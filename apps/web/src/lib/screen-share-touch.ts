/** Relative touchpad movement for a shared screen. A tap clicks the cursor. */
export class ScreenShareTouchPointer {
  private cursor = { x: 0.5, y: 0.5 }
  private gesture: { id: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null = null

  get position(): { x: number; y: number } {
    return { ...this.cursor }
  }

  begin(id: number, x: number, y: number): boolean {
    if (this.gesture || !Number.isFinite(x) || !Number.isFinite(y)) return false
    this.gesture = { id, startX: x, startY: y, x, y, moved: false }
    return true
  }

  move(id: number, x: number, y: number, width: number, height: number): { x: number; y: number } | null {
    const gesture = this.gesture
    if (!gesture || gesture.id !== id || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
    if (Math.hypot(x - gesture.startX, y - gesture.startY) > 8) gesture.moved = true
    this.cursor = {
      x: Math.max(0, Math.min(1, this.cursor.x + (x - gesture.x) / width)),
      y: Math.max(0, Math.min(1, this.cursor.y + (y - gesture.y) / height)),
    }
    gesture.x = x
    gesture.y = y
    return this.position
  }

  end(id: number): { x: number; y: number } | null {
    if (!this.gesture || this.gesture.id !== id) return null
    const click = !this.gesture.moved
    this.gesture = null
    return click ? this.position : null
  }

  cancel(id?: number): void {
    if (id === undefined || this.gesture?.id === id) this.gesture = null
  }

  reset(): void {
    this.cancel()
    this.cursor = { x: 0.5, y: 0.5 }
  }
}
