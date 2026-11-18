# Native GitHub credential service — partial candidate

This records the historical storage/setup slice. The current exchange/JWT extension
and its remaining integration/parity limits are reviewed in
`native-agent-github-exchange.md`; the original 38-check evidence remains unchanged.

No component credit. Production remains TypeScript. The native candidate uses the
shared SQLite connection and existing encrypted UserSecretService rather than a
parallel store. Callers must run storage work on the bounded database worker.
The current service is not mounted in the runtime or wired to the GitHub HTTP port.

Implemented slice: owner/agent storage, manual key validation and PEM normalization,
public metadata without manifest state, live encrypted-key availability, tolerant
webhook owner lookup, HMAC manifest-state signing/verification, manifest preparation,
configured URL precedence, webhook-secret lookup, installed-agent enumeration and
disconnect of exactly the owner's key and webhook secret.

Actual TypeScript comparisons use the real migrated SQLite schema and encrypted
secret store on both sides. Storage/setup cases reject unexpected fetch effects. The exchange extension uses
injected fixture responses; these tests cannot contact GitHub. Only random ciphertext and row/secret identifiers
are excluded from comparisons; decrypted values, labels, scope, row metadata and
ciphertext non-disclosure remain checked. Random setup states are cross-validated
separately, then normalized in setup comparisons. Names are compared as UTF-16 code
units, including truncation through a surrogate pair; a separate native wire check
requires the escaped lone surrogate rather than a replacement character.

Public URL configuration and captured JAIT_PUBLIC_URL are explicit host inputs.
Nullish config precedence is resolved before trimming, matching the reference's
explicit-blank suppression of the environment. A configured public URL controls
callbacks even when a request supplies another base. This grants no authority to
an outbound destination. Disconnect removes neither another owner/agent's secrets
nor similarly prefixed keys or other secret types. State decoding intentionally
retains the reference's permissive signed payload truthiness and extra-segment
behavior; untrusted callers must continue through the authenticated HTTP checks.

Pending: manifest exchange/failure state, RS256 App JWT, installation binding,
verification/revocation, installation-token cache and invalidation, repository test,
execution environment, HTTP failure classification, service-port composition and
source-bound full native gate. The installed-agent and disconnect storage slice
has no token-cache parity until minting and cache invalidation are implemented.
No production activation, external writes, release or publication is included.
