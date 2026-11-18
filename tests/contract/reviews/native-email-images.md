# Native remote email images

Reference: `packages/gateway/src/services/email/remote-images.ts`.
Native: `packages/gateway-rust/src/services/email/remote_images.rs`.
Contract: `gateway_rust_email_images` / `drivers/nativeemailimages.ts`.

The real image-loader and public-mail-server exports are exercised with fixture-owned
DNS and HTTPS streams. Native code resolves once, checks every result using the existing
SSRF guard, preserves the first checked address and original TLS name, disables proxy
inheritance/redirects/content decoding, and keeps cookies/authorization out of requests.
Only public HTTPS/443 and the five source MIME types are accepted. Runtime source
`connection.ts` receives no component credit: its discovery/schema work remains unported.

12 focused tests (including four shared transport-protocol checks) cover URL normalization,
IDNA/Unicode, fragments and empty query, header/TLS projection, mixed DNS results, literal
and encoded private addresses, redirects/status/MIME rejection, exact 1 MiB success and
one-byte overflow, request/body errors, 8 s DNS and 6 s absolute request/body deadlines,
caller cancellation, unopened rejected bodies, and fail-closed native transport inputs.
All network calls are injected owned fixtures; no private or public live image is fetched.

The empty-query regression failed with native `/?` versus source `/` and passes after the
fix. Evidence: `.jait/artifacts/gateway-rust/email-images-url-before.txt`.
Five reversible mutations (every-DNS-result validation, MIME/status/size checks, TLS name)
failed their intended comparisons, and restored sources passed. Evidence is under
`.jait/artifacts/gateway-rust/email-images-mutations/`.

Boundaries: DNS/TLS library error wording is engine-specific; actual provider images,
certificate-chain/HTTP2 behavior and non-Linux integration remain replacement-readiness
work. The default native HTTPS client's configuration is reviewed/compiled and its unsafe
inputs are tested; successful HTTPS byte transport is represented by the injected source-
compatible transport in this focused suite. No route or production startup was activated.
