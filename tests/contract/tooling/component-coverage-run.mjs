import { isolatedEnvironment } from './component-coverage-env.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = fileURLToPath(new URL('../../../.jait/artifacts/rust-continuation/component-baseline/', import.meta.url));
mkdirSync(`${out}/tmp`, { recursive: true });
for (const file of ['coverage', 'tests.json', 'measurement.json']) rmSync(`${out}/${file}`, { recursive: true, force: true });
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout?.trim();
const env = isolatedEnvironment(out);
const sourceHashes = {};
function capture(dir) {
  for (const entry of readdirSync(`${root}/${dir}`, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) capture(path);
    else if (entry.isFile()) sourceHashes[path] = createHash('sha256').update(readFileSync(`${root}/${path}`)).digest('hex');
  }
}
for (const component of ['gateway', 'shared', 'api-client']) capture(`packages/${component}/src`);
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'tests/contract/tooling/component-coverage.config.ts'], {
  cwd: root, stdio: 'inherit', timeout: 30 * 60 * 1000, killSignal: 'SIGTERM',
  env,
});
const hash = file => { try { return createHash('sha256').update(readFileSync(`${out}/${file}`)).digest('hex'); } catch { return null; } };
writeFileSync(`${out}/measurement.json`, JSON.stringify({
  schemaVersion: 1, isolation: 'allowlisted-env-tcp-guard-v2', sourceHashes, startedAt, finishedAt: new Date().toISOString(),
  commit: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain'),
  node: process.version, vitest: JSON.parse(readFileSync(`${root}/node_modules/vitest/package.json`)).version,
  instrumentation: 'istanbul', coverageProvider: JSON.parse(readFileSync(`${root}/node_modules/@vitest/coverage-istanbul/package.json`)).version,
  maxWorkers: 2, exitCode: result.status, signal: result.signal, error: result.error?.message,
  summarySha256: hash('coverage/coverage-summary.json'), testsSha256: hash('tests.json'),
}, null, 2) + '\n');
process.exitCode = result.status || (result.signal || result.error ? 1 : 0);
