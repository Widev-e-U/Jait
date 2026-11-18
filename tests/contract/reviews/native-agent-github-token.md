# Native GitHub token, repository and environment candidate

This is a partial review of packages/gateway/src/services/agent-github-apps.ts.
The component remains uncredited. The canonical native implementation is
packages/gateway-rust/src/services/agent_github_apps.rs. No duplicate service is
introduced, and the shared GithubPort remains the HTTP/tool boundary.

Installation token, connection-test and execution-environment clients now use
the shared bounded DatabaseWorker for preparation and completion. Each outbound
request runs after the DB job releases its SQLite connection. Connection tests
mint or reuse a token before listing a five-repository page. The post-mint
connection revision is captured in the completion DB job and checked before a
second request or an execution environment can combine the token with identity
metadata. Futures are exercised through tokio::spawn; unrelated database and
owner work progresses during both requests.

Actual-TypeScript comparisons cover expiry parsing/fallback, the exact
one-minute skew boundary, owner-scoped reuse, attach/disconnect eviction,
manual-save cache behavior, revoked/missing prerequisites, upstream error
classification, repository summary and agent bot environment. Tests found and
repaired a native bug that serialized expiry as a Rust Result object instead of
an ISO timestamp. Transient repository failures retain a retryable cached token,
as the reference does. Native rejected-credential failures evict it; both
implementations reject revoked connections before reading a cached token.

Manual key updates in TypeScript do NOT evict an already minted token. The
native candidate preserves that behavior until attach/disconnect/expiry.
An initial native client assertion wrongly required eviction after a key update
during the repository phase; that expectation was corrected against the actual
TypeScript service. A stale FIRST mint still cannot fill the cache after a key
update. The initial test harness also prohibited the valid second repository
request after an unrelated owner's update; that assertion was corrected.
A broad test-source replacement temporarily broke a verification test's
compilation, then was narrowed back to the new token test.

Explicit compatibility decisions and native client evidence:

- Stale success and failure cannot overwrite newer disconnect, setup or key
  state. No implicit retry occurs. This extends the existing exchange/verification
  compatibility decision. Direct clients cover token/env and both connection-test
  waits, with success/failure, same-owner mutation and unrelated-owner progress.
- Cache identity uses a (user, agent) pair rather than a concatenated key.
  cache_identity_pairs_do_not_alias_on_separator proves independent tokens for
  u::x/a and u/x::a. This intentionally prevents the reference's key aliasing.
- Native cache entries additionally bind App and installation ids. Direct,
  out-of-band secret changes and canonical operation ownership still need
  integration review; this batch does not claim cross-process cache coherence.
- Cancelled pending effects are dropped without a completion write. A token
  already committed before a cancelled repository read remains committed.
  Shared-worker queued/started cancellation limits remain unchanged.
- Fifteen-second deadlines and a 1 MiB response postcondition remain enforced
  by the existing request path; tests exercise token and repository timeout/drop.
  The host still owns streaming byte limits, destination/proxy policy, redirects,
  physical I/O cancellation and secret-safe diagnostic presentation.

Snapshot equality still cannot detect identical-state ABA. Same-connection
operations are not yet owned/serialized across the canonical HTTP/tool/env
composition. Malformed upstream schemas and runtime diagnostics retain earlier
review limits. No live GitHub request, ambient credential lookup or network
authorization expansion was introduced. Test tokens and RSA keys are synthetic.

Final validation is recorded in
.jait/artifacts/gateway-rust/agent-github-token/partial-result.json and its frozen
source manifest. Component credit requires remaining canonical service-port and
operation-ownership integration, reviewed complete behavior, and a current full
frozen native gate. Production remains TypeScript; supported-platform,
load/soak, recovery/rollback and activation gates remain open.
