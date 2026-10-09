import { describe, expect, it } from 'vitest'
import { resolveNoVncSessionUrl } from './no-vnc-session-view'

describe('live browser control options', () => {
  it('makes lite viewers read-only while the agent controls the browser', () => {
    expect(resolveNoVncSessionUrl('/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', { viewOnly: true })).toContain('view_only=1')
  })
  it('removes the read-only parameter when the user takes over', () => {
    const url = resolveNoVncSessionUrl('/noVNC/vnc_lite.html?path=api/live-view/6080/websockify&view_only=1', { viewOnly: false })!
    expect(url).not.toContain('view_only')
    expect(url).toContain('path=api%2Flive-view%2F6080%2Fwebsockify')
    expect(url).toContain('scale=true')
  })
})
