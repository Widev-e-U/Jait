/**
 * E2E test for the `project.assign_repository` MCP tool.
 *
 * Verifies the rename from `workspace.assign_repository` → `project.assign_repository`:
 *   - The new name is registered and callable via the gateway's MCP HTTP endpoint.
 *   - The old `workspace.assign_repository` name is no longer registered.
 *   - The tool actually assigns/creates a repository for a project root that has a `.git` directory.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const API_URL = process.env.API_URL || 'http://localhost:8000'

interface McpToolListResult {
  tools: Array<{ name: string; description: string }>
}

interface McpToolCallResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

interface McpResponse<T> {
  jsonrpc: '2.0'
  id: number | string | null
  result?: T
  error?: { code: number; message: string }
}

async function rpc<T>(
  page: Page,
  token: string,
  method: string,
  params: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<McpResponse<T>> {
  const response = await page.request.post(`${API_URL}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    data: {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    },
  })
  expect(response.ok(), `MCP ${method} HTTP ${response.status()}`).toBeTruthy()
  return (await response.json()) as McpResponse<T>
}

function initGitProject(dir: string): void {
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email "e2e@example.com"', { cwd: dir })
  execSync('git config user.name "E2E"', { cwd: dir })
  writeFileSync(join(dir, 'README.md'), '# e2e project\n')
  execSync('git add README.md', { cwd: dir })
  execSync('git commit -q -m "init"', { cwd: dir })
}

async function createSession(page: Page, token: string, projectPath: string): Promise<string> {
  const response = await page.request.post(`${API_URL}/api/sessions`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      name: 'e2e project-assign-repository',
      projectPath,
    },
  })
  expect(response.ok(), `POST /api/sessions HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { id: string }
  expect(body.id).toBeTruthy()
  return body.id
}

test.describe('project.assign_repository MCP tool', () => {
  let projectDir: string

  test.beforeAll(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'jait-project-assign-'))
    initGitProject(projectDir)
  })

  test.afterAll(() => {
    if (projectDir) {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('is registered under the project namespace and not under workspace', async ({ page, apiToken }) => {
    const list = await rpc<McpToolListResult>(page, apiToken, 'tools/list', {})

    expect(list.error, list.error?.message).toBeUndefined()
    const toolNames = list.result?.tools.map((tool) => tool.name) ?? []

    expect(toolNames).toContain('project.assign_repository')
    expect(toolNames).not.toContain('workspace.assign_repository')

    const projectTool = list.result?.tools.find((tool) => tool.name === 'project.assign_repository')
    expect(projectTool?.description).toMatch(/project/i)
    expect(projectTool?.description).not.toMatch(/deprecated/i)
  })

  test('assigns a repository to a project given a projectRoot with a .git directory', async ({ page, apiToken }) => {
    const sessionId = await createSession(page, apiToken, projectDir)
    const call = await rpc<McpToolCallResult>(
      page,
      apiToken,
      'tools/call',
      {
        name: 'project.assign_repository',
        arguments: { projectRoot: projectDir },
      },
      { 'x-jait-session-id': sessionId },
    )

    expect(call.error, call.error?.message).toBeUndefined()
    expect(call.result?.isError, JSON.stringify(call.result)).toBeFalsy()

    const text = call.result?.content.map((part) => part.text).join('\n') ?? ''
    expect(text).toMatch(/project/i)
    expect(text).not.toMatch(/projectId or projectRoot is required/i)
  })

  test('refuses to call the removed workspace.assign_repository name', async ({ page, apiToken }) => {
    const sessionId = await createSession(page, apiToken, projectDir)
    const call = await rpc<McpToolCallResult>(
      page,
      apiToken,
      'tools/call',
      {
        name: 'workspace.assign_repository',
        arguments: { projectRoot: projectDir },
      },
      { 'x-jait-session-id': sessionId },
    )

    expect(call.result?.isError).toBeTruthy()
    const text = call.result?.content.map((part) => part.text).join('\n') ?? ''
    expect(text).toMatch(/unknown tool/i)
  })
})
