import { describe, expect, it } from 'vitest'

import { createProjectStatePersistRequestInit } from '@/hooks/useProjectState'

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
