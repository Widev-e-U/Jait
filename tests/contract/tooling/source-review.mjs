/** Apply only complete, fresh Rust-owned source-review evidence. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requiredEvidence = [
  'tests/contract/source-reviews.json', 'tests/contract/vectors/sourcereview.json',
  'tests/contract/drivers/sourcereview.ts', 'tests/contract/tests/source_review.rs',
  'tests/contract/src/internal_driver.rs', 'tests/contract/src/fixture_internal_contracts.rs',
  'tests/contract/drivers/internals.ts', 'tests/source-review/Cargo.toml', 'tests/source-review/Cargo.lock',
  'tests/contract/src/source_review_reuse.rs',
  'tests/contract/tests/tail_static.rs',
  'tests/contract/tests/support/tail_assertions.rs',
  'tests/contract/tests/support/tail_stream.rs',
  'tests/contract/tests/support/tail_text_pattern.rs',
  'tests/contract/drivers/tailstatic.ts',
  'tests/contract/drivers/tailstream.ts',
  'tests/contract/drivers/tailtransport.ts',
  'tests/contract/drivers/tail-peer.test.ts',
  'tests/contract/drivers/tail-node-loader.mjs',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fnv = bytes => {
  let result = 0xcbf29ce484222325n;
  for (const byte of bytes) result = BigInt.asUintN(64, (result ^ BigInt(byte)) * 0x100000001b3n);
  return result.toString(16).padStart(16, '0');
};
const members = values => [...new Set(values)].sort();

export function reviewedInventory(manifest, registry, report, read) {
  assert.equal(registry.schema_version, 1, 'unsupported source-review schema');
  assert.equal(report.profile, 'source-runtime-review', 'wrong report profile');
  assert.equal(report.backend_label, 'typescript', 'reference backend required');
  assert.equal(report.success, true, 'failed report cannot grant source credit');
  assert.equal(report.build_manifest, 'tests/source-review/Cargo.toml', 'isolated reference build required');
  const sources = registry.sources;
  assert.ok(sources.length > 0, 'no reviewed sources');
  assert.equal(members(sources.map(s => s.path)).length, sources.length, 'duplicate source review');
  const ids = members(sources.flatMap(s => s.case_ids));
  assert.equal(report.cases.length, ids.length, 'case count differs from review');
  assert.deepEqual(members(report.cases.map(c => c.id)), ids, 'case membership differs from review');
  assert.ok(report.cases.every(c => c.status === 'passed'), 'every case must pass');
  assert.equal(report.mutations.length, sources.length, 'every source requires a mutation control');
  assert.equal(members(report.mutations.map(m => m.path)).length, sources.length, 'duplicate mutation evidence');
  const extraFiles = sources.flatMap(source => {
    assert.ok(source.evidence_files === undefined || Array.isArray(source.evidence_files), 'invalid extra evidence files');
    for (const path of source.evidence_files ?? []) {
      assert.ok(typeof path === 'string' && !path.split(/[\\/]/).includes('..') && (
        /^tests\/contract\/drivers\/tailstatic\/fixture-[a-z0-9-]+\.ts$/.test(path)
        || (path.startsWith('packages/gateway/') && /\.(test|spec)\.[cm]?[jt]sx?$/.test(path))
        || path === 'tests/contract/drivers/source-review-assessment.ts'
      ), 'extra evidence is not a reviewed fixture, original test or assessment helper');
    }
    return source.evidence_files ?? [];
  });
  for (const path of [...requiredEvidence, ...sources.map(s => s.path), ...extraFiles]) {
    assert.equal(report.source_sha256[path], sha256(read(path)), `stale or absent evidence: ${path}`);
  }
  const updated = structuredClone(manifest);
  for (const source of sources) {
    assert.ok(source.path.startsWith('packages/gateway/'), 'source outside gateway inventory');
    assert.ok(typeof source.review === 'string' && source.review.trim(), 'missing behavior review');
    assert.ok(source.case_ids.length > 0, 'source requires cases');
    assert.equal(members(source.case_ids).length, source.case_ids.length, 'duplicate case reference');
    const item = updated.source_files.find(file => file.path === source.path);
    assert.ok(item, `source missing from coverage inventory: ${source.path}`);
    assert.equal(item.fingerprint, fnv(read(source.path)), `source inventory drift: ${source.path}`);
    const mutation = report.mutations.find(m => m.path === source.path);
    assert.equal(mutation?.case, source.mutation.case_id, 'mutation case differs from review');
    assert.ok(source.case_ids.includes(mutation.case), 'mutation borrows unrelated case');
    assert.deepEqual([mutation.before, mutation.mutated, mutation.restored], ['passed', 'assertion-failed', 'passed'], 'mutation requires pass/fail/restore');
    assert.ok(mutation.error.includes('equality assertion failed') || mutation.error.includes('source behavior assertion failed'), 'setup failures do not prove behavior');
    item.status = 'verified';
    item.parity_review = `${source.review} Executable review: tests/contract/source-reviews.json; Rust-owned cases and assertion-failing source mutation with restored pass: tests/contract/tests/source_review.rs. Reference source runtime coverage only; native implementation and broader migration acceptance remain separate.`;
    item.gap = 'Reviewed reference runtime behavior; native migration and wider acceptance gates remain separate.';
    // The caller supplies the project-relative report path after validation.
    item.rust_cases = source.case_ids.map(id => ({ id, source: 'tests/contract/tests/source_review.rs' }));
  }
  return updated;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const paths = args.filter(arg => arg !== '--apply');
  assert.equal(paths.length, 1, 'usage: node source-review.mjs <project-relative-report.json> [--apply]');
  const reportPath = paths[0];
  assert.ok(reportPath.startsWith('.jait/artifacts/') && !reportPath.split(/[\\/]/).includes('..'), 'report must be project-local artifact');
  const read = path => {
    const absolute = resolve(root, path);
    assert.ok(absolute.startsWith(root), 'evidence path escapes project');
    return readFileSync(absolute);
  };
  const manifest = JSON.parse(read('tests/contract/coverage.json'));
  const registry = JSON.parse(read('tests/contract/source-reviews.json'));
  const updated = reviewedInventory(manifest, registry, JSON.parse(read(reportPath)), read);
  for (const source of registry.sources) {
    for (const item of updated.source_files.find(file => file.path === source.path).rust_cases) item.report = reportPath;
  }
  if (apply) writeFileSync(resolve(root, 'tests/contract/coverage.json'), JSON.stringify(updated, null, 2) + '\n');
  const verified = updated.source_files.filter(s => s.status === 'verified').length;
  console.log(JSON.stringify({ applied: apply, reviewed_sources: registry.sources.length, verified_sources: verified, total_sources: updated.source_files.length, pending_sources: updated.source_files.length - verified }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
