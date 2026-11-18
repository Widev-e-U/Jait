# Partial native GitHub runtime payload review — 2026-10-26

No component credit. The canonical service now validates successful installation
credential responses before cache admission, and repository summaries before
returning a successful connection test. Uses the existing service, worker and
port; no second implementation or production wiring is introduced.

Actual TypeScript AgentGithubAppService executes with SQLite, encrypted fixture
secrets and bounded synthetic fetch responses. Its generic response types are
erased at runtime: it caches missing/null/numeric/object tokens, accepts arbitrary
permission values, omits an absent total_count, preserves arbitrary full_name
values, and throws for some nonarray repositories and null entries. These are
observed through the actual reference driver, not an imitation of the service.

Explicit compatibility decisions:

- Installation tokens must be nonempty strings using the ASCII bearer alphabet
  (letters, digits, -._~+/=). Reject missing/null/other types, whitespace, header
  control characters and Unicode before cache admission or repository requests.
  This deliberately tightens TypeScript; it must never turn arbitrary JSON into
  an outbound Authorization header or an execution credential. Errors are static
  and never include the received credential.
- Optional permissions remain missing/null or a string-valued object; optional
  repository selection remains missing/null or a string. Expiry remains optional
  string/null; wrong-type expiry is rejected before admission. Missing/null and
  unparseable string expiry retain the existing 30-minute fallback. Valid ISO
  expiry behavior and skew tests remain intact. JavaScript Date.parse accepts
  additional non-ISO date forms; their compatibility is still unreviewed and is
  not claimed by this slice.
- Repository count may be absent (and must then be omitted in the result), or a
  nonnegative safe integer (including integral decimal/exponent forms and -0,
  normalized to the same wire number as JavaScript). Present null, wrong types and fractional/negative
  values are rejected. Repositories absent/null means empty; otherwise require
  an array of objects with string full_name. Missing/null/wrong-type names and
  null entries are rejected instead of coerced, silently defaulted or exposed as
  a successful connection. The shared response parser's existing null/invalid
  JSON-to-empty-object behavior is unchanged; empty repository objects yield an
  empty sample with omitted count, matching the reference.
- On malformed repository success, evict the previously minted credential so a
  later environment consumer must remint. This deliberately differs from the
  reference cache retention. There is no implicit retry within the failed test;
  no further credentialed effect occurs in that operation. Previously committed
  connection state and encrypted App keys are not rolled back or replaced.
- Unicode token prefixes are deliberately unreachable after native admission.
  Actual-reference cases cover an astral character crossing the four-code-unit
  boundary and an intact surrogate pair. The driver optionally exposes only
  tokenPrefix as numeric UTF-16 units after the service runs, because serde_json
  cannot decode a lone surrogate. Tests assert the exact reference code units;
  neither service nor outbound request is mocked or rewritten to fix slicing.

Contracts compare full valid results, persisted rows, encrypted fixture secrets
and outbound effects for 24 optional-field/repository combinations. Rejection
matrices exercise 26 credential payloads and 12 repository payloads against the
actual reference and prove remint/cache reuse after recovery. The canonical-port
client independently runs SaveManual -> Attach -> malformed Test -> ResolveEnv
-> malformed repository Test -> ResolveEnv -> cached ResolveEnv through one
service/worker/cache, asserting outbound credentials and effect counts.

Initial harness corrections: null success bodies are normalized to {} by the
shared request parser, so null is not a rejected repository case. Reference
Unicode slicing initially caused Rust driver JSON decoding to fail; observing
UTF-16 units in the fixture now preserves that evidence without lossy decoding. The first full focused run also caught an existing
owner-key isolation fixture generating a colon-containing token from its owner
ID. Only that synthetic token is now base64url encoded; the separator-containing
owner/agent pairs and isolation/cache-count assertions remain unchanged. The
Final code review caught rejection of integral decimal JSON counts; valid
2.0/-0.0 comparisons now protect the normalization. The canonical-port client
initially passed a number to the string-only installation
operation; the fixture now uses the actual port contract.

Frozen validation and isolated deliberate controls are recorded in
.jait/artifacts/gateway-rust/agent-github-payload/partial-result.json. Read the
result for final counts, hashes, controls and drift, not this review's prose.

Still open: actual-service callback/webhook sequences and races; changed-App
cache binding, cache residency bounds, out-of-band secret changes, identical-state
ABA and cross-process limits; host lifecycle deadlines/shutdown; broader expiry
parsing; reviewed complete service behavior and a current full native gate.
The prior port lease/cancelled SQL job-guard requirements remain in force.
Production is TypeScript. Platform, load/soak, recovery/rollback and activation
gates remain open. No activation, publishing, release or agent spawning occurred.
