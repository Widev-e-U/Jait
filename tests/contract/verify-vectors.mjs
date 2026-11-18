/**
 * Lane verifier for Rust-owned declarative vectors.
 * Replays one vector file through the test-only TypeScript adapter and applies the
 * same assertion semantics as src/fixture_internal_contracts.rs::validate.
 * Usage: node tests/contract/verify-vectors.mjs vectors/fixtures.json [--json]
 * This is developer tooling: it never writes vectors or expected values.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const contractDir = fileURLToPath(new URL('.', import.meta.url))
const file = process.argv[2]
if (!file) throw new Error('usage: node verify-vectors.mjs <vectors/*.json> [--json]')
const quiet = process.argv.includes('--json')
const cases = JSON.parse(readFileSync(file === 'fixtures.json' ? `${contractDir}vectors/${file}` : file, 'utf8'))

function pointer(value, path) {
  if (path === '') return value
  if (!path.startsWith('/')) throw new Error(`bad pointer ${path}`)
  return path
    .slice(1)
    .split('/')
    .map((part) => decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~')))
    .reduce((current, key) => {
      if (current === undefined || current === null) throw new Error(`missing result path ${path}`)
      if (Array.isArray(current)) return current[Number(key)]
      return current[key]
    }, value)
}

function checkAssertion(actual, assertion) {
  let value = pointer(actual, assertion.path)
  if (value === undefined) throw new Error(`missing result path ${assertion.path}`)
  if (assertion.parse !== undefined) value = pointer(JSON.parse(value), assertion.parse)
  switch (assertion.kind) {
    case 'eq':
      if (JSON.stringify(value) !== JSON.stringify(assertion.value)) throw new Error(`equality assertion failed at ${assertion.path}: ${JSON.stringify(value)}`)
      return
    case 'ne':
      if (JSON.stringify(value) === JSON.stringify(assertion.value)) throw new Error(`inequality assertion failed at ${assertion.path}`)
      return
    case 'contains':
      if (typeof value !== 'string' || !value.includes(assertion.value)) throw new Error(`substring absent at ${assertion.path}`)
      return
    case 'array-contains':
      if (!Object.hasOwn(assertion, 'value') || !Array.isArray(value) || !value.some((item) => JSON.stringify(item) === JSON.stringify(assertion.value))) throw new Error(`array member absent at ${assertion.path}`)
      return
    case 'sum-paths-eq': {
      if (!Array.isArray(assertion.paths) || !assertion.paths.length) throw new Error('sum requires operand paths')
      let sum = 0
      for (const path of assertion.paths) {
        if (typeof path !== 'string') throw new Error('expected sum path')
        const operand = pointer(actual, path)
        if (typeof operand !== 'number' || !Number.isFinite(operand)) throw new Error('missing numeric sum operand')
        sum += operand
        if (!Number.isFinite(sum)) throw new Error('non-finite sum')
      }
      if (typeof value !== 'number' || value !== sum) throw new Error(`sum assertion failed at ${assertion.path}`)
      return
    }
    case 'difference-ge': {
      if (typeof assertion.other !== 'string') throw new Error('missing other path')
      const other = pointer(actual, assertion.other)
      if (typeof value !== 'number' || typeof other !== 'number' || typeof assertion.value !== 'number' || !Number.isFinite(value - other) || !(value - other >= assertion.value)) throw new Error(`difference assertion failed at ${assertion.path}`)
      return
    }
    case 'not-contains':
      if (typeof value !== 'string' || value.includes(assertion.value)) throw new Error(`substring present at ${assertion.path}`)
      return
    case 'bytes-le':
      if (Buffer.byteLength(value, 'utf8') > assertion.value) throw new Error(`byte limit exceeded at ${assertion.path}`)
      return
    case 'length':
      if (!Array.isArray(value) || value.length !== assertion.value) throw new Error(`wrong array length at ${assertion.path}`)
      return
    case 'gt':
      if (!(value > assertion.value)) throw new Error(`numeric bound failed at ${assertion.path}`)
      return
    case 'gt-path': {
      const other = pointer(actual, assertion.other)
      if (!(value > other * (assertion.factor ?? 1))) throw new Error(`relative score assertion failed at ${assertion.path}`)
      return
    }
    case 'lt-path': {
      const other = pointer(actual, assertion.other)
      if (!(value < other * (assertion.factor ?? 1))) throw new Error(`relative score assertion failed at ${assertion.path}`)
      return
    }
    case 'each-fields-absent':
      for (const item of value) for (const field of assertion.value) if (Object.hasOwn(item, field)) throw new Error(`field ${field} should be absent`)
      return
    default:
      throw new Error(`unknown assertion operation ${assertion.kind}`)
  }
}

let failures = 0
for (const testCase of cases) {
  const input = { version: 1, calls: testCase.calls }
  if (Buffer.byteLength(JSON.stringify(input)) > 65_536) {
    console.error(`failed: ${testCase.id} (input exceeds 64 KiB)`)
    failures += 1
    continue
  }
  const child = spawnSync('bun', [`${contractDir}drivers/internals.ts`], { input: JSON.stringify(input), maxBuffer: 1 << 20, encoding: 'utf8' })
  if (child.status !== 0) {
    console.error(`failed: ${testCase.id} (driver exit ${child.status})`)
    console.error(child.stderr.trim().split('\n').slice(0, 6).join('\n'))
    failures += 1
    continue
  }
  try {
    const { results } = JSON.parse(child.stdout)
    for (const assertion of testCase.assertions) checkAssertion(results, assertion)
    if (!quiet) console.log(`passed: ${testCase.id}`)
  } catch (error) {
    console.error(`failed: ${testCase.id}: ${error.message}`)
    failures += 1
  }
}
console.log(`${cases.length - failures}/${cases.length} vectors passed against the TypeScript reference adapter`)
process.exitCode = failures ? 1 : 0
