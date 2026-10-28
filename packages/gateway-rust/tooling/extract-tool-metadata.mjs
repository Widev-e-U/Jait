// Build-time helper: extract a TS tool definition's static metadata as JSON so
// the native crate can embed reviewed data without running JS at runtime.
//
// Usage: bun tooling/extract-tool-metadata.mjs <ts-module> <exportName> <out.json>
//
// The factory is invoked with a universal inert proxy, so create-time code must
// stay side-effect free (that is the contract for tool factories).
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [modulePath, exportName, outPath] = process.argv.slice(2);
if (!modulePath || !exportName || !outPath) {
  console.error('usage: extract-tool-metadata.mjs <ts-module> <exportName> <out.json>');
  process.exit(2);
}

function inert() {
  const target = function () {};
  const proxy = new Proxy(target, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'then') return undefined;
      if (key === 'toString') return () => '';
      return proxy;
    },
    apply() { return proxy; },
    construct() { return proxy; },
    has() { return true; },
  });
  return proxy;
}

const url = pathToFileURL(resolve(modulePath)).href;
const mod = await import(url);
const factory = mod[exportName];
if (typeof factory !== 'function') {
  throw new Error(`${exportName} is not exported by ${modulePath}`);
}
const tool = factory(inert());
if (!tool || typeof tool !== 'object') {
  throw new Error(`${exportName}() did not return a tool definition`);
}
// TS tool definitions carry their metadata inline as own properties; `execute`
// is the only behaviour-bearing field and is dropped.
const metadata = {};
for (const [key, value] of Object.entries(tool)) {
  if (typeof value === 'function') continue;
  metadata[key] = value;
}
if (!metadata.name) {
  throw new Error(`${exportName}() tool definition has no name`);
}
writeFileSync(resolve(outPath), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`wrote ${outPath} (${metadata.name})`);
