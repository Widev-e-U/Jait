/**
 * Manual-only GPT-5 E2E:
 * - Sends a prompt to /api/chat
 * - Expects the agent to execute terminal.run and create a TXT file
 * - Verifies file existence + contents
 *
 * This test is skipped by default and should not run in automated pipelines.
 * To run manually:
 *   RUN_MANUAL_GPT5=1 OPENAI_MODEL=gpt-5 npm test -- tests/gpt5-manual-file-create.spec.ts
 */
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const RUN_MANUAL_GPT5 = process.env.RUN_MANUAL_GPT5 === '1'

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

test.describe('Manual GPT-5 file creation via terminal.run', () => {
  test.skip(!RUN_MANUAL_GPT5, 'Manual-only test. Set RUN_MANUAL_GPT5=1 to run.')

  test('creates a txt file through /api/chat using GPT-5', async ({ request }) => {
    const model = process.env.OPENAI_MODEL || ''
    test.skip(!/gpt-5/i.test(model), `OPENAI_MODEL must include gpt-5 (current: "${model || 'unset'}")`)

    const marker = `gpt5-e2e-${Date.now()}`
    const artifactsDir = join(process.cwd(), 'artifacts')
    mkdirSync(artifactsDir, { recursive: true })
    const filePath = join(artifactsDir, `gpt5-file-create-${marker}.txt`)
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "''")
    const expectedText = 'hello world'
    const escapedText = expectedText.replace(/'/g, "''")

    const psCommand = [
      `$path = '${escapedPath}'`,
      `'${escapedText}' | Set-Content -Path $path -Encoding UTF8`,
      "if (Test-Path $path) {",
      "  Get-Item $path | Select-Object FullName,Length | Format-List",
      "} else {",
      "  Write-Output ('NOT_CREATED: ' + $path)",
      "}",
    ].join('; ')

    const prompt = [
      'Use the terminal.run tool exactly once.',
      'Create a .txt file with exactly the content: hello world',
      'Run this PowerShell command exactly as written:',
      psCommand,
      'After the tool call is done, reply with DONE.',
    ].join('\n')

    const sessionId = `manual-gpt5-${marker}`
    const response = await request.post(`${API_URL}/api/chat`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        sessionId,
        content: prompt,
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
    if (process.env.CLEANUP_MANUAL_GPT5 === '1') {
      rmSync(filePath, { force: true })
    } else {
      console.log(`MANUAL_ARTIFACT_FILE: ${filePath}`)
    }
  })
})
