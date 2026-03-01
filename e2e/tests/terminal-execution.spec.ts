/**
 * E2E: Terminal execution via REST API
 *
 * Tests that the gateway can:
 * 1. Create a persistent terminal (POST /api/terminals)
 * 2. Execute commands in it (POST /api/terminals/:id/execute)
 * 3. Execute commands via the terminal.run tool (POST /api/tools/execute)
 * 4. Return correct output and exit codes
 * 5. Persist between commands (state carries over)
 *
 * Requires: gateway running on API_URL (default http://localhost:8000)
 */
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'

/** Helper: create a fresh terminal and return its id */
async function createTerminal(request: any, sessionId?: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/terminals`, {
    data: {
      sessionId: sessionId ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceRoot: process.cwd(),
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.id).toBeTruthy()
  // Give the shell time to initialize
  await new Promise((r) => setTimeout(r, 1500))
  return body.id as string
}

test.describe('Terminal execution', () => {
  // Run sequentially within this describe — tests don't share state but
  // we avoid spawning too many terminals in parallel.
  test.describe.configure({ mode: 'serial' })

  test('creates a terminal via REST', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/terminals`, {
      data: {
        sessionId: `e2e-create-${Date.now()}`,
        workspaceRoot: process.cwd(),
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.type).toBe('terminal')
    expect(body.state).toBe('running')

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${body.id}`)
  })

  test('executes echo command and gets output', async ({ request }) => {
    const terminalId = await createTerminal(request)

    const res = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: 'echo hello-from-e2e',
        timeout: 15000,
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.output).toContain('hello-from-e2e')
    expect(body.exitCode).toBe(0)
    expect(body.timedOut).toBe(false)

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${terminalId}`)
  })

  test('captures non-zero exit codes', async ({ request }) => {
    const terminalId = await createTerminal(request)

    // Use cmd /c so the *subprocess* exits 42 without killing the shell
    const res = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: 'cmd /c "exit 42"',
        timeout: 15000,
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.exitCode).toBe(42)

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${terminalId}`)
  })

  test('terminal persists state between commands', async ({ request }) => {
    const terminalId = await createTerminal(request)

    // Set a variable in one command
    const setRes = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: '$env:JAIT_E2E_VAR = "sentinel-value-123"',
        timeout: 10000,
      },
    })
    expect(setRes.ok()).toBeTruthy()

    // Read it back in the next command
    const getRes = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: 'echo $env:JAIT_E2E_VAR',
        timeout: 10000,
      },
    })
    expect(getRes.ok()).toBeTruthy()

    const body = await getRes.json()
    expect(body.ok).toBe(true)
    expect(body.output).toContain('sentinel-value-123')

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${terminalId}`)
  })

  test('lists terminal in GET /api/terminals', async ({ request }) => {
    const terminalId = await createTerminal(request)

    const res = await request.get(`${API_URL}/api/terminals`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    // API returns { terminals: [...] }
    expect(body.terminals).toBeTruthy()
    expect(Array.isArray(body.terminals)).toBe(true)
    const found = body.terminals.find((t: { id: string }) => t.id === terminalId)
    expect(found).toBeTruthy()
    expect(found.state).toBe('running')

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${terminalId}`)
  })

  test('terminal.run tool executes and returns terminalId', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'terminal.run',
        input: {
          command: 'echo tool-run-test-output',
          timeout: 15000,
        },
        sessionId: `e2e-tool-run-${Date.now()}`,
        workspaceRoot: process.cwd(),
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.output).toContain('tool-run-test-output')
    expect(body.data.exitCode).toBe(0)
    expect(body.data.terminalId).toBeTruthy()
    expect(body.data.terminalId).toMatch(/^term-/)

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${body.data.terminalId}`)
  })

  test('terminal.run reuses same terminal for same session', async ({ request }) => {
    const sessionId = `e2e-reuse-${Date.now()}`

    const res1 = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'terminal.run',
        input: { command: 'echo cmd-1' },
        sessionId,
        workspaceRoot: process.cwd(),
      },
    })
    const body1 = await res1.json()

    const res2 = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'terminal.run',
        input: { command: 'echo cmd-2' },
        sessionId,
        workspaceRoot: process.cwd(),
      },
    })
    const body2 = await res2.json()

    expect(body1.ok).toBe(true)
    expect(body2.ok).toBe(true)
    // Same session should reuse the same terminal
    expect(body2.data.terminalId).toBe(body1.data.terminalId)

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${body1.data.terminalId}`)
  })

  test('kills terminal via DELETE', async ({ request }) => {
    const terminalId = await createTerminal(request)

    const res = await request.delete(`${API_URL}/api/terminals/${terminalId}`)
    expect(res.ok()).toBeTruthy()

    // Verify it's gone
    const listRes = await request.get(`${API_URL}/api/terminals`)
    const body = await listRes.json()
    const found = body.terminals.find((t: { id: string }) => t.id === terminalId)
    expect(found).toBeFalsy()
  })
})
