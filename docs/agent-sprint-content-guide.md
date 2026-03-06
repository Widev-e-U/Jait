# Agent Sprint Content Guide

Use this as a lightweight execution checklist per sprint.

## 1) Align Context First

1. Read `docs/vision.md` for product direction.
2. Read `docs/implementation-plan.md` for sprint goals and exit criteria.
3. Read `docs/sprint-baselines.md` for required already-done capabilities.
4. Read `docs/testing.md` for validation commands.

## 2) Reuse Before Building

Check for existing contracts and components before adding new files:

- Shared contracts: `packages/shared/src`
- Gateway logic: `packages/gateway/src`
- API client: `packages/api-client/src`
- Web UI: `apps/web/src`
- E2E patterns: `e2e/tests`

## 3) Deliverables Per Sprint

- Implement only sprint-scoped functionality.
- Add/update tests for changed behavior.
- Keep docs in `docs/` updated with the final behavior.
- Avoid duplicate explanations: link to canonical docs instead.

## 4) Minimal Done Checklist

- Build/type/test commands executed (or documented blockers).
- Security boundaries respected (path limits, SSRF guards, consent-sensitive flows).
- User-visible behavior clearly described in docs.

## 5) Documentation Rule

When information already exists in a canonical file, add a short reference instead of repeating long sections.
