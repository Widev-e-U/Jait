# Native messenger history review — 2026-10-26

This review covers `packages/gateway/src/services/messenger-history.ts` and its
native replacement `packages/gateway-rust/src/services/messenger_history.rs`.

The native module is a complete service implementation, not a wrapper: it owns
recovery-key validation, backup version/public-key agreement, `room_keys/keys`
scoping, Matrix session import/merge, audit reporting, cancellation, the
`Untrusted` trust requirement and single-shot machine close. Megolm decryption
and the Olm machine remain explicit ports (`BackupCrypto`, `HistoryMachine`);
the focused contract supplies recording fakes so every decision made by the
native service is observed through its public API.

`tests/contract/tests/gateway_rust_messenger_history.rs` runs 8 tests and checks:

- restore requests exactly `room_keys/version`, then `room_keys/keys?version=N`;
- downloaded room/session scopes are decrypted in request order and merged into
  one import payload with the original `sender_key` and `session_export`;
- an invalid recovery key fails before any network, machine or crypto call;
- algorithm, public-key and missing-version mismatches stop after the version
  request and wipe the key;
- cancellation is checked between observable steps and before every import;
- malformed sessions stop before import and preserve the partial audit;
- decryption validates the room and always requests `TrustRequirement::Untrusted`,
  including after close and with an invalid room id;
- create imports only non-empty exports, closes the machine on import failure,
  rejects invalid user ids, and close is single-shot while preserving a machine
  close error;
- the native session cap remains 50,000.

Validation: `cargo test --manifest-path tests/contract/Cargo.toml --test
gateway_rust_messenger_history` passed 8/8. The frozen-source gate result for this
batch is recorded under `.jait/artifacts/gateway-rust/agent-messenger-history/`.

Limits: the contract uses deterministic fake ports; it does not establish
cross-process backup server behavior, real Megolm interoperability, host
shutdown/deadlines, or load/soak characteristics. Production remains TypeScript.
