import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// matrix-bot-sdk still declares the older native binding. Bundle its JS while keeping the
// gateway's current binding external, so published installs use the same version as tests.
const result = spawnSync(
  process.env.JAIT_BUILD_BUN || 'bun',
  [
    'build',
    resolve(root, 'src/services/messenger-matrix-runtime.ts'),
    '--target=node',
    '--format=esm',
    '--external',
    '@matrix-org/matrix-sdk-crypto-nodejs',
    '--outfile',
    resolve(root, 'dist/services/messenger-matrix-runtime.js'),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
