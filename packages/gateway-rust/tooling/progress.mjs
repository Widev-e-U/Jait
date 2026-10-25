// Fast source-bound status only: this command never builds or executes migration tests.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHA256 = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const percent = (count, total) => total ? Number((100 * count / total).toFixed(2)) : 0;

export function fingerprint(bytes) {
  // Match capture-coverage.mjs: decode source as UTF-8, then hash its UTF-8 bytes.
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(bytes.toString('utf8'))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function projectPath(root, value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) {
    throw new Error('Expected a project-relative source path');
  }
  const path = resolve(root, value);
  const rel = relative(root, path);
  if (isAbsolute(value) || !rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('Source path must remain inside the project');
  }
  return path;
}

export function artifactOutputPath(root, value) {
  const path = isAbsolute(value) ? resolve(value) : resolve(root, value);
  const base = resolve(root, '.jait/artifacts');
  const rel = relative(base, path);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('Progress output must be a file inside project .jait/artifacts');
  }
  return path;
}

/** Ledger claims, frozen evidence and source drift are separate measurements. */
export function summarizeProgress({ ledger, inventory, checkpoints = [], currentRuntimePaths = [], readBytes }) {
  if (!Array.isArray(ledger?.components) || !Array.isArray(inventory?.source_files) || !Array.isArray(inventory?.test_files)) {
    throw new Error('Invalid native ledger or reference inventory');
  }
  const issues = [];
  const sourcePaths = new Set(inventory.source_files.map(row => row.path));
  if (sourcePaths.size !== inventory.source_files.length) issues.push('Duplicate reference source inventory paths');
  if (sourcePaths.size !== ledger.inventory_total) issues.push('Native denominator differs from current source inventory');
  const verified = ledger.components.filter(row => row.status === 'verified');
  if (new Set(verified.map(row => row.reference)).size !== verified.length) issues.push('Duplicate native component credit');
  for (const row of verified) {
    if (!sourcePaths.has(row.reference)) issues.push('Native credit outside reference inventory: ' + row.reference);
    if (!row.native?.length || !row.contracts?.length || !row.targets?.length || !row.review || !SHA256.test(row.reference_sha256)) {
      issues.push('Incomplete native evidence metadata: ' + row.reference);
    }
  }
  const bytes = path => readBytes(path);
  const drift = (path, expected, hash) => {
    const value = bytes(path);
    return value === null || hash(value) !== expected;
  };
  const referenceDrift = verified
    .filter(row => drift(row.reference, row.reference_sha256, sha256))
    .map(row => row.reference);
  const implemented = new Set(verified.map(row => row.reference));
  const remaining = inventory.source_files.filter(row => !implemented.has(row.path));
  const laneCounts = {};
  for (const row of remaining) laneCounts[row.lane ?? 'unassigned'] = (laneCounts[row.lane ?? 'unassigned'] ?? 0) + 1;

  const inventoryDrift = {};
  for (const group of ['test_files', 'source_files', 'retained_test_files']) {
    inventoryDrift[group] = (inventory[group] ?? [])
      .filter(row => drift(row.path, row.fingerprint, fingerprint))
      .map(row => ({
        path: row.path,
        recorded_verified_declarations: (row.cases ?? []).filter(row => row.status === 'verified').length,
      }));
  }
  const declarations = inventory.test_files.flatMap(row => row.cases ?? []);
  const statuses = {};
  for (const row of declarations) statuses[row.status] = (statuses[row.status] ?? 0) + 1;
  const verifiedDeclarations = statuses.verified ?? 0;
  const affectedDeclarations = inventoryDrift.test_files.reduce((n, row) => n + row.recorded_verified_declarations, 0);
  const valid = checkpoints.filter(({ report }) =>
    report?.passed === true && report.sources_unchanged === true &&
    Number.isInteger(report.verified_components) && Number.isInteger(report.inventory_total) &&
    report.verified_components >= 0 && report.inventory_total > 0 &&
    report.verified_components <= report.inventory_total &&
    Number.isFinite(Date.parse(report.generated_at)) &&
    report.sources && typeof report.sources === 'object' && !Array.isArray(report.sources) &&
    Object.keys(report.sources).length > 0 && Object.values(report.sources).every(value => SHA256.test(value))
  ).sort((a, b) => Date.parse(b.report.generated_at) - Date.parse(a.report.generated_at));
  let checkpoint = null;
  if (valid.length) {
    const { path, report } = valid[0];
    const changed = Object.entries(report.sources)
      .filter(([path, hash]) => drift(path, hash, sha256)).map(([path]) => path).sort();
    const unrecorded = currentRuntimePaths.filter(path => !Object.hasOwn(report.sources, path)).sort();
    checkpoint = {
      path,
      generated_at: report.generated_at,
      verified_components: report.verified_components,
      inventory_total: report.inventory_total,
      percent: percent(report.verified_components, report.inventory_total),
      recorded_run_passed: true,
      recorded_input_drift: changed,
      runtime_paths_not_recorded: unrecorded,
      current_inputs_match: changed.length === 0 && unrecorded.length === 0,
    };
  }
  return {
    format: 1,
    generated_at: new Date().toISOString(),
    audit_only: true,
    tests_executed: false,
    replacement_ready: false,
    limits: [
      'Component percentages count equally weighted inventory entries, not effort or time remaining.',
      'Ledger status and historical frozen test evidence are separate; this audit grants no new verification.',
      'Reference-test reconstruction exercises the TypeScript reference and is not native implementation coverage.',
      'Matching inventoried fingerprints does not prove full API, platform, performance or replacement acceptance.',
      'Concurrent edits can occur during this read-only audit; frozen validation is the source-bound acceptance gate.',
    ],
    issues,
    native_ledger: {
      recorded_verified: verified.length,
      total: ledger.inventory_total,
      percent: percent(verified.length, ledger.inventory_total),
      credited_reference_drift: referenceDrift,
      remaining: remaining.length,
      remaining_by_lane: laneCounts,
    },
    latest_frozen_checkpoint: checkpoint,
    reference_test_parity: {
      declarations: declarations.length,
      status_counts: statuses,
      recorded_verified_percent: percent(verifiedDeclarations, declarations.length),
      verified_declarations_in_changed_test_files: affectedDeclarations,
      recorded_verified_in_unchanged_test_files: verifiedDeclarations - affectedDeclarations,
      recorded_verified_in_unchanged_test_files_percent: percent(verifiedDeclarations - affectedDeclarations, declarations.length),
      // Unchanged test files alone do not revalidate their changed runtime dependencies.
      inventory_drift: inventoryDrift,
    },
  };
}

