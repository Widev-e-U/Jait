#!/usr/bin/env node
/**
 * Version-up + push for the Jait monorepo.
 *
 * Implements the "Release & Deployment" process in AGENTS.md:
 *   1. bump packages/gateway/package.json (the release source of truth)
 *   2. optionally bump sub-packages whose code changed
 *   3. regenerate CHANGELOG.md from git history
 *   4. recapture tests/contract/interfaces.json so the drift gate stays green
 *   5. commit everything as one `chore(release): v<version>` commit
 *   6. push to main, where CI auto-tags v<version> and publishes
 *
 * No manual `git tag` or `npm publish` is needed. Never force-pushes.
 *
 * Usage:
 *   node scripts/release.mjs --bump patch --dry-run
 *   node scripts/release.mjs --bump patch --notes "Fixes avatar rows." --push
 *   node scripts/release.mjs --bump minor --also shared,web
 *   node scripts/release.mjs --set 0.1.960 --bump patch
 *   node scripts/release.mjs --help
 */

import { execFileSync } from 'node:child_process'
import { runReleaseTests } from './release-tests.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// Gateway is the release source of truth; the rest are published when they change.
// Keep this list in sync with scripts/check-release-version-source.js.
const RELEASE_PACKAGES = {
  gateway: 'packages/gateway/package.json',
  shared: 'packages/shared/package.json',
  web: 'apps/web/package.json',
  'screen-share': 'packages/screen-share/package.json',
  mobile: 'apps/mobile/package.json',
}

const CHANGELOG = 'CHANGELOG.md'
const INTERFACES = 'tests/contract/interfaces.json'
const INTERFACE_TOOL = 'tests/contract/tooling/capture-interfaces.mjs'
// Sources whose fingerprints live in INTERFACES. The manifest hashes these files
// as well as the release package.json files, so it goes stale on every version
// bump unless it is recaptured -- which is what failed CI's drift gate.
const AUDITED_SOURCE = [
  'packages/gateway/src',
  'packages/shared/src',
  'packages/gateway/bin',
  'packages/gateway/scripts',
]
const SOURCE_OF_TRUTH = 'gateway'

class ReleaseError extends Error {}
const fail = (message) => {
  throw new ReleaseError(message)
}

// ── arguments ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    bump: 'patch',
    also: [],
    set: null,
    notes: '',
    message: null,
    date: null,
    remote: 'origin',
    branch: 'main',
    push: true,
    dryRun: false,
    allowDirty: false,
    skipChecks: false,
    selfTest: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value`)
      i += 1
      return value
    }

    switch (arg) {
      case '--bump':
        options.bump = next()
        break
      case '--also':
        options.also = next()
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
        break
      case '--set':
        options.set = next()
        break
      case '--notes':
        options.notes = next()
        break
      case '--message':
        options.message = next()
        break
      case '--date':
        options.date = next()
        break
      case '--remote':
        options.remote = next()
        break
      case '--branch':
        options.branch = next()
        break
      case '--push':
        options.push = true
        break
      case '--no-push':
        options.push = false
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--allow-dirty':
        options.allowDirty = true
        break
      case '--skip-checks':
        options.skipChecks = true
        break
      case '--self-test':
        options.selfTest = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        fail(`unknown argument: ${arg}`)
    }
  }

  if (!['patch', 'minor', 'major'].includes(options.bump)) {
    fail(`--bump must be patch, minor, or major (got "${options.bump}")`)
  }
  for (const name of options.also) {
    if (!(name in RELEASE_PACKAGES)) {
      fail(`--also got unknown package "${name}" (known: ${Object.keys(RELEASE_PACKAGES).join(', ')})`)
    }
    if (name === SOURCE_OF_TRUTH) fail(`--also cannot include "${SOURCE_OF_TRUTH}" (always bumped)`)
  }
  return options
}

const HELP = `Version-up + push for the Jait monorepo.

  node scripts/release.mjs [options]

