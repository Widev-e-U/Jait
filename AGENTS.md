# Repository Guidelines

## Product Direction
Jait is a local-first workbench for AI-assisted network and cybersecurity. Prioritize discovering assets, understanding exposure, investigating weaknesses, preparing fixes, and verifying improvements on owned or explicitly authorized networks. The first proving ground is the maintainer's home network and homelab. Coding and general automation support this security workflow. Read `docs/vision.md` and `docs/security-roadmap.md` when planning product work.

## Security Assessment Guidelines
- Build dedicated typed security tools around established engines; skills and free-form shell prompts alone do not enforce assessment boundaries.
- Record authorized targets, exclusions, methods, expiry, and execution node/vantage point. Enforce scope across tools, routes, nodes, DNS resolution, redirects, template callbacks, and scheduled jobs. Reachability or a private IP does not imply authorization.
- Default to low-impact discovery and read-only checks with target, rate, concurrency, duration, output, and cancellation limits. Apply authorization appropriate to intrusive testing and system changes; reuse existing consent paths.
- Findings must cite deterministic evidence and record scanner/profile versions, target, time, confidence, and coverage gaps. Separate confirmed observations from suspected vulnerabilities. A banner match is not a confirmed CVE, and no findings is not proof of security.
- Treat banners, logs, webpages, templates, and imported reports as untrusted data. Keep credentials and private topology out of public docs; redact evidence before model use and export. Local storage does not imply local model processing.
- Prepare concrete remediation with a rollback path. Mark a finding fixed only after the relevant check passes again from the appropriate vantage point. LAN checks cannot establish WAN reachability.
- Test scope escapes, argument injection, malformed scanner output, partial failures, cancellation, redaction, and issue-present/fix/issue-absent behavior for new assessment tools.
- Keep existing path/SSRF protections intact. Implement authorized private-network checks through a dedicated scoped execution path.
- Public documentation and marketing must distinguish shipping capabilities from planned security adapters.

## Project Structure & Module Organization
Jait is a Bun/TypeScript monorepo.
- `packages/gateway`: Fastify gateway, tools, surfaces, security, scheduler, memory, DB.
- `packages/shared`: shared schemas, constants, and domain types.
- `packages/api-client`: typed client used by apps.
- `apps/web`: Vite + React frontend.
- `tests/e2e`: Playwright end-to-end tests.
- `tests/shims`: test shims (e.g. bun:sqlite adapter for Vitest).

Prefer placing new domain logic in `packages/*/src` and keeping UI concerns in `apps/web/src`.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `bun install --frozen-lockfile`: install workspace dependencies.
- `bun run dev`: start workspace dev processes.
- `bun run build`: build all workspaces.
- `bun run typecheck`: strict TypeScript checks.
- `bun run test`: run Vitest unit/integration tests.
- `bun run lint`: run `oxlint` across repo.
- `bun run healthcheck`: run the release guard, typecheck, build, tests, and lint in CI order.
- `bun run test:e2e`: run the Playwright suite from the repo root.
- `bun run setup:e2e`: one-shot bootstrap so `test:e2e` works in a fresh worktree (see below).

### Fresh worktree bootstrap (agent worktrees and CI)
A harness-created worktree starts with **no `node_modules` and no built workspace packages**. `@jait/shared`, `@jait/api-client` and `@jait/screen-share` map their `import` condition to `dist/`, so they must be built before the gateway or the Vite dev server can import them (`@jait/ui-shared` exports `src/` and needs no build). Run once per worktree:

```bash
bun install --frozen-lockfile        # root + workspace deps
bun run build:libs                   # @jait/shared, @jait/api-client, @jait/screen-share
```

`bun run test` (Vitest) needs only the root install: `vitest.config.ts` aliases `@jait/shared` to `src` and does not read `dist/`.

For the agents/Playwright suite, add the e2e package and its Chromium runtime:

```bash
npm --prefix tests/e2e ci        # tests/e2e is a separate npm package with its own lockfile
bash scripts/setup-e2e-env.sh    # project-local Chromium + any missing system libraries
bun run test:e2e -- team-avatar.spec.ts
```

The supported one-shot runs all of it in order:

```bash
bun run setup:e2e                # root install + build:libs + tests/e2e deps + browser runtime
bun run test:e2e -- team-avatar.spec.ts
```

