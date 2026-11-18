import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, realpathSync, mkdirSync, mkdtempSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('reference review build has locked dependencies and no native gateway coupling', () => {
  const local = join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  const cargo = process.env.CARGO || (existsSync(local) ? local : 'cargo');
  const manifest = join(root, 'tests/source-review/Cargo.toml');
  const result = spawnSync(cargo, ['metadata', '--locked', '--offline', '--no-deps', '--format-version', '1', '--manifest-path', manifest], {
    cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
    env: { ...process.env, CARGO_TARGET_DIR: join(root, '.jait/artifacts/rust-contract-target') },
  });
  assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(result.stdout);
  assert.equal(metadata.packages.length, 1);
  const pkg = metadata.packages[0];
  assert.equal(pkg.name, 'jait-source-review');
  assert.equal(pkg.targets.length, 1);
  assert.deepEqual(pkg.targets[0].kind, ['test']);
  assert.equal(pkg.targets[0].name, 'source_review');
  assert.equal(realpathSync(pkg.targets[0].src_path), realpathSync(join(root, 'tests/contract/tests/source_review.rs')));
  assert.deepEqual(pkg.dependencies.map(item => item.name).sort(), ['anyhow', 'hex', 'reqwest', 'serde', 'serde_json', 'sha2', 'uuid']);
  assert.ok(pkg.dependencies.every(item => !item.path && item.req.startsWith('=')));
});

test('source copies use separate embedded-root builds even with a shared compiler cache', () => {
  const base = join(root, '.jait/artifacts/source-review-build-tests');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'roots-'));
  const cache = join(directory, 'shared-cache');
  mkdirSync(cache);
  const cargo = join(directory, 'capture-cargo.mjs');
  writeFileSync(cargo, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ target: process.env.CARGO_TARGET_DIR, args: process.argv.slice(2) }))
`, { mode: 0o755 });
  const targets = [];
  for (const name of ['first', 'second']) {
    const project = join(directory, name);
    mkdirSync(join(project, 'tests/contract'), { recursive: true });
    mkdirSync(join(project, '.jait/artifacts'), { recursive: true });
    symlinkSync(cache, join(project, '.jait/artifacts/rust-contract-target'), 'dir');
    copyFileSync(join(root, 'tests/contract/run.mjs'), join(project, 'tests/contract/run.mjs'));
    for (const args of [['source-review'], ['test', '--test', 'source_review']]) {
      const result = spawnSync(process.execPath, [join(project, 'tests/contract/run.mjs'), ...args], {
        cwd: project, env: { ...process.env, CARGO: cargo }, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.status, 0, result.stderr);
      const invocation = JSON.parse(result.stdout);
      assert.ok(invocation.args.includes(join(project, 'tests/source-review/Cargo.toml')));
      assert.ok(invocation.args.includes('--locked'));
      mkdirSync(invocation.target, { recursive: true });
      targets.push(realpathSync(invocation.target));
    }
  }
  assert.equal(targets[0], targets[1], 'CLI aliases share the same source root');
  assert.equal(targets[2], targets[3]);
  assert.notEqual(targets[0], targets[2], 'distinct source roots cannot reuse embedded-root binaries');
});
