#!/usr/bin/env node
/** Verified local builds. Public versions and git history remain release.mjs's job. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { promises as fs, createWriteStream, lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackage, waitForVersion } from '../packages/gateway/bin/safe-update.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE = join(ROOT, '.jait/artifacts/local-deploy');
const IGNORED = new Set(['.git', '.jait', 'node_modules']);
export const VERIFY_STEPS = Object.freeze([
  ['release-guard', 'bun', ['run', 'release:check']],
  ['artifact-paths', 'bun', ['run', 'check:artifacts']],
  ['typecheck', 'bun', ['run', 'typecheck']],
  ['unit-tests', 'bun', ['run', 'test', '--maxWorkers=4', '--minWorkers=1']],
  ['workflow-tests', 'node', ['--test', ...readdirSync(join(ROOT,'.github/scripts')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`.github/scripts/${name}`), 'scripts/local-deploy.test.mjs']],
  ['lint', 'bun', ['run', 'lint']],
  ['browser-tools', 'bun', ['run', 'test:tools:browser']],
  ['rust-migration', 'bun', ['run', 'test:gateway:rust', '--full-contracts']],
  ['web-e2e', 'node', ['tests/e2e/scripts/run-isolated.mjs', 'bun', 'run', 'test:e2e']],
  ['web-ui', 'node', ['tests/e2e/scripts/run-isolated.mjs', 'bun', 'run', 'test:e2e:ui']],
]);

// JavaScript reference retained for differential contracts; production uses the native controller.
export async function verifyAndActivate({ runStep, fingerprint, activate }) {
  const before = await fingerprint();
  const checks = [];
  for (const [id, command, args] of VERIFY_STEPS) {
    await runStep(id, command, args); // rejection, signal or timeout stops the pipeline
    checks.push({ id, command, args, passed: true });
  }
  if (await fingerprint() !== before) throw new Error('Verified source/build changed during checks; refusing deployment');
  await activate({ fingerprint: before, checks });
  return checks;
}

export function systemdQuote(value) {
  if (/[\0\r\n]/.test(value)) throw new Error('Invalid service argument');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => '$$')}"`;
}
export function overrideUnit(argv, entry) {
  const index = argv.findIndex(arg => arg.endsWith('/bin/jait.mjs'));
  if (index < 1 || !/^(node|bun)(?:\.exe)?$/.test(argv[0].split('/').at(-1))) throw new Error('Expected a Node/Bun gateway service');
  return `[Service]\nExecStart=\nExecStart=${[...argv.slice(0,index), entry, ...argv.slice(index+1)].map(systemdQuote).join(' ')}\n`;
}
function contained(root, path) {
  const sub = relative(root, path);
  if (!sub || sub.startsWith(`..${sep}`) || sub === '..' || resolve(path) === resolve(root)) throw new Error('Unsafe deployment path');
  return path;
}
function git(root, args, options = {}) {
  return execFileSync('git', ['--literal-pathspecs', '-C', root, ...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024, ...options });
}
export function sourceFiles(root) {
  return [...new Set(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))]
    .filter(path => !path.split('/').some(part => IGNORED.has(part)))
    .filter(path => { try { lstatSync(join(root,path)); return true; } catch(e) { if(e.code==='ENOENT')return false; throw e; } }).sort();
}
export async function digestFiles(root, files) {
  const hash = createHash('sha256');
  for (const path of files) {
    const full = contained(root, resolve(root, path));
    const stat = await fs.lstat(full);
    hash.update(JSON.stringify([path, stat.mode & 0o777]));
    if (stat.isSymbolicLink()) hash.update(await fs.readlink(full));
    else if (stat.isFile()) hash.update(await fs.readFile(full));
    else throw new Error(`Unsupported source entry: ${path}`);
  }
  return hash.digest('hex');
}
async function treeFiles(root, directory = root) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (IGNORED.has(entry.name) || entry.name.endsWith('.tsbuildinfo')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await treeFiles(root, path));
    else result.push(relative(root, path));
  }
  return result.sort();
}
export async function treeDigest(root) { return digestFiles(root, await treeFiles(root)); }

export async function snapshotSource(root, target) {
  const files = sourceFiles(root);
  const before = await digestFiles(root, files);
  await fs.mkdir(target, { recursive: true });
  for (const path of files) {
    const from = resolve(root, path), to = contained(target, resolve(target, path));
    const stat = await fs.lstat(from);
    await fs.mkdir(dirname(to), { recursive: true });
    if (stat.isSymbolicLink()) {
      const link = await fs.readlink(from);
      if(isAbsolute(link))throw new Error('Unsafe deployment path: use relative source symlinks');
      const linked=contained(root, resolve(dirname(from), link));
      if(relative(root,linked).split(sep).some(p=>IGNORED.has(p)))throw new Error('Unsafe deployment path: source symlink reaches ignored state');
      await fs.symlink(link, to);
    } else {
      await fs.copyFile(from, to);
      await fs.chmod(to, stat.mode & 0o777);
    }
  }
  if (sourceFiles(root).join('\0') !== files.join('\0') || await digestFiles(root, files) !== before || await digestFiles(target, files) !== before) {
    throw new Error('Source changed while taking the snapshot; retry after edits settle');
  }
  // Shadow the parent checkout: tests must never discover or mutate its .git.
  git(target, ['init', '--quiet']);
  git(target, ['add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: files.join('\0') + '\0' });
  git(target, ['-c', 'user.name=Jait local build', '-c', 'user.email=local-build@localhost', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Local verification snapshot']);
  return { sourceHash: before, commit: git(root, ['rev-parse', 'HEAD']).trim(), files: files.length };
}

export function runLogged(command, args, { cwd = ROOT, log, env = process.env, timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolveRun, reject) => {
    const output = createWriteStream(log, { mode: 0o600 });
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    let failure, escalation;
    const startedAt=Date.now();
    const progress=setInterval(()=>console.log(`[local-deploy] ${basename(log)} still running (${Math.round((Date.now()-startedAt)/1000)}s)`),30_000);
    const terminate = () => {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch { /* already reaped */ }
      escalation = setTimeout(() => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {} }, 5000);
    };
    const abort = () => { failure = new Error('Local deployment cancelled'); terminate(); };
    process.once('SIGTERM', abort); process.once('SIGINT', abort);
    const timer = setTimeout(() => { failure = new Error(`Stage exceeded ${timeoutMs}ms`); terminate(); }, timeoutMs);
    child.once('error', error => { failure = error; });
    child.once('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(escalation); clearInterval(progress);
      process.off('SIGTERM', abort); process.off('SIGINT', abort);
      output.end(() => failure || code !== 0 || signal
        ? reject(failure ?? new Error(`${command} failed (${signal ?? code}); see ${log}`)) : resolveRun());
    });
  });
}

