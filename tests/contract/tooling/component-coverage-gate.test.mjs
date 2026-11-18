import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { compare, fromSummary, output, validateMeasurement } from './component-coverage-gate.mjs';
import { isolatedEnvironment } from './component-coverage-env.mjs';
const file = 'packages/gateway/src/example.ts';
const values = (covered = 7, total = 10) => Object.fromEntries(['branches', 'statements', 'functions', 'lines'].map(m => [m, { covered, total }]));
const snapshot = (covered = 7, total = 10) => ({ schemaVersion: 1, sources: { [file]: values(covered, total) } });
test('equal and increasing measured coverage passes', () => {
  assert.deepEqual(compare(snapshot(), snapshot()), []);
  assert.deepEqual(compare(snapshot(), snapshot(8)), []);
});
test('lower measured branch coverage fails even if other metrics increase', () => {
  const current = snapshot(9);
  current.sources[file].branches = { covered: 6, total: 10 };
  assert.match(compare(snapshot(), current).join('\n'), /branches regressed/);
});
test('increased branch denominator with unchanged hits fails', () => {
  assert.ok(compare(snapshot(), snapshot(7, 11)).length);
});
test('missing baseline source fails', () => {
  const current = snapshot();
  current.sources = { 'packages/gateway/src/other.ts': values(10) };
  assert.match(compare(snapshot(), current).join('\n'), /Missing baseline source/);
});
test('new uncovered source cannot dilute aggregate coverage', () => {
  const current = snapshot();
  current.sources['packages/shared/src/untested.ts'] = values(0);
  assert.match(compare(snapshot(), current).join('\n'), /all: branches regressed/);
});
test('summary must contain every source including untested files', () => {
  assert.throws(() => fromSummary({ total: values(), [file]: values() }, [file, 'packages/shared/src/untested.ts']), /Missing source coverage/);
});
test('invalid and empty evidence fails closed', () => {
  assert.throws(() => compare(snapshot(), { schemaVersion: 1, sources: {} }), /Empty/);
  assert.throws(() => compare(snapshot(), snapshot(NaN)), /Invalid/);
});
test('zero executable branches are valid, not omitted sources', () => {
  assert.deepEqual(compare(snapshot(0, 0), snapshot(0, 0)), []);
});
test('CLI returns nonzero for lower coverage and missing source', () => {
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(join(output, 'gate-test-'));
  try {
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    writeFileSync(before, JSON.stringify(snapshot()));
    for (const changed of [snapshot(6), { schemaVersion: 1, sources: { 'packages/shared/src/other.ts': values() } }]) {
      writeFileSync(after, JSON.stringify(changed));
      const result = spawnSync(process.execPath, [new URL('./component-coverage-gate.mjs', import.meta.url).pathname, 'compare', before, after]);
      assert.equal(result.status, 1);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('environment excludes secrets/live services/shell init and isolates persistent paths', () => {
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(join(output, 'env-test-'));
  try {
    const env = isolatedEnvironment(dir, { PATH: '/usr/bin:/bin', OPENAI_API_KEY: 'secret', JAIT_PRIMARY_GATEWAY: 'live', BASH_ENV: '/live/init', NODE_OPTIONS: '--require live', XDG_RUNTIME_DIR: '/run/user/live' });
    assert.equal(env.OPENAI_API_KEY, '');
    assert.equal(env.JAIT_PRIMARY_GATEWAY, '');
    assert.equal(env.BASH_ENV, undefined);
    assert.ok(env.NODE_OPTIONS.includes('component-coverage-network.mjs'));
    assert.ok(env.NODE_OPTIONS.includes('--max-old-space-size=5120'));
    assert.ok(!env.NODE_OPTIONS.includes('--require live'));
    assert.equal(env.__JAIT_CLI, '1');
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(env.GIT_ALLOW_PROTOCOL, 'file');
    for (const key of ['HOME', 'JAIT_STATE_DIR', 'JAIT_DB_PATH', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'TMP', 'TEMP']) assert.ok(env[key].startsWith(dir + '/'), key);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('network boundary allows fixture TCP but blocks production defaults and outbound TCP', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import net from 'node:net';
    import { allowedConnection } from ${JSON.stringify(new URL('./component-coverage-network.mjs', import.meta.url).href)};
    assert.equal(allowedConnection('localhost', 20128), false);
    assert.equal(allowedConnection('192.168.1.1', 12345), false);
    assert.equal(allowedConnection('example.com', 443), false);
    const server = net.createServer(socket => socket.end('fixture'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const socket = net.connect(server.address().port, '127.0.0.1');
    await new Promise((resolve, reject) => { socket.on('data', resolve); socket.on('error', reject); });
    socket.destroy();
    await new Promise(resolve => server.close(resolve));
    const blocked = net.connect(20128, 'localhost');
    await new Promise((resolve, reject) => { blocked.on('error', error => { assert.equal(error.code, 'ECONNREFUSED'); resolve(); }); blocked.on('connect', () => reject(new Error('connected to a live service'))); });
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('versioned baseline decrease is denied by the CI compare command', () => {
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(join(output, 'baseline-decrease-'));
  try {
    const before = join(dir, 'base-branch.json'), after = join(dir, 'proposed-baseline.json');
    writeFileSync(before, JSON.stringify(snapshot(8)));
    writeFileSync(after, JSON.stringify(snapshot(7)));
    const result = spawnSync(process.execPath, [new URL('./component-coverage-gate.mjs', import.meta.url).pathname, 'compare', before, after], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /branches regressed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('provider migrations cannot silently compare incomparable percentages', () => {
  assert.throws(() => compare({ ...snapshot(), instrumentation: 'v8' }, { ...snapshot(), instrumentation: 'istanbul@3.2.7' }), /Incomparable/);
});
test('CI measurement rejects failures, changed reports, changed tests and new sources', () => {
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(join(output, 'freshness-'));
  try {
    for (const component of ['gateway', 'shared', 'api-client']) mkdirSync(join(dir, `packages/${component}/src`), { recursive: true });
    mkdirSync(join(dir, 'coverage'));
    const hash = value => createHash('sha256').update(value).digest('hex');
    const source = 'export const x = 1;';
    writeFileSync(join(dir, file), source);
    writeFileSync(join(dir, 'tests.json'), '{}');
    writeFileSync(join(dir, 'coverage/coverage-summary.json'), '{}');
    const measurement = { exitCode: 0, isolation: 'allowlisted-env-tcp-guard-v2', instrumentation: 'istanbul', coverageProvider: '3.2.7', vitest: '3.2.7', summarySha256: hash('{}'), testsSha256: hash('{}'), sourceHashes: { [file]: hash(source) } };
    const tests = { success: true, numFailedTests: 0, numPassedTests: 1 };
    validateMeasurement(measurement, tests, dir, dir);
    assert.throws(() => validateMeasurement({ ...measurement, exitCode: 1 }, tests, dir, dir), /Unsuccessful/);
    writeFileSync(join(dir, 'tests.json'), '{"changed":true}');
    assert.throws(() => validateMeasurement(measurement, tests, dir, dir), /digest mismatch/);
    writeFileSync(join(dir, 'tests.json'), '{}');
    writeFileSync(join(dir, 'packages/gateway/src/original.test.ts'), 'changed test');
    assert.throws(() => validateMeasurement(measurement, tests, dir, dir), /Stale/);
    rmSync(join(dir, 'packages/gateway/src/original.test.ts'));
    writeFileSync(join(dir, 'packages/shared/src/new.ts'), 'new source');
    assert.throws(() => validateMeasurement(measurement, tests, dir, dir), /Stale/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('omitted modules require proof of zero static Istanbul counters', () => {
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(join(output, 'static-empty-'));
  try {
    const empty = 'types.ts', executable = 'untested.ts';
    writeFileSync(join(dir, empty), 'export interface Value { x: string }; export { Value as Other };');
    writeFileSync(join(dir, executable), 'export const value = Math.random() ? 1 : 2;');
    const current = fromSummary({ total: values(0, 0) }, [empty], dir);
    assert.deepEqual(current.nonExecutableSources, [empty]);
    assert.deepEqual(current.sources[empty], values(0, 0));
    assert.throws(() => fromSummary({ total: values(0, 0) }, [empty, executable], dir), /Missing source coverage: untested.ts/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
