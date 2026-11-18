# Native cron tool adapter

Reference: `packages/gateway/src/tools/cron-tools.ts`.
Implementation: `packages/gateway-rust/src/tools/cron.rs`.
Acceptance: `gateway_rust_cron` through the actual TypeScript factories, with
only the explicit SchedulerService boundary replaced by a recording fixture.

The 84 differential cases compare complete metadata, returned results or thrown
errors, exact service operation/arguments, and call count. They cover all four
factories, defaults, non-string input, raw input preservation, ECMAScript trim,
first-underscore-only tool names, optional/empty/distinct users, project/session
fallbacks, typed update filtering, explicit null input, nullish versus falsy
update results, removal success/miss, and scheduler exceptions without retries.
Lists cover empty, 1, 24, 25, 26 and 32 jobs, disabled entries, Unicode/newlines,
and long individual names that must remain untruncated. Four deliberate mutations
(alias replacement, owner forwarding, preview budget and nullish fallback) each
fail result/request comparisons; restored cases pass.

Tool metadata and presentation are ported. The host must supply the scheduler
service; this component does not claim SchedulerService execution, persistence,
authorization or cron timing are ported. The input boundary is JSON plus typed
ToolContext fields and SchedulerService results. Fixtures do not execute jobs,
contact networks, or change production state.

Evidence: `.jait/artifacts/gateway-rust/cron/mutations.json`,
`contracts-restored.log`, and source-bound full native gate report. Component
credit is valid only when the complete gate passes and live hashes match.
