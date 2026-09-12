/** Runs the packaged runtime, not the developer's Node or workspace modules. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const bundle = join(root, 'apps/desktop-tauri/src-tauri/gateway');
const runtime = join(bundle, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
const entry = join(bundle, 'node_modules/@jait/gateway/bin/desktop-host.mjs');
const temporary = mkdtempSync(join(tmpdir(), 'jait-desktop-smoke-'));
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
let child;
let output = '';
async function stop(eof = false) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  if (!eof) child.stdin.write('stop\n');
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 10000);
  const [code] = await exited;
  clearTimeout(timer);
  assert.equal(code, 0, 'graceful shutdown');
}
async function start() {
  output = '';
  child = spawn(runtime, [entry, temporary, String(port), 'local'], {
    cwd: temporary, windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '', JAIT_GRAPHIFY_COMMAND: join(temporary, 'no-optional-python') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output = (output + data).slice(-40000); });
  child.stderr.on('data', data => { output = (output + data).slice(-40000); });
  const deadline = Date.now() + 90000;
  while (!output.includes(`JAIT_DESKTOP_READY ${port}`)) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Packaged gateway startup failed:\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
try {
  // Validate the two native dependencies through the packaged Node and modules.
  const nativeCheck = join(temporary, 'native-check.cjs');
  writeFileSync(nativeCheck, `
const { createRequire } = require('node:module');
const requireGateway = createRequire(${JSON.stringify(entry)});
const pty = requireGateway('node-pty');
const watcher = requireGateway('@parcel/watcher');
(async () => {
  const subscription = await watcher.subscribe(${JSON.stringify(temporary)}, () => {});
  await subscription.unsubscribe();
  const windows = process.platform === 'win32';
  const term = pty.spawn(windows ? 'cmd.exe' : '/bin/sh', windows ? ['/c', 'echo jait-pty-ok'] : ['-c', 'echo jait-pty-ok'], { cols: 80, rows: 24 });
  let text = '';
  term.onData(data => { text += data; });
  term.onExit(() => setTimeout(() => process.exit(text.includes('jait-pty-ok') ? 0 : 1), 50));
})().catch(error => { console.error(error); process.exit(1); });
`);
  const probe = spawn(runtime, [nativeCheck], { stdio: 'inherit', windowsHide: true });
  assert.equal((await once(probe, 'exit'))[0], 0, 'packaged PTY and watcher');
  await start();
  const duplicate = spawn(runtime, [entry, temporary, String(port), 'local'], { stdio: 'ignore', windowsHide: true });
  assert.equal((await once(duplicate, 'exit'))[0], 1, 'rejects a second owner of the same state');
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const credentials = { username: 'desktop-smoke', password: 'smoke-test-password-123' };
  const registered = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(registered.status, 200, 'account creation on packaged SQLite');
  const secrets = readFileSync(join(temporary, 'host-secrets.json'), 'utf8');
  await stop();
  await start();
  assert.equal(readFileSync(join(temporary, 'host-secrets.json'), 'utf8'), secrets, 'stable signing secrets');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(login.status, 200, 'account persists across restart');
  await stop(true);
  console.log('Packaged gateway smoke passed: PTY, watcher, HTTP, SQLite account persistence, stable secrets, exclusive state ownership, stop and parent-pipe closure.');
} finally {
  if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); }
  rmSync(temporary, { recursive: true, force: true });
}
