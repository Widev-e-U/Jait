import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { parallelContracts, execute } from './parallel-contracts.mjs';

const artifacts = fileURLToPath(new URL('../../../.jait/artifacts/parallel-contract-tests/', import.meta.url));
mkdirSync(artifacts, { recursive: true });
function fixture(bodies) {
  const root = mkdtempSync(join(artifacts, 'run-'));
  mkdirSync(join(root, 'crate'));
  const manifest = join(root, 'crate/Cargo.toml');
  writeFileSync(manifest, '');
  const suites = bodies.map((body, index) => {
    const executable = join(root, 'suite-' + index + '.mjs');
    writeFileSync(executable, '#!/usr/bin/env node\n' + body, { mode: 0o755 });
    return { reason: 'compiler-artifact', profile: { test: true }, target: { name: 'suite-' + index, kind: ['test'] }, executable };
  });
  const cargo = join(root, 'fake-cargo.mjs');
  writeFileSync(cargo, '#!/usr/bin/env node\n' + `
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(join(root, 'builds'))}, JSON.stringify(process.argv.slice(2)) + '\\n');
for (const suite of ${JSON.stringify(suites)}) console.log(JSON.stringify(suite));
`, { mode: 0o755 });
  return { cargo, manifest, root, target: join(root, 'target'), reportRoot: join(root, '.jait/reports') };
}
const report = f => JSON.parse(readFileSync(join(f.reportRoot, readdirSync(f.reportRoot)[0], 'report.json'), 'utf8'));
const markerBody = (index, code = '') => `
import fs from 'node:fs';
const directory = process.env.FIXTURE;
const mark = name => fs.writeFileSync(directory + '/' + name, '');
const exists = name => fs.existsSync(directory + '/' + name);
const wait = async name => {
  const deadline = Date.now() + 5000;
  while (!exists(name)) {
    if (Date.now() > deadline) throw Error('Timed out: ' + name);
    await new Promise(r => setTimeout(r, 10));
  }
};
fs.appendFileSync(directory + '/events', 'start ${index}\\n');
${code}
fs.appendFileSync(directory + '/events', 'end ${index}\\n');
`;

