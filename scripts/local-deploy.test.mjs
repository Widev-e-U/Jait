import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationContext, verificationContextKey, main, verificationSteps, VERIFY_STEPS, verifyAndActivate, activateLocal, snapshotSource, sourceFiles, digestFiles, overrideUnit } from './local-deploy.mjs';
const artifacts=fileURLToPath(new URL('../.jait/artifacts/local-deploy-tests/',import.meta.url));
async function fixture(t){await fs.mkdir(artifacts,{recursive:true});const root=await fs.mkdtemp(join(artifacts,'case-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'});}

test('all mandatory gates finish before activation; every failure blocks activation',async()=>{
  assert(VERIFY_STEPS.some(([id])=>id==='rust-migration'));
  assert.deepEqual(VERIFY_STEPS.find(([id])=>id==='rust-migration'), ['rust-migration', 'bun', ['run', 'test:gateway:rust', '--full-contracts']]);
  assert.equal(VERIFY_STEPS.some(([id])=>id==='rust-contracts'), false);
  assert(VERIFY_STEPS.some(([id])=>id==='unit-tests'));
  assert(VERIFY_STEPS.some(([id])=>id==='web-e2e'));
  for(const [failure] of VERIFY_STEPS){let activated=false;const ran=[];
    await assert.rejects(verifyAndActivate({fingerprint:async()=>'same',runStep:async(id)=>{ran.push(id);if(id===failure)throw Error('failed');},activate:async()=>{activated=true;}}));
    assert.equal(activated,false);assert.equal(ran.at(-1),failure);
  }
  const ran=[];await verifyAndActivate({fingerprint:async()=>'same',runStep:async(id)=>ran.push(id),activate:async proof=>{assert.equal(ran.length,VERIFY_STEPS.length);assert.equal(proof.checks.length,VERIFY_STEPS.length);ran.push('activate');}});
  assert.equal(ran.at(-1),'activate');
});
test('source/build drift after tests refuses activation',async()=>{
  let i=0;let activated=false;await assert.rejects(verifyAndActivate({fingerprint:async()=>String(i++),runStep:async()=>{},activate:async()=>{activated=true;}}),/changed/);assert.equal(activated,false);
});
test('snapshot honors nested ignores, dirty edits and deletions without changing parent git',async t=>{
  const root=await fixture(t),repo=join(root,'repo'),copy=join(root,'copy');await fs.mkdir(repo);
  git(repo,['init','--quiet']);await fs.writeFile(join(repo,'.gitignore'),'node_modules/\ndist/\n');
  await fs.writeFile(join(repo,'file.ts'),'before');await fs.writeFile(join(repo,'deleted.ts'),'deleted');
  git(repo,['add','.']);git(repo,['-c','user.name=Test','-c','user.email=test@localhost','commit','-qm','initial']);
  await fs.writeFile(join(repo,'file.ts'),'dirty');await fs.unlink(join(repo,'deleted.ts'));
  await fs.mkdir(join(repo,'nested'));await fs.writeFile(join(repo,'nested/.gitignore'),'ignored/\n');await fs.mkdir(join(repo,'nested/ignored'));await fs.writeFile(join(repo,'nested/ignored/private'),'private');
  await fs.mkdir(join(repo,'node_modules'));await fs.writeFile(join(repo,'node_modules/cache'),'cache');
  await fs.writeFile(join(repo,'new.ts'),'new');const before=git(repo,['status','--porcelain']);
  const result=await snapshotSource(repo,copy);
  assert.equal(await fs.readFile(join(copy,'file.ts'),'utf8'),'dirty');assert.equal(await fs.readFile(join(copy,'new.ts'),'utf8'),'new');
  for(const file of ['deleted.ts','nested/ignored/private','node_modules/cache'])await assert.rejects(fs.access(join(copy,file)));
  assert.equal(before,git(repo,['status','--porcelain']));assert.equal(result.sourceHash,await digestFiles(copy,sourceFiles(copy)));
  assert.equal(git(copy,['rev-parse','--show-toplevel']).trim(),copy);
});
test('content-checked snapshot timestamps reuse Cargo and rebuild backdated edits and redirected symlinks', {
  skip: process.platform === 'win32' || !existsSync(join(homedir(), '.cargo/bin/cargo')),
}, async t => {
  const root = await fixture(t), repo = join(root, 'repo'), copy = join(root, 'copy');
  const cacheManifest = join(root, '.jait/source-snapshot.json');
  await fs.mkdir(join(repo, 'src'), { recursive: true });
  git(repo, ['init', '--quiet']);
  await fs.writeFile(join(repo, 'Cargo.toml'), '[package]\nname = "snapshot-fixture"\nversion = "0.1.0"\nedition = "2024"\n');
  await fs.writeFile(join(repo, 'Cargo.lock'), 'version = 4\n[[package]]\nname = "snapshot-fixture"\nversion = "0.1.0"\n');
  const program = value => 'fn main() { println!("' + value + '"); }\n';
  await fs.writeFile(join(repo, 'src/main.rs'), program(1));
  await fs.writeFile(join(repo, 'src/alternate.rs'), program(3));
  await fs.writeFile(join(repo, 'src/older.rs'), program(4));
  const backdated = new Date('2020-01-01T00:00:00Z');
  await fs.utimes(join(repo, 'src/main.rs'), backdated, backdated);
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-qm', 'initial']);
  const capture = async () => {
    await fs.rm(copy, { recursive: true, force: true });
    await snapshotSource(repo, copy, { cacheManifest });
  };
  const compile = () => {
    const output = execFileSync(join(homedir(), '.cargo/bin/cargo'), [
      'run', '--locked', '--offline', '--manifest-path', join(copy, 'Cargo.toml'), '--message-format=json',
    ], {
      cwd: copy, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CARGO_TARGET_DIR: join(root, '.jait/cargo-target'), CARGO_BUILD_JOBS: '1' },
    });
    const records = output.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    return { fresh: records.find(record => record.reason === 'compiler-artifact' && record.executable).fresh, value: output.trim().split('\n').at(-1) };
  };
  await capture();
  assert.deepEqual(compile(), { fresh: false, value: '1' });
  const timestamp = (await fs.stat(join(copy, 'src/main.rs'))).mtimeMs;
  await capture();
  assert.equal((await fs.stat(join(copy, 'src/main.rs'))).mtimeMs, timestamp);
  assert.deepEqual(compile(), { fresh: true, value: '1' });
  await fs.writeFile(join(repo, 'src/main.rs'), program(2));
  await fs.utimes(join(repo, 'src/main.rs'), backdated, backdated);
  await capture();
  assert.deepEqual(compile(), { fresh: false, value: '2' });
  await fs.unlink(join(repo, 'src/main.rs'));
  await fs.symlink('alternate.rs', join(repo, 'src/main.rs'));
  await capture();
  assert.deepEqual(compile(), { fresh: false, value: '3' });
  await fs.unlink(join(repo, 'src/main.rs'));
  await fs.symlink('older.rs', join(repo, 'src/main.rs'));
  await capture();
  assert.deepEqual(compile(), { fresh: false, value: '4' });
});

