# Native remote CLI provider review

Reference: `packages/gateway/src/providers/remote-cli-provider.ts` (all 443 lines).
Reference SHA-256: `63481b7c603bf1f175a1c49bcaf11fabbfcd96c7d7018398b4aee352d44f4052`.
Native: `packages/gateway-rust/src/providers/remote_cli.rs` (all adapter logic).
Differential driver: `tests/contract/drivers/nativeremoteprovider.ts`.
Contract target: `gateway_rust_remote_provider`.

The native adapter implements the public provider metadata, node/provider availability,
auth status/login/login input/logout, model normalization, session start/stop/interrupt,
approval no-op, event subscription, request forwarding and streamed turn completion.
Optional start options cover every field of the source StartSessionOptions contract,
including model, reasoning effort, environment and MCP configuration. The source's
provider account ID remains distinct from provider type. Remote thread IDs and
attachments are forwarded without model-derived routing substitutions. Auth operations
retain the source's 60/90-second defaults, start/model/login operations use 90 seconds,
stop uses 15 seconds, and a send request carries the separate 1830-second transport
budget while its independent completion watchdog emits at 1800 seconds.

The event path handles runner events, nested JSON provider.line frames, direct events
and raw Codex notifications. Only registered adapter session IDs are admitted; a direct
event with a conflicting embedded string session ID is ignored. Normalized terminal
runner/direct events remove sessions and detach idle subscriptions. Raw Codex mapping
retains the source's distinction: session.completed removes a session, whereas mapped
session.error completes the turn but leaves the session registered. Timeout similarly
emits an error without deleting the session. A completed operation reply does not
produce a duplicate event after a streamed terminal event. Concurrent adapters retain
independent subscriptions and do not cross-deliver or detach one another's sessions.

Boundary: RemoteProviderTransport replaces the existing authenticated WS control plane,
not the provider adapter. Its production implementation must enforce authenticated node
identity, the node agent capability, supplied operation deadlines, cancellation of
abandoned operations, frame/output limits and multiplexed subscriptions preserving
other listeners. The adapter itself owns its sessions, event mapping, completion
watchdog and cleanup guards. This review does not verify a live native WS transport,
remote CLI executable, device login, WAN connectivity or production activation. Those
are separate components and readiness gates; no shell or JS bridge implements this
native adapter.

The TypeScript oracle imports and runs the actual source class. A small peer replaces
only node lookup, proxy operations and incoming WS delivery. Native uses the same
operation/event schedules. Twelve deterministic scenarios compare every intermediate
operation (node, name, parameters, deadline), return value, emitted event, turn outcome,
metadata snapshot and subscription state. Only generated session IDs and timestamps
are normalized. The scenarios cover all public operations, start/request/stop/auth
failures, account versus provider type, options and attachments, sparse/malformed model
lists and reasoning efforts, wrong-session/late/nested events, concurrent turns and
sessions, completion reply/event races, unsubscribe and timeout/retry boundaries.

Native lifecycle checks additionally abort pending start and send futures, assert
transport futures are dropped, remove abandoned starting sessions and subscriptions,
prove timers cannot emit after dropped turns, exercise an independent watchdog while
a proxy operation remains pending, share one peer across two adapters and tolerate
malformed primitive notifications without panicking. The peer intentionally does not
implement a real transport timeout in the pending-operation test: it proves the adapter
watchdog is independent, then aborts the operation and verifies cleanup explicitly.

Deliberate native safety/API differences: typed peer failures use Result<String> rather
than arbitrary JS thrown values; login input is awaited rather than fire-and-forget;
malformed primitive notifications are ignored rather than reproducing JS null-property
exceptions; provider thread IDs must be nonempty strings; nested provider.line parsing
is iterative to avoid recursive stack growth. Returned native session values are
snapshots, not aliases to mutable JS objects. The source approval method remains a
no-op, so this port grants no new remote approval capability.

Focused evidence is in `.jait/artifacts/gateway-rust/`. The timer-fixture investigation
reproduced a missing exact-threshold event with an injected 500-microsecond Tokio timer
origin offset (`remote-provider-offset-probe.log`). Starting the aggregate test clock
paused at runtime creation removes that fixture offset while preserving exact
1799-second plus 1-second checks; no provider runtime change was needed. Final lifecycle
and mutation-restoration results are recorded separately by the focused validation run.

Final focused evidence: `node tests/contract/run.mjs test --test gateway_rust_remote_provider`
passes 12 tests (eight component/lifecycle checks, including the twelve-scenario actual
source differential, plus four internal-driver transport checks). See
`remote-provider-audited-contracts.log`. Two meaningful native mutations were compiled
and rejected by the actual-source comparison: replacing the forwarded remote thread ID
failed scenario 0 at `/1/operations/1/params/providerThreadId`; accepting conflicting
embedded session IDs failed scenario 3 at `/3/events/length`. Both were restored and the
complete focused target passed afterward. `remote-provider-mutations/results.json` and
the two adjacent logs record the assertions and restoration hash. Native source was
restored byte-for-byte to SHA-256
`23b49d1624301d24fb424df260d14c2cb419b0cfa452ae3cbf1d199d0cd890e0`.

Recommendation: the complete adapter engine can enter the source-bound component gate
with this reference hash, native file, contract target, actual-source driver and review.
That recommendation adds no production WS integration or cutover-readiness claim.
