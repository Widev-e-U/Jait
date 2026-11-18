// Merge reviewed parity fragments into coverage.json. Fragments are produced by
// declaration-by-declaration review; this tool only applies them — it never
// invents parity claims. Rust owns the audit and all assertions.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const manifestPath = path.join(root, 'tests/contract/coverage.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fragmentDir = path.join(root, 'tests/contract/fragments');
const fragments = fs.existsSync(fragmentDir)
  ? fs.readdirSync(fragmentDir).filter(name => name.endsWith('.json')).sort()
  : [];
const byId = new Map();
const testFiles = [...manifest.test_files, ...(manifest.retained_test_files ?? [])];
for (const file of testFiles) for (const test of file.cases ?? []) {
  if (byId.has(test.id)) throw new Error(`duplicate inventory declaration ${test.id}`);
  byId.set(test.id, test);
}
let applied = 0;
let unchanged = 0;
const reviewedIds = new Set();
const errors = [];
for (const name of fragments) {
  const fragment = JSON.parse(fs.readFileSync(path.join(fragmentDir, name), 'utf8'));
  for (const entry of fragment.declarations ?? []) {
    if (reviewedIds.has(entry.id)) { errors.push(`${name}: duplicate declaration ${entry.id}`); continue; }
    reviewedIds.add(entry.id);
    const target = byId.get(entry.id);
    if (!target) { errors.push(`${name}: unknown declaration ${entry.id}`); continue; }
    if (entry.status !== 'verified') errors.push(`${name}: status must be verified (${entry.id})`);
    if (typeof entry.parity_review !== 'string' || !entry.parity_review.trim()) errors.push(`${name}: empty parity_review (${entry.id})`);
    if (!Array.isArray(entry.rust_cases) || !entry.rust_cases.length) errors.push(`${name}: no rust_cases (${entry.id})`);
    for (const rust of entry.rust_cases ?? []) {
      if (!rust.id || !rust.source || !rust.report) errors.push(`${name}: rust case missing id/source/report (${entry.id})`);
    }
    if (target.status === 'verified') {
      if (target.parity_review === entry.parity_review && JSON.stringify(target.rust_cases) === JSON.stringify(entry.rust_cases)) {
        unchanged += 1;
        continue;
      }
      errors.push(`${name}: conflicting existing review (${entry.id})`);
      continue;
    }
    target.status = 'verified';
    target.rust_cases = entry.rust_cases ?? [];
    target.parity_review = entry.parity_review;
    applied += 1;
  }
}
manifest.summary.rust_verified_declarations = testFiles
  .reduce((sum, file) => sum + (file.cases ?? []).filter(test => test.status === 'verified').length, 0);
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ fragments: fragments.length, applied, unchanged, rust_verified_declarations: manifest.summary.rust_verified_declarations }));
