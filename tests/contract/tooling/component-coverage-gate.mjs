import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const output = resolve(root, '.jait/artifacts/rust-continuation/component-baseline');
export const baselinePath = fileURLToPath(new URL('./component-coverage-baseline.v2.json', import.meta.url));
const components = ['gateway', 'shared', 'api-client'];
const metrics = ['branches', 'statements', 'functions', 'lines'];
const read = path => JSON.parse(readFileSync(path, 'utf8'));
export function inventory(repo = root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(resolve(repo, dir), { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile() && name.endsWith('.ts') && !/\.(test|spec|d)\.ts$/.test(name)) files.push(name);
    }
  }
  for (const component of components) walk(`packages/${component}/src`);
  return files.sort();
}
function counts(summary) {
  return Object.fromEntries(metrics.map(metric => {
    const value = summary?.[metric];
    if (!Number.isSafeInteger(value?.total) || !Number.isSafeInteger(value?.covered) || value.total < 0 || value.covered < 0 || value.covered > value.total) throw new Error(`Invalid ${metric} counts`);
    return [metric, { covered: value.covered, total: value.total }];
  }));
}
// Istanbul/source-map remapping omits counter-free modules. Prove zero counters
// with the same Istanbul AST instrumenter; never waive a missing executable file.
export function nonExecutableSource(file, repo = root) {
  try {
    const require = createRequire(import.meta.url);
    const providerRequire = createRequire(require.resolve('@vitest/coverage-istanbul'));
    const ts = require('typescript');
    const code = ts.transpileModule(readFileSync(resolve(repo, file), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    }).outputText;
    const instrumenter = providerRequire('istanbul-lib-instrument').createInstrumenter({ esModules: true, produceSourceMap: false });
    instrumenter.instrumentSync(code, file);
    const coverage = instrumenter.lastFileCoverage();
    return ['statementMap', 'branchMap', 'fnMap'].every(key => Object.keys(coverage[key]).length === 0);
  } catch { return false; }
}
export function fromSummary(summary, expected, repo = root) {
  const sources = {};
  for (const [path, value] of Object.entries(summary)) {
    if (path === 'total') continue;
    const name = relative(repo, resolve(repo, path)).split('\\').join('/');
    if (!expected.includes(name)) throw new Error(`Unexpected coverage source: ${name}`);
    sources[name] = counts(value);
  }
  const nonExecutableSources = [];
  for (const file of expected) if (!sources[file]) {
    if (!nonExecutableSource(file, repo)) throw new Error(`Missing source coverage: ${file}`);
    sources[file] = Object.fromEntries(metrics.map(metric => [metric, { covered: 0, total: 0 }]));
    nonExecutableSources.push(file);
  }
  return { schemaVersion: 1, sources: Object.fromEntries(Object.entries(sources).sort()), nonExecutableSources, totals: counts(summary.total) };
}
function ratio({ covered, total }) { return total ? covered / total : 1; }
function aggregate(sources) {
  const result = {};
  for (const component of [...components, 'all']) {
    result[component] = Object.fromEntries(metrics.map(metric => [metric, { covered: 0, total: 0 }]));
    for (const [file, values] of Object.entries(sources)) {
      if (component !== 'all' && !file.startsWith(`packages/${component}/`)) continue;
      for (const metric of metrics) {
        result[component][metric].covered += values[metric].covered;
        result[component][metric].total += values[metric].total;
      }
    }
  }
  return result;
}
export function validateMeasurement(measurement, tests, repo = root, reports = output) {
  if (measurement.exitCode !== 0 || measurement.signal || measurement.error || tests.success !== true || tests.numFailedTests !== 0 || tests.numPassedTests < 1) throw new Error('Unsuccessful test measurement');
  if (measurement.isolation !== 'allowlisted-env-tcp-guard-v2' || measurement.instrumentation !== 'istanbul' || measurement.coverageProvider !== '3.2.7' || measurement.vitest !== '3.2.7') throw new Error('Incompatible measurement provider or isolation');
  for (const [file, expectedHash] of [['coverage/coverage-summary.json', measurement.summarySha256], ['tests.json', measurement.testsSha256]]) {
    const actual = createHash('sha256').update(readFileSync(resolve(reports, file))).digest('hex');
    if (actual !== expectedHash) throw new Error(`Measurement digest mismatch: ${file}`);
  }
  const actualSources = {};
  function capture(dir) {
    for (const entry of readdirSync(resolve(repo, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) capture(file);
      else if (entry.isFile()) actualSources[file] = createHash('sha256').update(readFileSync(resolve(repo, file))).digest('hex');
    }
  }
  for (const component of components) capture(`packages/${component}/src`);
  if (JSON.stringify(Object.entries(actualSources).sort()) !== JSON.stringify(Object.entries(measurement.sourceHashes ?? {}).sort())) throw new Error('Stale source/test measurement');
}
export function compare(baseline, current) {
  if (baseline.instrumentation !== current.instrumentation) throw new Error('Incomparable instrumentation baselines');
  if (baseline.schemaVersion !== 1 || current.schemaVersion !== 1) throw new Error('Unsupported baseline schema');
  const errors = [];
  for (const snapshot of [baseline, current]) {
    if (!Object.keys(snapshot.sources ?? {}).length) throw new Error('Empty source coverage');
    for (const values of Object.values(snapshot.sources)) counts(values);
  }
  function check(label, before, after) {
    for (const metric of metrics) if (ratio(after[metric]) < ratio(before[metric])) errors.push(`${label}: ${metric} regressed (${after[metric].covered}/${after[metric].total} < ${before[metric].covered}/${before[metric].total})`);
  }
  for (const [file, values] of Object.entries(baseline.sources)) {
    if (!current.sources[file]) errors.push(`Missing baseline source: ${file}`);
    else check(file, values, current.sources[file]);
  }
  const before = aggregate(baseline.sources), after = aggregate(current.sources);
  for (const component of [...components, 'all']) check(component, before[component], after[component]);
  return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command = 'check', first, second] = process.argv.slice(2);
    if (command === 'compare') {
      const errors = compare(read(first), read(second));
      if (errors.length) throw new Error(errors.join('\n'));
    } else {
      const current = fromSummary(read(`${output}/coverage/coverage-summary.json`), inventory());
      const measurement = read(`${output}/measurement.json`);
      const tests = read(`${output}/tests.json`);
      validateMeasurement(measurement, tests);
      current.instrumentation = 'istanbul@3.2.7';
      if (command === 'snapshot') {
        current.measurement = measurement;
        current.tests = Object.fromEntries(['success', 'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'].map(key => [key, tests[key]]));
        current.tests.files = tests.testResults.length;
        current.tests.failures = tests.testResults.flatMap(suite => suite.assertionResults.filter(test => test.status === 'failed').map(test => ({ file: relative(root, suite.name), name: test.fullName, messages: test.failureMessages })));
        current.tests.skips = tests.testResults.flatMap(suite => suite.assertionResults.filter(test => ['pending', 'todo', 'skipped'].includes(test.status)).map(test => ({ file: relative(root, suite.name), name: test.fullName, status: test.status })));
        writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
      } else if (command === 'check') {
        const errors = compare(read(baselinePath), current);
        writeFileSync(`${output}/comparison.json`, JSON.stringify({ passed: !errors.length, errors }, null, 2) + '\n');
        if (errors.length) throw new Error(errors.join('\n'));
      } else throw new Error(`Unknown command: ${command}`);
    }
    console.log(`Component coverage ${command}: passed`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
