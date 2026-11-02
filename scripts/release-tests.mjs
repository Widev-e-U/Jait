import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { VERIFY_STEPS, TEST_STEP_IDS } from './local-deploy.mjs';
import { releaseCheckFingerprint } from './release-check-cache.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CACHE = join(ROOT, '.jait/artifacts/release-check-cache');
const MAX_AGE = 24 * 60 * 60 * 1000;
export const RELEASE_TEST_STEPS = VERIFY_STEPS.filter(([id]) => TEST_STEP_IDS.includes(id) && id !== 'rust-migration');

// Fail before the release commit/push; --skip-checks only controls the version guard.
export function runReleaseTests(run = (command, args) => execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' }), options = {}) {
  // Injected runners in tests never read or write real release evidence.
  const useCache = options.cache ?? arguments.length === 0;
  const fingerprint = options.fingerprint ?? ((id, step) => releaseCheckFingerprint(ROOT, id, step));
  const cacheDirectory = options.cacheDirectory ?? CACHE;
  for (const [id, command, args] of RELEASE_TEST_STEPS) {
    const step = [id, command, args];
    let key;
    // Browser binaries and host runtime are external to the workspace, so its
    // integration gate always runs until they can be fully fingerprinted.
    if (useCache && id !== 'browser-tools') {
      try { key = fingerprint(id, step); }
      catch (error) { console.log(`[release] ${id}: cannot validate cached evidence (${error.message}); running check`); }
    }
    const path = join(cacheDirectory, `${id}.json`);
    if (key) {
      try {
        const record = JSON.parse(readFileSync(path, 'utf8'));
        if (record.key === key && record.passed === true && record.time <= Date.now() && Date.now() - record.time < MAX_AGE) {
          console.log(`[release] ${id}: skipped; matching successful check from ${new Date(record.time).toISOString()} (${(record.duration / 1000).toFixed(1)}s)`);
          continue;
        }
      } catch { /* Missing or invalid evidence means run the check. */ }
    }
    if (id === 'browser-tools') run('node', ['packages/gateway/node_modules/playwright/cli.js', 'install', 'chromium']);
    console.log(`[release] ${id}: running`);
    const start = Date.now();
    run(command, args);
    const duration = Date.now() - start;
    console.log(`[release] ${id}: passed in ${(duration / 1000).toFixed(1)}s`);
    if (key) {
      try {
        if (fingerprint(id, step) !== key) throw new Error('inputs changed during the check');
        mkdirSync(cacheDirectory, { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        writeFileSync(temporary, JSON.stringify({ key, passed: true, time: Date.now(), duration }));
        renameSync(temporary, path);
      } catch (error) { console.log(`[release] ${id}: result cannot be reused (${error.message})`); }
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runReleaseTests();
