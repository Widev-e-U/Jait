# Native encrypted user-secret storage and secret-request routes

`UserSecretService` matches the TypeScript service's AES-256-GCM layout: the key is
`SHA-256("jait:user-secrets:" + secret)`, the nonce is 12 random bytes, and the 16-byte
auth tag is stored separately as base64 — so native and TypeScript ciphertexts decrypt
across implementations. `SecretRoutes` mounts the authenticated request and storage API
with the existing origin, stored-user, and body-parser boundaries.

Focused contracts cover:

- Cross-implementation compatibility: native ciphertext decrypts in TypeScript and
  TypeScript ciphertext decrypts natively (node:crypto is the reference).
- Save/list/get/delete with owner and type filters, updates by `(user_id, type, key)`,
  `last_used_at` marking, and validation errors (`type`/`key`/`label`/`value` trim or
  empty). `list` ordering is exercised with a stepping clock in both implementations.
- Real HTTP request list/submit/cancel with rememberable save, cookie and bearer auth,
  cross-origin denial, missing users, malformed JSON, prototype-pollution rejection,
  empty bodies, unknown secrets, and store-unavailable responses.

Five native and differential tests pass; `encrypt`/`decrypt` are exposed so the
compatibility contract can inspect raw ciphertext. Strict Clippy passes for the library
and the `gateway_rust_secrets` target. The secret-input lifecycle itself was already
credited separately.