function insideRealProject(root, path) {
  const rel = relative(realpathSync(root), realpathSync(path));
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

export function isGatewayRuntimePath(path) {
  return /\.(?:[cm]?js|tsx?)$/.test(path) && !path.endsWith('.d.ts') && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

export function runtimePaths(root, directory) {
  const path = resolve(root, directory);
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = directory + '/' + entry.name;
    if (entry.isDirectory()) return entry.name === '.jait' ? [] : runtimePaths(root, child);
    return entry.isFile() && (!directory.startsWith('packages/gateway/src') || isGatewayRuntimePath(child)) ? [child] : [];
  });
}

function checkpointPaths(root) {
  const base = '.jait/artifacts/gateway-rust';
  const dirs = [base + '/checkpoints'];
  if (existsSync(resolve(root, base + '/runs'))) {
    for (const entry of readdirSync(resolve(root, base + '/runs'), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(base + '/runs/' + entry.name + '/checkpoints');
    }
  }
  return dirs.flatMap(directory => existsSync(resolve(root, directory))
    ? readdirSync(resolve(root, directory)).filter(name => /^\d+-report\.json$/.test(name)).map(name => directory + '/' + name)
    : []);
}

/** Shared by the native gate and freshness audit, including uninventoried runtime inputs. */
export function validationRuntimePaths(root) {
  return ['packages/gateway-rust/src', 'packages/shared/src', 'packages/gateway/src']
    .flatMap(path => runtimePaths(root, path));
}

export function collectProgress(root = ROOT) {
  const readBytes = value => {
    const path = projectPath(root, value);
    if (!existsSync(path)) return null;
    if (!insideRealProject(root, path)) throw new Error('Source symlink escapes project: ' + value);
    return readFileSync(path);
  };
  const readJson = value => JSON.parse(readBytes(value)?.toString('utf8') ?? 'null');
  const checkpoints = [];
  for (const path of checkpointPaths(root)) {
    try {
      checkpoints.push({ path, report: readJson(path) });
    } catch {
      // An unfinished or malformed report is not completed test evidence.
    }
  }
  return summarizeProgress({
    ledger: readJson('packages/gateway-rust/native-coverage.json'),
    inventory: readJson('tests/contract/coverage.json'),
    checkpoints,
    currentRuntimePaths: validationRuntimePaths(root),
    readBytes,
  });
}

function main(args) {
  let output = '.jait/artifacts/gateway-rust/progress.json';
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--output') {
      throw new Error('Usage: node packages/gateway-rust/tooling/progress.mjs [--output PROJECT_ARTIFACT_PATH]');
    }
    output = args[1];
  }
  const destination = artifactOutputPath(ROOT, output);
  // Check the nearest existing ancestor before mkdir/write to prevent symlink escape.
  let ancestor = destination;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (!insideRealProject(ROOT, ancestor)) throw new Error('Progress output symlink escapes project');
  const expectedAncestor = resolve(realpathSync(ROOT), relative(ROOT, ancestor));
  if (realpathSync(ancestor) !== expectedAncestor) throw new Error('Progress output must not traverse symlinks');
  const report = collectProgress();
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    audit_only: true,
    native_ledger: report.native_ledger,
    frozen_checkpoint: report.latest_frozen_checkpoint && {
      verified_components: report.latest_frozen_checkpoint.verified_components,
      total: report.latest_frozen_checkpoint.inventory_total,
      percent: report.latest_frozen_checkpoint.percent,
      current_inputs_match: report.latest_frozen_checkpoint.current_inputs_match,
      changed_inputs: report.latest_frozen_checkpoint.recorded_input_drift.length,
      unrecorded_runtime_paths: report.latest_frozen_checkpoint.runtime_paths_not_recorded.length,
    },
    reference_test_parity: {
      recorded_verified: report.reference_test_parity.status_counts.verified ?? 0,
      declarations: report.reference_test_parity.declarations,
      percent: report.reference_test_parity.recorded_verified_percent,
      verified_in_changed_test_files: report.reference_test_parity.verified_declarations_in_changed_test_files,
    },
    issues: report.issues,
    report: relative(ROOT, destination),
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
