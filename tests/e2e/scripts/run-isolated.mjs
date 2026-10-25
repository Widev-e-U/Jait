import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const argv = process.argv.slice(2)
let shards = 1
if (argv[0]?.startsWith('--shards=')) {
  const value = argv.shift().slice('--shards='.length)
  if (!/^[1-4]$/.test(value)) throw new Error('Expected --shards=1..4')
  shards = Number(value)
}
const [command, ...args] = argv
if (!command) throw new Error('Usage: run-isolated.mjs [--shards=1..4] <command> [args...]')
if (shards > 1 && args.some(arg => /^(--shard|--workers)(=|$)/.test(arg))) {
  throw new Error('The isolated shard runner owns --shard and --workers')
}

const artifacts = join(root, '.jait/artifacts/playwright-shards')
await mkdir(artifacts, { recursive: true })
const runDir = await mkdtemp(join(artifacts, 'run-'))
const startedAt = Date.now()
const children = new Set()
const results = []
let stopping = false
let escalation
let exitCode = 0

function signalChild(child, signal) {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

function stop(code) {
  exitCode ||= code
  if (stopping) return
  stopping = true
  for (const child of children) signalChild(child, 'SIGTERM')
  escalation = setTimeout(() => {
    for (const child of children) signalChild(child, 'SIGKILL')
  }, 5000)
}
const onTerm = () => stop(143)
const onInt = () => stop(130)
process.on('SIGTERM', onTerm)
process.on('SIGINT', onInt)

// Reserve all ports together so no two live shards receive the same port.
// Strict server binds still reject an external allocation race after release.
const reservations = []
try {
  for (let i = 0; i < shards * 3; i++) {
    const server = createServer()
    reservations.push(server)
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
  }
  const ports = reservations.map(server => server.address().port)
  await Promise.all(reservations.map(server => new Promise(resolve => server.close(resolve))))
  await Promise.all(Array.from({ length: shards }, async (_, index) => {
    if (stopping) return
    const shard = index + 1
    const shardDir = join(runDir, `shard-${shard}`)
    const [frontend, api, ui] = ports.slice(index * 3, index * 3 + 3)
    const shardArgs = shards > 1 ? [`--shard=${shard}/${shards}`, '--workers=1'] : []
    const started = Date.now()
    console.log(`[e2e] Starting ${shard}/${shards}; frontend=${frontend} api=${api}; artifacts: ${shardDir}`)
    await new Promise(resolve => {
      const child = spawn(command, [...args, ...shardArgs], {
        cwd: root,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          // Each shard owns its complete stack, including a fresh DB/state dir
          // created by start-dev-stack.mjs. Never attach shards to a shared API.
          ...(shards > 1 ? { FRONTEND_URL: '', API_URL: '', PLAYWRIGHT_WORKERS: '1' } : {}),
          E2E_FRONTEND_PORT: String(frontend),
          E2E_API_PORT: String(api),
          UI_FRONTEND_URL: `http://127.0.0.1:${ui}`,
          JAIT_E2E_ARTIFACT_DIR: shardDir,
        },
      })
      children.add(child)
      let spawnError
      child.on('error', error => { spawnError = error.message; console.error(error); stop(1) })
      child.on('close', (code, signal) => {
        // Drain descendants even if a failed command left a dev server behind.
        signalChild(child, 'SIGKILL')
        children.delete(child)
        const passed = code === 0 && !signal && !spawnError
        results.push({ shard, passed, code, signal, error: spawnError, durationMs: Date.now() - started, frontend, api, artifacts: shardDir })
        if (!passed) stop(1)
        console.log(`[e2e] Shard ${shard}/${shards}: ${passed ? 'passed' : 'failed/cancelled'} (${Date.now() - started}ms)`)
        resolve()
      })
    })
  }))
} finally {
  for (const server of reservations) if (server.listening) await new Promise(resolve => server.close(resolve))
  clearTimeout(escalation)
  process.off('SIGTERM', onTerm)
  process.off('SIGINT', onInt)
  const passed = !stopping && results.length === shards && results.every(result => result.passed)
  const report = { passed, shards, durationMs: Date.now() - startedAt, results: results.sort((a, b) => a.shard - b.shard) }
  await writeFile(join(runDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`[e2e] ${passed ? 'Passed' : 'Failed'}; summary: ${join(runDir, 'summary.json')}`)
  process.exitCode = passed ? 0 : exitCode || 1
}