test('snapshot rejects source symlinks escaping the repository',async t=>{
  const root=await fixture(t),repo=join(root,'repo');await fs.mkdir(repo);git(repo,['init','--quiet']);
  await fs.symlink('../outside',join(repo,'escape'));
  await assert.rejects(snapshotSource(repo,join(root,'copy')),/Unsafe deployment path/);
});
test('systemd overrides preserve literal arguments and reject control characters',()=>{
  const text=overrideUnit(['/usr/bin/node','/old/bin/jait.mjs','--env','/a b/settings.env','--port','9000'], '/release/bin/jait.mjs');
  assert(overrideUnit(['/usr/bin/node','--max-old-space-size=4096','/old/bin/jait.mjs','--port','9000'],'/new/bin/jait.mjs').includes('"--max-old-space-size=4096"'));
  assert.match(text,/ExecStart=\n/);assert(text.includes('"/a b/settings.env"'));assert(text.includes('"9000"'));
  assert.equal(overrideUnit(['/usr/bin/node','/old/bin/jait.mjs','--host','a%$b'],'/new/bin/jait.mjs').includes('a%%$$b'),true);
  assert.throws(()=>overrideUnit(['/usr/bin/node','/old/bin/jait.mjs','bad\narg'],'/new/bin/jait.mjs'));
  assert.throws(()=>overrideUnit(['/usr/bin/other','/old/bin/jait.mjs'],'/new/bin/jait.mjs'));
});
test('health failure restores only the local override before restarting the previous install',async()=>{
  const events=[];let health=0;const plan={override:'/test/90-jait-local.conf',unitText:'new',unit:'jait.service',port:8000,version:'new',previousVersion:'old'};
  await assert.rejects(activateLocal(plan,{read:async()=>'previous',write:async(path,text)=>events.push(['write',text]),remove:async()=>events.push(['remove']),command:async(program,args)=>events.push([program,...args]),health:async(port,version)=>{events.push(['health',version]);if(health++===0)throw Error('unhealthy');}}),/previous service configuration restored/);
  assert.deepEqual(events.filter(e=>e[0]==='write'),[['write','new'],['write','previous']]);assert.deepEqual(events.filter(e=>e[0]==='health'),[['health','new'],['health','old']]);
});
test('initial deployment removes its new override on failure; success never invokes rollback',async()=>{
  const plan={override:'/test/local.conf',unitText:'new',unit:'jait.service',port:8000,version:'new',previousVersion:'old'};
  const events=[];let attempts=0;
  await assert.rejects(activateLocal(plan,{read:async()=>{throw Object.assign(Error(),{code:'ENOENT'});},write:async()=>{},remove:async p=>events.push(p),command:async()=>{},health:async()=>{if(attempts++===0)throw Error('failed');}}));assert.deepEqual(events,[plan.override]);
  let starts=0;await activateLocal(plan,{read:async()=>'old',write:async()=>{},remove:async()=>assert.fail('rollback on success'),command:async(_program,args)=>{if(args.includes('restart'))starts++;},health:async()=>{}});assert.equal(starts,1);
});

