# Partial GitHub callback/webhook composition review — 2026-10-26

No component credit. This batch connects the real TypeScript routes to the real
AgentGithubAppService, SQLite and encrypted UserSecretService, and compares them
with the native routes through NativeGithubPort and DatabaseWorker. Outbound
GitHub requests are bounded synthetic effects. No production activation occurs.

The driver observes only outer route-to-service calls. Domain methods execute
unchanged; nested service calls are excluded from the presentation trace. Hooks
perform an actual disconnect or encrypted secret write after a selected operation
returns, in both clients. These are deterministic interleaving observations, not
evidence of cross-process atomicity or a concurrent HTTP load test. Sinks record
the exact accepted owner, payload and delivery metadata before optional failure.

The contracts exercise valid and tampered signed state, missing/empty values,
conversion -> installation -> redirect, replay, repeated query values, disconnect
after Get and after CompleteSetup, and immediate same-owner operation handoff.
Webhook cases cover raw whitespace/UTF-8 signature bytes, invalid signatures,
conflicting App/installation owners, installation fallback, unknown owners,
missing secrets, invalid JSON, target filtering, sink failure, and secret rotation
or deletion between lookups. Complete results, effect headers/URLs, owner events
and route operation order compare where behavior is compatible.

Explicit compatibility observations and limits:

- Signed state contains an identity and nonce; neither service enforces an expiry
  or consumes the nonce. A signed fixture containing an old exp is accepted and
  can attach twice. This records a security limitation; it does not establish
  replay prevention or approve shipping these semantics as complete security.
- Repeated state becomes an array. TypeScript returns a 500 before domain effects;
  native returns the existing invalid_state redirect. Repeated code is coerced
  to x,y in TypeScript and reaches manifest conversion; the native typed port
  rejects it before outbound effects. Repeated installation is likewise rejected
  by the native typed port; the reference fixture reaches its connection check.
  The intentional native admission rules are retained and asserted separately;
  expected reference effects are recorded, not erased or normalized into parity.
- Callback operations remain separate. Disconnect after Get prevents attachment;
  disconnect after conversion leaves no connection and prevents the next effect.
  This is observed reference behavior, not an atomic callback transaction. There
  is no newly introduced route-wide lease, state-to-App binding or replay store.
- App ownership takes precedence over installation ownership. Unknown owner and
  missing secret responses occur before signature checking, matching the source.
  Rotation after owner lookup is seen by secret lookup; deletion there yields
  no_webhook_secret. Rotation after secret lookup permits the already-read secret
  for that delivery and rejects it on the next delivery. This leaves a deliberate
  observation of the lookup -> secret -> sink gap, not a fencing guarantee.
- A sink exception still produces success after a valid signature. Durable sink
  delivery, idempotency, sink deadlines and host shutdown remain open.

The expanded run exposed a native admission handoff bug. A completed SQL job
sent its result before dropping its job guard; the caller could immediately start
another same-owner operation and receive busy. DatabaseWorker now drops the job
guard after SQL/captured work completes and before sending the result. This
preserves cancellation retention through queued/started work and permits ordinary
sequential calls to progress. The canonical-port regression runs 128 immediate
same-owner Get operations with one permit and no retry or delay. Existing queued
cancellation, independent-owner progress and overload contracts remain required.
An isolated control delays guard release until after the wakeup and must fail
this regression; it is never applied to live source.

Validation, frozen/restored source hashes and independent controls are recorded
in .jait/artifacts/gateway-rust/agent-github-callback/partial-result.json. Initial
fixture failures and the admission-race reproduction remain in initial through
fourth logs; those failed runs are not passing evidence. Manual route input does
not accept a webhook secret, so successful webhook fixtures explicitly seed the
real encrypted secret store rather than assuming the route saved an ignored key.

Still open: state expiry/replay/App binding decisions; complete callback and sink
fencing; changed-App cache binding/residency bounds; out-of-band credential edits,
ABA/cross-process behavior; host deadlines/shutdown; broader Date.parse forms;
complete service review and a current full frozen native gate. Component counts
remain 228/370 original targets plus 5/6 additions (233/376 current). Production
remains TypeScript. Platform/load/recovery/rollback/activation gates remain open.
