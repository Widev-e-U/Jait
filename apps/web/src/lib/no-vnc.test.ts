import { describe, expect, it } from 'vitest'
import { buildNoVncViewerUrl, isNoVncViewerUrl, isWebSocketUrl } from './no-vnc'

describe('noVNC helpers', () => {
  it('builds query params for vnc_lite viewers', () => {
    expect(buildNoVncViewerUrl({
      websocketUrl: 'ws://127.0.0.1:5900',
      viewOnly: false,
      shared: true,
      resize: 'remote',
    })).toBe('/noVNC/vnc_lite.html?autoconnect=true&path=ws%3A%2F%2F127.0.0.1%3A5900&view_only=0&shared=1&resize=remote')
  })

  it('builds hash params for classic vnc viewers', () => {
    expect(buildNoVncViewerUrl({
      viewerUrl: '/noVNC/vnc.html',
      websocketUrl: 'wss://example.test/websockify',
      scaleViewport: true,
      reconnect: true,
    })).toBe('/noVNC/vnc.html#autoconnect=true&path=wss%3A%2F%2Fexample.test%2Fwebsockify&reconnect=1&scale=1')
  })

  it('clamps numeric quality controls into the supported range', () => {
    expect(buildNoVncViewerUrl({
      websocketUrl: 'ws://127.0.0.1:5900',
      quality: 99,
      compression: -4,
    })).toBe('/noVNC/vnc_lite.html?autoconnect=true&path=ws%3A%2F%2F127.0.0.1%3A5900&quality=9&compression=0')
  })

  it('preserves existing query params on vnc_lite viewers when adding websocket config', () => {
    expect(buildNoVncViewerUrl({
      viewerUrl: '/noVNC/vnc_lite.html?logging=debug&resize=remote',
      websocketUrl: 'wss://example.test/websockify',
      quality: 4,
    })).toBe('/noVNC/vnc_lite.html?logging=debug&resize=remote&autoconnect=true&path=wss%3A%2F%2Fexample.test%2Fwebsockify&quality=4')
  })

  it('preserves existing hash params on classic vnc viewers when adding websocket config', () => {
    expect(buildNoVncViewerUrl({
      viewerUrl: '/noVNC/vnc.html?theme=dark#logging=debug&resize=remote',
      websocketUrl: 'wss://example.test/websockify',
      scaleViewport: false,
    })).toBe('/noVNC/vnc.html?theme=dark#logging=debug&resize=remote&autoconnect=true&path=wss%3A%2F%2Fexample.test%2Fwebsockify&scale=0')
  })

  it('recognizes websocket and viewer urls', () => {
    expect(isWebSocketUrl('ws://127.0.0.1:5900')).toBe(true)
    expect(isNoVncViewerUrl('/noVNC/vnc.html')).toBe(true)
    expect(isNoVncViewerUrl('/noVNC/vnc_lite.html')).toBe(true)
  })
})