Parameters
  --bump <kind>     patch | minor | major for the gateway (default: patch)
  --also <list>     Comma-separated sub-packages to bump too:
                    shared, web, screen-share, mobile
  --set <version>   Exact version for the gateway instead of --bump
  --notes <text>    Prose paragraph for the changelog entry
  --message <text>  Override the commit subject
                    (default: chore(release): v<version>)
  --date <date>     Changelog date (default: today, YYYY-MM-DD)
  --remote <name>   Git remote (default: origin)
  --branch <name>   Target branch (default: main)
  --push            Push after committing (default)
  --no-push         Commit locally only
  --dry-run         Print the plan, change nothing
  --allow-dirty     Do not require a clean working tree
  --skip-checks     Skip scripts/check-release-version-source.js
  --self-test       Verify version maths offline and exit
  -h, --help        This text

What it does (per AGENTS.md "Release & Deployment")
  1. bumps packages/gateway/package.json, the release source of truth
  2. bumps any --also packages, never letting one outrun the gateway
  3. regenerates CHANGELOG.md from git log <previous tag>..HEAD
  4. recaptures tests/contract/interfaces.json for the bumped versions
  5. commits only those files as chore(release): v<version>
  6. pushes to main, where CI auto-tags v<version> and publishes

Examples
  node scripts/release.mjs --bump patch --dry-run
  node scripts/release.mjs --bump patch --notes "Fixes messenger avatar rows."
  node scripts/release.mjs --bump minor --also shared,web --no-push
`

// ── semver ───────────────────────────────────────────────────────────────────

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/

export function parseSemver(version, label = 'version') {
  const match = SEMVER.exec(version)
  if (!match) fail(`${label} is not semver: ${version}`)
  return match.slice(1, 4).map(Number)
}

export function bumpSemver(version, kind) {
  const [major, minor, patch] = parseSemver(version)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  fail(`unknown bump kind: ${kind}`)
}

export function compareVersions(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

// ── git helpers ─────────────────────────────────────────────────────────────

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch (error) {
    if (allowFailure) return null
    const detail = error.stderr?.toString().trim() || error.message
    fail(`git ${args.join(' ')} failed: ${detail}`)
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Rewrites only the version string so the file keeps its existing formatting. */
function writeVersion(path, version) {
  const raw = readFileSync(path, 'utf8')
  const pattern = /("version"\s*:\s*)"[^"]*"/
  if (!pattern.test(raw)) fail(`${path} has no "version" field`)
  const updated = raw.replace(pattern, `$1"${version}"`)
  writeFileSync(path, updated)
}

function currentVersion(name) {
  return readJson(RELEASE_PACKAGES[name]).version
}

function previousTag() {
  return git(['describe', '--tags', '--abbrev=0', '--match', 'v*'], { allowFailure: true })
}

// ── changelog ───────────────────────────────────────────────────────────────

export function changelogBullets(logOutput) {
  return logOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('- chore(release):'))
}

export function buildChangelogSection({ version, date, bullets, notes }) {
  const url = `https://github.com/Widev-e-U/Jait/releases/tag/v${version}`
  const lines = [`## [v${version}](${url}) — ${date}`, '']
  if (bullets.length === 0) {
    lines.push('- (no code changes since the previous release)')
  } else {
    lines.push(...bullets)
  }
  if (notes.trim()) lines.push('', notes.trim())
  return lines
}

function insertChangelogEntry(sectionLines, version) {
  if (!existsSync(CHANGELOG)) {
    const header = [
      '# Changelog',
      '',
      'This changelog is generated from git history. Each "version up" must regenerate',
      'it (see the Release & Deployment section in `AGENTS.md`). Entries are listed',
      'newest-first; each release links back to the commits that shipped in it.',
      '',
    ]
    writeFileSync(CHANGELOG, [...header, ...sectionLines, ''].join('\n'))
    return
  }

  const raw = readFileSync(CHANGELOG, 'utf8')
  if (raw.includes(`releases/tag/v${version})`)) {
    fail(`CHANGELOG.md already has an entry for v${version}`)
  }

  const lines = raw.split('\n')
  const firstEntry = lines.findIndex((line) => line.startsWith('## ['))
  if (firstEntry === -1) {
    const trimmed = raw.replace(/\s*$/, '')
    writeFileSync(CHANGELOG, `${trimmed}\n\n${sectionLines.join('\n')}\n`)
    return
  }

  const before = lines.slice(0, firstEntry)
  const after = lines.slice(firstEntry)
  writeFileSync(CHANGELOG, [...before, ...sectionLines, '', ...after].join('\n'))
}

