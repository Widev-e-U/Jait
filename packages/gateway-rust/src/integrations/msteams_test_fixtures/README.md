# Teams loopback TLS fixture

These certificates and the public test-only server key are exclusively for
`../msteams_tls_tests.rs`. Never use the key outside tests.

The leaf covers `teams.invalid` and is signed by the dedicated fixture CA.
The PEM files retain their original October 2026–October 2046 validity periods.
The test supplies a local rustls clock fixed at 2030-01-01, so wall-clock changes
cannot make the fixture expire or become not-yet-valid. Standard rustls
verification still checks the chain, signature, validity and requested hostname.
No custom verifier or certificate/hostname acceptance bypass is used.

The single focused test exercises five cases:

- Trusted CA, matching hostname and valid verification time: delivery succeeds.
- Untrusted CA: TLS fails.
- Trusted CA with a different hostname: TLS fails.
- Trusted CA and matching hostname at 2020-01-01: TLS fails (not yet valid).
- Trusted CA and matching hostname at 2050-01-01: TLS fails (expired).

The in-process tokio-rustls server binds loopback port zero and retains that same
listener, preserving the fix for the release-and-rebind race. It bounds each
connection to three seconds and request headers to 16 KiB, counts one HTTP
request and four handshake rejections, and is joined on success or aborted on
failure. It requires neither Python nor OpenSSL executables at test runtime and
uses the gateway's existing dependencies.

The test still calls the outbound client's shared builder and POST implementation,
with the TLS config replaced only to supply the fixture roots and test clock.
It establishes loopback TLS behavior, not Microsoft interoperability, runtime
registration, credential/consent integration or production readiness.
