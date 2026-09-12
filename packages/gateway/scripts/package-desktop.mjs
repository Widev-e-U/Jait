/** Stage the installed, lockfile-resolved production dependency graph on the target OS.
 * Run with Node after building shared, screen-share, gateway, and web.
 * No symlinks or dependency installation are required on the user's computer.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = join(root, 'apps/desktop-tauri/src-tauri/gateway');
if (process.release.name !== 'node' || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Package with Node 22 or newer on the target OS');
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'runtime'), { recursive: true });
const runtime = join(output, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
cpSync(process.execPath, runtime);
chmodSync(runtime, 0o755);
const rootModules = join(output, 'node_modules');
const hoisted = new Map();
let count = 0;
function dependencyPath(from, name) {
  for (let base = from; ; base = dirname(base)) {
    const path = join(base, 'node_modules', name);
    if (existsSync(join(path, 'package.json'))) return realpathSync(path);
    if (dirname(base) === base) return null;
  }
}
function install(source, parentModules, ancestors = new Map()) {
  const src = realpathSync(source);
  const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
  if (ancestors.get(pkg.name) === src) return;
  if (!ancestors.has(pkg.name) && hoisted.get(pkg.name) === src) return;
  const modules = !hoisted.has(pkg.name) ? rootModules : parentModules;
  const dest = join(modules, pkg.name);
  if (modules === rootModules) hoisted.set(pkg.name, src);
  mkdirSync(dest, { recursive: true });
  const workspace = src.startsWith(join(root, 'packages'));
  const entries = workspace ? ['package.json', ...(pkg.files ?? ['dist'])] : readdirSync(src).filter(n => n !== 'node_modules' && n !== '.git');
  for (const entry of entries) {
    if (existsSync(join(src, entry))) cpSync(join(src, entry), join(dest, entry), { recursive: true, dereference: true });
  }
  if (workspace && !existsSync(join(dest, 'dist/index.js'))) throw new Error(`Build ${pkg.name} before packaging`);
  const chain = new Map(ancestors).set(pkg.name, src);
  const dependencies = { ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(dependencies)) {
    const dep = dependencyPath(src, name);
    if (!dep) {
      if (name in (pkg.optionalDependencies ?? {}) || pkg.peerDependenciesMeta?.[name]?.optional) continue;
      throw new Error(`Missing dependency ${pkg.name} -> ${name}`);
    }
    install(dep, join(dest, 'node_modules'), chain);
  }
  count++;
}
install(join(root, 'packages/gateway'), rootModules);
writeFileSync(join(output, 'manifest.json'), JSON.stringify({
  platform: process.platform, arch: process.arch, node: process.versions.node,
  gateway: JSON.parse(readFileSync(join(root, 'packages/gateway/package.json'))).version,
}, null, 2));
console.log(`Packaged ${count} production packages and Node ${process.versions.node} for ${process.platform}-${process.arch}`);
