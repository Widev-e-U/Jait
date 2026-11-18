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
import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://localhost:8000'

test.beforeEach(async ({ request }) => {
  await registerAgentTestUser(request, API_URL, `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`, 'terminal-test-password')
})

async function createOwnedSession(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const response = await request.post(`${API_URL}/api/sessions`, { data: { name: 'Terminal E2E' } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).id
}

/** Helper: create a fresh terminal and return its id */
async function createTerminal(
  request: any,
  sessionId?: string,
): Promise<{ id: string; shell: string }> {
  const res = await request.post(`${API_URL}/api/terminals`, {
    data: {
      sessionId: sessionId ?? await createOwnedSession(request),
      projectRoot: process.cwd(),
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.id).toBeTruthy()
  // Give the shell time to initialize
  await new Promise((r) => setTimeout(r, 1500))
  return {
    id: body.id as string,
    shell: String(body.metadata?.shell ?? ''),
  }
}

/** Execute as the test user, approving only this owned session's exact echo. */
async function executeTerminalTool(
  request: import('@playwright/test').APIRequestContext,
  sessionId: string,
  command: string,
): Promise<import('@playwright/test').APIResponse> {
  const execution = request.post(`${API_URL}/api/tools/execute`, {
    data: {
      tool: 'terminal.run', input: { command, timeout: 15000 },
      sessionId, projectRoot: process.cwd(), consentTimeoutMs: 15000,
    },
  })
  let finished = false
  void execution.then(() => { finished = true }, () => { finished = true })
  await expect.poll(async () => {
    if (finished) return true
    const pending = await request.get(`${API_URL}/api/consent/pending/${sessionId}`)
    expect(pending.ok()).toBeTruthy()
    const { requests } = await pending.json() as { requests: Array<{ id: string; toolName: string; sessionId: string; preview: { command?: string } }> }
    const approval = requests.find(item => item.toolName === 'terminal.run' && item.sessionId === sessionId)
    if (!approval) return false
    expect(approval.preview.command).toBe(command)
    const approved = await request.post(`${API_URL}/api/consent/${approval.id}/approve`, {
      data: { reason: 'Approve the owned E2E echo fixture command' },
    })
    expect(approved.ok()).toBeTruthy()
    return true
  }, { timeout: 10000 }).toBe(true)
  return execution
}

test.describe('Terminal execution', () => {
  // Run sequentially within this describe — tests don't share state but
  // we avoid spawning too many terminals in parallel.
  test.describe.configure({ mode: 'serial' })

  test('creates a terminal via REST', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/terminals`, {
      data: {
        sessionId: await createOwnedSession(request),
        projectRoot: process.cwd(),
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
    const { id: terminalId } = await createTerminal(request)

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

  test('returns structured result for failing command', async ({ request }) => {
    const { id: terminalId } = await createTerminal(request)

    // Use an invalid command that should fail across shells/platforms.
    const res = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: '__jait_command_that_does_not_exist__',
        timeout: 15000,
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(typeof body.exitCode).toBe('number')
    expect(body.exitCode).not.toBe(0)
    expect(body.output).toBeTruthy()

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${terminalId}`)
  })

  test('terminal persists state between commands', async ({ request }) => {
    const { id: terminalId, shell } = await createTerminal(request)
    const powershell = /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(shell)

    // Set a variable in one command
    const setRes = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: powershell
          ? '$env:JAIT_E2E_VAR = "sentinel-value-123"'
          : 'export JAIT_E2E_VAR="sentinel-value-123"',
        timeout: 10000,
      },
    })
    expect(setRes.ok()).toBeTruthy()

    // Read it back in the next command
    const getRes = await request.post(`${API_URL}/api/terminals/${terminalId}/execute`, {
      data: {
        command: powershell
          ? 'echo $env:JAIT_E2E_VAR'
          : 'echo $JAIT_E2E_VAR',
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
    const { id: terminalId } = await createTerminal(request)

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
    const sessionId = await createOwnedSession(request)
    const res = await executeTerminalTool(request, sessionId, 'echo tool-run-test-output')
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
    const sessionId = await createOwnedSession(request)

    const res1 = await executeTerminalTool(request, sessionId, 'echo cmd-1')
    expect(res1.ok()).toBeTruthy()
    const body1 = await res1.json()

    const res2 = await executeTerminalTool(request, sessionId, 'echo cmd-2')
    expect(res2.ok()).toBeTruthy()
    const body2 = await res2.json()

    expect(body1.ok).toBe(true)
    expect(body2.ok).toBe(true)
    // Same session should reuse the same terminal
    expect(body2.data.terminalId).toBe(body1.data.terminalId)

    // Cleanup
    await request.delete(`${API_URL}/api/terminals/${body1.data.terminalId}`)
  })

  test('kills terminal via DELETE', async ({ request }) => {
    const { id: terminalId } = await createTerminal(request)

    const res = await request.delete(`${API_URL}/api/terminals/${terminalId}`)
    expect(res.ok()).toBeTruthy()

    // Verify it's gone
    const listRes = await request.get(`${API_URL}/api/terminals`)
    const body = await listRes.json()
    const found = body.terminals.find((t: { id: string }) => t.id === terminalId)
    expect(found).toBeFalsy()
  })
})
