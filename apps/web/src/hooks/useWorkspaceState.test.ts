import { describe, expect, it } from 'vitest'

import { createWorkspaceStatePersistRequestInit } from '@/hooks/useWorkspaceState'

describe('createWorkspaceStatePersistRequestInit', () => {
  it('enables keepalive for immediate workspace writes', async () => {
    const init = createWorkspaceStatePersistRequestInit(
      'token-123',
      'workspace.ui',
      { panel: { open: false }, layout: { tree: false, editor: false } },
      { immediate: true },
    )

    expect(init.method).toBe('PATCH')
    expect(init.keepalive).toBe(true)
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-123',
    })

    const request = new Request('http://localhost/workspace-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({
      'workspace.ui': {
        panel: { open: false },
        layout: { tree: false, editor: false },
      },
    }))
  })

  it('keeps debounced writes as normal non-keepalive fetches', () => {
    const init = createWorkspaceStatePersistRequestInit(
      'token-123',
      'workspace.ui',
      { panel: { open: true } },
    )

    expect(init.keepalive).toBe(false)
  })
})
