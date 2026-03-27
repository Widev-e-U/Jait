import { describe, expect, it } from 'vitest'

import type { BrowserSession } from '@/lib/browser-collaboration-api'
import {
  canOpenLiveSessionInPreview,
  formatSessionMetadataValue,
  getBrowserSessionDetails,
  getBrowserSessionOpenTarget,
  getPreviewSurfaceStatus,
  getPreviewSurfaceStorageScope,
  isSessionVisibleInPreview,
} from './browser-collaboration-panel-helpers'

function makeSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    id: 'browser-session-1',
    name: 'isolated-jait-live-test',
    workspaceRoot: '/workspace/app',
    targetUrl: 'http://127.0.0.1:3000/login',
    previewUrl: '/api/dev-proxy/3000/login',
    previewSessionId: 'preview-session-1',
    browserId: 'browser-surface-1',
    mode: 'isolated',
    origin: 'managed',
    controller: 'agent',
    status: 'paused',
    secretSafe: false,
    storageProfile: {
      tempHome: '/tmp/jait-home',
      browserProfile: '/tmp/jait-profile',
    },
    createdBy: 'agent',
    createdAt: '2026-03-27T00:00:00.000Z',
    updatedAt: '2026-03-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('browser collaboration panel helpers', () => {
  it('prefers the preview URL when opening a live session', () => {
    expect(getBrowserSessionOpenTarget(makeSession())).toBe('/api/dev-proxy/3000/login')
    expect(getBrowserSessionOpenTarget(makeSession({ previewUrl: null }))).toBe('http://127.0.0.1:3000/login')
  })

  it('routes managed sessions with a workspace root into the preview surface', () => {
    expect(canOpenLiveSessionInPreview(makeSession())).toBe(true)
    expect(canOpenLiveSessionInPreview(makeSession({
      origin: 'attached',
      workspaceRoot: null,
      previewUrl: 'https://example.com/live',
      targetUrl: 'https://example.com/live',
    }))).toBe(false)
    expect(canOpenLiveSessionInPreview(makeSession({
      workspaceRoot: null,
      previewUrl: 'https://example.com/managed',
      targetUrl: 'https://example.com/managed',
    }))).toBe(false)
  })

  it('routes attached loopback and gateway preview urls into the preview surface', () => {
    expect(canOpenLiveSessionInPreview(makeSession({
      origin: 'attached',
      workspaceRoot: null,
      previewUrl: '/api/dev-proxy/3000/login',
    }))).toBe(true)

    expect(canOpenLiveSessionInPreview(makeSession({
      origin: 'direct',
      workspaceRoot: null,
      previewUrl: null,
      targetUrl: 'http://127.0.0.1:8000/',
    }))).toBe(true)
  })

  it('builds explicit session metadata rows including storage profile details', () => {
    expect(getBrowserSessionDetails(makeSession())).toEqual([
      { label: 'Target', value: 'http://127.0.0.1:3000/login' },
      { label: 'Live URL', value: '/api/dev-proxy/3000/login' },
      { label: 'Isolation', value: 'isolated' },
      { label: 'Origin', value: 'managed' },
      { label: 'Controller', value: 'agent' },
      { label: 'Workspace', value: '/workspace/app' },
      { label: 'Preview Session', value: 'preview-session-1' },
      { label: 'Browser Surface', value: 'browser-surface-1' },
      { label: 'Storage Temp Home', value: '/tmp/jait-home' },
      { label: 'Storage Browser Profile', value: '/tmp/jait-profile' },
    ])
  })

  it('formats nested metadata values without crashing', () => {
    expect(formatSessionMetadataValue({ tempDbPath: '/tmp/db.sqlite', ports: [3000, 3001] })).toBe(
      '{"tempDbPath":"/tmp/db.sqlite","ports":[3000,3001]}',
    )
  })

  it('reports whether the preview surface is hidden, blank, or connected', () => {
    expect(getPreviewSurfaceStatus(null)).toBe('hidden')
    expect(getPreviewSurfaceStatus({ open: true })).toBe('blank')
    expect(getPreviewSurfaceStatus({ open: true, target: 'http://127.0.0.1:3000/' })).toBe('connected')
  })

  it('marks a session visible when the preview is bound to its browser session id', () => {
    expect(isSessionVisibleInPreview(
      makeSession(),
      { open: true, browserSessionId: 'browser-session-1', displayState: 'connected' },
    )).toBe(true)
    expect(isSessionVisibleInPreview(
      makeSession(),
      { open: true, browserSessionId: 'browser-session-2', displayState: 'connected' },
    )).toBe(false)
  })

  it('reports preview storage scope explicitly', () => {
    expect(getPreviewSurfaceStorageScope(null)).toBe('unknown')
    expect(getPreviewSurfaceStorageScope({ open: true, storageScope: 'shared-browser' })).toBe('shared-browser')
  })
})
