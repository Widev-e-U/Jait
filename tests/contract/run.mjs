import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
const artifacts = resolve(root, '.jait/artifacts/rust-contract-target')
mkdirSync(artifacts, { recursive: true })
const localCargo = join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
const cargo = process.env.CARGO || (existsSync(localCargo) ? localCargo : 'cargo')
const [mode = 'run', ...args] = process.argv.slice(2)
const binaryModes = { internal: 'internal-contract', coverage: 'coverage', 'translated-report': 'translated-contract', 'resource-baseline': 'resource-baseline', interfaces: 'interfaces' }
if (!['run', 'internal', 'coverage', 'test', 'translated', 'translated-report', 'resource-baseline', 'interfaces', 'source-review', 'fmt', 'clippy'].includes(mode)) throw new Error('Expected run, internal, coverage, test, translated, translated-report, resource-baseline, interfaces, source-review, fmt or clippy')
// Source review has its own locked dependencies; unrelated native ports must not
// alter its build while reference assertions and mutation controls are executing.
const sourceReview = mode === 'source-review' || (mode === 'test' && args[0] === '--test'
  && args[1] === 'source_review' && !args.slice(2).includes('--test'))
// Cargo embeds CARGO_MANIFEST_DIR in the test binary. Distinct source copies
// must not reuse that binary through a shared target-directory symlink.
const buildArtifacts = sourceReview
  ? join(artifacts, `source-review-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`)
  : join(artifacts, `contracts-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`)
const manifest = fileURLToPath(new URL(sourceReview ? '../source-review/Cargo.toml' : './Cargo.toml', import.meta.url))
// Four peers retain subprocess isolation without saturating the host.
const cargoArgs = sourceReview
  ? ['test', '--locked', '--manifest-path', manifest, '--test', 'source_review', ...(mode === 'source-review' ? args : args.slice(2))]
  : mode === 'translated'
  ? ['test', '--locked', '--manifest-path', manifest, '--test', 'tail_static', '--',
    ...(args.some(arg => arg.startsWith('--test-threads')) ? [] : ['--test-threads=4']), ...args]
  : mode === 'fmt'
  ? ['fmt', '--manifest-path', manifest, '--', '--check']
  : [Object.hasOwn(binaryModes, mode) ? 'run' : mode, '--locked', '--manifest-path', manifest,
    ...(Object.hasOwn(binaryModes, mode) ? ['--bin', binaryModes[mode], '--', ...args]
      : mode === 'run' ? ['--', ...args] : args)]
if (mode === 'test' && args.length === 0) {
  const { parallelContracts } = await import('../../packages/gateway-rust/tooling/parallel-contracts.mjs')
  const controller = new AbortController()
  const interrupt = () => controller.abort(new Error('Contract run interrupted'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, interrupt)
  try {
    process.exitCode = await parallelContracts({
      cargo, manifest, target: buildArtifacts, root,
      env: { ...process.env, CARGO_TERM_PROGRESS_WHEN: 'never', CARGO_TERM_COLOR: 'never' },
      signal: controller.signal,
    }) ? 0 : 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, interrupt)
  }
} else {
  const child = spawn(cargo, cargoArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CARGO_TARGET_DIR: buildArtifacts, CARGO_BUILD_JOBS: '2', CARGO_TERM_PROGRESS_WHEN: 'never', CARGO_TERM_COLOR: 'never' },
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
}
