#!/usr/bin/env node
// Exercise the package npm users receive, rather than workspace-linked sources.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, validatePackage } from "../packages/gateway/bin/safe-update.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(repository, ".jait/artifacts/release-package");
await mkdir(artifacts, { recursive: true });
const stage = await mkdtemp(join(artifacts, "check-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  const { stdout } = await run(npm, ["pack", process.argv[2] ?? join(repository, "packages/gateway"),
    "--pack-destination", stage, "--json"], { cwd: stage });
  const [{ filename }] = JSON.parse(stdout);
  await run(npm, ["install", "--global", "--prefix", stage, join(stage, filename), "--no-audit", "--no-fund"], { cwd: stage });
  const candidate = join(stage, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@jait/gateway");
  const version = await validatePackage(candidate);
  console.log(`Packed gateway ${version} links successfully with registry dependencies.`);
  await rm(stage, { recursive: true, force: true });
} catch (error) {
  console.error(`Gateway package validation failed. Installation retained at ${stage}`);
  throw error;
}
