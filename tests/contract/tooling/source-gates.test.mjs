import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceGates } from './source-gates.mjs';
const gate = body => `/*__jait_source_gate__ ${body} */`;
test('platform predicates retain source eligibility for every supported platform', () => {
  for (const platform of ['linux', 'darwin', 'win32']) {
    for (const target of ['linux', 'darwin', 'win32']) {
      for (const method of ['skipIf', 'runIf']) {
        for (const operator of ['===', '!==']) {
          const result = sourceGates([gate(`${method} process.platform ${operator} "${target}"`)], platform);
          const condition = operator === '===' ? platform === target : platform !== target;
          assert.equal(result.ignored, method === 'skipIf' ? condition : !condition);
          assert.equal(result.attributes.length, 1);
          assert.match(result.attributes[0], /^#\[cfg_attr\(/);
        }
      }
    }
  }
});
test('Linux CLI cases run on Linux and preserve portable Rust attributes', () => {
  const linux = sourceGates([gate('skipIf process.platform !== "linux"')], 'linux');
  assert.equal(linux.ignored, false);
  assert.deepEqual(linux.attributes, ['#[cfg_attr(not(target_os = "linux"), ignore = "original source platform gate")]']);
  assert.equal(sourceGates([gate('skipIf process.platform === "win32"')], 'linux').ignored, false);
});
test('unknown source predicates remain unresolved without executing them', () => {
  for (const body of ['explicit skip', 'runIf process.env.JAIT_TEST_SANDBOX === "1"', 'skipIf process.exit(1)', 'skipIf process.platform === "win32" || process.getuid?.() === 0']) {
    assert.equal(sourceGates([gate(body)]).ignored, true);
  }
  assert.deepEqual(sourceGates([]), { ignored: false, attributes: [], gates: [] });
});