// ── self-test ───────────────────────────────────────────────────────────────

async function selfTest() {
  const cases = [
    ['0.1.957', 'patch', '0.1.958'],
    ['0.1.957', 'minor', '0.2.0'],
    ['0.1.957', 'major', '1.0.0'],
    ['1.9.9', 'patch', '1.9.10'],
  ]
  let failures = 0
  for (const [from, kind, expected] of cases) {
    const actual = bumpSemver(from, kind)
    if (actual !== expected) {
      console.error(`FAIL bump ${from} ${kind}: expected ${expected}, got ${actual}`)
      failures += 1
    }
  }
  const ordering = [
    ['0.1.957', '0.1.958', -1],
    ['0.2.0', '0.1.999', 1],
    ['0.1.9', '0.1.9', 0],
  ]
  for (const [left, right, expected] of ordering) {
    const sign = Math.sign(compareVersions(left, right))
    if (sign !== expected) {
      console.error(`FAIL compare ${left} vs ${right}: expected ${expected}, got ${sign}`)
      failures += 1
    }
  }
  const bullets = changelogBullets('- fix(a): one — abc123\n- chore(release): v0.1.1 — def456\n- feat(b): two — 789abc')
  if (bullets.length !== 2) {
    console.error(`FAIL changelogBullets: expected 2 entries, got ${bullets.length}`)
    failures += 1
  }
  if (failures > 0) {
    console.error(`self-test failed (${failures})`)
    process.exit(1)
  }
  console.log('self-test passed')
}

// ── main ────────────────────────────────────────────────────────────────────

function plan(options) {
  const from = currentVersion(SOURCE_OF_TRUTH)
  const target = options.set ?? bumpSemver(from, options.bump)

  if (compareVersions(target, from) <= 0) {
    fail(`target ${target} is not greater than current gateway version ${from}`)
  }

  const changes = [{ name: SOURCE_OF_TRUTH, from, to: target }]
  for (const name of options.also) {
    const current = currentVersion(name)
    const next = options.set ? current : bumpSemver(current, options.bump)
    if (compareVersions(next, current) <= 0) {
      fail(`${name} would not advance (${current} -> ${next}); use --set or drop --also`)
    }
    if (compareVersions(next, target) > 0) {
      fail(
        `${name} would reach ${next}, ahead of the gateway ${target}. ` +
          'check-release-version-source.js rejects packages ahead of the gateway; ' +
          'bump the gateway further or drop --also.',
      )
    }
    changes.push({ name, from: current, to: next })
  }
  return { target, changes }
}

