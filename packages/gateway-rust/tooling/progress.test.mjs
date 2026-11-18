import { validationRuntimePaths } from './progress.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { artifactOutputPath, fingerprint, isGatewayRuntimePath, summarizeProgress, runtimePaths } from './progress.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

function fixture() {
  const files = {
    'src/a.ts': Buffer.from('reference a'),
    'src/b.ts': Buffer.from('reference b'),
    'src/c.ts': Buffer.from('reference c'),
    'src/test.ts': Buffer.from('test declarations'),
    'native/a.rs': Buffer.from('native implementation'),
  };
  const component = reference => ({
    reference,
    reference_sha256: sha(files[reference]),
    status: 'verified',
    native: ['native/a.rs'],
    contracts: ['contract.rs'],
    targets: ['native_contract'],
    review: 'Reviewed executable native behavior',
  });
  const inventory = {
    source_files: ['src/a.ts', 'src/b.ts', 'src/c.ts'].map(path => ({
      path, fingerprint: fingerprint(files[path]), lane: path === 'src/c.ts' ? 'execution' : 'core',
    })),
    test_files: [{
      path: 'src/test.ts',
      fingerprint: fingerprint(files['src/test.ts']),
      cases: [{ status: 'verified' }, { status: 'verified' }, { status: 'pending' }],
    }],
  };
  const ledger = { inventory_total: 3, components: [component('src/a.ts'), component('src/b.ts')] };
  const checkpoints = [{
    path: 'checkpoints/1-report.json',
    report: {
      passed: true,
      sources_unchanged: true,
      generated_at: '2026-10-21T10:00:00Z',
      verified_components: 1,
      inventory_total: 3,
      sources: Object.fromEntries(Object.entries(files).map(([path, value]) => [path, sha(value)])),
    },
  }];
  return { files, ledger, inventory, checkpoints, readBytes: path => files[path] ?? null };
}

test('ledger, frozen verification and reference-test reconstruction remain distinct', () => {
  const report = summarizeProgress(fixture());
  assert.equal(report.native_ledger.recorded_verified, 2);
  assert.equal(report.native_ledger.percent, 66.67);
  assert.equal(report.native_ledger.remaining, 1);
  assert.deepEqual(report.native_ledger.remaining_by_lane, { execution: 1 });
  assert.equal(report.latest_frozen_checkpoint.verified_components, 1);
  assert.equal(report.latest_frozen_checkpoint.percent, 33.33);
  assert.equal(report.latest_frozen_checkpoint.current_inputs_match, true);
  assert.equal(report.reference_test_parity.recorded_verified_percent, 66.67);
  assert.equal(report.reference_test_parity.status_counts.pending, 1);
  assert.equal(report.tests_executed, false);
  assert.equal(report.replacement_ready, false);
  assert.deepEqual(report.issues, []);
});

test('changed reference, native runtime and test files invalidate matching evidence without deleting ledger claims', () => {
  const input = fixture();
  input.files['src/a.ts'] = Buffer.from('changed reference');
  input.files['native/a.rs'] = Buffer.from('changed native implementation');
  input.files['src/test.ts'] = Buffer.from('changed test');
  const report = summarizeProgress(input);
  assert.equal(report.native_ledger.recorded_verified, 2);
  assert.deepEqual(report.native_ledger.credited_reference_drift, ['src/a.ts']);
  assert.equal(report.latest_frozen_checkpoint.current_inputs_match, false);
  assert.deepEqual(report.latest_frozen_checkpoint.recorded_input_drift, ['native/a.rs', 'src/a.ts', 'src/test.ts']);
  assert.deepEqual(report.reference_test_parity.inventory_drift.source_files.map(row => row.path), ['src/a.ts']);
  assert.equal(report.reference_test_parity.verified_declarations_in_changed_test_files, 2);
  assert.equal(report.reference_test_parity.recorded_verified_in_unchanged_test_files, 0);
  assert.equal(report.reference_test_parity.recorded_verified_percent, 66.67);
});

test('new runtime files prevent claiming the historical checkpoint matches', () => {
  const input = fixture();
  input.currentRuntimePaths = ['native/a.rs', 'native/new.rs'];
  const report = summarizeProgress(input);
  assert.deepEqual(report.latest_frozen_checkpoint.recorded_input_drift, []);
  assert.deepEqual(report.latest_frozen_checkpoint.runtime_paths_not_recorded, ['native/new.rs']);
  assert.equal(report.latest_frozen_checkpoint.current_inputs_match, false);
});

test('failed, unstable, malformed and empty-source reports are not completed frozen checkpoints', () => {
  const input = fixture();
  const original = input.checkpoints[0];
  input.checkpoints.push(
    { path: 'failed.json', report: { ...original.report, generated_at: '2026-10-21T11:00:00Z', passed: false } },
    { path: 'unstable.json', report: { ...original.report, generated_at: '2026-10-21T12:00:00Z', sources_unchanged: false } },
    { path: 'empty.json', report: { ...original.report, generated_at: '2026-10-21T13:00:00Z', sources: {} } },
    { path: 'malformed.json', report: { ...original.report, generated_at: 'invalid date' } },
    { path: 'bad-hash.json', report: { ...original.report, generated_at: '2026-10-21T14:00:00Z', sources: { 'src/a.ts': 'not a digest' } } },
  );
  assert.equal(summarizeProgress(input).latest_frozen_checkpoint.path, original.path);
  input.checkpoints.shift();
  assert.equal(summarizeProgress(input).latest_frozen_checkpoint, null);
});