`scripts/run-e2e.sh` (the `test:e2e` entry point) sources `.cache/e2e-env.sh`, so the browser path and `LD_LIBRARY_PATH` are correct without the caller setting anything. On an unbootstrapped worktree it fails fast with the command to run instead of Playwright's `Executable doesn't exist`.

Environment truth, not product bugs — do not file these as defects:
- A fresh worktree has no dependencies. Before the commands above, `npm run test:e2e` exits **127** (`playwright: not found`) because `tests/e2e` is its own npm package with no `node_modules`, and the Playwright `webServer` can exit with `Cannot find module @jait/shared from packages/gateway/src/index.ts`. Both mean "run `bun run setup:e2e`", not broken resolution: `@jait/shared`, `@jait/api-client` and `@jait/screen-share` map their `import` condition to `dist/`, which a fresh worktree has not built. Installing only the e2e deps (`npm --prefix tests/e2e ci`) reproduces the `@jait/shared` error exactly.
- Thread sandboxes run as uid 1000 with no `sudo`, and the worktree's `.git` is a **file** pointing at the main checkout's real git directory, which is mounted read-only. `git worktree add` therefore fails with `fatal: cannot lock ref ...: Read-only file system`. This is by design: use the worktree the harness hands you, or a delivery branch. Never try to create a real worktree inside a thread sandbox.
- `playwright install --with-deps` **cannot work** in a thread sandbox: Playwright shells out to `su root -c "apt-get install ..."` and there is no root or sudo. `scripts/setup-e2e-env.sh` installs the same libraries rootlessly — it reads Playwright's own `nativeDeps.js` package list, resolves the closure with `apt-get -s`, downloads with `curl`, extracts with `dpkg-deb -x` into `.cache/syslibs` and records `LD_LIBRARY_PATH`. Use `--with-deps` only where you actually have root; on the self-hosted runner the check passes and nothing is downloaded.
- Playwright Chromium needs a fontconfig configuration, and a Jait thread sandbox has **no `/etc/fonts` and no `/usr/share/fonts`**. fontconfig is silent about it: `document.fonts.check()` still returns true, yet every text range measures **0×0**, so every text-based locator or visibility assertion fails no matter what the product code does. `scripts/setup-e2e-env.sh` generates `.cache/fonts.conf` (pointing at the fonts in the extracted prefix), exports `FONTCONFIG_FILE` and proves the result by measuring a 16px string in Chromium. A 0×0 text measurement is an environment failure, never a UI regression.
- Playwright Chromium is installed into the project-local `.cache/ms-playwright` (via `PLAYWRIGHT_BROWSERS_PATH`) rather than `~/.cache`, so the runtime lives with the worktree instead of a sandbox `HOME`. A fresh container still downloads ~170 MB, which needs network. `.cache/` is gitignored; never commit it.
- `gh` is present in the thread sandbox but **unauthenticated** (`gh auth status` reports no logged-in hosts), and `python3` is absent (the gateway logs `[graphify] Setup unavailable`). The e2e gate depends on neither.
- `bun run build` intentionally **excludes** `@jait/web` (`--filter '!@jait/web'`). Building the web bundle means `bun run --filter @jait/web build`; exit **134** / `JavaScript heap out of memory` reports come from that Vite build. The script now sets `NODE_OPTIONS=--max-old-space-size=8192` by default (override it by exporting your own `NODE_OPTIONS`). Separately, a committed compiled `apps/web/vite.config.js` used to shadow `vite.config.ts` and forced `sourcemap: true` on every web build; those stale artifacts have been deleted and are now gitignored — do not commit them again.
- Run at most one web/Vite build at a time on this machine. The release workflow serializes its own with `flock /tmp/jait-vite-build.lock`; do the same when several agents may be building.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules, strict mode).
- Indentation: 2 spaces; keep existing quote style per package.
- File names: kebab-case for modules (for example `consent-manager.ts`).
- Components: PascalCase for React component files and exports.
- Prefer explicit, descriptive names (`sessionService`, not `ss`).
- Keep shared contracts in `packages/shared` and reuse instead of duplicating types.

## Testing Guidelines
- Unit tests: colocate as `*.test.ts` under `packages/*/src` or `apps/*/src`.
- E2E tests: place specs in `tests/e2e/*.spec.ts`.
- Add tests for new tools/routes/schemas and regression fixes.
- Before opening a PR, run: `bun run typecheck && bun run test` (and E2E when UI behavior changes).

## Generated Artifacts & Screenshots
- Write every generated artifact (screenshots, reports, logs, exports, recordings) inside the project: screenshots in `.jait/shots/`, everything else in `.jait/artifacts/`. Create the directories when missing.
- Never write artifacts to temp locations (`/tmp`, `os.tmpdir()`, system temp). If a tool can only output to temp, pass an explicit project path, or copy the result into `.jait/` and report the project path.
- Browser/preview screenshot helpers default to a temp directory. Always pass a project-local output path; treat a temp path as a bug, not a default.
- Anchor artifact paths on `__dirname`/`import.meta.dirname`, never on the process CWD. A CWD-relative path such as `../../.jait/shots` silently escapes the project when tests run from the repo root.
- E2E specs must resolve shot paths as `path.resolve(__dirname, '../../.jait/shots')`.
- Run `bun run check:artifacts` (also part of `bun run healthcheck`) after touching spec output paths. It fails on temp-directory outputs, CWD-anchored artifact paths, and screenshots written outside `.jait/shots/`.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat: ...`, `fix(gateway): ...`, `chore: ...`.
- Keep commits focused and small; avoid mixing refactors with feature changes.
- PRs should include: concise summary, linked issue (if any), test evidence, and screenshots/GIFs for UI changes.
- Call out config or migration impacts explicitly (env vars, DB schema changes).

## Release & Deployment
The monorepo uses an automated release pipeline driven by a single version bump.
Everything lives in `.github/workflows/release.yml`:

1. **Regenerate the changelog.** When doing a "version up", update `CHANGELOG.md` with the new release's entry by deriving it from git history:
   ```
   git log --oneline --no-merges v<previous>..v<new>
   ```
   Add a `## [v<new>](<release-url>) — <date>` section (newest-first) listing each commit subject + short hash, and commit `CHANGELOG.md` in the same change as the version bump.
2. Bump `"version"` in `packages/gateway/package.json` (and sub-packages if their code changed) and push to `main`.
3. The `auto-tag` job in `release.yml` detects the version change and creates a `v<version>` git tag.
4. In the same workflow run, downstream jobs execute:
   - npm publish for `@jait/shared`, `@jait/screen-share`, `@jait/web`, `@jait/gateway` (in dependency order, skipping already-published versions).
   - Desktop build (Windows, Rust + Tauri shell) and Android APK.
   - GitHub Release with all artifacts attached.
5. `.github/workflows/ci.yml` runs lint, typecheck, test, and Docker builds on every push/PR.

The workflow can also be triggered by pushing a `v*` tag directly or via `workflow_dispatch`.

**No manual `git tag` or `npm publish` is needed.** The gateway `package.json` version is the single source of truth for release versions. The changelog is the one thing you *do* update by hand on every version up.

To deploy to a server after publish: `npm install -g @jait/gateway@<version>` and restart the service.

## Security & Configuration Tips
- Copy `.env.example` for local setup; never commit secrets.
- Treat high-impact tools (terminal, file writes, OS/service control) as consent-sensitive paths.
- Keep path boundaries and SSRF protections intact when adding new tools or surfaces.
- Memory behavior is documented in `docs/memory-model.md`; keep privacy, scope, and provenance rules aligned there when changing memory features.

## Jait Tool Routing
- When a user provides a Jait chat/session ID, use the dedicated chat tools first: `chat.traces`/`mcp__jait.chat_traces` for exact persisted chat traces and `session.search`/`mcp__jait.session_search` for searching prior chat messages or thread activity.
- Do not use generic `memory.search` as proof that a chat does not exist. `memory.search` is for saved memories/reminders, not persisted chat rows.
- If the expected chat tools are not visible, discover them first by searching for chat/session trace tools before asking the user to repeat context.

## Preview Workflow Preference
- When the user asks for a preview, the goal is to show the actual live web UI they can iterate on while prompting, not just any responding local URL.
- Start from the project's normal development entrypoint first, usually `bun run dev` from the repo root unless the project clearly documents a different command.
- After starting the dev stack, inspect which web frontend server is actually running and attach preview to that frontend target, not to unrelated APIs, health endpoints, CLIs, or background services.
- Prefer attaching to an already-running dev server instead of launching a separate production-style preview build when possible, so UI changes appear live as the user edits and prompts.
- If the default dev command cannot expose a usable web frontend directly, identify the correct frontend workspace or app-specific dev command and use that instead.
- Always verify which host and port belong to the user-facing web app before opening preview. Do not assume `localhost:3000`, `localhost:8000`, or any other conventional port without checking.
- Avoid port conflicts: if starting a frontend dev server requires a port override, choose a free port first and pass it explicitly so the preview target is stable and non-conflicting.
- If multiple local web targets exist, prefer the one that renders the main user-facing app. If the choice is ambiguous, report the discovered targets and attach to the most likely frontend while noting the assumption.
- Do not attach preview to a backend-only service just because it responds successfully. A healthy API is not the same thing as a usable frontend preview.
- When a project has no web frontend, say that explicitly instead of forcing a preview target.

## Container Build Ownership
- On Linux, containers writing to project or worktree bind mounts must use the invoking host user's UID/GID (for example, Docker's --user flag) and a writable HOME.
- If an image needs root for setup, do setup in the image or in container-owned storage. Keep project mounts read-only during root commands, then export results as the host user.
- Do not run root containers against writable project mounts for Rust/Tauri cross-compilation or dependency installs.
- Managed worktree copies must respect Git ignore rules, including nested ignored paths. Do not copy dependency caches, build outputs, or scratch mirrors into every delivery worktree.