function renderPlan({ target, changes }, options) {
  const lines = [`Release plan — gateway ${changes[0].from} -> ${target}`, '']
  lines.push('Version changes:')
  for (const change of changes) {
    const suffix = change.name === SOURCE_OF_TRUTH ? ' (source of truth)' : ''
    lines.push(`  ${change.name.padEnd(13)} ${change.from} -> ${change.to}${suffix}`)
  }
  lines.push('', `Changelog:   ${CHANGELOG} entry for v${target}`)
  lines.push(`Interfaces:  ${INTERFACES} recaptured for v${target}`)
  lines.push(`Commit:      chore(release): v${target}`)
  lines.push(
    options.push
      ? `Push:        ${options.remote} ${options.branch}`
      : 'Push:        skipped (--no-push)',
  )
  return lines.join('\n')
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    process.stdout.write(HELP)
    return
  }
  if (options.selfTest) {
    selfTest()
    return
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== options.branch) {
    fail(`on branch "${branch}" but releasing to "${options.branch}"; switch branches first`)
  }

  if (!options.allowDirty) {
    const dirty = git(['status', '--porcelain'])
    if (dirty) {
      fail(
        'working tree has uncommitted changes.\n' +
          'Commit your work first so the release commit stays reviewable, ' +
          'or pass --allow-dirty to commit only the release files.',
      )
    }
  }

  const release = plan(options)

  if (git(['rev-parse', '--verify', '--quiet', `refs/tags/v${release.target}`], { allowFailure: true })) {
    fail(`tag v${release.target} already exists`)
  }

  console.log(renderPlan(release, options))

  if (options.dryRun) {
    console.log('\nDry run — nothing was written, committed, or pushed.')
    return
  }

  const paths = [
    ...release.changes.map((change) => RELEASE_PACKAGES[change.name]),
    CHANGELOG,
    INTERFACES,
  ]

  // The manifest fingerprints every audited file, including the package.json
  // files bumped below, so a version bump without a recapture fails CI's
  // `capture-interfaces.mjs --check`. Recapture must read released source: if
  // audited files still carry uncommitted edits those edits would be baked into
  // the manifest, widening the drift gate instead of being caught by it. Bail
  // out before writing anything rather than restore a half-applied bump.
  const dirtySource = git(['status', '--porcelain', '--', ...AUDITED_SOURCE])
  if (dirtySource) {
    fail(
      'uncommitted changes in audited source; commit or stash them so ' +
        `${INTERFACES} records released source (--allow-dirty does not apply here):\n` +
        dirtySource,
    )
  }

  // Required before changing versions or creating a release commit, including --skip-checks.
  runReleaseTests()

  // Any failure between here and the commit restores every touched file, so a
  // failed release never leaves a half-applied version bump behind.
  const originals = new Map()
  for (const path of paths) {
    originals.set(path, existsSync(path) ? readFileSync(path, 'utf8') : null)
  }

  try {
    for (const change of release.changes) {
      writeVersion(RELEASE_PACKAGES[change.name], change.to)
    }

    // Regenerate the changelog from history since the previous tag.
    const previous = previousTag()
    const range = previous ? `${previous}..HEAD` : 'HEAD'
    const log = git(['log', '--no-merges', '--pretty=- %s — %h', range])
    const date = options.date ?? new Date().toISOString().slice(0, 10)
    const section = buildChangelogSection({
      version: release.target,
      date,
      bullets: changelogBullets(log),
      notes: options.notes,
    })
    insertChangelogEntry(section, release.target)
    console.log(`\nWrote ${CHANGELOG} (${previous ? `since ${previous}` : 'full history'}).`)

    // Keep the contract drift gate honest: the bumped package.json files are
    // fingerprinted by the manifest, so recapture it in the same commit.
    if (existsSync(INTERFACE_TOOL)) {
      execFileSync('node', [INTERFACE_TOOL], { stdio: 'inherit' })
      console.log(`Refreshed ${INTERFACES}.`)
    } else {
      console.warn(`warning: ${INTERFACE_TOOL} not found, ${INTERFACES} was not refreshed`)
    }

    if (!options.skipChecks) {
      const checkScript = 'scripts/check-release-version-source.js'
      if (existsSync(checkScript)) {
        console.log('Running release:check …')
        execFileSync('node', [checkScript], { stdio: 'inherit' })
      } else {
        console.warn(`warning: ${checkScript} not found, skipping the version-source check`)
      }
    }

    const message = options.message ?? `chore(release): v${release.target}`
    git(['commit', '--only', '-m', message, '--', ...paths])
    console.log(`Committed ${message}`)
  } catch (error) {
    for (const [path, raw] of originals) {
      if (raw === null) continue
      try {
        writeFileSync(path, raw)
      } catch {
        console.error(`warning: could not restore ${path}`)
      }
    }
    const detail = error instanceof ReleaseError ? error.message : (error.stderr?.toString().trim() || error.message)
    fail(`release aborted, all files restored: ${detail}`)
  }

  if (!options.push) {
    console.log('Skipped push (--no-push). CI only tags and publishes once this lands on main.')
    return
  }

  console.log(`Pushing to ${options.remote} ${options.branch} …`)
  git(['push', options.remote, `HEAD:${options.branch}`])
  console.log(`\nPushed v${release.target}. CI will tag v${release.target} and publish.`)
}

try {
  main()
} catch (error) {
  if (error instanceof ReleaseError) {
    console.error(`release: ${error.message}`)
    process.exit(1)
  }
  throw error
}
