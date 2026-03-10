# Repository Guidelines

## Project Structure & Module Organization
Jait is a Bun/TypeScript monorepo.
- `packages/gateway`: Fastify gateway, tools, surfaces, security, scheduler, memory, DB.
- `packages/shared`: shared schemas, constants, and domain types.
- `packages/api-client`: typed client used by apps.
- `apps/web`: Vite + React frontend.
- `e2e`: Playwright end-to-end tests.

Prefer placing new domain logic in `packages/*/src` and keeping UI concerns in `apps/web/src`.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `bun install --frozen-lockfile`: install workspace dependencies.
- `bun run dev`: start workspace dev processes.
- `bun run build`: build all workspaces.
- `bun run typecheck`: strict TypeScript checks.
- `bun run test`: run Vitest unit/integration tests.
- `bun run lint`: run `oxlint` across repo.
- `cd e2e && npm test`: run Playwright suite.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules, strict mode).
- Indentation: 2 spaces; keep existing quote style per package.
- File names: kebab-case for modules (for example `consent-manager.ts`).
- Components: PascalCase for React component files and exports.
- Prefer explicit, descriptive names (`sessionService`, not `ss`).
- Keep shared contracts in `packages/shared` and reuse instead of duplicating types.

## Testing Guidelines
- Unit tests: colocate as `*.test.ts` under `packages/*/src` or `apps/*/src`.
- E2E tests: place specs in `e2e/tests/*.spec.ts`.
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
