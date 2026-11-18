import { describe, expect, it } from 'vitest'
import { HostedScreenShareCapture } from './hosted-screen-share-capture'

function track(displaySurface: string, readyState = 'live', width = 1920, height = 1080) {
  return { readyState, getSettings: () => ({ displaySurface, width, height }) } as MediaStreamTrack
}

describe('hosted capture proof', () => {
  it('only accepts the live monitor belonging to the same share and chat', () => {
    const capture = new HostedScreenShareCapture()
    capture.set('share-a', 'chat-a', track('monitor'))
    expect(capture.inspect('share-a', 'chat-a')).toEqual({ width: 1920, height: 1080 })
    expect(capture.inspect('share-b', 'chat-a')).toBeNull()
    expect(capture.inspect('share-a', 'chat-b')).toBeNull()
    capture.clear('different')
    expect(capture.inspect('share-a', 'chat-a')).not.toBeNull()
    capture.clear('share-a')
    expect(capture.inspect('share-a', 'chat-a')).toBeNull()
  })

  it('fails closed for windows, browser tabs, ended tracks and invalid dimensions', () => {
    const capture = new HostedScreenShareCapture()
    for (const candidate of [track('window'), track('browser'), track('monitor', 'ended'), track('monitor', 'live', 0)]) {
      capture.set('share-a', 'chat-a', candidate)
      expect(capture.inspect('share-a', 'chat-a')).toBeNull()
    }
  })
})
