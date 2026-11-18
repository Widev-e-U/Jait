// Translate only explicit platform comparisons. Capability and arbitrary source
// predicates remain visible gaps; never evaluate source code during authoring.
export function sourceGates(scopes, platform = process.platform) {
  const markers = scopes.filter(s => typeof s === 'string' && s.startsWith('/*__jait_source_gate__'));
  const platformNames = { linux: 'linux', darwin: 'macos', win32: 'windows' };
  const predicates = [];
  let ignored = false;
  for (const marker of markers) {
    const match = /^\/\*__jait_source_gate__ (skipIf|runIf) process\.platform (===|!==) (["'])(linux|darwin|win32)\3 \*\/$/.exec(marker);
    if (!match) return { ignored: true, attributes: ['#[ignore = "original source skip or capability gate; unresolved"]'], gates: markers };
    const [, method, operator, , expected] = match;
    const skipOnMatch = (method === 'skipIf') === (operator === '===');
    const target = `target_os = "${platformNames[expected]}"`;
    predicates.push(skipOnMatch ? target : `not(${target})`);
    ignored ||= skipOnMatch ? platform === expected : platform !== expected;
  }
  return {
    ignored,
    attributes: predicates.map(predicate => `#[cfg_attr(${predicate}, ignore = "original source platform gate")]`),
    gates: markers,
  };
}