// Reference activation adapter for cross-language regression tests.
export async function activateLocal(plan, { command, health, read = fs.readFile, write = fs.writeFile, remove = fs.rm, backup } = {}) {
  // Ports are injected in tests; production activation uses only this user's service.
  command ??= async (program, args) => execFileSync(program, args, { timeout: 30_000, stdio: 'pipe' });
  health ??= waitForVersion;
  let previous;
  try { previous = await read(plan.override, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await backup?.(previous);
  try {
    await write(plan.override, plan.unitText, { mode: 0o600 });
    await command('systemctl', ['--user', 'daemon-reload']);
    await command('systemctl', ['--user', 'restart', plan.unit]);
    await health(plan.port, plan.version);
  } catch (error) {
    if (previous === undefined) await remove(plan.override, { force: true });
    else await write(plan.override, previous, { mode: 0o600 });
    await command('systemctl', ['--user', 'daemon-reload']);
    await command('systemctl', ['--user', 'restart', plan.unit]);
    await health(plan.port, plan.previousVersion);
    throw new Error(`Local activation failed; previous service configuration restored: ${error.message}`, { cause: error });
  }
}
async function serviceInfo(unit) {
  if (!/^[a-zA-Z0-9_.@-]+\.service$/.test(unit)) throw new Error('Invalid systemd unit');
  const pid = Number(execFileSync('systemctl', ['--user', 'show', unit, '--property=MainPID', '--value'], { encoding: 'utf8', timeout: 10_000 }).trim());
  if (!Number.isInteger(pid) || pid < 1) throw new Error(`${unit} must be running to preserve its current arguments`);
  const argv = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean);
  const entry = argv.find(arg => arg.endsWith('/bin/jait.mjs'));
  if (!entry) throw new Error('Running service is not a standalone Jait gateway');
  const pkg = JSON.parse(await fs.readFile(resolve(dirname(entry), '../package.json'), 'utf8'));
  if (pkg.name !== '@jait/gateway') throw new Error('Unexpected service package');
  const environment = (await fs.readFile(`/proc/${pid}/environ`, 'utf8')).split('\0');
  const envPath = argv.includes('--env') ? argv[argv.indexOf('--env') + 1] : join(homedir(), '.jait/.env');
  const inheritedPort = environment.find(value => value.startsWith('PORT='))?.slice(5);
  let port = inheritedPort ?? '8000';
  try { port = inheritedPort ?? /^\s*PORT\s*=\s*["']?(\d+)/m.exec(await fs.readFile(envPath, 'utf8'))?.[1] ?? port; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (argv.includes('--port')) port = argv[argv.indexOf('--port') + 1];
  port = Number(port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid service port');
  return { argv, port, previousVersion: pkg.version };
}
async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const port = server.address().port;
  await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
  return port;
}
async function canary(runtime, runDir, version) {
  const port = await freePort();
  const state = join(runDir, 'canary-state'); await fs.mkdir(state, { recursive: true, mode: 0o700 });
  const envPath = join(runDir, 'canary.env');
  await fs.writeFile(envPath, `HOST=127.0.0.1\nPORT=${port}\nJAIT_STATE_DIR=${state}\nAUTH_SECRET=${randomUUID()}\n`, { mode: 0o600 });
  const log = createWriteStream(join(runDir, 'canary.log'), { mode: 0o600 });
  // A fresh state directory and env file keep canary startup away from live data/accounts.
  const child = spawn(process.execPath, [join(runtime, 'packages/gateway/bin/jait.mjs'), '--env', envPath, '--host', '127.0.0.1', '--port', String(port)],
    { cwd: runtime, env: { PATH: process.env.PATH, HOME: homedir(), JAIT_STATE_DIR: state }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  const abort = new AbortController();
  let listening = false, tail = '';
  child.stdout.on('data', chunk => {
    tail = (tail + chunk.toString()).slice(-8000);
    if (tail.includes(`Jait Gateway listening on http://127.0.0.1:${port}`)) listening = true;
  });
  const closed = new Promise(done => {
    const ended = () => { abort.abort(new Error('Canary exited before becoming healthy')); done(); };
    child.once('error', ended); child.once('close', ended);
  });
  try {
    const deadline = Date.now() + 60_000;
    for (;;) {
      if (abort.signal.aborted) throw abort.signal.reason;
      if (Date.now() >= deadline) throw new Error('Canary did not become healthy within 60 seconds');
      if (listening) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3000)]) });
          const health = await response.json();
          if (response.ok && health.healthy !== false && health.version === version) break;
        } catch (error) { if (abort.signal.aborted) throw error; }
      }
      await delay(250, undefined, { signal: abort.signal });
    }
  }
  finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    await closed; clearTimeout(timer); await new Promise(done => log.end(done));
  }
}

