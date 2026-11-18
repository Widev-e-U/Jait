import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { flowCoverage } from '../flow-report.mjs'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const flow = JSON.parse(readFileSync(new URL('../flows/chat.json', import.meta.url), 'utf8'))
const required = JSON.parse(readFileSync(new URL('../migration-cases.json', import.meta.url), 'utf8')).cases
const readSource = path => readFileSync(root + path, 'utf8')
test('every flow source anchor and scenario refers to the current source and required inventory', () => {
  const report = flowCoverage(flow, required, required.map(id => ({ id, status: 'passed' })), readSource)
  assert.equal(report.edges.length, 16)
  assert.equal(report.edges.find(e => e.id === 'F12').coverage, 'partial')
  assert.equal(report.edges.find(e => e.id === 'F15').verdict, 'uncovered')
})
test('source drift cannot silently preserve a verified flow', () => {
  assert.throws(() => flowCoverage(flow, required, [], () => ''), /source anchor drift/)
})
test('missing executable cases stay blocked and actual failures dominate', () => {
  const missing = flowCoverage(flow, required, [], readSource)
  assert.equal(missing.edges[0].verdict, 'blocked')
  const failed = flowCoverage(flow, required, [{ id: flow.edges[0].cases[0], status: 'failed' }], readSource)
  assert.equal(failed.edges[0].verdict, 'failed')
})
test('unknown cases and dangling graph nodes are rejected', () => {
  const changed = structuredClone(flow)
  changed.edges[0].cases = ['invented/passing-test']
  assert.throws(() => flowCoverage(changed, required, [], readSource), /flow case/)
  changed.edges[0].from = 'missing-node'
  assert.throws(() => flowCoverage(changed, required, [], readSource), /flow edge/)
})
