# Native GitHub service port candidate

Partial integration review of packages/gateway/src/services/agent-github-apps.ts.
The component remains uncredited. NativeGithubPort composes the existing
AgentGithubAppService, its cache, DatabaseWorker and explicit GithubEffect. HTTP,
tools and environment clients obtain closures from the same adapter instance;
no parallel credential service, ambient client, key discovery or production
mount is introduced. Construct one adapter per database/runtime. Direct callers
of the service and out-of-band SQL/secret edits remain outside its ownership.

GithubHost requires explicit lifecycle and authenticated current-agent callbacks
and the bounded outbound effect. Initialize invokes the real supplied lifecycle
callback, propagates errors and does not claim readiness itself. The host remains
responsible for idempotent initialization, identity authorization, destination,
proxy/redirect policy, streaming byte limits, physical I/O cancellation and
secret-safe diagnostics. Entry adapters retain authentication/consent/ownership.
The existing 15-second request deadline and 1 MiB response postcondition remain.
Lifecycle/identity callbacks and SQL jobs need host deadlines and shutdown policy;
close rejects new admissions and does not itself cancel/drain active operations.

A small process-local owner registry and a nonwaiting Tokio semaphore bound
active operations. Ownership is keyed by the full (user,agent) pair, is shared
across port closures, and spans each service operation's network waits and SQL
completion. Unrelated owners can progress during those waits. Global admission
also applies to unowned metadata/lifecycle operations. Idle owners are removed
on drop; no idle-owner registry or waiter queue accumulates.

Compatibility decision: a conflicting same-owner operation is rejected with
"GitHub agent operation is busy"; global overload/closed admission is rejected
with "GitHub operation capacity unavailable". Neither rejection performs SQL,
network work or an implicit retry. Existing adapters present HostError through
their error paths (HTTP maps service errors to 500). This deliberately replaces
reference-service races with bounded rejection; it does not promise a fair
waiting queue. Native client contracts exercise exclusion, capacity, same agent
id across users, independent SQL progress, dropped effect futures, owner reuse,
no cancelled-effect completion write and admission close.

DatabaseWorker::with_job_guard shares the existing worker/thread/mailbox and
retains admission through every queued/started SQL job after caller cancellation.
Cancelled queued jobs retain the lease until popped and skipped. Started jobs
may finish and commit, as the existing worker contract permits; ownership stays
held until then. Nested guards retain their predecessors. This closes the
otherwise premature-admission-release race without detached completion tasks.
Contracts include an actual cancelled queued port operation and a barrier-driven
started SQL commit with nested guard lifetimes.

Actual TypeScript reference composition uses unmodified Fastify routes,
createAgentGithubTool/createAgentGithubTokenTool and AgentGithubAppService with
real SQLite/encrypted secrets. Only GitHub fetch responses and host identity are
fixture capabilities. Native composition uses loopback HTTP, native tools, the
canonical port/service/worker and the native encrypted store. Comparisons include
unauthenticated/foreign-owner HTTP rejection, manual save, installation attach,
token/repository requests, environment/token cache reuse, GET/disconnect,
lifecycle error propagation and missing/null/empty/explicit bot metadata. Outbound
owner, deadline, byte limit and redirect flags are asserted at the host boundary.
No real GitHub request or live credential is used. Test-harness compilation first
failed on the fixture filename and argument order; both were corrected before
passing comparisons.

Evidence is .jait/artifacts/gateway-rust/agent-github-port/partial-result.json.
Counts and controls must be read from that result, not inferred from this review.
The preceding token slice's executable hashes matched before this implementation;
its README/migration metadata drift is recorded in initial-drift.json.

Still required before component credit:

- Complete schema/runtime success-payload review. In particular, the reference
  does not coerce token or repository full_name values, omits absent total_count,
  and can throw on nonarray repositories or null repository entries. The current
  native fallbacks differ on malformed success data. Missing fields, UTF-16 token
  prefixes and serialized exceptions need actual-composition contracts and an
  explicit, security-preserving compatibility decision.
- Callback and webhook actual-service composition, including invalid/repeated
  query values, signed state, signature/owner/secret lookup ordering and races.
  Owner leases span individual port operations; multi-operation route sequences
  are not atomic and must be reviewed at each effect boundary.
- Changed-App cache binding versus reference manual-save cache preservation.
  Direct key edits, identical-state ABA, cross-process operation/cache coherence,
  cache residency bounds and host shutdown/deadline behavior remain open.
- Current full frozen native gate and reviewed complete service behavior. This
  focused slice awards no source-component credit. Platform/capacity/load/soak,
  recovery/rollback and activation gates remain open; production is TypeScript.
