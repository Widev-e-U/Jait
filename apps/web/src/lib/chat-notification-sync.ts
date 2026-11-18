import type { ChatNotificationState } from '@jait/shared'

/** One exact completion per chat. Read events never target a replacement reply. */
export class ChatNotificationSync {
  private latest = new Map<string, ChatNotificationState>()
  private readIds = new Set<string>()

  constructor(
    private visible: () => string | null,
    private sendRead: (state: ChatNotificationState) => void,
    private dismiss: (state: ChatNotificationState) => void,
  ) {}

  receive(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const state = value as ChatNotificationState
    if (typeof state.id !== 'string' || !state.id || typeof state.sessionId !== 'string'
      || !state.sessionId || state.replaceId !== `chat-complete:${state.sessionId}` || typeof state.read !== 'boolean') return
    const previous = this.latest.get(state.sessionId)
    if (state.read) {
      this.readIds.add(state.id)
      if (this.readIds.size > 4096) this.readIds.delete(this.readIds.values().next().value!)
      if (previous && previous.id !== state.id) return
    }
    if (this.readIds.has(state.id)) {
      if (previous && previous.id !== state.id) return
      this.latest.set(state.sessionId, { ...state, read: true })
      this.dismiss(state)
    } else {
      this.latest.set(state.sessionId, state)
      this.readVisible()
    }
    if (this.latest.size > 2048) this.latest.delete(this.latest.keys().next().value!)
  }

  readVisible(): void {
    const sessionId = this.visible()
    const state = sessionId ? this.latest.get(sessionId) : null
    if (state && !state.read) this.sendRead(state)
  }

  /** A read can arrive while an asynchronous native notification is being posted. */
  afterShow(id: string, sessionId: string): void {
    const state = this.latest.get(sessionId)
    if (state?.id === id && this.readIds.has(id)) this.dismiss(state)
  }

  reset(): void {
    this.latest.clear()
    this.readIds.clear()
  }
}
