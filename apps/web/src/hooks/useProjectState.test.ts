import { describe, expect, it } from 'vitest'

import {
  createProjectStatePersistRequestInit,
  getProjectStateRequestKey,
  resolveProjectStateSnapshot,
} from '@/hooks/useProjectState'

describe('createProjectStatePersistRequestInit', () => {
  it('enables keepalive for immediate project writes', async () => {
    const init = createProjectStatePersistRequestInit(
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

    const request = new Request('http://localhost/project-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({
      'project.ui': {
        panel: { open: false },
        layout: { tree: false, editor: false },
      },
    }))
  })

  it('keeps debounced writes as normal non-keepalive fetches', () => {
    const init = createProjectStatePersistRequestInit(
      'token-123',
      'project.ui',
      { panel: { open: true } },
    )

    expect(init.keepalive).toBe(false)
  })
})

describe('project state scoping', () => {
  it('hides the previous project state while the next project loads', () => {
    const previousRequestKey = getProjectStateRequestKey('project-a', 'project.ui', 'token-1')
    const nextRequestKey = getProjectStateRequestKey('project-b', 'project.ui', 'token-1')

    expect(resolveProjectStateSnapshot(
      { layout: { tree: true, editor: true } },
      false,
      nextRequestKey,
      previousRequestKey,
    )).toEqual({
      value: null,
      loading: true,
    })
  })

  it('exposes state only for the project that loaded it', () => {
    const requestKey = getProjectStateRequestKey('project-a', 'project.ui', 'token-1')
    const value = { layout: { tree: false, editor: true } }

    expect(resolveProjectStateSnapshot(value, false, requestKey, requestKey)).toEqual({
      value,
      loading: false,
    })
    expect(resolveProjectStateSnapshot(value, false, null, requestKey)).toEqual({
      value: null,
      loading: false,
    })
  })
})
