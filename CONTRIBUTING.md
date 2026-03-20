# Contributing

## Setup

```bash
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

## Before Opening a PR

```bash
bun run lint
bun run typecheck
bun run test
```

Run E2E checks for UI-heavy changes:

```bash
cd e2e && npm test
```

## Guidelines

- Keep changes focused and small.
- Follow existing TypeScript and naming conventions.
- Add regression tests for behavior changes and bug fixes.
- Do not commit secrets, local `.env` files, or private infrastructure details.
- Use Conventional Commit style such as `feat: ...` or `fix(gateway): ...`.

## Pull Requests

- Explain the user-facing outcome.
- Call out config, migration, or deployment impacts.
- Include screenshots or GIFs for UI changes when helpful.
