import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const loops = ['ci.yml', 'release.yml'].flatMap(file => {
  const source = readFileSync(join(root, '.github/workflows', file), 'utf8');
  return [...source.matchAll(/^( +)for attempt in 1 2 3; do\n[\s\S]*?^\1(?:exit|return) 137$/gm)]
    .map((match, index) => ({ name: `${file} loop ${index + 1}`, script: match[0].replace(/^\s*return /gm, 'exit ') }));
});

describe('release build retries preserve command failure', () => {
  it('covers CI and all three release retry loops', () => expect(loops).toHaveLength(4));
  for (const loop of loops) {
    for (const scenario of [
      { name: 'success', code: 0, failures: 0, attempts: 1, status: 0 },
      { name: 'ordinary failure', code: 42, failures: 3, attempts: 1, status: 42 },
      { name: 'transient OOM', code: 134, failures: 1, attempts: 2, status: 0 },
      { name: 'persistent OOM', code: 137, failures: 3, attempts: 3, status: 137 },
    ]) {
      it(`${loop.name}: ${scenario.name}`, () => {
        const directory = mkdtempSync(join(tmpdir(), 'jait-retry-'));
        const counter = join(directory, 'attempts');
        writeFileSync(counter, '0');
        try {
          const result = spawnSync('bash', ['-c', `
            flock() {
              local attempt
              attempt=$(cat "$RETRY_COUNTER")
              attempt=$((attempt + 1))
              printf '%s' "$attempt" > "$RETRY_COUNTER"
              if [ "$attempt" -le "$RETRY_FAILURES" ]; then return "$RETRY_CODE"; fi
              return 0
            }
            sleep() { :; }
            ${loop.script}
          `], { cwd: root, env: { PATH: '/usr/bin:/bin', RETRY_COUNTER: counter,
            RETRY_FAILURES: String(scenario.failures), RETRY_CODE: String(scenario.code) }, encoding: 'utf8' });
          expect(result.error).toBeUndefined();
          expect(result.status, result.stderr + result.stdout).toBe(scenario.status);
          expect(Number(readFileSync(counter, 'utf8'))).toBe(scenario.attempts);
        } finally { rmSync(directory, { recursive: true, force: true }); }
      });
    }
  }
});
