import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { availableParallelism, homedir, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = fileURLToPath(new URL('./Cargo.toml', import.meta.url));
const target = join(root, '.jait/artifacts/gateway-rust-target');
mkdirSync(target, { recursive: true });
const localCargo = join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const cargo = process.env.CARGO || (existsSync(localCargo) ? localCargo : 'cargo');
const [mode = 'run', ...args] = process.argv.slice(2);
if (!['run', 'build', 'check', 'test', 'fmt', 'clippy'].includes(mode)) throw new Error('Expected run, build, check, test, fmt, or clippy');
// A single clippy-driver on the gateway crate peaks near 0.9 GiB, so budget
// 1.2 GiB per job and keep ~1 GiB for cargo, node and the shell.
const GIB_PER_JOB = 1.2;
const GIB_RESERVED = 1.0;

function readCgroupGiB(file) {
  try {
    const raw = readFileSync(`/sys/fs/cgroup${cgroupPath()}/${file}`, 'utf8').trim();
    return raw === 'max' ? Infinity : Number(raw) / 1024 ** 3;
  } catch {
    return Infinity;
  }
}

function cgroupPath() {
  try {
    const match = /^0::(.*)$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

// The usable budget is the tightest of: cgroup hard cap, cgroup throttle point,
// and system-wide available memory. Jait runs each terminal in its own scope
// (see JAIT_TERMINAL_MEMORY_{HIGH,MAX} in the gateway env), so once a build
// crosses those limits an unconstrained job count only thrashes the cgroup
// instead of going faster.
function memoryBudgetGiB() {
  let free = totalmem() / 1024 ** 3;
  try {
    const match = /^MemAvailable:\s+(\d+) kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
    if (match) free = Number(match[1]) / 1024 / 1024;
  } catch {}
  return Math.min(free, readCgroupGiB('memory.high'), readCgroupGiB('memory.max'));
}

function buildJobs() {
  const requested = process.env.CARGO_BUILD_JOBS ?? process.env.JAIT_BUILD_JOBS;
  if (requested) return requested;
  const cores = availableParallelism();
  const byMemory = Math.floor((memoryBudgetGiB() - GIB_RESERVED) / GIB_PER_JOB);
  return String(Math.max(1, Math.min(cores - 1, byMemory)));
}

const jobs = buildJobs();
const cargoArgs = mode === 'fmt'
  ? ['fmt', '--manifest-path', manifest, '--', '--check']
  : [mode, '--locked', '--manifest-path', manifest, ...args];
const child = spawn(cargo, cargoArgs, {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: jobs, CARGO_TERM_PROGRESS_WHEN: 'never', CARGO_TERM_COLOR: 'never' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
