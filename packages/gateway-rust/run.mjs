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

// The tighter of the cgroup's throttle point and hard cap; Infinity when the process is not in a limited scope.
const cgroupLimitGiB = () => Math.min(readCgroupGiB('memory.high'), readCgroupGiB('memory.max'));

// Below this cgroup limit the single-crate gateway build needs the two guards below.
const SMALL_CGROUP_GIB = 16;

// A build that includes the lib unit-test target peaks near 6.4 GiB in rustc alone (the front end plus the
// concurrent LLVM workers). Under a 6 GiB memory.high, 4 jobs overran it and stalled in
// mem_cgroup_handle_over_high (peak 6.6 GB, ~100k throttle events and 3% CPU); 2 jobs peaked at 6.44 GB with no
// throttling (206 s, 2595 unit tests). Builds that do not compile the lib tests (single --test targets, check,
// clippy) keep the memory-derived job count, e.g. 17 integration binaries peaked at 4.4 GB with 4 jobs.
const LIB_TEST_JOB_CAP = 2;

function includesLibTests() {
  if (mode !== 'test') return false;
  const targeted = args.some((arg) => ['--test', '--bin', '--bins', '--example', '--examples', '--bench', '--benches', '--doc'].includes(arg));
  return args.includes('--lib') || args.includes('--all-targets') || !targeted;
}

function buildJobs() {
  const requested = process.env.CARGO_BUILD_JOBS ?? process.env.JAIT_BUILD_JOBS;
  if (requested) return requested;
  const cores = availableParallelism();
  const byMemory = Math.floor((memoryBudgetGiB() - GIB_RESERVED) / GIB_PER_JOB);
  const jobs = Math.max(1, Math.min(cores - 1, byMemory));
  return String(cgroupLimitGiB() < SMALL_CGROUP_GIB && includesLibTests() ? Math.min(jobs, LIB_TEST_JOB_CAP) : jobs);
}

// Incremental compilation holds the whole query dependency graph in memory and serializes it at the end.
// On a cold cache that overran a 6 GiB memory.high and was throttled for hours (clippy --all-targets 55 min,
// test --lib still unfinished after 3.5 h), while CARGO_INCREMENTAL=0 built the same lib-test target in
// 2m10s at a 6.5 GB peak. Below the small-cgroup limit, default to non-incremental; an explicit CARGO_INCREMENTAL wins.
function incrementalOverride() {
  if (process.env.CARGO_INCREMENTAL !== undefined) return {};
  return cgroupLimitGiB() < SMALL_CGROUP_GIB ? { CARGO_INCREMENTAL: '0' } : {};
}

const jobs = buildJobs();
const cargoArgs = mode === 'fmt'
  ? ['fmt', '--manifest-path', manifest, '--', '--check']
  : [mode, '--locked', '--manifest-path', manifest, ...args];
const child = spawn(cargo, cargoArgs, {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, ...incrementalOverride(), CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: jobs, CARGO_TERM_PROGRESS_WHEN: 'never', CARGO_TERM_COLOR: 'never' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
