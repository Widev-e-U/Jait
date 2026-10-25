// Development evidence only. The native gateway itself has no JS runtime dependency.
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validationCommands } from './validation-commands.mjs';
import { validationRuntimePaths } from './progress.mjs';

const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--full-contracts')) throw new Error('Expected only --full-contracts');
const fullContracts = flags.includes('--full-contracts');

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = fileURLToPath(new URL('../native-coverage.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const inventory = JSON.parse(readFileSync(join(root, 'tests/contract/coverage.json'), 'utf8'));
const known = new Set(inventory.source_files.map(f => f.path));
if (known.size !== manifest.inventory_total) throw new Error('component inventory changed; review native progress denominator');
const credited = manifest.components.filter(c => c.status === 'verified');
if (new Set(credited.map(c => c.reference)).size !== credited.length) throw new Error('duplicate native component credit');
for (const c of manifest.components) {
  if (!known.has(c.reference)) throw new Error('unknown component: ' + c.reference);
  if (c.status === 'verified' && (!c.native.length || !c.contracts.length || !c.review)) throw new Error('missing component evidence');
}
const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
for (const c of credited) {
  if (hash(c.reference) !== c.reference_sha256) throw new Error('reference changed; review native parity: ' + c.reference);
}
const runtimeFiles = validationRuntimePaths(root);
const paths = [...new Set([
  // Bind indirect gateway dependencies (server hooks/config/helpers) as well.
  ...known, ...runtimeFiles, 'packages/gateway-rust/run.mjs', 'packages/gateway-rust/tooling/check-native.mjs', 'packages/gateway/package.json',
  'tests/contract/coverage.json', 'packages/gateway-rust/native-coverage.json',
  'packages/gateway-rust/Cargo.toml', 'packages/gateway-rust/Cargo.lock',
  'packages/gateway-rust/build.rs', 'packages/gateway-rust/tooling/validate-frozen.py',
  'packages/gateway-rust/tooling/validation-commands.mjs',
  'packages/gateway-rust/tooling/progress.mjs', 'packages/gateway-rust/tooling/progress.test.mjs',
  'packages/gateway-rust/tooling/parallel-contracts.mjs', 'packages/gateway-rust/tooling/parallel-contracts.test.mjs',
  'tests/contract/run.mjs',
  'tests/contract/tooling/test_native_validation_output.py', 'tests/contract/tooling/test_native_inventory_metadata.py', 'tests/contract/tooling/test_native_validation_lock.py', 'tests/contract/Cargo.toml', 'tests/contract/Cargo.lock',
  'tests/contract/src/internal_driver.rs', 'tests/contract/drivers/internals.ts',
  // Supplementary deployment regression; not additional component credit.
  'scripts/local-deploy.mjs', 'scripts/local-deploy.sh', 'scripts/local-deploy.test.mjs',
  'tests/contract/drivers/localdeploy.ts', 'tests/contract/tests/local_deploy_pipeline.rs',
  'tests/contract/tests/local_deploy_host.rs',
  ...credited.flatMap(c => [c.reference, ...c.native, ...c.contracts]),
])].sort();
const fingerprint = () => Object.fromEntries(paths.map(p => [p, hash(p)]));
const before = fingerprint();
const output = resolve(root, '.jait/artifacts/gateway-rust/native-progress');
mkdirSync(output, {recursive:true});
const targets = [...new Set([...credited.flatMap(c => c.targets), 'local_deploy_pipeline', 'local_deploy_host'])];
const commands = validationCommands(root, targets, fullContracts);
const checks = [];
let interrupted = false;
const validationLog = createWriteStream(join(output, 'validation.log'), { mode: 0o600 });
for (const args of commands) {
  // Stream progress instead of hiding every suite behind a synchronous, buffered process.
  const checked = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { validationLog.write(chunk); process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { validationLog.write(chunk); process.stderr.write(chunk); });
    const interrupt = signal => { interrupted = true; child.kill(signal); };
    const terminate = () => interrupt('SIGTERM');
    const cancel = () => interrupt('SIGINT');
    process.on('SIGTERM', terminate);
    process.on('SIGINT', cancel);
    let failure;
    child.once('error', error => { failure = error.message; });
    child.once('close', status => {
      process.off('SIGTERM', terminate);
      process.off('SIGINT', cancel);
      resolve({ status, error: failure });
    });
  });
  checks.push({args:args.map(a => a.startsWith(root) ? a.slice(root.length) : a),exit:checked.status,error:checked.error});
  if (checked.status !== 0 || interrupted) break;
}
await new Promise(resolve => validationLog.end(resolve));
const result = {status:!interrupted && checks.length === commands.length && checks.every(c=>c.exit===0) ? 0 : 1};
const after = fingerprint();
const passed = result.status === 0 && JSON.stringify(before) === JSON.stringify(after);
const report = {
  format: 1, generated_at: new Date().toISOString(), passed, test_exit: result.status,
  sources_unchanged: JSON.stringify(before) === JSON.stringify(after),
  inventory_total: manifest.inventory_total, verified_components: passed ? credited.length : 0,
  verified_percent: passed ? Number((100 * credited.length / manifest.inventory_total).toFixed(2)) : 0,
  replacement_ready: false, full_contracts: fullContracts, checks, targets, sources: before, components: credited,
};
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({passed, verified:report.verified_components, total:manifest.inventory_total, percent:report.verified_percent, report:'.jait/artifacts/gateway-rust/native-progress/report.json'}));
if (!passed) process.exitCode = 1;
