/** Buffer remote ICE candidates until the matching peer has a remote description. */
export class ScreenShareIceBuffer {
  private pending = new Map<string, RTCIceCandidateInit[]>()

  add(sessionId: string, candidate: RTCIceCandidateInit, peer: RTCPeerConnection | null, peerSessionId: string | null): void {
    if (peer && peerSessionId === sessionId && peer.remoteDescription) {
      void peer.addIceCandidate(candidate).catch(error => console.error('[screen-share] ICE candidate failed:', error))
      return
    }
    if (!this.pending.has(sessionId) && this.pending.size >= 8) return
    const candidates = this.pending.get(sessionId) ?? []
    if (candidates.length < 256) candidates.push(candidate)
    this.pending.set(sessionId, candidates)
  }

  async flush(sessionId: string, peer: RTCPeerConnection): Promise<void> {
    const candidates = this.pending.get(sessionId) ?? []
    this.pending.delete(sessionId)
    for (const candidate of candidates) {
      try { await peer.addIceCandidate(candidate) } catch (error) {
        console.error('[screen-share] ICE candidate failed:', error)
      }
    }
  }

  clear(key?: string): void {
    if (key === undefined) this.pending.clear()
    else this.pending.delete(key)
  }
}
