# Native channel assistant presentation

Reference: `packages/gateway/src/channels/assistant.ts`. All exported constants,
local-time formatting, per-turn context, model fallback and host-zone resolution
are represented natively. The embedded standing instructions and nine activated
tools compare exactly to the actual TypeScript exports; the driver imports the
real source rather than duplicating the formatter or context builder.

The corpus covers every reference canonical timezone plus the pinned timezone
aliases, current and historical seconds, DST transitions, negative timestamps,
extended years through the ECMAScript TimeClip boundary, invalid dates and zones,
fixed-offset syntaxes, empty and omitted model names, Unicode and literal context
fields. Invalid offsets containing non-ASCII text exposed a native byte-slicing
panic; the implementation now rejects non-ASCII offsets before slicing and uses
the reference ISO fallback. Host-zone discovery is an injected resolver; empty,
missing and throwing results fall back to UTC without reading host configuration
in the contract. The pinned timezone database is shared with the scheduler.

Nine focused checks pass, including the four bounded-driver checks. Four native
mutations are detected and restored: wrong host fallback, wrong local hour, wrong
model fallback and removed Unicode offset protection. Logs and the mutation
summary are `.jait/artifacts/gateway-rust/channel-assistant-*.log` and
`channel-assistant-mutations.json`. Full frozen validation controls component
credit; focused tests alone are not a new passing checkpoint.

This implements presentation behavior, not channel connectors, transport, account
configuration or reminders. Concrete platform timezone discovery, connector
activation and production replacement remain separate integration work. Inputs
are typed dates and Unicode scalar strings; JavaScript object coercion and lone
surrogates are outside this presentation adapter's interface.