function validatePlanTarget(plan) {
  if (plan.unit !== 'jait-gateway.service' || plan.override !== join(homedir(),'.config/systemd/user/jait-gateway.service.d/90-jait-local.conf')) throw new Error('Unexpected local deployment service target');
  if (plan.unitText !== overrideUnit(plan.previousArgv,join(plan.runtime,'packages/gateway/bin/jait.mjs'))) throw new Error('Unexpected local service override');
}

export async function main(argv = process.argv.slice(2)) {
  if (!(argv.length === 0 || (argv.length === 1 && ['--plan','--prepare'].includes(argv[0])) || (argv.length === 2 && ['--activate','--rollback','--restore'].includes(argv[0])))) throw new Error('Usage: bun run deploy:local [--plan | --prepare]');
  if (['--activate','--rollback','--restore'].includes(argv[0])) {
    const planPath = resolve(argv[1]);
    const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
    if (VERIFY_STEPS.some(([id],i) => plan.proof?.checks?.[i]?.id !== id || plan.proof.checks[i].passed !== true || JSON.stringify([plan.proof.checks[i].command,plan.proof.checks[i].args]) !== JSON.stringify(VERIFY_STEPS[i].slice(1)))) throw new Error('Missing mandatory verification evidence');
    if (plan.artifactRoot !== resolve(dirname(planPath), '../..')) throw new Error('Invalid activation plan location');
    contained(plan.artifactRoot, plan.runtime);
    validatePlanTarget(plan);
    const controller = join(plan.runtime, 'packages/gateway-rust/bin/jait-local-deploy');
    await runLogged(controller, [argv[0], planPath], {cwd: plan.runtime, log: join(dirname(planPath), 'native-controller.log')});
    return;
  }
  if (argv.includes('--plan')) {
    console.log(JSON.stringify({ publicVersion: 'unchanged', publish: false, push: false, testsAlwaysRun: true,
      preparation: ['frozen source snapshot', 'frozen dependencies', 'production build'], checks: VERIFY_STEPS.map(([id, command, args]) => ({ id, command, args })),
      activation: 'validated staged runtime, isolated canary, systemd handoff with health rollback', artifacts: BASE }, null, 2)); return;
  }
  if (process.platform !== 'linux') throw new Error('Local deployment currently supports the Linux systemd gateway');
  await fs.mkdir(BASE, { recursive: true, mode: 0o700 });
  await fs.mkdir(join(BASE, 'lock')); // atomic: a second run must not replace an active verification workspace
  await fs.writeFile(join(BASE,'lock','owner.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{mode:0o600});
  let handedOff = false;
  const runDir = join(BASE, 'runs', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
  const workspace = join(BASE, 'workspace');
  const runStep = async (id, program, args, extraEnv = {}) => {
    console.log(`[local-deploy] ${id}; log: ${join(runDir, `${id}.log`)}`);
    await runLogged(program, args, { cwd: workspace, log: join(runDir, `${id}.log`), env: {
      ...process.env, ...extraEnv, CI: '1', NODE_OPTIONS: '--max-old-space-size=6144', CARGO_BUILD_JOBS: '2',
      JAIT_STATE_DIR: join(runDir, 'test-state'),
      PLAYWRIGHT_BROWSERS_PATH: join(BASE, 'browser-cache'),
      // Do not accidentally reuse a live/custom stack during acceptance tests.
      FRONTEND_URL: '', API_URL: '', UI_FRONTEND_URL: '', PLAYWRIGHT_WORKERS: '1',
    }, timeoutMs: id === 'native-verification' ? 2 * 60 * 60_000 : 30 * 60_000 });
  };
  try {
    const unit = 'jait-gateway.service';
    const service = await serviceInfo(unit);
    await fs.rm(workspace, { recursive: true, force: true });
    const provenance = await snapshotSource(ROOT, workspace);
    const cache = join(BASE, 'verification-cache');
    try { await fs.rename(cache, join(workspace, '.jait')); } catch(e) { if(e.code!=='ENOENT')throw e; await fs.mkdir(join(workspace,'.jait'),{recursive:true}); }
    await runStep('dependencies', 'bun', ['install', '--frozen-lockfile']);
    // e2e dev tooling is required even when the caller's environment looks production-like.
    await runStep('e2e-dependencies', 'npm', ['--prefix', 'tests/e2e', 'ci', '--no-audit', '--no-fund', '--include=dev'], { NODE_ENV: 'development' });
    await runStep('browser-runtime', 'node', ['tests/e2e/node_modules/playwright/cli.js', 'install', 'chromium']);
    await runStep('browser-tools-runtime', 'node', ['packages/gateway/node_modules/playwright/cli.js', 'install', 'chromium']);
    await runStep('build', 'bun', ['run', 'build']);
    // Build once, then test and deploy the exact native controller with the staged runtime.
    const cargo = process.env.CARGO || join(homedir(), '.cargo/bin/cargo');
    const nativeTarget = join(workspace, '.jait/native-local-deploy');
    await runStep('native-controller-build', cargo, ['build', '--locked', '--manifest-path', 'packages/gateway-rust/Cargo.toml', '--bin', 'jait-local-deploy', '--target-dir', nativeTarget]);
    const controller = join(workspace, 'packages/gateway-rust/bin/jait-local-deploy');
    await fs.mkdir(dirname(controller), {recursive:true});
    await fs.copyFile(join(nativeTarget, 'debug/jait-local-deploy'), controller);
    await fs.chmod(controller, 0o700);
    await runStep('native-verification', controller, ['--verify', workspace, runDir]);
    const proof = JSON.parse(await fs.readFile(join(runDir, 'proof.json'), 'utf8'));
    await (async proof => {
      const buildId = `${proof.fingerprint.slice(0, 16)}-${Date.now()}`;
      const runtime = join(BASE, 'releases', buildId); await fs.mkdir(dirname(runtime), { recursive: true });
      await fs.rename(join(workspace, '.jait'), cache); // keep compiler/browser/test caches out of the deployed tree
      await fs.rm(join(workspace, '.git'), { recursive: true, force: true });
      await fs.rename(workspace, runtime); // preserves the exact tested dependency tree and relative workspace links
      // validatePackage expects direct dependency links, including dependencies hoisted by Bun.
      const gateway = join(runtime, 'packages/gateway');
      const pkg = JSON.parse(await fs.readFile(join(gateway, 'package.json'), 'utf8'));
      for (const name of Object.keys(pkg.dependencies ?? {})) {
        const dest = join(gateway, 'node_modules', name);
        try { await fs.access(join(dest, 'package.json')); } catch {
          const source = join(runtime, 'node_modules', name);
          await fs.access(join(source, 'package.json')); await fs.mkdir(dirname(dest), { recursive: true });
          await fs.symlink(relative(dirname(dest), source), dest, 'dir');
        }
      }
      await validatePackage(gateway);
      await canary(runtime, runDir, pkg.version);
      const override = join(homedir(), '.config/systemd/user', `${unit}.d`, '90-jait-local.conf');
      const plan = { artifactRoot: BASE, previousArgv: service.argv, unit, port: service.port, previousVersion: service.previousVersion, version: pkg.version,
        buildId, runtime, runtimeHash: await treeDigest(runtime), override,
        unitText: overrideUnit(service.argv, join(runtime, 'packages/gateway/bin/jait.mjs')), provenance, proof };
      const planPath = join(runDir, 'plan.json'); await fs.writeFile(planPath, JSON.stringify(plan, null, 2), { mode: 0o600 });
      console.log(`[local-deploy] All gates passed. Local build ${buildId}; evidence: ${runDir}`);
      if (argv.includes('--prepare')) return;
      await fs.mkdir(dirname(override), { recursive: true });
      // This controller must survive the service restart that ends the current agent connection.
      execFileSync('systemd-run', ['--user', '--collect', `--unit=jait-local-deploy-${buildId}`, '--property=Type=exec',
        join(runtime, 'packages/gateway-rust/bin/jait-local-deploy'), '--activate', planPath], { timeout: 30_000 });
      handedOff = true;
      console.log(`[local-deploy] Activation handed to systemd; result: ${join(runDir, 'activation.json')}`);
    })(proof);
  } catch (error) {
    await fs.writeFile(join(runDir, 'failure.json'), JSON.stringify({ passed: false, error: error.message }, null, 2)); throw error;
  } finally {
    // A failed gate leaves its cache reusable, never a stale success certificate.
    try { await fs.rename(join(workspace,'.jait'),join(BASE,'verification-cache')); } catch(e) { if(!['ENOENT','EEXIST','ENOTEMPTY'].includes(e.code))console.error(`[local-deploy] Cache cleanup: ${e.message}`); }
    if (!handedOff) await fs.rm(join(BASE, 'lock'), { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`[local-deploy] ${error.message}`); process.exitCode = 1; });
