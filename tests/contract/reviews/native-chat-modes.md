# Native chat-mode policy and plan contracts

Reference: `packages/gateway/src/tools/chat-modes.ts`.
Native: `packages/gateway-rust/src/tools/chat_modes.rs` and immutable
`chat-modes-assets.json`. Extraction script: `tooling/extract-chat-mode-assets.mjs`.
Only migration-time data extraction uses Bun. Native mode validation, tool-policy
access, roster formatting, prompt selection and plan types use Rust alone.

All 4 modes, 30 Ask tools, 37 mutating tools, 29 coordinator tools, 5 built-in team
rosters, and every prompt are compared in full to the real source exports.
Unknown/missing/non-string modes retain the original Agent prompt fallback while
strict validation accepts only the four exact strings. Custom, empty and Unicode
rosters preserve ordering and separators without normalization.

The source TypeScript compiler resolves Plan, PlannedAction, result and status-union
fields. Rust serializes the matching names/status variants, keeps optional values
omitted, preserves explicit null result data, and rejects invalid plan statuses.
Arguments/result data are JSON values, reflecting the gateway's transport boundary;
non-JSON JavaScript identities, functions and undefined values are out of scope.

Eight focused tests include four shared driver checks. Four reversible mutations
(strict mode validation, fallback mode, roster delimiter, null-data retention) each
failed their intended assertion and restored sources passed. Evidence is under
`.jait/artifacts/gateway-rust/chat-mode-mutations/`.

This module exports policy data; the unported agent loop must still enforce those
policies. It does not create teams, run agents, execute plans, activate production
routes or earn any agent-loop/plan-service implementation credit.