test('process exit failures, signals and deadlines cannot become success',async t=>{
  const {runLogged}=await import('./local-deploy.mjs');const root=await fixture(t);
  await runLogged(process.execPath,['-e','console.log("passed")'],{log:join(root,'pass.log')});
  await assert.rejects(runLogged(process.execPath,['-e','console.log("partial");process.exit(7)'],{log:join(root,'fail.log')}),/failed \(7\)/);
  assert.match(await fs.readFile(join(root,'fail.log'),'utf8'),/partial/);
  await assert.rejects(runLogged(process.execPath,['-e','process.kill(process.pid,"SIGTERM")'],{log:join(root,'signal.log')}),/SIGTERM/);
  await assert.rejects(runLogged(process.execPath,['-e','setInterval(()=>{},1000)'],{log:join(root,'timeout.log'),timeoutMs:30}),/exceeded/);
});

test('activation controller refuses incomplete verification evidence before touching systemd',async t=>{
  const {runLogged}=await import('./local-deploy.mjs');const root=await fixture(t);
  const run=join(root,'runs','one');await fs.mkdir(run,{recursive:true});
  const plan=join(run,'plan.json');await fs.writeFile(plan,JSON.stringify({artifactRoot:root,runtime:join(root,'release'),proof:{checks:[]}}));
  const log=join(root,'controller.log');
  await assert.rejects(runLogged(process.execPath,[fileURLToPath(new URL('./local-deploy.mjs',import.meta.url)),'--activate',plan],{log}));
  assert.match(await fs.readFile(log,'utf8'),/Missing mandatory verification evidence/);
});

test('explicitly versioned files remain in snapshots even if a later ignore rule matches them',async t=>{
  const root=await fixture(t),repo=join(root,'repo'),copy=join(root,'copy');await fs.mkdir(repo);git(repo,['init','--quiet']);
  await fs.writeFile(join(repo,'versioned.fixture'),'needed');git(repo,['add','versioned.fixture']);
  await fs.writeFile(join(repo,'.gitignore'),'*.fixture\n');git(repo,['add','.gitignore']);
  git(repo,['-c','user.name=Test','-c','user.email=test@localhost','commit','-qm','initial']);
  await snapshotSource(repo,copy);assert.equal(await fs.readFile(join(copy,'versioned.fixture'),'utf8'),'needed');
});


