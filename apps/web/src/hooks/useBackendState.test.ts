import { describe, expect, it } from 'vitest'

import {
  createBackendStatePersistRequestInit,
  getBackendStateRequestKey,
  resolveBackendStateSnapshot,
  shouldApplyBackendStateFetchResult,
} from '@/hooks/useBackendState'

describe('shouldApplyBackendStateFetchResult', () => {
  it('applies fetch results when no newer local write happened', () => {
    expect(shouldApplyBackendStateFetchResult(0, 0)).toBe(true)
    expect(shouldApplyBackendStateFetchResult(3, 3)).toBe(true)
  })

  it('ignores stale fetch results after a local optimistic update', () => {
    expect(shouldApplyBackendStateFetchResult(0, 1)).toBe(false)
    expect(shouldApplyBackendStateFetchResult(2, 5)).toBe(false)
  })
})

describe('createBackendStatePersistRequestInit', () => {
  it('builds the PATCH request payload for persisted backend state', async () => {
    const init = createBackendStatePersistRequestInit('token-123', 'chat.mode', 'agent')

    expect(init.method).toBe('PATCH')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-123',
    })
    expect(init.keepalive).toBe(false)

    const request = new Request('http://localhost/backend-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({ 'chat.mode': 'agent' }))
  })

  it('serializes object payloads for DB-backed entity state', async () => {
    const init = createBackendStatePersistRequestInit('token-123', 'manager.selectedRepo', {
      repoId: 'repo-123',
      localPath: '/work/repo',
    })

    const request = new Request('http://localhost/backend-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({
      'manager.selectedRepo': {
        repoId: 'repo-123',
        localPath: '/work/repo',
      },
    }))
  })

  it('enables keepalive for immediate writes', async () => {
    const init = createBackendStatePersistRequestInit(
      'token-123',
      'project.ui',
      { panel: { open: false }, layout: { tree: false, editor: false } },
      { immediate: true },
    )

    expect(init.method).toBe('PATCH')
    expect(init.keepalive).toBe(true)
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-123',
    })

    const request = new Request('http://localhost/backend-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({
      'project.ui': {
        panel: { open: false },
        layout: { tree: false, editor: false },
      },
    }))
  })
})

describe('backend state scoping', () => {
  it('builds a stable request key only when entity auth is available', () => {
    expect(getBackendStateRequestKey('session-1', 'manager.selectedRepo', 'token-1')).toBe('session-1:manager.selectedRepo:token-1')
    expect(getBackendStateRequestKey(null, 'manager.selectedRepo', 'token-1')).toBeNull()
    expect(getBackendStateRequestKey('session-1', 'manager.selectedRepo', null)).toBeNull()
  })

  it('hides the previous entity state while the next one loads', () => {
    const previousRequestKey = getBackendStateRequestKey('project-a', 'project.ui', 'token-1')
    const nextRequestKey = getBackendStateRequestKey('project-b', 'project.ui', 'token-1')

    expect(resolveBackendStateSnapshot(
      { layout: { tree: true, editor: true } },
      false,
      nextRequestKey,
      previousRequestKey,
    )).toEqual({
      value: null,
      loading: true,
    })
  })

  it('exposes state only for the entity that loaded it', () => {
    const requestKey = getBackendStateRequestKey('project-a', 'project.ui', 'token-1')
    const value = { layout: { tree: false, editor: true } }

    expect(resolveBackendStateSnapshot(value, false, requestKey, requestKey)).toEqual({
      value,
      loading: false,
    })
    expect(resolveBackendStateSnapshot(value, false, null, requestKey)).toEqual({
      value: null,
      loading: false,
    })
  })
})