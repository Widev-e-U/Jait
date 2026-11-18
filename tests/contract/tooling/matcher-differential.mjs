#!/usr/bin/env node
// Differential matcher harness.
//
// 1. Real Vitest runs every corpus case and records what it decided.
// 2. The Rust comparator replays the same case ids and must agree with Vitest.
//
// Either half failing makes the whole harness fail. Run: node tests/contract/tooling/matcher-differential.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const manifest = fileURLToPath(new URL('../Cargo.toml', import.meta.url))
const config = fileURLToPath(new URL('./matcher-differential.config.ts', import.meta.url))

// Share the contract target dir with run.mjs so the two do not rebuild from scratch.
const targetDir = resolve(root, '.jait/artifacts/rust-contract-target')
mkdirSync(targetDir, { recursive: true })

const exe = name => (process.platform === 'win32' ? `${name}.cmd` : name)
const run = (label, command, args, env = {}) =>
  new Promise((resolvePromise, rejectPromise) => {
    console.error(`\n[matcher-differential] ${label}`)
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    })
    child.on('error', rejectPromise)
    child.on('exit', code => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`${label} exited with code ${code}`))
    })
  })

const vitestCandidates = [
  process.env.VITEST,
  join(root, 'node_modules/.bin', exe('vitest')),
].filter(Boolean)
const vitest = vitestCandidates.find(candidate => existsSync(candidate) || candidate === process.env.VITEST)
if (!vitest) throw new Error('vitest not found; run the workspace install first')

const localCargo = join(homedir(), '.cargo/bin', exe('cargo'))
const cargo = process.env.CARGO || (existsSync(localCargo) ? localCargo : 'cargo')

await run('vitest corpus', vitest, ['run', '--config', config])
await run(
  'rust differential',
  cargo,
  ['test', '--locked', '--manifest-path', manifest, '--test', 'matcher_differential', '--', '--nocapture'],
  {
    JAIT_MATCHER_DIFFERENTIAL: '1',
    CARGO_TARGET_DIR: targetDir,
    CARGO_TERM_COLOR: 'never',
    CARGO_TERM_PROGRESS_WHEN: 'never',
  },
)

console.error('\n[matcher-differential] ok: Rust comparator reproduces every real Vitest verdict')
