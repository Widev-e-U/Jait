// Local, short-lived evidence for release prerequisites. Never cache a failure.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir, release } from 'node:os';
import { sourceFiles } from './local-deploy.mjs';

const hashRecord = (hash, record) => hash.update(JSON.stringify(record) + '\n');

// Workflow regression tests exercise release scripts and fixtures, not the web UI.
// Everything else is included, including untracked, non-ignored files.
export function affectsReleaseCheck(id, path) {
  return !(id === 'workflow-tests' && path.startsWith('apps/web/src/'));
}

function metadataTree(hash, path, root, visited = new Set()) {
  const stat = lstatSync(path);
  hashRecord(hash, [path, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino]);
  if (stat.isSymbolicLink()) {
    let target;
    try { target = realpathSync(path); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hashRecord(hash, [readlinkSync(path), 'dangling']);
      return;
    }
    hashRecord(hash, [readlinkSync(path), target]);
    // External dependencies cannot be fingerprinted reliably: run the check.
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`external dependency: ${path}`);
    if (!visited.has(target)) metadataTree(hash, target, root, visited);
  } else if (stat.isDirectory()) {
    const real = realpathSync(path);
    if (visited.has(real)) return;
    visited.add(real);
    for (const entry of readdirSync(path).sort()) metadataTree(hash, join(path, entry), root, visited);
  }
}

export function releaseCheckFingerprint(root, id, step, environment = process.env) {
  root = realpathSync(root);
  const hash = createHash('sha256');
  hashRecord(hash, ['release-check-v1', id, step, root, process.platform, process.arch, release(), Object.entries(environment).sort()]);
  for (const program of ['node', 'bun', 'npm', 'git', 'python3', 'bash', 'cargo', 'rustc', 'rustfmt']) {
    let executable;
    try { executable = execFileSync('which', [program], { env: environment, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (error) { if (!['cargo', 'rustc', 'rustfmt'].includes(program)) throw error; executable = join(homedir(), '.cargo/bin', program); }
    const target = realpathSync(executable);
    const info = statSync(target);
    hashRecord(hash, [program, target, info.size, info.mtimeMs, info.ctimeMs,
      execFileSync(executable, ['--version'], { env: environment, encoding: 'utf8', timeout: 10000 }).trim()]);
  }
  const files = sourceFiles(root).filter(path => affectsReleaseCheck(id, path));
  for (const path of files) {
    const full = resolve(root, path);
    const stat = lstatSync(full);
    hashRecord(hash, [path, stat.mode]);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(full);
      if (target !== root && !target.startsWith(root + sep)) throw new Error(`external source: ${path}`);
      hashRecord(hash, [readlinkSync(full)]);
    } else if (stat.isFile()) hash.update(readFileSync(full));
    else throw new Error(`unsupported source: ${path}`);
  }
  // Include discovered tool configuration and local environment files even when git ignores them.
  for (const path of [join(homedir(), '.bunfig.toml'), join(environment.CARGO_HOME || join(homedir(), '.cargo'), 'config'), join(environment.CARGO_HOME || join(homedir(), '.cargo'), 'config.toml'), join(root, '.env'), join(root, '.env.local'), join(root, '.cargo/config'), join(root, '.cargo/config.toml'), '/etc/localtime']) {
    try { const info = statSync(path); hashRecord(hash, [path, info.mode, info.size, info.mtimeMs, info.ctimeMs]); hash.update(readFileSync(path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; hashRecord(hash, [path, 'missing']); }
  }
  if (id === 'rust-migration') metadataTree(hash, '/usr/share/zoneinfo', '/usr/share/zoneinfo');
  // Include installed dependencies, including changes not reflected in the lockfile.
  const visited = new Set();
  for (const path of ['node_modules', 'packages/gateway/node_modules', 'packages/shared/node_modules', 'apps/web/node_modules']) {
    metadataTree(hash, join(root, path), root, visited);
  }
  return hash.digest('hex');
}
