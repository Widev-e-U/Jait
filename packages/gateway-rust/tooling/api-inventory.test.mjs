import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('inventory does not turn path references into tested parity claims', () => {
  const summary = JSON.parse(execFileSync(process.execPath, [join(here, 'api-inventory.mjs')], { encoding: 'utf8' }));
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  assert.deepEqual(inventory.summary, summary, 'regenerate the checked-in inventory');
  assert.equal(summary.nativeTestedPct, null);
  assert.ok(inventory.http.some((route) => route.status === 'native-untested' && route.testPathReference));
  assert.ok(inventory.http.every((route) => route.status !== 'native-tested'));
  assert.ok(inventory.http.some((route) => route.status === 'mounted-fail-closed'));
  assert.ok(inventory.http.some((route) => route.status === 'missing'));
});
