import { describe, expect, it } from 'vitest'
import { buildNoVncViewerUrl, isNoVncViewerUrl, isWebSocketUrl } from './no-vnc'

describe('noVNC helpers', () => {
  it('normalizes websocket urls into a local noVNC viewer url', () => {
    expect(buildNoVncViewerUrl({
      websocketUrl: 'ws://127.0.0.1:5900',
      viewOnly: false,
      shared: true,
      resize: 'remote',
    })).toContain('/noVNC/vnc_lite.html#')
  })

  it('recognizes websocket and viewer urls', () => {
    expect(isWebSocketUrl('ws://127.0.0.1:5900')).toBe(true)
    expect(isNoVncViewerUrl('/noVNC/vnc.html')).toBe(true)
  })
})
