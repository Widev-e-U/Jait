/** Serializes input and coalesces adjacent pointer movement, keeping work bounded. */
export class ScreenShareInputQueue {
  private tail: Promise<void> = Promise.resolve()
  private generation = 0
  private queued = 0
  private move: { effect: () => Promise<void>; generation: number } | null = null

  get idle(): boolean { return this.queued === 0 }

  private schedule(effect: () => Promise<void>): Promise<void> {
    if (this.queued >= 32) return Promise.reject(new Error('Too many pending screen-control actions.'))
    const generation = this.generation
    this.queued++
    const result = this.tail.then(async () => {
      if (generation === this.generation) await effect()
    }).finally(() => { this.queued-- })
    this.tail = result.catch(() => {})
    return result
  }

  enqueue(effect: () => Promise<void>): Promise<void> {
    // Subsequent moves belong after this action, even if an earlier move has
    // not reached the front of the queue yet.
    this.move = null
    return this.schedule(effect)
  }

  moveTo(effect: () => Promise<void>): Promise<void> {
    if (this.move) {
      this.move.effect = effect
      return Promise.resolve()
    }
    const move = { effect, generation: this.generation }
    this.move = move
    const result = this.schedule(async () => {
      if (this.move === move) this.move = null
      if (move.generation === this.generation) await move.effect()
    })
    return result.finally(() => { if (this.move === move) this.move = null })
  }

  cancel(): void {
    this.generation++
    this.move = null
  }
}
