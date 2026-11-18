# GitHub setup journey and state authority review — partial, uncredited

Date: 2026-10-26. Extends native-agent-github-webhook-admission.md and
native-agent-github-callback.md. This batch adds actual-client contracts and an
implementation plan. It changes no native runtime behavior and earns no source
component credit. Unsafe baseline observations below are gaps to fix, not an
approved final callback policy. Production remains TypeScript.

## Observed entrypoints

The browser's connect action calls authenticated POST
`/api/agents/:agentId/github-app/setup`. `beginSetup` persists a fresh signed
`manifestState`. The returned GitHub personal/organization post URL carries that
state; the UI posts both manifest JSON and the hidden state field. The manifest's
redirect_url, callback_urls and setup_url point to the callback without embedded
state. The fixtures use the returned state, not a separately forged HMAC.

A code callback invokes get -> completeSetup -> get, clears stored manifestState
and redirects to the local agents page. It does not redirect to installUrl or
return the converted service's installUrl to the browser. Both that service result
and the UI's Install link use `https://github.com/apps/<slug>/installations/new`
without state. The UI computes its link from connection.appSlug. A request to the
unauthenticated callback with installation_id and no state is rejected; it must
not acquire authority from an App or installation lookup. The authenticated
installation-ID form remains usable and is explicitly tested for missing auth,
wrong owner and successful own-agent attachment. No real GitHub browser redirect
or Internet request was made; the source mapping does not prove what GitHub
would preserve across its browser flow.

A caller retaining the original setup state can make a second installation
callback after conversion, or combine code and installation_id in one callback.
Those valid local service/HTTP paths pass. Consuming state during readState would
break the two-stage path because it parses the same state twice. Parsing is not a
phase transition and must remain separate from authority admission.

## Actual-client evidence

Ten additional composition contracts exercise fresh setup state issued over
physical loopback HTTP in both Fastify and Axum, with actual credential services,
real SQLite and encrypted fixture secrets. Responses, redirect locations,
manifest callback URLs, ordered port calls and outbound requests compare exactly.
Only random signed-state bytes are projected: the fixture verifies the returned
principal, checks that postUrl contains the same token, requires successive tokens
to differ, and records which exact issued token is persisted. That projection is
outside route call logging. Callback requests still send the original token on
the wire. JWT authority and encrypted credentials retain the existing fixtures.
The controlled service clock advances by one day without sleeps.

Observed gaps in both clients:

- A second beginSetup overwrites manifestState but the older issued token still
  converts a code. The newer token can subsequently attach an installation.
- Disconnect deletes the row, yet the issued token can recreate App credentials
  through a later conversion callback.
- Manual App replacement clears manifestState, yet the older token can attach an
  installation under the replacement App identity.
- An issued token still authorizes conversion after a one-day clock advance.
- Failed conversion clears manifestState but an explicit repeat callback can
  retry with the same token. Failed installation can retry without reconversion.
- A callback missing both code and installation_id leaves stored state intact.

The tests record current behavior separately from the proposed security contract.
When implementing the challenge, retain actual reference observations and assert
intentional native rejections/effect histories; do not normalize them into parity.
The prior object/header/query/payload admission and SQL handoff/cancellation
contracts remain required, including 128 immediate same-owner followups.

## Next implementation contract (not implemented)

Use one durable challenge per `(userId, agentId)` with a fresh opaque generation,
nonce digest, issuedAt/expiresAt, phase and credential/App binding. Start with a
15-minute absolute lifetime across the whole challenge; no sliding extension
from parsing, retries or background work. Reject at `now >= expiresAt`, and
reject a clock earlier than issuedAt. Tests must cover both boundaries and
restart with a controlled clock. This duration is a proposed native compatibility
choice, not a claim about GitHub's code expiry or an existing product setting.

Authenticated beginSetup replaces the prior challenge. For a new App, the initial
phase is `awaiting_conversion`; for an already configured App (the current route
skips code conversion), bind an `awaiting_installation` challenge to that App and
credential generation. A random generation prevents same-content ABA. Manual
save, disconnect and a newer begin revoke prior authority, including in-flight
local completion. Persist the challenge outside the public connection projection;
readState verifies syntax/signature/principal only, and cannot reserve or consume.
Legacy signed tokens without a matching durable challenge must fail admission.

Reserve an effect phase atomically in SQLite before dispatch, tied to challenge
generation, operation identity and current credential revision. A process-local
owner lease spans the compound callback; SQLite reservation remains necessary
for cross-process exclusion and restart recovery. Recheck generation and revision
at commit. Never hold a SQLite transaction over a network wait. A stale completion
must not save credentials, attach an installation or recreate a disconnected row.
Revocation cannot undo an already dispatched remote request; distinguish local
commit fencing from remote cancellation and retain host effect authority.

Successful conversion transitions to `awaiting_installation`, binds the resulting
App and credential generation, and keeps authority for the second callback within
the original deadline. Combined callbacks perform the same ordered transitions.
Successful installation transitions to `complete`, retaining only bounded replay
metadata until expiry. An exact completed phase replay returns the recorded
result without another GitHub request; a different code, installation, App or
owner is rejected. Store a digest of the code, not the raw code. Normalized
callback query admission and authenticated ownership checks stay in force.

A definitive failure before dispatch can release a reservation. Timeout, caller
cancellation, shutdown, transport ambiguity or crash after dispatch cannot safely
be treated as no effect. Persist `uncertain`, do not automatically re-exchange a
possibly consumed manifest code, and require explicit authenticated restart or a
reviewed recovery operation. This deliberately narrows current callback retry
behavior and requires client evidence. Installation retries also need explicit
phase/outcome rules; no generic retry loop gains authority from a signed token.

Do not add an unsigned installation fallback. State-bearing install URL issuance
would need an authenticated operation bound to the current App and a browser
client change; it is separate from the existing authenticated installation form.
Do not claim that source-level URL inspection proves an external browser journey.

Before credit: implement reservation and transitions in the canonical service,
compose the whole callback under one owner, then test fresh/expired/replayed/
replaced/disconnected/manual-save and combined/two-stage clients; two simultaneous
callbacks; cancellation before/after dispatch; stale success/failure; crash and
restart; direct credential edits, identical-state ABA and cross-process access.
Run a current full frozen native gate only after the service is reviewed complete.

## Validation and limits

The frozen/restored suite, library checks and isolated controls are recorded in
`.jait/artifacts/gateway-rust/agent-github-setup-journey/partial-result.json`.
Controls cover native/reference nonce reuse, conversion state clearing and
callback installation dispatch. Snapshot sources must be restored before reruns;
no live source is mutated by controls. Evidence has no runtime implementation
credit: original228/370 plus5/6 additions stay233/376;142 originals and one
addition remain. State authority and compound callback/sink fencing are not yet
implemented; sink lifecycle/idempotency, changed-App cache contracts, bounded
cache residency, direct edits/ABA/cross-process, host lifecycle, broader Date.parse,
current full gate, platform/load/soak/recovery/rollback/activation remain open.
No activation, deployment, release, publication or additional agents.
