#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const releasePackages = [
  'packages/gateway/package.json',
  'packages/shared/package.json',
  'apps/web/package.json',
  'packages/screen-share/package.json',
  'apps/desktop/package.json',
  'apps/mobile/package.json',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseSemver(version, path) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) {
    throw new Error(`${path} has a non-semver version: ${version}`);
  }
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

const gatewayVersion = readJson('packages/gateway/package.json').version;
const gatewayParsed = parseSemver(gatewayVersion, 'packages/gateway/package.json');

const failures = [];
for (const path of releasePackages) {
  const version = readJson(path).version;
  const parsed = parseSemver(version, path);
  if (compareVersions(parsed, gatewayParsed) > 0) {
    failures.push(`${path} version ${version} is ahead of gateway ${gatewayVersion}`);
  }
}

const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
if (!releaseWorkflow.includes('GW_VERSION=$(jq -r \'.version\' packages/gateway/package.json)')) {
  failures.push('release.yml no longer reads the tag version from packages/gateway/package.json');
}
if (!releaseWorkflow.includes('source of truth for monorepo release versions')) {
  failures.push('release.yml no longer documents the gateway package as the release source of truth');
}

if (failures.length > 0) {
  console.error('Release version source check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release version source check passed: packages/gateway/package.json ${gatewayVersion}`);