test('deployment runs the entire contract suite once alongside native checks', async () => {
  const {validationCommands} = await import('../packages/gateway-rust/tooling/validation-commands.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const targets = ['gateway_rust', 'local_deploy_pipeline', 'local_deploy_host'];
  const commands = validationCommands(root, targets, true);
  const contract = fileURLToPath(new URL('../tests/contract/run.mjs', import.meta.url));
  assert.deepEqual(commands.filter(([path]) => path === contract), [[contract, 'test']]);
  assert.deepEqual(commands[0], ['--test', fileURLToPath(new URL('../packages/gateway-rust/tooling/parallel-contracts.test.mjs', import.meta.url)), fileURLToPath(new URL('../packages/gateway-rust/tooling/progress.test.mjs', import.meta.url))]);
  assert.deepEqual(commands.slice(1, 4).map(([, ...args]) => args), [
    ['fmt'], ['clippy', '--all-targets', '--', '-D', 'warnings'], ['test', '--lib'],
  ]);
  assert.deepEqual(validationCommands(root, targets).at(-1), [
    contract, 'test', ...targets.flatMap(target => ['--test', target]),
  ]);
});


// Exercise actual shard processes: an otherwise green mock cannot hide a lost
// shard, a shared server/report directory or a surviving sibling process.
async function isolatedBrowserFixture(t, source, shards = 2) {
  const root = await fixture(t);
  const script = join(root, 'browser.cjs');
  await fs.writeFile(script, source);
  const runner = fileURLToPath(new URL('../tests/e2e/scripts/run-isolated.mjs', import.meta.url));
  const child = spawn(process.execPath, [runner, `--shards=${shards}`, process.execPath, script], {
    env: { ...process.env, JAIT_ISOLATION_FIXTURE: root, FRONTEND_URL: 'http://shared.invalid', API_URL: 'http://shared.invalid' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
  });
  return { root, child, done };
}
const shardFixturePrelude = `
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.JAIT_ISOLATION_FIXTURE;
const shardArg = process.argv.find(arg => arg.startsWith('--shard='));
const shard = Number(shardArg?.split('=')[1].split('/')[0] || 1);
const wait = async name => {
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(path.join(root, name))) {
    if (Date.now() > deadline) throw Error('peer never started');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
`;

test('browser shards overlap with separate ports, stacks and evidence; each keeps one worker', { timeout: 15000 }, async t => {
  const run = await isolatedBrowserFixture(t, shardFixturePrelude + `
(async () => {
  const ports = ['E2E_FRONTEND_PORT', 'E2E_API_PORT'].map(key => Number(process.env[key]));
  ports.push(Number(new URL(process.env.UI_FRONTEND_URL).port));
  const servers = ports.map(() => require('node:net').createServer());
  await Promise.all(servers.map((server, i) => new Promise((resolve, reject) => {
    server.on('error', reject); server.listen(ports[i], '127.0.0.1', resolve);
  })));
  fs.writeFileSync(path.join(root, 'started-' + shard), JSON.stringify({ ports, args: process.argv.slice(2), frontend: process.env.FRONTEND_URL, api: process.env.API_URL, artifacts: process.env.JAIT_E2E_ARTIFACT_DIR }));
  await wait('started-' + (shard === 1 ? 2 : 1));
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
})().catch(error => { console.error(error); process.exit(1); });
`);
  const result = await run.done;
  assert.equal(result.code, 0, result.output);
  const records = await Promise.all([1, 2].map(async shard => JSON.parse(await fs.readFile(join(run.root, 'started-' + shard), 'utf8'))));
  assert.equal(new Set(records.flatMap(record => record.ports)).size, 6);
  assert.notEqual(records[0].artifacts, records[1].artifacts);
  for (const [index, record] of records.entries()) {
    assert(record.args.includes(`--shard=${index + 1}/2`));
    assert(record.args.includes('--workers=1'));
    assert.equal(record.frontend, ''); assert.equal(record.api, '');
  }
  const summary = JSON.parse(await fs.readFile(join(records[0].artifacts, '..', 'summary.json'), 'utf8'));
  assert.equal(summary.passed, true); assert.equal(summary.results.length, 2);
});

test('a single isolated browser run retains the complete unsharded command', { timeout: 15000 }, async t => {
  const run = await isolatedBrowserFixture(t, shardFixturePrelude + `fs.writeFileSync(path.join(root, 'args'), JSON.stringify(process.argv.slice(2)));`, 1);
  const result = await run.done;
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(JSON.parse(await fs.readFile(join(run.root, 'args'), 'utf8')), []);
});

async function assertProcessDrained(pid) {
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
      if (process.platform === 'linux' && (await fs.readFile(`/proc/${pid}/stat`, 'utf8')).split(') ')[1].startsWith('Z')) return;
    } catch (error) { if (error.code === 'ESRCH' || error.code === 'ENOENT') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(`Browser descendant ${pid} survived cancellation`);
}

test('one failed browser shard cancels its sibling and signal-resistant descendants', { timeout: 15000, skip: process.platform === 'win32' }, async t => {
  const run = await isolatedBrowserFixture(t, shardFixturePrelude + `
(async () => {
  if (shard === 1) { await wait('descendant'); process.exit(7); }
  const child = require('node:child_process').spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.send('ready')"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.on('message', () => fs.writeFileSync(path.join(root, 'descendant'), String(child.pid)));
  setInterval(() => {}, 1000);
})();
`);
  const result = await run.done;
  assert.notEqual(result.code, 0, result.output);
  const pid = Number(await fs.readFile(join(run.root, 'descendant'), 'utf8'));
  await assertProcessDrained(pid);
  const summaryPath = result.output.match(/summary: (.+)/)?.[1];
  assert(summaryPath, result.output);
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  assert.equal(summary.passed, false); assert.equal(summary.results.length, 2);
});

test('browser shard count is bounded before any command starts', { timeout: 15000 }, async t => {
  const run = await isolatedBrowserFixture(t, "throw Error('must not start')", 5);
  const result = await run.done;
  assert.notEqual(result.code, 0); assert.match(result.output, /Expected --shards=1\.\.4/);
});


test('cancelling the browser runner drains both shards without passing evidence', { timeout: 15000, skip: process.platform === 'win32' }, async t => {
  const run = await isolatedBrowserFixture(t, shardFixturePrelude + `
fs.writeFileSync(path.join(root, 'ready-' + shard), String(process.pid));
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`);
  const deadline = Date.now() + 5000;
  const pids = [];
  for (const shard of [1, 2]) {
    while (true) {
      try { pids.push(Number(await fs.readFile(join(run.root, 'ready-' + shard), 'utf8'))); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      assert(Date.now() < deadline, 'browser shard never started');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  run.child.kill('SIGTERM');
  const result = await run.done;
  assert.equal(result.code, 143, result.output);
  await Promise.all(pids.map(assertProcessDrained));
  const summary = JSON.parse(await fs.readFile(result.output.match(/summary: (.+)/)[1], 'utf8'));
  assert.equal(summary.passed, false); assert.equal(summary.results.length, 2);
});

test('explicit skip-e2e retains all remaining gates and blocks their failures', async () => {
  const steps = verificationSteps(true);
  assert.deepEqual(steps, VERIFY_STEPS.filter(([id]) => !['web-e2e', 'web-ui'].includes(id)));
  assert.equal(steps.length, VERIFY_STEPS.length - 2);
  const ran = [];
  await verifyAndActivate({skipE2e:true, fingerprint:async()=>'same', runStep:async id=>ran.push(id), activate:async proof=>assert.equal(proof.checks.length,steps.length)});
  assert.deepEqual(ran,steps.map(([id])=>id));
  for (const [failure] of steps) {
    await assert.rejects(verifyAndActivate({skipE2e:true,fingerprint:async()=>'same',runStep:async id=>{if(id===failure)throw Error('failed');},activate:async()=>assert.fail('must not activate')}));
  }
});


test('deployment CLI skips E2E by default and includes it only with --e2e', () => {
  const launcher = fileURLToPath(new URL('./local-deploy.mjs', import.meta.url));
  const plan = (...args) => JSON.parse(execFileSync(process.execPath, [launcher, '--plan', ...args], { encoding: 'utf8' }));
  const defaultPlan = plan();
  assert.equal(defaultPlan.skipE2e, true);
  assert.deepEqual(defaultPlan.checks.map(check => check.id), verificationSteps(true, true).map(([id]) => id));
  assert.deepEqual(plan('--skip-e2e').checks, defaultPlan.checks);
  const fullPlan = plan('--tests', '--e2e');
  assert.equal(fullPlan.skipE2e, false);
  assert.deepEqual(fullPlan.checks.map(check => check.id), VERIFY_STEPS.map(([id]) => id));
  assert.throws(() => execFileSync(process.execPath, [launcher, '--plan', '--e2e', '--skip-e2e'], { stdio: 'pipe' }), /Command failed/);
});


test('verification context binds environment and tools without storing their values', () => {
  const tools = [['/tools/bun', '1.0', 'binary-hash']];
  const env = { PATH: '/tools', CI: '1', SECRET: 'private', JAIT_STATE_DIR: '/run/one' };
  const key = verificationContextKey(env, tools, '/run/one');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, verificationContextKey({ ...env, JAIT_STATE_DIR: '/run/two' }, tools, '/run/two'));
  assert.equal(key, verificationContextKey(Object.fromEntries(Object.entries(env).reverse()), tools, '/run/one'));
  for (const change of [{ CI: '0' }, { SECRET: 'changed' }, { PATH: '/other' }, { JAIT_STATE_DIR: '/custom' }]) {
    assert.notEqual(key, verificationContextKey({ ...env, ...change }, tools, '/run/one'));
  }
  assert.notEqual(key, verificationContextKey(env, [['/tools/bun', '1.1', 'binary-hash']], '/run/one'));
  assert.notEqual(key, verificationContextKey(env, [['/tools/bun', '1.0', 'new-binary']], '/run/one'));
});
test('deployment plan exposes reuse and fresh override while retaining all gates', async () => {
  const original = console.log;
  let plan;
  console.log = value => { plan = JSON.parse(value); };
  try {
    await main(['--plan']);
    assert.equal(plan.verificationReuse, true);
    assert.equal(plan.skipE2e, true);
    assert.equal(plan.checks.length, verificationSteps(true, true).length);
    await main(['--plan', '--fresh', '--tests', '--e2e']);
    assert.equal(plan.verificationReuse, false);
    assert.equal(plan.testsAlwaysRun, true);
    assert.equal(plan.checks.length, VERIFY_STEPS.length);
  } finally { console.log = original; }
});

test('verification identity detects executable bytes and inherited tool configuration', async t => {
  const root = await fixture(t);
  const bin = join(root, 'bin');
  const workspace = join(root, 'workspace');
  await fs.mkdir(bin);
  await fs.mkdir(workspace);
  for (const name of ['bun', 'node', 'npm', 'cargo', 'rustc', 'rustfmt']) {
    await fs.writeFile(join(bin, name), '#!/bin/sh\necho version-1\n', { mode: 0o700 });
  }
  const env = { PATH: `${bin}:/usr/bin:/bin`, CARGO: join(bin, 'cargo'), RUSTC: join(bin, 'rustc'), RUSTFMT: join(bin, 'rustfmt'), CARGO_HOME: join(root, 'cargo-home') };
  const first = await verificationContext(env, workspace, 'state');
  assert.equal(first, await verificationContext(env, workspace, 'state'));
  await fs.writeFile(join(bin, 'bun'), '#!/bin/sh\necho version-1\n# different binary bytes\n');
  assert.notEqual(first, await verificationContext(env, workspace, 'state'));
  const second = await verificationContext(env, workspace, 'state');
  await fs.mkdir(join(root, '.cargo'));
  await fs.writeFile(join(root, '.cargo/config.toml'), '[build]\njobs = 1\n');
  assert.notEqual(second, await verificationContext(env, workspace, 'state'));
  await fs.unlink(join(bin, 'rustfmt'));
  await assert.rejects(verificationContext(env, workspace, 'state'));
});


test('fast local policy skips test suites but retains static gates and selected E2E policy', async () => {
  const ids = verificationSteps(true, true).map(([id]) => id);
  assert.deepEqual(ids, ['release-guard', 'artifact-paths', 'typecheck', 'lint']);
  assert(verificationSteps(false, true).some(([id]) => id === 'web-e2e'));
  const ran = [];
  await verifyAndActivate({skipE2e:true,skipTests:true,fingerprint:async()=>'same',runStep:async id=>ran.push(id),activate:async proof=>assert.deepEqual(proof.checks.map(c=>c.id),ids)});
  assert.deepEqual(ran, ids);
  for (const failure of ids) {
    await assert.rejects(verifyAndActivate({skipE2e:true,skipTests:true,fingerprint:async()=>'same',runStep:async id=>{if(id===failure)throw Error('failed');},activate:async()=>assert.fail('must not activate')}));
  }
});

test('release prerequisites include skipped tests and stop on failure', async () => {
  const { RELEASE_TEST_STEPS, runReleaseTests } = await import('./release-tests.mjs');
  assert.deepEqual(RELEASE_TEST_STEPS.map(([id])=>id), ['unit-tests','workflow-tests','browser-tools','rust-migration']);
  assert.deepEqual(RELEASE_TEST_STEPS.at(-1).slice(1), ['bun',['run','test:gateway:rust','--full-contracts']]);
  const ran=[];
  runReleaseTests((command,args)=>ran.push([command,args]));
  assert.deepEqual(ran.slice(1), RELEASE_TEST_STEPS.map(([,command,args])=>[command,args]));
  for(let failure=0;failure<ran.length;failure++) {
    let calls=0;
    assert.throws(()=>runReleaseTests(()=>{if(calls++===failure)throw Error('failed');}),/failed/);
    assert.equal(calls,failure+1);
  }
  const source=await fs.readFile(new URL('./release.mjs',import.meta.url),'utf8');
  assert(source.indexOf('  runReleaseTests()') < source.indexOf('    for (const change of release.changes)'));
});
