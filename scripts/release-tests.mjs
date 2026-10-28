import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { VERIFY_STEPS, TEST_STEP_IDS } from './local-deploy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const RELEASE_TEST_STEPS = VERIFY_STEPS.filter(([id]) => TEST_STEP_IDS.includes(id));
// Fail before the release commit/push; --skip-checks only controls the version guard.
export function runReleaseTests(run = (command, args) => execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' })) {
  run('node', ['packages/gateway/node_modules/playwright/cli.js', 'install', 'chromium']);
  for (const [id, command, args] of RELEASE_TEST_STEPS) {
    console.log(`[release] ${id}`);
    run(command, args);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runReleaseTests();
