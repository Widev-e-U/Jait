// Compile once, then run isolated Rust test executables with a bounded worker pool.
import { spawn } from 'node:child_process';
import { closeSync, createWriteStream, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

function groupSignal(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function groupExists(child) {
  if (process.platform === 'win32') return false;
  try { process.kill(-child.pid, 0); return true; } catch { return false; }
}
async function drain(child) {
  if (!groupExists(child)) return;
  groupSignal(child, 'SIGTERM');
  await delay(300);
  if (!groupExists(child)) return;
  groupSignal(child, 'SIGKILL');
  const deadline = Date.now() + 1000;
  while (groupExists(child) && Date.now() < deadline) await delay(20);
}

/** Each child owns a process group; abort also reaches signal-resistant descendants. */
export async function execute(program, args, { cwd, env, log, signal, onLine, onFailure }) {
  if (signal.aborted) return { code: null, cancelled: true };
  writeFileSync(log, '', { mode: 0o600 });
  const fd = openSync(log, 'a');
  let child;
  try {
    child = spawn(program, args, {
      cwd, env, detached: process.platform !== 'win32',
      stdio: ['ignore', onLine ? 'pipe' : fd, fd],
    });
  } finally { closeSync(fd); }
  let buffer = '';
  const output = onLine ? createWriteStream(log, { flags: 'a' }) : null;
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', chunk => {
    output.write(chunk);
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      onLine(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
    }
  });
  let escalation;
  const abort = () => {
    if (!child.pid) return;
    groupSignal(child, 'SIGTERM');
    escalation ??= setTimeout(() => groupSignal(child, 'SIGKILL'), 400);
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    const result = await new Promise(resolve => {
      child.once('error', error => {
        const cancelled = signal.aborted;
        if (!cancelled) onFailure?.();
        resolve({ code: null, error: error.message, cancelled });
      });
      child.once('close', (code, exitSignal) => {
        const cancelled = signal.aborted;
        if (code !== 0 && !cancelled) onFailure?.();
        resolve({ code, signal: exitSignal, cancelled });
      });
    });
    if (buffer) onLine?.(buffer);
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
    clearTimeout(escalation);
    await drain(child);
    if (output) await new Promise(resolve => output.end(resolve));
  }
}

function testArtifacts(line, suites) {
  const event = JSON.parse(line);
  if (event.reason === 'compiler-artifact' && event.profile?.test && event.executable) {
    if (!suites.some(suite => suite.executable === event.executable)) {
      suites.push({ name: event.target.name, executable: event.executable, kind: event.target.kind });
    }
  }
  if (event.reason === 'compiler-message' && event.message?.rendered) {
    process.stderr.write(event.message.rendered);
  }
}

/** No test is omitted: discovery comes from Cargo's complete --no-run artifact stream. */
export async function parallelContracts({
  cargo, manifest, target, root, env = process.env, workers = 3, testThreads = 4,
  signal, reportRoot = join(root, '.jait/artifacts/contract-parallel'),
}) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 3) throw new Error('Expected 1–3 suite workers');
  if (!Number.isInteger(testThreads) || testThreads < 1 || testThreads > 4) throw new Error('Expected 1–4 test threads per ordinary suite');
  mkdirSync(reportRoot, { recursive: true });
  const directory = mkdtempSync(join(reportRoot, 'run-'));
  const controller = new AbortController();
  const interrupted = () => controller.abort(signal?.reason ?? new Error('Contract run interrupted'));
  signal?.addEventListener('abort', interrupted, { once: true });
  if (signal?.aborted) interrupted();
  const childEnv = { ...env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: '2', RUST_TEST_THREADS: String(testThreads) };
  const suites = [], results = [];
  let passed = false;
  const started = Date.now();
  try {
    console.error('[contracts] Compiling all test targets once; log: ' + join(directory, 'build.log'));
    let discoveryError;
    const build = await execute(cargo, [
      'test', '--locked', '--manifest-path', manifest, '--no-run', '--message-format=json',
    ], {
      cwd: root, env: childEnv, log: join(directory, 'build.log'),
      signal: controller.signal, onLine: line => {
        try { testArtifacts(line, suites); } catch (error) { discoveryError ??= error.message; }
      },
    });
    if (build.code !== 0 || build.cancelled) throw new Error('Contract compilation failed; see ' + join(directory, 'build.log'));
    if (discoveryError) throw new Error('Malformed Cargo artifact stream: ' + discoveryError);
    if (!suites.length) throw new Error('Cargo emitted no test executables; refusing an empty passing run');
    // Start the expensive translated/source-review targets early to shorten the critical path.
    const priority = suite => ['tail_static', 'source_review'].indexOf(suite.name);
    const queue = suites.map((suite, index) => ({ ...suite, index })).sort((a, b) => {
      const rank = s => priority(s) < 0 ? 2 : priority(s);
      return rank(a) - rank(b) || a.index - b.index;
    });
    console.error('[contracts] Running ' + suites.length + ' test executables with ' + workers + ' workers, ' + testThreads + ' threads per ordinary suite; 8 for translated tests');
    const work = async () => {
      while (queue.length && !controller.signal.aborted) {
        const suite = queue.shift();
        const log = join(directory, suite.index + '-' + suite.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.log');
        console.error('[contracts] Starting ' + suite.name + '; log: ' + log);
        const begin = Date.now();
        const result = await execute(suite.executable, [], {
          cwd: dirname(manifest), env: { ...childEnv, RUST_TEST_THREADS: String(suite.name === 'tail_static' ? 8 : suite.name === 'source_review' ? 1 : testThreads), JAIT_SOURCE_REVIEW_WORKERS: String(testThreads) }, log, signal: controller.signal,
          onFailure: () => controller.abort(new Error('Contract suite failed: ' + suite.name)),
        });
        results.push({ name: suite.name, index: suite.index, log, ...result, durationMs: Date.now() - begin });
        console.error('[contracts] ' + suite.name + ': ' + (result.code === 0 && !result.cancelled ? 'passed' : 'failed/cancelled') + ' (' + (Date.now() - begin) + 'ms)');
        if (result.code !== 0 && !result.cancelled) {
          console.error(readFileSync(log, 'utf8').slice(-8000));
          controller.abort(new Error('Contract suite failed: ' + suite.name));
        }
      }
    };
    const outcomes = await Promise.allSettled(Array.from({ length: workers }, async () => {
      try { await work(); }
      catch (error) { controller.abort(error); throw error; }
    }));
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    if (rejected) throw rejected.reason;
    passed = !controller.signal.aborted && results.length === suites.length && results.every(result => result.code === 0);
    // Cargo's default test command also runs documentation tests when the package has a library.
    if (passed && suites.some(suite => suite.kind.includes('lib'))) {
      const docs = await execute(cargo, ['test', '--locked', '--manifest-path', manifest, '--doc'], {
        cwd: root, env: childEnv, log: join(directory, 'doctests.log'), signal: controller.signal,
      });
      passed = docs.code === 0 && !docs.cancelled;
    }
    return passed;
  } finally {
    signal?.removeEventListener('abort', interrupted);
    writeFileSync(join(directory, 'report.json'), JSON.stringify({
      passed, workers, testThreads, durationMs: Date.now() - started,
      discovered: suites.length, completed: results.length, results: results.sort((a, b) => a.index - b.index),
    }, null, 2) + '\n', { mode: 0o600 });
    console.error('[contracts] ' + (passed ? 'Passed' : 'Failed') + '; report: ' + join(directory, 'report.json'));
  }
}
