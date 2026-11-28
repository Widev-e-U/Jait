// Explicitly reviewed black-box evidence. A source reference is not proof that a
// test passes or exercises every behavior; reviewers must check the test and run it.
// Strip comments and string literals before looking for declarations. Nested block
// comments and raw strings are supported so example code cannot count as a test.
function rustCodeOnly(source) {
  let result = '';
  let i = 0;
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const tail = source.slice(i);
    if (tail.startsWith('//')) {
      const length = tail.indexOf('\n') < 0 ? tail.length : tail.indexOf('\n');
      result += blank(tail.slice(0, length));
      i += length;
    } else if (tail.startsWith('/*')) {
      let j = i + 2, depth = 1;
      while (j < source.length && depth) {
        if (source.startsWith('/*', j)) { depth++; j += 2; }
        else if (source.startsWith('*/', j)) { depth--; j += 2; }
        else j++;
      }
      result += blank(source.slice(i, j));
      i = j;
    } else {
      const raw = tail.match(/^(?:br|r)(#*)"/);
      if (raw) {
        const end = source.indexOf('"' + raw[1], i + raw[0].length);
        const j = end < 0 ? source.length : end + 1 + raw[1].length;
        result += blank(source.slice(i, j));
        i = j;
      } else if (tail[0] === '"') {
        let j = i + 1;
        while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
        j = Math.min(source.length, j + 1);
        result += blank(source.slice(i, j));
        i = j;
      } else {
        result += source[i++];
      }
    }
  }
  return result;
}

function hasEnabledTest(source, name) {
  const declarations = rustCodeOnly(source).matchAll(/^((?:[ \t]*#\[[^\]\n]*\][ \t]*\n)+)[ \t]*(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(/gm);
  for (const match of declarations) {
    if (match[2] === name && /#\[(?:tokio::)?test(?:\([^\]]*\))?\]/.test(match[1]) && !/#\[ignore(?:\s*=|\s*\(|\s*\])/.test(match[1])) return true;
  }
  return false;
}

export function applyBinaryEvidence(http, ws, services, manifest, readTest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.http) || !Array.isArray(manifest.ws) || !Array.isArray(manifest.services)) {
    throw new Error('Invalid binary-test evidence manifest');
  }
  const assign = (items, evidence, keyOf, eligible) => {
    const byKey = new Map(items.map((item) => [keyOf(item), item]));
    const seen = new Set();
    for (const record of evidence) {
      const key = keyOf(record);
      if (!byKey.has(key) || seen.has(key)) throw new Error(`Unknown or duplicate evidence key: ${key}`);
      if (!eligible(byKey.get(key))) throw new Error(`Evidence for non-native entry: ${key}`);
      if (!Array.isArray(record.tests) || record.tests.length === 0) throw new Error(`Missing tests: ${key}`);
      for (const test of record.tests) {
        if (!/^tests\/[\w/-]+\.rs$/.test(test.file ?? '') || !/^[a-zA-Z_][\w]*$/.test(test.name ?? '')) {
          throw new Error(`Invalid test reference: ${key}`);
        }
        const source = readTest(test.file);
        if (!hasEnabledTest(source, test.name)) {
          throw new Error(`Missing or ignored test function ${test.file}::${test.name}`);
        }
      }
      byKey.get(key).binaryTests = record.tests;
      byKey.get(key).status = 'native-tested';
      seen.add(key);
    }
    for (const item of items) item.binaryTests ??= [];
  };
  assign(http, manifest.http, (entry) => `${entry.method} ${entry.path}`, (entry) => entry.status === 'native-untested');
  assign(ws, manifest.ws, (entry) => `${entry.direction} ${entry.type}`, () => true);
  assign(services, manifest.services, (entry) => entry.name, (entry) => entry.status === 'native-untested');
  const total = http.length + ws.length + services.length;
  const tested = [...http, ...ws, ...services].filter((entry) => entry.status === 'native-tested').length;
  return { tested, total, nativeTestedPct: total ? +(100 * tested / total).toFixed(2) : 0 };
}
