import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reviewedInventory } from './source-review.mjs';

function fixture() {
  const path = 'packages/gateway/src/check.ts';
  const source = Buffer.from('export const value = 1;\n');
  const registry = { schema_version: 1, sources: [{ path, review: 'Exact result and changed-result control.', case_ids: ['exact-value'], mutation: { case_id: 'exact-value' } }] };
  let fingerprint = 0xcbf29ce484222325n;
  for (const byte of source) fingerprint = BigInt.asUintN(64, (fingerprint ^ BigInt(byte)) * 0x100000001b3n);
  const manifest = { source_files: [{ path, fingerprint: fingerprint.toString(16).padStart(16, '0'), status: 'pending' }] };
  const hash = createHash('sha256').update(source).digest('hex');
  const all = [path, 'tests/contract/source-reviews.json', 'tests/contract/vectors/sourcereview.json', 'tests/contract/drivers/sourcereview.ts', 'tests/contract/tests/source_review.rs', 'tests/contract/src/internal_driver.rs', 'tests/contract/src/fixture_internal_contracts.rs', 'tests/contract/drivers/internals.ts', 'tests/source-review/Cargo.toml', 'tests/source-review/Cargo.lock', 'tests/contract/src/source_review_reuse.rs', 'tests/contract/tests/tail_static.rs', 'tests/contract/tests/support/tail_assertions.rs', 'tests/contract/tests/support/tail_stream.rs', 'tests/contract/tests/support/tail_text_pattern.rs', 'tests/contract/drivers/tailstatic.ts', 'tests/contract/drivers/tailstream.ts', 'tests/contract/drivers/tailtransport.ts', 'tests/contract/drivers/tail-peer.test.ts', 'tests/contract/drivers/tail-node-loader.mjs'];
  const report = { profile: 'source-runtime-review', backend_label: 'typescript', success: true, build_manifest: 'tests/source-review/Cargo.toml', cases: [{ id: 'exact-value', status: 'passed' }], mutations: [{ path, case: 'exact-value', before: 'passed', mutated: 'assertion-failed', restored: 'passed', error: 'equality assertion failed at /0: 2' }], source_sha256: Object.fromEntries(all.map(p => [p, hash])) };
  return { manifest, registry, report, read: () => source };
}
function check(f) { return reviewedInventory(f.manifest, f.registry, f.report, f.read); }
test('fresh complete reference evidence grants credit without mutating the input', () => {
  const f = fixture(); const result = check(f);
  assert.equal(result.source_files[0].status, 'verified');
  assert.equal(result.source_files[0].rust_cases[0].id, 'exact-value');
  assert.equal(f.manifest.source_files[0].status, 'pending');
});
test('stale source, driver, assertion interpreter and incomplete reports cannot grant credit', () => {
  for (const change of [
    f => { f.report.success = false; },
    f => { f.report.build_manifest = 'tests/contract/Cargo.toml'; },
    f => { delete f.report.build_manifest; },
    f => { f.report.source_sha256['tests/source-review/Cargo.toml'] = 'stale'; },
    f => { f.report.source_sha256['tests/source-review/Cargo.lock'] = 'stale'; },
    f => { f.report.backend_label = 'rust'; },
    f => { f.report.cases[0].status = 'failed'; },
    f => { f.report.cases = []; },
    f => { f.report.cases.push(f.report.cases[0]); },
    f => { f.report.source_sha256['packages/gateway/src/check.ts'] = 'stale'; },
    f => { f.report.source_sha256['tests/contract/drivers/sourcereview.ts'] = 'stale'; },
    f => { f.report.source_sha256['tests/contract/src/fixture_internal_contracts.rs'] = 'stale'; },
    f => { f.manifest.source_files[0].fingerprint = 'stale'; },
    f => { f.registry.sources[0].review = ''; },
  ]) { const f = fixture(); change(f); assert.throws(() => check(f)); assert.equal(f.manifest.source_files[0].status, 'pending'); }
});
test('missing, borrowed, setup-failed and unrestored mutations fail closed', () => {
  for (const change of [
    f => { f.report.mutations = []; },
    f => { f.report.mutations[0].case = 'other-source'; },
    f => { f.report.mutations[0].mutated = 'process-crashed'; },
    f => { f.report.mutations[0].restored = 'failed'; },
    f => { f.report.mutations[0].error = 'fixture setup failed'; },
  ]) { const f = fixture(); change(f); assert.throws(() => check(f)); }
});

test('reused source oracles require fresh defining fixture and original test evidence', () => {
  const paths = ['tests/contract/drivers/tailstatic/fixture-owned-test.ts', 'packages/gateway/src/owned.test.ts'];
  const f = fixture();
  f.registry.sources[0].evidence_files = paths;
  const hash = f.report.source_sha256['packages/gateway/src/check.ts'];
  for (const path of paths) f.report.source_sha256[path] = hash;
  f.report.mutations[0].error = 'source behavior assertion failed: Rust assertion failed: site 0';
  assert.equal(check(f).source_files[0].status, 'verified');
  for (const path of paths) {
    f.report.source_sha256[path] = 'stale';
    assert.throws(() => check(f), /stale or absent evidence/);
    f.report.source_sha256[path] = hash;
  }
  f.registry.sources[0].evidence_files = ['../../private.env'];
  assert.throws(() => check(f), /extra evidence/);
  f.registry.sources[0].evidence_files = paths;
  f.report.mutations[0].error = 'reused source fixture setup failed';
  assert.throws(() => check(f), /setup failures/);
});

test('assessment helper evidence is exact and must be fresh', () => {
  const path = 'tests/contract/drivers/source-review-assessment.ts';
  const f = fixture();
  f.registry.sources[0].evidence_files = [path];
  const hash = f.report.source_sha256['packages/gateway/src/check.ts'];
  f.report.source_sha256[path] = hash;
  assert.equal(check(f).source_files[0].status, 'verified');
  delete f.report.source_sha256[path];
  assert.throws(() => check(f), /stale or absent evidence/);
  f.report.source_sha256[path] = 'stale';
  assert.throws(() => check(f), /stale or absent evidence/);
  for (const invalid of [
    'tests/contract/drivers/unreviewed.ts',
    'tests/contract/drivers/../drivers/source-review-assessment.ts',
    'tests/contract/drivers/source-review-assessment.ts/extra',
  ]) {
    f.registry.sources[0].evidence_files = [invalid];
    assert.throws(() => check(f), /extra evidence/);
  }
  assert.equal(f.manifest.source_files[0].status, 'pending');
});

test('source evidence binds its actual isolated Cargo inputs', () => {
  const f = fixture();
  const read = f.read;
  f.read = path => {
    assert.notEqual(path, 'tests/contract/Cargo.toml');
    assert.notEqual(path, 'tests/contract/Cargo.lock');
    return read(path);
  };
  assert.equal(check(f).source_files[0].status, 'verified');
  for (const path of ['tests/source-review/Cargo.toml', 'tests/source-review/Cargo.lock']) {
    const hash = f.report.source_sha256[path];
    delete f.report.source_sha256[path];
    assert.throws(() => check(f), /stale or absent evidence/);
    f.report.source_sha256[path] = hash;
  }
  f.report.build_manifest = 'tests/contract/Cargo.toml';
  assert.throws(() => check(f), /isolated reference build required/);
});
