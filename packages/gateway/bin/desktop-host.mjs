/** Private desktop entrypoint. stdin is the parent lifetime/control pipe. */
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const [stateDir, portText, network] = process.argv.slice(2);
const port = Number(portText);
if (!stateDir || !isAbsolute(stateDir) || !Number.isInteger(port) || port < 1024 || port > 65535 || !['local', 'network'].includes(network)) {
  throw new Error('Invalid desktop gateway launch configuration');
}
mkdirSync(stateDir, { recursive: true, mode: 0o700 });
// The native shell is single-instance. This extra lock protects manual launches
// of this private entrypoint and a surviving child after a shell crash.
const lockPath = join(stateDir, 'desktop-host.pid');
try {
  const pid = Number(readFileSync(lockPath, 'utf8'));
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Desktop gateway lock is incomplete; another gateway may be starting');
  try { process.kill(pid, 0); throw new Error('Desktop gateway is already running'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  unlinkSync(lockPath);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const lock = openSync(lockPath, 'wx', 0o600);
writeFileSync(lock, String(process.pid));
closeSync(lock);
process.on('exit', () => { try { unlinkSync(lockPath); } catch {} });

const secretsPath = join(stateDir, 'host-secrets.json');
let secrets;
try { secrets = JSON.parse(readFileSync(secretsPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secrets = { jwt: randomBytes(32).toString('hex'), hook: randomBytes(32).toString('hex') };
  writeFileSync(secretsPath, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 });
}
if (!/^[a-f0-9]{64}$/.test(secrets.jwt) || !/^[a-f0-9]{64}$/.test(secrets.hook)) throw new Error('Invalid desktop host secrets');
Object.assign(process.env, {
  __JAIT_CLI: '1', JAIT_DESKTOP_HOST: '1', JAIT_STATE_DIR: stateDir,
  JAIT_DB_PATH: join(stateDir, 'data', 'jait.db'),
  JAIT_NODE_ONLY: 'false', JAIT_PRIMARY_GATEWAY: '', JAIT_PRIMARY_TOKEN: '',
  HOST: network === 'network' ? '0.0.0.0' : '127.0.0.1', PORT: String(port),
  JWT_SECRET: secrets.jwt, HOOK_SECRET: secrets.hook, NODE_ENV: 'production',
});
process.chdir(stateDir);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // Works on Windows too; process.kill(SIGTERM) would terminate immediately.
  process.emit('SIGTERM');
  setTimeout(() => process.exit(0), 6000).unref();
}
const control = createInterface({ input: process.stdin });
control.on('line', line => { if (line === 'stop') stop(); });
control.on('close', stop);
try {
  const { main } = await import('../dist/index.js');
  if (!stopping) await main();
  if (stopping) stop();
  else process.stdout.write(`JAIT_DESKTOP_READY ${port}\n`);
} catch (error) {
  console.error('Desktop gateway failed:', error);
  process.exit(1);
}
