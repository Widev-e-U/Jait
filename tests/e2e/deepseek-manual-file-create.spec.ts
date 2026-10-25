/**
 * Opt-in live DeepSeek V4.1 Flash smoke test; never enabled in normal CI.
 * Requires a gateway configured with a live Jait backend and model access.
 * Run from the repository root:
 *   RUN_MANUAL_DEEPSEEK=1 bun run test:e2e deepseek-manual-file-create.spec.ts
 * Override DEEPSEEK_MODEL when the provider uses a different model identifier.
 * Set E2E_AUTH_TOKEN when targeting an existing gateway rather than a fresh E2E stack.
 */
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const RUN_MANUAL_DEEPSEEK = process.env.RUN_MANUAL_DEEPSEEK === '1'
const model = process.env.DEEPSEEK_MODEL || 'deepseek/deepseek-v4.1-flash'
const projectRoot = resolve(__dirname, '../..')

type StreamEvent = {
  type?: string
  tool?: string
  call_id?: string
  ok?: boolean
  message?: string
  data?: unknown
}

function parseSseEvents(streamBody: string): StreamEvent[] {
  const events: StreamEvent[] = []
  for (const line of streamBody.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const payload = line.slice(6).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      events.push(JSON.parse(payload) as StreamEvent)
    } catch {
      // Ignore partial/non-JSON lines
    }
  }
  return events
}

test.describe('Manual DeepSeek V4.1 Flash file creation via terminal.run', () => {
  test.skip(!RUN_MANUAL_DEEPSEEK, 'Live-model test. Set RUN_MANUAL_DEEPSEEK=1 to run.')
  test.setTimeout(180000)

  test('creates a txt file through /api/chat using DeepSeek V4.1 Flash', async ({ request }) => {
    const marker = `deepseek-e2e-${Date.now()}`
    const artifactsDir = resolve(__dirname, '../../.jait/artifacts/manual-deepseek')
    mkdirSync(artifactsDir, { recursive: true })
    const filePath = resolve(artifactsDir, `file-create-${marker}.txt`)
    const expectedText = 'hello world'
    const script = `require('node:fs').writeFileSync(${JSON.stringify(filePath)}, ${JSON.stringify(expectedText)}, 'utf8')`
    // Single-quote for the Linux gateway shell; escape embedded apostrophes.
    const command = `node -e '${script.replace(/'/g, "'\\''")}'`

    const prompt = [
      'Use the terminal.run tool exactly once.',
      'Create a .txt file with exactly the content: hello world',
      'Run this command exactly as written:',
      command,
      'After the tool call is done, reply with DONE.',
    ].join('\n')

    const token = process.env.E2E_AUTH_TOKEN || await registerAgentTestUser(
      request, API_URL, `manual-deepseek-${marker}`, 'e2e-manual-deepseek-password',
    )
    const headers = { Authorization: `Bearer ${token}` }
    const created = await request.post(`${API_URL}/api/sessions`, {
      headers,
      data: { name: `manual-deepseek-${marker}`, projectRoot, provider: 'jait', model },
    })
    expect(created.ok()).toBeTruthy()
    const { id: sessionId } = await created.json()
    expect(sessionId).toBeTruthy()

    const response = await request.post(`${API_URL}/api/chat`, {
      headers,
      data: {
        sessionId,
        content: prompt,
        provider: 'jait',
        model,
        projectRoot,
      },
      timeout: 120000,
    })

    expect(response.ok()).toBeTruthy()

    const streamText = await response.text()
    const events = parseSseEvents(streamText)

    const callToolById = new Map<string, string>()
    for (const event of events) {
      if (event.type === 'tool_start' && event.call_id && event.tool) {
        callToolById.set(event.call_id, event.tool)
      }
    }

    const terminalResults = events.filter((event) => {
      if (event.type !== 'tool_result' || !event.call_id) return false
      return callToolById.get(event.call_id) === 'terminal.run'
    })

    expect(terminalResults.length).toBeGreaterThan(0)
    expect(terminalResults.some((event) => event.ok === true)).toBeTruthy()

    expect(existsSync(filePath)).toBeTruthy()
    const text = readFileSync(filePath, 'utf8').trim()
    expect(text).toBe(expectedText)

    // Keep artifact for manual verification unless explicitly requested.
    if (process.env.CLEANUP_MANUAL_DEEPSEEK === '1') {
      rmSync(filePath, { force: true })
    } else {
      console.log(`MANUAL_ARTIFACT_FILE: ${filePath}`)
    }
  })
})
