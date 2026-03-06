#!/usr/bin/env bun
/**
 * scripts/version-sync.ts
 *
 * Reads the version from the root package.json (single source of truth)
 * and syncs it to:
 *   - All workspace package.json files
 *   - packages/shared/src/constants/index.ts  (the VERSION export)
 *
 * Usage:  bun scripts/version-sync.ts
 * Called automatically by `bun run release`.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version: string = rootPkg.version;

console.log(`Syncing version → ${version}`);

// ── 1. Sync workspace package.json files ─────────────────────────────
const workspaceDirs = ["packages", "apps", "extensions", "skills"];
let synced = 0;

for (const wsDir of workspaceDirs) {
  const dir = join(ROOT, wsDir);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    const pkgPath = join(dir, name, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (pkg.version === version) continue;
    pkg.version = version;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    synced++;
    console.log(`  ✓ ${wsDir}/${name}/package.json`);
  }
}

// ── 2. Sync shared constants VERSION ─────────────────────────────────
const constantsPath = join(ROOT, "packages/shared/src/constants/index.ts");
if (existsSync(constantsPath)) {
  let src = readFileSync(constantsPath, "utf-8");
  const replaced = src.replace(
    /export const VERSION\s*=\s*"[^"]*"/,
    `export const VERSION = "${version}"`,
  );
  if (replaced !== src) {
    writeFileSync(constantsPath, replaced);
    synced++;
    console.log("  ✓ packages/shared/src/constants/index.ts");
  }
}

console.log(`Done — ${synced} file(s) updated.`);
