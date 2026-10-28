import { describe, expect, it, vi } from 'vitest'
import { ScreenShareIceBuffer } from './screen-share-ice'

describe('screen share ICE negotiation', () => {
  it('buffers early candidates for the correct session and applies them after the description', async () => {
    const buffer = new ScreenShareIceBuffer()
    const peer = { remoteDescription: null, addIceCandidate: vi.fn().mockResolvedValue(undefined) } as unknown as RTCPeerConnection
    buffer.add('session-a', { candidate: 'early' }, null, null)
    buffer.add('session-a', { candidate: 'also-early' }, peer, 'session-a')
    buffer.add('session-b', { candidate: 'other' }, peer, 'session-a')
    expect(peer.addIceCandidate).not.toHaveBeenCalled()
    await buffer.flush('session-a', peer)
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2)
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(1, { candidate: 'early' })
    buffer.clear()
    await buffer.flush('session-b', peer)
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2)
  })
})