test('latest passing frozen evidence is selected by time, not the largest component count', () => {
  const input = fixture();
  input.checkpoints.push({
    path: 'older-larger.json',
    report: { ...input.checkpoints[0].report, generated_at: '2026-10-21T09:00:00Z', verified_components: 3 },
  });
  assert.equal(summarizeProgress(input).latest_frozen_checkpoint.verified_components, 1);
});

test('missing source files appear as drift and duplicate or malformed ledger credit is reported', () => {
  const input = fixture();
  delete input.files['src/a.ts'];
  input.ledger.components.push({ ...input.ledger.components[0], review: '' });
  input.ledger.inventory_total = 4;
  const report = summarizeProgress(input);
  assert(report.issues.includes('Duplicate native component credit'));
  assert(report.issues.includes('Native denominator differs from current source inventory'));
  assert(report.issues.includes('Incomplete native evidence metadata: src/a.ts'));
  assert(report.native_ledger.credited_reference_drift.includes('src/a.ts'));
  assert.equal(report.latest_frozen_checkpoint.current_inputs_match, false);
});

test('FNV fingerprints match the capture inventory algorithm for ASCII and Unicode', () => {
  assert.equal(fingerprint(Buffer.from('')), 'cbf29ce484222325');
  assert.equal(fingerprint(Buffer.from('hello')), 'a430d84680aabd0b');
  assert.equal(fingerprint(Buffer.from('héllo')), 'a35ff71f960240e0');
});

test('output must stay inside project artifact storage', () => {
  const root = resolve('/project');
  assert.equal(artifactOutputPath(root, '.jait/artifacts/status.json'), resolve(root, '.jait/artifacts/status.json'));
  assert.equal(artifactOutputPath(root, resolve(root, '.jait/artifacts/status.json')), resolve(root, '.jait/artifacts/status.json'));
  for (const path of ['/tmp/report.json', '.jait/shots/report.json', '.jait/artifacts/../report.json', '../other/.jait/artifacts/report.json', '.jait/artifacts']) {
    assert.throws(() => artifactOutputPath(root, path), /inside project .jait\/artifacts/);
  }
});

test('unrecorded gateway paths use the same source/test extensions as the coverage inventory', () => {
  for (const path of ['packages/gateway/src/chat.ts', 'packages/gateway/src/util.mjs', 'packages/gateway/src/ui.tsx']) {
    assert.equal(isGatewayRuntimePath(path), true);
  }
  for (const path of ['packages/gateway/src/chat.test.ts', 'packages/gateway/src/util.spec.mjs', 'packages/gateway/src/types.d.ts', 'packages/gateway/src/fixture.json']) {
    assert.equal(isGatewayRuntimePath(path), false);
  }
});


test('runtime audit skips generated nested .jait evidence but retains unrecorded native assets', async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../../.jait/artifacts/gateway-rust/progress-fixtures/' + crypto.randomUUID() + '/', import.meta.url));
  mkdirSync(resolve(root, 'packages/gateway-rust/src/execution/.jait/artifacts'), { recursive: true });
  writeFileSync(resolve(root, 'packages/gateway-rust/src/execution/new.rs'), 'pub fn actual_source() {}');
  writeFileSync(resolve(root, 'packages/gateway-rust/src/execution/native-assets.json'), '{}');
  writeFileSync(resolve(root, 'packages/gateway-rust/src/execution/.jait/artifacts/test.log'), 'generated evidence');
  try {
    assert.deepEqual(runtimePaths(root, 'packages/gateway-rust/src').sort(), [
      'packages/gateway-rust/src/execution/native-assets.json',
      'packages/gateway-rust/src/execution/new.rs',
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('gate runtime inputs include uninventoried CommonJS dependencies and detect later drift', async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../../.jait/artifacts/gateway-rust/progress-fixtures/' + crypto.randomUUID() + '/', import.meta.url));
  const paths = ['packages/gateway/src/surfaces/browser-cursor.cjs', 'packages/shared/src/new.ts', 'packages/gateway-rust/src/asset.bin'];
  for (const path of paths) {
    mkdirSync(resolve(root, path, '..'), { recursive: true });
    writeFileSync(resolve(root, path), 'runtime');
  }
  try {
    const recorded = validationRuntimePaths(root);
    assert.deepEqual(recorded.sort(), paths.sort());
    const input = fixture();
    input.currentRuntimePaths = recorded;
    for (const path of recorded) {
      input.files[path] = Buffer.from('runtime');
      input.checkpoints[0].report.sources[path] = createHash('sha256').update(input.files[path]).digest('hex');
    }
    assert.equal(summarizeProgress(input).latest_frozen_checkpoint.current_inputs_match, true);
    input.files[paths.find(p => p.endsWith('.cjs'))] = Buffer.from('changed runtime');
    assert.equal(summarizeProgress(input).latest_frozen_checkpoint.current_inputs_match, false);
    assert(summarizeProgress(input).latest_frozen_checkpoint.recorded_input_drift.includes('packages/gateway/src/surfaces/browser-cursor.cjs'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
