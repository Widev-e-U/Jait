import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Execute the actual generated transport helper; this catches field-name drift
// that isolated comparator tests cannot see.
function captureFixture(source) {
  const start = source.indexOf('const __jait_refs=');
  const end = source.indexOf('const __jait_captureType=', start);
  assert.ok(start >= 0 && end > start, 'generated reference-capture helper exists');
  const javascript = ts.transpile(source.slice(start, end));
  const rows = [];
  const context = {
    __jait_boxed: value => ({ type: typeof value, value }),
    __jait_record: row => rows.push(row),
  };
  vm.runInNewContext(javascript + '\nglobalThis.capture = __jait_capture;', context);
  return { capture: context.capture, rows };
}
const directory = new URL('../drivers/tailstatic/', import.meta.url);
test('generated peers send identity metadata under the Rust comparator keys', () => {
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const { capture, rows } = captureFixture(fs.readFileSync(new URL(file, directory), 'utf8'));
    const same = { aborted: false };
    capture(0, same, same);
    capture(1, same, { aborted: false });
    const fn = () => {};
    capture(2, fn, fn);
    capture(3, fn, () => {});
    capture(4, null, null);
    capture(5, true, true);
    for (const row of rows) {
      assert.ok(Object.hasOwn(row, 'ref'), file);
      assert.ok(Object.hasOwn(row, 'otherRef'), file);
    }
    assert.equal(rows[0].ref, rows[0].otherRef, file);
    assert.notEqual(rows[1].ref, rows[1].otherRef, file);
    assert.equal(rows[2].ref, rows[2].otherRef, file);
    assert.notEqual(rows[3].ref, rows[3].otherRef, file);
    assert.equal(rows[4].ref, null, file);
    assert.equal(rows[5].ref, null, file);
  }
});
test('the prior mismatched field is detected by the transport contract', () => {
  const first = fs.readdirSync(directory).find(file => file.endsWith('.ts'));
  const source = fs.readFileSync(new URL(first, directory), 'utf8');
  const mutant = source.replace('ref:__jait_ref(actual)', '__jait_ref:__jait_ref(actual)');
  assert.notEqual(mutant, source);
  const { capture, rows } = captureFixture(mutant);
  capture(0, {}, {});
  assert.equal(Object.hasOwn(rows[0], 'ref'), false);
});

test('generated serialization retains nested Date types without rereading getters', () => {
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const source = fs.readFileSync(new URL(file, directory), 'utf8');
    const start = source.indexOf('const __jait_symbols=');
    const end = source.indexOf('export async function run(', start);
    assert.ok(start >= 0 && end > start);
    const context = { Date, Map, Set, Error, RegExp, ArrayBuffer, DataView };
    vm.runInNewContext(ts.transpile(source.slice(start, end)) + '\nglobalThis.box = __jait_boxed;', context);
    const date = new Date('2020-01-01T00:00:00.000Z');
    const observed = context.box({ date, list: [date], invalid: new Date(NaN) });
    assert.equal(observed.value.date.__jait_type, 'date', file);
    assert.equal(observed.value.date.value, date.toISOString(), file);
    assert.equal(observed.value.list[0].__jait_type, 'date', file);
    assert.equal(observed.value.invalid.value, 'NaN', file);
    let reads = 0;
    context.box({ get value() { reads++; return 'plain string'; } });
    assert.equal(reads, 1, file);
  }
});

test('generated exception constructors use prototype identity for throws and rejections', async () => {
  const Expected = class SameName extends Error {};
  const Other = class SameName extends Error {};
  class Child extends Expected {}
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const source = fs.readFileSync(new URL(file, directory), 'utf8');
    const start = source.indexOf('const __jait_refs=');
    const end = source.indexOf('const __jait_instance=', start);
    assert.ok(start >= 0 && end > start, file);
    const rows = [];
    const context = { Error, Function, Symbol, __jait_boxed: value => ({ type: typeof value, name: value?.name, value }), __jait_record: row => rows.push(row) };
    vm.runInNewContext(ts.transpile(source.slice(start, end)) + '\nglobalThis.thrown = __jait_thrown; globalThis.rejected = __jait_rejected;', context);
    context.thrown(0, () => { throw new Expected('fixture failure'); }, Expected);
    context.thrown(1, () => { throw new Other('fixture failure'); }, Expected);
    context.thrown(2, () => { throw new Child('fixture failure'); }, Expected);
    await context.rejected(3, Promise.reject(new Other('fixture failure')), Expected);
    context.thrown(4, () => {}, Expected);
    for (const row of rows.slice(0, 4)) {
      assert.equal(row.threw, true, file);
      assert.ok(Number.isInteger(row.expectedPrototype) && row.expectedPrototype > 0, file);
      assert.ok(Array.isArray(row.prototypes), file);
    }
    assert.equal(rows[0].prototypes.includes(rows[0].expectedPrototype), true, file);
    assert.equal(rows[1].prototypes.includes(rows[1].expectedPrototype), false, file);
    assert.equal(rows[2].prototypes.includes(rows[2].expectedPrototype), true, file);
    assert.equal(rows[3].prototypes.includes(rows[3].expectedPrototype), false, file);
    assert.equal(rows[4].threw, false, file);
  }
});

// Deep equality and call-argument matchers must distinguish equal-looking
// functions/signals; top-level toBe metadata cannot preserve nested identity.
test('nested function and AbortSignal references survive transport', () => {
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const source = fs.readFileSync(new URL(file, directory), 'utf8');
    const start = source.indexOf('const __jait_symbols=');
    const end = source.indexOf('export async function run(', start);
    const context = { Date, Map, Set, Error, RegExp, ArrayBuffer, DataView, AbortSignal };
    vm.runInNewContext(ts.transpile(source.slice(start, end)) + '\nglobalThis.box = __jait_boxed;', context);
    const fn = () => {};
    const signal = new AbortController().signal;
    const first = context.box({ fn, signal });
    const same = context.box({ fn, signal });
    const different = context.box({ fn: () => {}, signal: new AbortController().signal });
    for (const key of ['fn', 'signal']) {
      assert.ok(Number.isInteger(first.value[key].ref) && first.value[key].ref > 0, file);
      assert.equal(first.value[key].ref, same.value[key].ref, file);
      assert.notEqual(first.value[key].ref, different.value[key].ref, file);
    }
  }
});
