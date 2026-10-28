# Native GitHub webhook admission review — partial, uncredited

Date: 2026-10-26. This extends native-agent-github-callback.md. The canonical
service, SQL worker and encrypted fixture secret store are used by both clients.
No component or full-service credit is awarded. Production stays TypeScript.

Compatibility decision: native delivery payloads must be JSON objects. Valid
JSON null, booleans, numbers, strings and arrays return 400 invalid_payload before
owner/secret lookup or the sink. The actual TypeScript route returns 500 for
null and admits the other signed shapes to the sink with a known App owner.
Tests assert these observations separately, rather than normalizing them into
parity. This narrows malformed-input admission without adding callback authority.
Invalid JSON retains 400 invalid_json; valid object deliveries retain existing
App-owner precedence, raw-byte HMAC, secret admission and sink semantics.

Compatibility decision: repeated or comma-coalesced values of target type,
target App ID, signature, event or delivery ID return 400 ambiguous_headers before
lookup or sink. Admission checks run before custom-header normalization and
before the target-type ignore branch. Missing headers retain existing behavior.
Coalesced values are rejected because an upstream hop can erase multiplicity.
The decision covers the five named headers, rather than arbitrary custom headers.

The reference client sends actual physical HTTP requests to a loopback Fastify
listener for repeated/coalesced headers and valid object deliveries. Header
arrays are sent by node:http; the native client uses reqwest header append calls.
Actual reference observations: duplicate target type is ignored (202); duplicate
App ID does not resolve (404); duplicate signature is rejected (401); event and
delivery ID duplicates reach the sink joined with comma-space. Injected headers
join with a different separator; that helper is not the header-wire oracle.
The wire fixture has an absolute five-second deadline and a 1 MiB response cap;
GitHub requests remain deterministic fixtures and never reach the Internet.

Client evidence covers eight non-object shapes; repeated and coalesced values
for all five headers; five valid object forms (including null/scalar/array nested
installation values); exact responses, port calls, outbound effects and sink
records. Valid object requests still compare exactly against the actual service.
Native malformed-input checks explicitly require no owner/secret/sink effects.
The entire existing callback, query admission, signature, owner precedence,
rotation and SQL admission/cancellation suite remains required.

Early failed runs are retained: before.log is a duplicate fixture-helper compile
failure, before-admission.log used an incomplete secret fixture, and
before-corrected.log demonstrates both admission failures with valid credentials.
These are not passing evidence. after.log passes the 24 composition contracts;
first-frozen-baseline.log also records three older HTTP parity expectations
that were then reconciled into separate native/reference assertions with exact
lookup histories (http-reconciled.log passes all 14 HTTP checks). These failures
are preserved, not passing evidence. The frozen/restored suite and isolated
controls are recorded separately in
.jait/artifacts/gateway-rust/agent-github-webhook-admission/partial-result.json.

Remaining: state expiry/one-use nonce/App binding with valid setup and install
clients; compound callback and webhook lookup/secret/sink fencing; sink
cancellation/deadline/shutdown; changed-App cache binding and bounded residency;
direct secret edits/ABA/cross-process; host lifecycle and broader Date.parse;
complete reviewed service and current full frozen native gate. Original/current
counts stay 228/370 plus 5/6 additions (233/376). Platform/load/soak/recovery/
rollback/activation limits remain open. No deployment, release or activation.
