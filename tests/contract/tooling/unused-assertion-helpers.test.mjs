import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findUnusedAssertionHelpers } from './unused-assertion-helpers.mjs'

function review(setup, body, hooks = '') {
  const source = `${setup}\ndescribe('suite', () => {\n${hooks}\nit('case', () => { ${body} })\n})`
  const line = source.split('\n').findIndex(value => value.startsWith("it('case'")) + 1
  return findUnusedAssertionHelpers(source, line, 1)
}

test('proves an unreferenced helper unused and retains exact assertion range', () => {
  const result = review('function denied() { expect(false).toBe(true) }', 'expect(true).toBe(true)')
  assert.deepEqual(result.helpers.map(helper => helper.name), ['denied'])
  assert.equal(result.contains(20, 40)?.name, 'denied')
  assert.equal(result.contains(0, 100), undefined)
})

test('retains helpers reached through aliases, arguments and transitive calls', () => {
  for (const body of ['const alias = outer; alias()', 'queueMicrotask(outer)', 'outer()']) {
    const result = review('function inner() { expect(false).toBe(true) }\nconst outer = () => inner()', body)
    assert.deepEqual(result.helpers, [])
  }
})

test('retains helpers used by all lifecycle hooks and lexical initialization', () => {
  for (const hook of ['beforeAll', 'beforeEach', 'afterEach', 'afterAll']) {
    assert.deepEqual(review('function check() { expect(true).toBe(true) }', '', `${hook}(() => check())`).helpers, [])
  }
  assert.deepEqual(review('function check() { expect(true).toBe(true) }\nconst value = check()', '').helpers, [])
})

test('retains helpers referenced inside nested callbacks and classes', () => {
  assert.deepEqual(review('const check = () => expect(true).toBe(true)', 'setTimeout(() => check(), 0)').helpers, [])
  assert.deepEqual(review('function check() { expect(true).toBe(true) }\nclass Holder { run() { check() } }', '').helpers, [])
})

test('fails closed on eval, dynamic constructors and duplicate definitions', () => {
  for (const body of ["eval('check()')", "new Function('check()')()"])
    assert.throws(() => review('function check() {}', body), /dynamic lexical lookup/)
  assert.throws(() => review('function check() {}\nfunction check() {}', ''), /shadowed helper/)
})

test('conservatively retains references to shadowed or property names', () => {
  assert.deepEqual(review('function check() {}', 'const value = {check: 1}').helpers, [])
  assert.deepEqual(review('function check() {}', 'const check = 1').helpers, [])
})

test('retains exported helpers that external modules could call', () => {
  assert.deepEqual(review('export function check() { expect(true).toBe(true) }', '').helpers, [])
  assert.deepEqual(review('export const check = () => expect(true).toBe(true)', '').helpers, [])
})

test('fails closed on unmodeled enclosing blocks that can alias a helper', () => {
  const source = "function check() {}\n{ const alias = check; it('case', () => { alias() }) }"
  assert.throws(() => findUnusedAssertionHelpers(source, 2, 24), /enclosing scope/)
})

function reviewEach(setup, table, body) {
  const source = `${setup}\nit.each(${table})('case', input => { ${body} })`
  return findUnusedAssertionHelpers(source, source.split('\n').length, 1)
}

test('parameterized declarations retain callback and registration-table helper references', () => {
  assert.deepEqual(reviewEach('function check() { expect(true).toBe(true) }', '[true, false]', 'check()').helpers, [])
  assert.deepEqual(reviewEach('function check() { expect(true).toBe(true) }', '[check]', '').helpers, [])
  const unused = reviewEach('function check() { expect(true).toBe(true) }', '[true, false]', 'expect(input).toBeDefined()')
  assert.deepEqual(unused.helpers.map(helper => helper.name), ['check'])
})

test('parameterized declarations still fail closed on unknown registration bases', () => {
  assert.throws(() => findUnusedAssertionHelpers("custom.each([true])('case', () => {})", 1, 1), /ambiguous test registration/)
})
