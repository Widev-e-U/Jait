import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const gatewayDir = resolve(repoRoot, 'packages/gateway')
const webDir = resolve(repoRoot, 'apps/web')

const frontendUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3100'
const gatewayUrl = process.env.API_URL || 'http://127.0.0.1:8100'
const frontendPort = String(new URL(frontendUrl).port || (new URL(frontendUrl).protocol === 'https:' ? 443 : 80))
const gatewayPort = String(new URL(gatewayUrl).port || (new URL(gatewayUrl).protocol === 'https:' ? 443 : 80))

const children = []
let shuttingDown = false
let keepAlive = null
let e2eStateDir = null

function spawnServer(name, command, args, cwd, extraEnv = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
  }
  delete env.__JAIT_CLI

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    const suffix = signal ? ` signal ${signal}` : ` code ${code ?? 'unknown'}`
    console.error(`[e2e] ${name} exited unexpectedly with${suffix}`)
    void shutdown(1)
  })

  children.push(child)
  return child
}

async function waitForUrl(url, label) {
  const deadline = Date.now() + 120_000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (response.ok || response.status === 404) return
      lastError = new Error(`${label} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for ${label} at ${url}${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`)
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    return response.ok || response.status === 404
  } catch {
    return false
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  if (keepAlive !== null) {
    clearInterval(keepAlive)
    keepAlive = null
  }

  for (const child of children.slice().reverse()) {
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  }

  await delay(1000)

  for (const child of children.slice().reverse()) {
    try {
      if (!child.killed) child.kill('SIGKILL')
    } catch {
      // ignore
    }
  }

  if (e2eStateDir) {
    await rm(e2eStateDir, { recursive: true, force: true })
    e2eStateDir = null
  }

  process.exit(exitCode)
}

process.on('SIGINT', () => { void shutdown(0) })
process.on('SIGTERM', () => { void shutdown(0) })

try {
  const frontendReady = await isUrlReady(frontendUrl)
  const gatewayHealthUrl = `${gatewayUrl}/health`
  const gatewayReady = await isUrlReady(gatewayHealthUrl)

  if (frontendReady || gatewayReady) {
    const occupied = [
      frontendReady ? `frontend ${frontendUrl}` : null,
      gatewayReady ? `gateway ${gatewayUrl}` : null,
    ].filter(Boolean).join(' and ')
    throw new Error(`Refusing to reuse an existing E2E server at ${occupied}. Stop it or set FRONTEND_URL and API_URL to use an external stack explicitly.`)
  }

  e2eStateDir = await mkdtemp(resolve(tmpdir(), 'jait-e2e-'))

  spawnServer('gateway', 'bun', ['src/index.ts'], gatewayDir, {
    PORT: gatewayPort,
    CORS_ORIGIN: frontendUrl,
    NODE_ENV: 'test',
    JAIT_DB_PATH: resolve(e2eStateDir, 'jait.db'),
  })
  await waitForUrl(gatewayHealthUrl, 'gateway health')

  spawnServer('web', 'bun', ['run', 'dev', '--host', '0.0.0.0'], webDir, {
    JAIT_GATEWAY_URL: gatewayUrl,
    VITE_WS_URL: gatewayUrl.replace(/^http/, 'ws'),
    NODE_ENV: 'development',
    PORT: frontendPort,
  })
  await waitForUrl(frontendUrl, 'frontend')

  // Keep the orchestration process alive until Playwright stops it.
  keepAlive = setInterval(() => {}, 60_000)
} catch (error) {
  console.error(error)
  await shutdown(1)
}
