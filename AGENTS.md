# Repository Guidelines

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
- `cd tests/e2e && npm test`: run Playwright suite.

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

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat: ...`, `fix(gateway): ...`, `chore: ...`.
- Keep commits focused and small; avoid mixing refactors with feature changes.
- PRs should include: concise summary, linked issue (if any), test evidence, and screenshots/GIFs for UI changes.
- Call out config or migration impacts explicitly (env vars, DB schema changes).

## Release & Deployment
The monorepo uses an automated release pipeline driven by a single version bump.
Everything lives in `.github/workflows/release.yml`:

1. Bump `"version"` in `packages/gateway/package.json` (and sub-packages if their code changed) and push to `main`.
2. The `auto-tag` job in `release.yml` detects the version change and creates a `v<version>` git tag.
3. In the same workflow run, downstream jobs execute:
   - npm publish for `@jait/shared`, `@jait/screen-share`, `@jait/web`, `@jait/gateway` (in dependency order, skipping already-published versions).
   - Desktop builds (Windows, macOS, Linux) and Android APK.
   - GitHub Release with all artifacts attached.
4. `.github/workflows/ci.yml` runs lint, typecheck, test, and Docker builds on every push/PR.

The workflow can also be triggered by pushing a `v*` tag directly or via `workflow_dispatch`.

**No manual `git tag` or `npm publish` is needed.** The gateway `package.json` version is the single source of truth for release versions.

To deploy to a server after publish: `npm install -g @jait/gateway@<version>` and restart the service.

## Security & Configuration Tips
- Copy `.env.example` for local setup; never commit secrets.
- Treat high-impact tools (terminal, file writes, OS/service control) as consent-sensitive paths.
- Keep path boundaries and SSRF protections intact when adding new tools or surfaces.

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
