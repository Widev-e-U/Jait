import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as loader from '../drivers/tail-node-loader.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const source = resolve(root, 'packages/gateway/src/security/ownership.ts');
const loaderPath = resolve(root, 'tests/contract/drivers/tail-node-loader.mjs');

function fixture() {
  const dir = join(root, '.jait/artifacts/source-review', 'node-loader-' + randomUUID());
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const copy = join(dir, 'subject.ts');
  writeFileSync(copy, 'export const fixtureValue = 1;\n');
  return { dir, copy, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
function run(raw) {
  const env = { PATH: process.env.PATH };
  if (raw !== undefined) env.JAIT_SOURCE_REVIEW_OVERRIDE = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return spawnSync(process.execPath, [
    '--no-warnings', '--loader', loaderPath, '--input-type=module', '--eval',
    'import * as subject from ' + JSON.stringify(pathToFileURL(source).href) + ';process.stdout.write(JSON.stringify(subject.fixtureValue ?? "original"));',
  ], { cwd: root, env, encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
}

test('ordinary Node imports keep the original defining module', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout), 'original');
});
test('Node loads exact copied bytes and observes mutation and restoration', () => {
  const f = fixture();
  try {
    for (const value of [1, 2, 1]) {
      writeFileSync(f.copy, 'export const fixtureValue = ' + value + ';\n');
      const result = run({ source, copy: f.copy });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout), value);
    }
  } finally { f.cleanup(); }
});
test('same-file source review baseline leaves the module unchanged', () => {
  const result = run({ source, copy: source });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout), 'original');
});
test('Node rejects malformed, extra-field and relative-path overrides', () => {
  const f = fixture();
  try {
    for (const raw of [
      'not-json',
      { source, copy: f.copy, extra: true },
      { source: 'packages/gateway/src/security/ownership.ts', copy: f.copy },
      { source, copy: '.jait/artifacts/source-review/subject.ts' },
    ]) {
      const result = run(raw);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Invalid source review override/);
    }
  } finally { f.cleanup(); }
});
test('Node rejects resolved source/copy paths outside the fixture boundary', () => {
  const f = fixture();
  try {
    const escaped = join(f.dir, 'escaped.ts');
    symlinkSync(resolve(root, 'tests/contract/Cargo.toml'), escaped);
    for (const raw of [
      { source: resolve(root, 'tests/contract/Cargo.toml'), copy: f.copy },
      { source, copy: resolve(root, 'tests/contract/Cargo.toml') },
      { source, copy: escaped },
    ]) {
      const result = run(raw);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Source review override escapes fixture scope/);
    }
  } finally { f.cleanup(); }
});
test('Node rejects oversized source copies', () => {
  const f = fixture();
  try {
    writeFileSync(f.copy, ' '.repeat(2 * 1024 * 1024 + 1));
    const result = run({ source, copy: f.copy });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Source review copy exceeds size limit/);
  } finally { f.cleanup(); }
});
test('copied imports resolve absolute and file URL JS paths at their TS source', async () => {
  const js = source.slice(0, -3) + '.js';
  for (const specifier of [js, pathToFileURL(js).href]) {
    const result = await loader.resolve(specifier, {}, async () => ({ url: 'fallback' }));
    assert.deepEqual(result, { url: pathToFileURL(source).href, shortCircuit: true });
  }
  assert.deepEqual(await loader.resolve('node:fs', {}, async () => ({ url: 'node:fs' })), { url: 'node:fs' });
});
