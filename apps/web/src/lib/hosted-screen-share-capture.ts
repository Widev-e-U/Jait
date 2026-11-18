/** Locally observed capture identity for the node-side control boundary. */
interface HostedCapture {
  sessionId: string
  chatId: string
  track: MediaStreamTrack
}

export class HostedScreenShareCapture {
  private capture: HostedCapture | null = null

  set(sessionId: string, chatId: string, track: MediaStreamTrack): void {
    this.capture = { sessionId, chatId, track }
  }

  clear(sessionId?: string): void {
    if (!sessionId || this.capture?.sessionId === sessionId) this.capture = null
  }

  inspect(sessionId: string, chatId: string): { width: number; height: number } | null {
    const capture = this.capture
    if (!capture || capture.sessionId !== sessionId || capture.chatId !== chatId || capture.track.readyState !== 'live') return null
    const settings = capture.track.getSettings()
    if (settings.displaySurface !== 'monitor' || !Number.isFinite(settings.width) || !Number.isFinite(settings.height)
      || !settings.width || !settings.height || settings.width <= 0 || settings.height <= 0) return null
    return { width: settings.width, height: settings.height }
  }
}

export const hostedScreenShareCapture = new HostedScreenShareCapture()
