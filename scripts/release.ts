#!/usr/bin/env bun
/**
 * scripts/release.ts
 *
 * Bump the project version, sync everywhere, and create a git tag.
 *
 * Usage:
 *   bun scripts/release.ts patch          # 0.1.0 → 0.1.1
 *   bun scripts/release.ts minor          # 0.1.0 → 0.2.0
 *   bun scripts/release.ts major          # 0.1.0 → 1.0.0
 *   bun scripts/release.ts 0.3.0          # explicit version
 *   bun scripts/release.ts --dry-run patch
 *
 * What it does:
 *   1. Bumps the root package.json version
 *   2. Runs version-sync.ts to propagate everywhere
 *   3. Stages the changed files
 *   4. Commits as "release: vX.Y.Z"
 *   5. Tags as vX.Y.Z
 *
 * Push manually with:  git push && git push --tags
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const ROOT = join(import.meta.dir, "..");

function bumpSemver(current: string, kind: "major" | "minor" | "patch"): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (kind) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

function isValidSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v);
}

// ── Parse args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filtered = args.filter((a) => a !== "--dry-run");
const input = filtered[0];

if (!input) {
  console.error("Usage: bun scripts/release.ts [--dry-run] <major|minor|patch|X.Y.Z>");
  process.exit(1);
}

// ── Compute next version ──────────────────────────────────────────────
const rootPkgPath = join(ROOT, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
const current: string = rootPkg.version;

let next: string;
if (input === "major" || input === "minor" || input === "patch") {
  next = bumpSemver(current, input);
} else if (isValidSemver(input)) {
  next = input;
} else {
  console.error(`Invalid version or bump type: "${input}"`);
  process.exit(1);
}

console.log(`\n  ${current} → ${next}${dryRun ? "  (dry run)" : ""}\n`);

// ── 1. Update root package.json ──────────────────────────────────────
rootPkg.version = next;
if (!dryRun) {
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
}

// ── 2. Sync to all workspace packages + shared constant ──────────────
if (!dryRun) {
  await $`bun ${join(ROOT, "scripts/version-sync.ts")}`.cwd(ROOT);
}

// ── 3. Git commit + tag ──────────────────────────────────────────────
if (!dryRun) {
  await $`git add -A`.cwd(ROOT);
  await $`git commit -m ${"release: v" + next}`.cwd(ROOT);
  await $`git tag ${"v" + next}`.cwd(ROOT);
  console.log(`\n  Tagged v${next}`);
  console.log("  Push with:  git push && git push --tags\n");
} else {
  console.log("  Dry run — no files written, no git commands run.\n");
}
