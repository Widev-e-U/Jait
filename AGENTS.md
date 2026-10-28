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

## Rust Gateway Migration
- Before Rust gateway work, read `docs/gateway-rust-migration.md` for gates and `docs/gateway-rust-architecture.md`, especially **Session ownership and concurrency**, for the design and acceptance checks. Runtime commands and checkpoint evidence are in `packages/gateway-rust/README.md`.
- For concurrency/capacity work, read `docs/gateway-rust-capacity.md`: distinguish connected sessions, active provider turns and heavyweight effects; the ambition is thousands of concurrent sessions and eventually more than 10,000 where resources allow, with 500 as an early milestone. Each stage requires measured load/soak evidence and responsive control, fair progress and bounded resources, not increased limits alone.
- Prefer one owner per active session, bounded work across independent sessions, supervised cancellation/cleanup, durable event replay and explicit effect authority. Keep tools sequential unless reviewed independence and resource-conflict rules permit concurrency. Apply the documented direction incrementally; proposed architecture is not implemented parity.
- Audit `packages/gateway-rust/native-coverage.json` and live source drift before choosing a port or reporting progress. Several TypeScript references can share one canonical Rust module; do not duplicate services or award scaffold/refactor credit.
- Preserve observable contracts with differential tests. Record an explicit compatibility decision and client evidence for intentional changes to ordering, overload, disconnect, retries or recovery. Keep native component coverage, reconstructed test coverage and production readiness separate; production remains TypeScript until replacement gates pass.

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
- `bun run build:local`: Linux/systemd production build with a temporary 6 GiB soft / 8 GiB hard memory budget, 6 GiB Node heap, and 10-minute timeout. Prefer this inside Jait terminals; the scope disappears on exit and terminal defaults remain unchanged.
- `bun run typecheck`: strict TypeScript checks.
- `bun run test`: run Vitest unit/integration tests.
- `bun run lint`: run `oxlint` across repo.
- `bun run healthcheck`: run the release guard, typecheck, build, tests, and lint in CI order.
- `node scripts/release.mjs --bump patch`: the supported way to do a version up — bump, regenerate `CHANGELOG.md`, recapture `tests/contract/interfaces.json`, run the release guard, commit, and push so CI tags and publishes. Use `--dry-run` to preview; never bump versions by hand.
- `bun run test:e2e`: run the Playwright suite from the repo root.
- `bun run test:e2e:ui`: run the isolated UI fixture checks with two workers and a frontend only. Keep API-backed tests in the standard single-worker suite; use `--workers=1` to compare timings. The two-worker UI suite and production builds need an explicit, bounded terminal memory budget above the default 1.5 GiB throttle / 2 GiB cap (the measured UI suite peaked at 3.3 GiB). Use a temporary 6 GiB high / 8 GiB max budget for these checks and restore it afterward; raising Node's heap alone does not raise the cgroup limit.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules, strict mode).
- Indentation: 2 spaces; keep existing quote style per package.
- File names: kebab-case for modules (for example `consent-manager.ts`).
- Components: PascalCase for React component files and exports.
- Prefer explicit, descriptive names (`sessionService`, not `ss`).
- Keep shared contracts in `packages/shared` and reuse instead of duplicating types.
- For Jait web UI tooltips, use the shared shadcn/Radix tooltip in `apps/web/src/components/ui/tooltip.tsx`, as used by the chat input. Do not use native `title` hover tooltips or image `alt` text as a tooltip. Preserve accessible names, image alt text, and iframe titles where they serve accessibility.

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

> **Always use `node scripts/release.mjs` for a version up.** When asked to "bump the version", "cut a release", "up version and push", or anything equivalent, supply parameters to that script — do not hand-edit `version` fields, do not hand-write the `CHANGELOG.md` entry, do not compose the release commit yourself. The script performs steps 1–2 below atomically (version bump, changelog regeneration, interface manifest recapture, `release:check`, scoped commit, push) and rolls every file back if any step fails. Preview with `--dry-run`; see *Doing a version up* below for the flag list.

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

**No manual `git tag` or `npm publish` is needed.** The gateway `package.json` version is the single source of truth for release versions.

### Fast local deployment

Use `bun run deploy:local` for a verified local Linux/systemd deployment without
changing public versions or pushing. `--plan` shows the gates; `--prepare` runs
the selected gates and stages without restarting. Build, typecheck, lint and activation health checks are mandatory. Unit, workflow,
browser-tool and Rust migration/contract tests are skipped by default; include them
with `--tests` when requested. Chromium E2E and UI fixture suites are independently
opt-in with `--e2e`. Unit, workflow, browser-tool and full Rust checks are mandatory
prerequisites of `node scripts/release.mjs` before version edits, commit and push. Build a frozen snapshot, preserve the running service arguments,
and use the independent activation controller with health rollback. See
`docs/local-deployment.md` for evidence, limits and rollback. Public releases
continue to use `node scripts/release.mjs`; local deployment never replaces it.

### Doing a version up

Use `scripts/release.mjs` instead of running steps 1–2 by hand. It bumps the gateway (and any `--also` sub-packages), regenerates `CHANGELOG.md` from git history, recaptures `tests/contract/interfaces.json` so the contract drift gate stays green, runs `release:check`, commits only the release files as `chore(release): v<version>`, and pushes to `main` so CI tags and publishes. Because the manifest fingerprints audited sources as well as the bumped `package.json` files, it refuses to run while `packages/gateway/src`, `packages/shared/src`, `packages/gateway/bin`, or `packages/gateway/scripts` carry uncommitted edits — commit or stash those first so the manifest records released source. `--allow-dirty` does not relax this check.

```bash
node scripts/release.mjs --bump patch --dry-run        # preview, changes nothing
node scripts/release.mjs --bump patch                  # bump, changelog, commit, push
node scripts/release.mjs --bump minor --also shared,web
node scripts/release.mjs --set 0.1.960 --notes "Prose paragraph for the changelog."
```

Flags: `--bump patch|minor|major`, `--set <version>`, `--also <list>`, `--notes <text>`, `--message <text>`, `--date <date>`, `--remote`, `--branch`, `--no-push`, `--dry-run`, `--allow-dirty`, `--skip-checks`, `--self-test`. It never force-pushes, refuses to run on the wrong branch or on an already-tagged version, and restores every touched file if anything fails partway.

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