test('compiles once and executes every discovered target with exactly three concurrent workers', async () => {
  const f = fixture([
    markerBody(0, "mark('zero'); await wait('one'); await wait('two'); await new Promise(r => setTimeout(r, 100));"),
    markerBody(1, "mark('one'); await wait('zero'); await wait('two'); await new Promise(r => setTimeout(r, 100));"),
    markerBody(2, "if (!process.cwd().endsWith('/crate')) throw Error('wrong cwd'); if (process.env.RUST_TEST_THREADS !== '4') throw Error('wrong thread bound'); mark('two'); await wait('zero'); await wait('one');"),
    markerBody(3),
  ]);
  assert.equal(await parallelContracts({ ...f, env: { ...process.env, FIXTURE: f.root } }), true);
  const commands = readFileSync(join(f.root, 'builds'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(commands.length, 1);
  assert.ok(commands[0].includes('--no-run'));
  assert.ok(commands[0].includes('--locked'));
  const events = readFileSync(join(f.root, 'events'), 'utf8').trim().split('\n');
  let active = 0, maximum = 0;
  for (const event of events) { active += event.startsWith('start') ? 1 : -1; maximum = Math.max(maximum, active); }
  assert.equal(maximum, 3);
  assert.equal(active, 0);
  assert.equal(report(f).discovered, 4);
  assert.equal(report(f).completed, 4);
  assert.equal(report(f).passed, true);
});

function executing(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux' && /\) Z /.test(readFileSync('/proc/' + pid + '/stat', 'utf8'))) return false;
    return true;
  } catch { return false; }
}
test('a failing suite cancels resistant peers and their descendants and never starts queued suites', {
  skip: process.platform === 'win32',
}, async () => {
  const f = fixture([
    markerBody(0, "await wait('peer-pid'); process.exitCode = 17;"),
    markerBody(1, `
const { spawn } = await import('node:child_process');
process.on('SIGTERM', () => {});
const peer = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {});setInterval(() => {}, 1000)"], { stdio: 'ignore' });
fs.writeFileSync(directory + '/peer-pid', String(peer.pid));
fs.writeFileSync(directory + '/leader-pid', String(process.pid));
await new Promise(r => setTimeout(r, 30000));
`),
    markerBody(2, "mark('queued-started');"),
  ]);
  assert.equal(await parallelContracts({ ...f, workers: 2, env: { ...process.env, FIXTURE: f.root } }), false);
  assert.equal(existsSync(join(f.root, 'queued-started')), false);
  assert.equal(report(f).results.find(result => result.index === 0).cancelled, false);
  for (const name of ['peer-pid', 'leader-pid']) assert.equal(executing(Number(readFileSync(join(f.root, name), 'utf8'))), false, name);
  assert.equal(report(f).passed, false);
});

test('an explicit cancellation drains every active suite', { skip: process.platform === 'win32' }, async () => {
  const f = fixture([markerBody(0, "mark('ready'); await new Promise(r => setTimeout(r, 30000));")]);
  const controller = new AbortController();
  const pending = parallelContracts({ ...f, env: { ...process.env, FIXTURE: f.root }, signal: controller.signal });
  const deadline = Date.now() + 5000;
  while (!existsSync(join(f.root, 'ready'))) {
    assert.ok(Date.now() < deadline, 'suite did not start');
    await new Promise(r => setTimeout(r, 10));
  }
  controller.abort();
  assert.equal(await pending, false);
  assert.equal(report(f).passed, false);
});

test('compile failure and empty artifact output cannot issue passing evidence', async () => {
  for (const body of ['process.exitCode = 12;', "console.log('not-json');"]) {
    const f = fixture([markerBody(0, "mark('unexpected');")]);
    writeFileSync(f.cargo, '#!/usr/bin/env node\n' + body, { mode: 0o755 });
    await assert.rejects(parallelContracts({ ...f, env: { ...process.env, FIXTURE: f.root } }), /compilation failed|no test executables|Malformed Cargo/);
    assert.equal(existsSync(join(f.root, 'unexpected')), false);
    assert.equal(report(f).passed, false);
  }
});

test('spawn failure returns a failed child result', async () => {
  const f = fixture([]);
  const result = await execute(join(f.root, 'missing-program'), [], {
    cwd: f.root, env: process.env, log: join(f.root, 'missing.log'), signal: new AbortController().signal,
  });
  assert.equal(result.code, null);
  assert.match(result.error, /ENOENT/);
});

test('the full contract CLI routes through parallel discovery from any working directory', () => {
  const f = fixture([markerBody(0), markerBody(1)]);
  mkdirSync(join(f.root, 'tests/contract'), { recursive: true });
  mkdirSync(join(f.root, 'packages/gateway-rust/tooling'), { recursive: true });
  copyFileSync(fileURLToPath(new URL('../../../tests/contract/run.mjs', import.meta.url)), join(f.root, 'tests/contract/run.mjs'));
  copyFileSync(fileURLToPath(new URL('./parallel-contracts.mjs', import.meta.url)), join(f.root, 'packages/gateway-rust/tooling/parallel-contracts.mjs'));
  const result = spawnSync(process.execPath, [join(f.root, 'tests/contract/run.mjs'), 'test'], {
    cwd: '/', env: { ...process.env, CARGO: f.cargo, FIXTURE: f.root }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /2 test executables with 3 workers/);
  const directory = join(f.root, '.jait/artifacts/contract-parallel');
  const evidence = JSON.parse(readFileSync(join(directory, readdirSync(directory)[0], 'report.json'), 'utf8'));
  assert.equal(evidence.passed, true);
  assert.equal(evidence.completed, 2);
});

test('real Cargo discovery includes library, integration and documentation tests', {
  skip: !existsSync(join(homedir(), '.cargo/bin/cargo')),
}, async () => {
  const f = fixture([]);
  f.cargo = join(homedir(), '.cargo/bin/cargo');
  mkdirSync(join(f.root, 'crate/src'));
  mkdirSync(join(f.root, 'crate/tests'));
  writeFileSync(f.manifest, '[package]\nname = "jait-pipeline-fixture"\nversion = "0.1.0"\nedition = "2024"\n');
  writeFileSync(join(f.root, 'crate/Cargo.lock'), 'version = 4\n[[package]]\nname = "jait-pipeline-fixture"\nversion = "0.1.0"\n');
  writeFileSync(join(f.root, 'crate/src/lib.rs'), [
    '/// ```',
    '/// assert_eq!(jait_pipeline_fixture::two(), 2);',
    '/// ```',
    'pub fn two() -> u8 { 2 }',
    '#[test] fn library() { assert_eq!(two(), 2); }',
  ].join('\n'));
  for (const name of ['first', 'second']) writeFileSync(join(f.root, 'crate/tests/' + name + '.rs'),
    '#[test] fn isolated() { assert!(std::path::Path::new("Cargo.toml").exists()); std::thread::sleep(std::time::Duration::from_millis(350)); }');
  const run = async workers => {
    const started = Date.now();
    assert.equal(await parallelContracts({ ...f, workers, env: { ...process.env, CARGO_NET_OFFLINE: 'true' } }), true);
    return Date.now() - started;
  };
  await run(2); // Warm the exact same compilation cache for both measurements.
  const serialMs = await run(1);
  const parallelMs = await run(2);
  const evidence = readdirSync(f.reportRoot).map(name => join(f.reportRoot, name));
  for (const directory of evidence) {
    const result = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'));
    assert.equal(result.discovered, 3);
    assert.equal(result.completed, 3);
    assert.equal(result.passed, true);
    assert.ok(existsSync(join(directory, 'doctests.log')));
    assert.match(readFileSync(join(directory, 'doctests.log'), 'utf8'), /1 passed/);
  }
  writeFileSync(join(f.root, 'benchmark.json'), JSON.stringify({
    scope: 'Controlled Rust fixture; two 350ms integration suites plus library/docs. Not a full deployment timing.',
    serialMs, parallelMs,
  }, null, 2) + '\n');
  console.log('Controlled Rust fixture: serial ' + serialMs + 'ms; parallel ' + parallelMs + 'ms; evidence: ' + join(f.root, 'benchmark.json'));
});

test('documentation tests follow successful library tests', async () => {
  const f = fixture([markerBody(0)]);
  let source = readFileSync(f.cargo, 'utf8').replace('"kind":["test"]', '"kind":["lib"]');
  writeFileSync(f.cargo, source, { mode: 0o755 });
  assert.equal(await parallelContracts({ ...f, env: { ...process.env, FIXTURE: f.root } }), true);
  const commands = readFileSync(join(f.root, 'builds'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(commands.length, 2);
  assert.ok(commands[1].includes('--doc'));
});
