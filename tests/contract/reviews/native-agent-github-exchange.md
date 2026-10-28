# Native GitHub manifest exchange and App JWT — partial candidate

No component credit. This extends the storage/setup slice in
`native-agent-github-store.md`; the TypeScript gateway remains production.
The credential service is still absent from the canonical GitHub service port.

The native candidate exchanges a manifest code through an explicit `GithubEffect`
capability, encrypts the returned private key and optional webhook secret through
the existing UserSecretService, and persists public registration metadata. It
retains owner/agent isolation, existing installation metadata, and an existing
webhook secret when a later conversion omits one. Client secrets and PEM never
enter the connection row or public response. Failed exchanges persist the error
and clear manifest state while preserving existing credentials. The request uses
encoded code segments, the configured enterprise API base, POST and the reference
GitHub headers, with no authentication header on manifest conversion.

The effect receives owner/agent context, a 15-second deadline, a 1 MiB response
limit and redirects disabled. The service enforces deadline cancellation by
future drop and a response-size postcondition. The host must enforce streaming
limits, destination/redirect/proxy policy, authorization and cancellation of I/O.
There is no ambient network client, retry, detached task or production mount.
These bounded effect rules are a proposed native compatibility choice, tested
locally, and still require integrated client and host evidence before credit.

App JWT signing uses the existing RustCrypto RSA stack and jsonwebtoken signing.
The RSA crate is now a direct dependency at its already-locked version; no package
versions change. PKCS#1 and PKCS#8 PEM are decoded, normalized, converted to the
PKCS#1 DER expected by the existing signer, and signed with RS256. The JWT has the
reference header order and claims: floor(now/1000)-60 for iat, iat+540 for exp,
and the app identifier for iss. No HMAC or unsigned fallback exists.

The focused target executes the actual TypeScript service with real migrated
SQLite and encrypted secrets. Its injected fetch returns fixture responses and
records requests; it cannot contact GitHub. Comparisons include response and row
metadata, error text, secret labels/decrypted values and encrypted non-disclosure.
JWTs match the TypeScript tokens byte-for-byte across both PEM encodings, CRLF,
Unicode issuers and zero/negative timestamps. Node independently verifies the
native signatures with a public key and rejects changed claims. RSA fixtures are
generated test-only keys, unrelated to an account or installation.

Frozen validation passes 49 checks across storage/HTTP/tools, 316 native library
tests, strict native Clippy, both Cargo formatting checks and the artifact guard.
All six isolated native/reference mutations caught accidental client-secret
persistence, failure-state retention and incorrect JWT backdating. The restored
49 checks pass, and frozen/live code fingerprints match. Evidence and log hashes:
`.jait/artifacts/gateway-rust/agent-github-exchange/partial-result.json` and
`mutations.json` in the same directory. Native checks also exercise deadline
cleanup, cancellation without a completion write, oversized responses and invalid
signing keys.

Remaining work includes installation binding, app/installation verification and
revocation, installation-token cache/invalidation, repository testing, execution
environment, reusable structured HTTP failure classification and canonical
service-port composition. The current convenience async conversion method holds
a borrowed SQLite connection across its effect await; it is not a Send-capable
runtime adapter. Composition must separate bounded DB work from outbound waits
and retain sequential owner operations and stale-completion protection. Do not
hold a shared connection mutex across network waits. Malformed successful payload
error presentation and invalid UTF-8 response decoding also need reconciliation
against the TypeScript reference before component credit. No complete HTTP client,
production activation, release, publish or platform-replacement claim is made.
