# Native GitHub App service acceptance review

Reviewed 2026-10-26. Reference: `packages/gateway/src/services/agent-github-apps.ts`.
This reviews one original source component: 18 public methods and two exported
functions. The canonical service performs persisted owner/agent CRUD, encrypted
credential access, state signing/admission, RS256 JWT generation, manifest
exchange, installation verification, token mint/cache handling, repository
checks and environment preparation. Network effects use the shared authorized
transport/worker port; the implementation does not call TypeScript.

The mapping below binds actual native methods and executable actual-TypeScript
client comparisons. `getAgentGithubAppService` uses explicit shared native host
ownership in `NativeGithubPort`, instead of a second global registry.

| Reference operation | Native functions | Focused contracts |
| --- | --- | --- |
| `configuredBaseUrl` | `configured_base_url` | `configured_public_url_precedence_and_explicit_blank` |
| `publicBaseUrl` | `public_base_url` | `configured_public_url_precedence_and_explicit_blank`, `setup_manifest_names_permissions_and_owner_credentials` |
| `list` | `list` | `owner_agent_isolation_and_encrypted_metadata`, `disconnect_removes_only_owner_agent_credentials_and_is_idempotent` |
| `get` | `get` | `owner_agent_isolation_and_encrypted_metadata`, `public_key_presence_uses_live_encrypted_store` |
| `findByAppId` | `find_owner` | `webhook_app_owner_precedes_installation_fallback_and_rejection_order_is_real` |
| `findByInstallationId` | `find_owner` | `webhook_app_owner_precedes_installation_fallback_and_rejection_order_is_real` |
| `beginSetup` | `begin_setup`, `sign_state` | `setup_manifest_names_permissions_and_owner_credentials`, `setup_serializes_split_utf16_without_replacement` |
| `completeSetup` | `prepare_setup_exchange`, `finish_call`, `complete_setup` | `manifest_exchange_success_encrypts_secrets_and_preserves_owner_isolation`, `manifest_exchange_failure_matrix_persists_error_and_clears_state`, `manifest_code_encoding_and_enterprise_base_are_reference_compatible` |
| `saveManualApp` | `save_manual` | `manual_validation_before_persistence`, `update_preserves_creation_installation_and_omits_manifest_state` |
| `attachInstallation` | `prepare_installation`, `finish_call`, `attach_installation` | `installation_binding_is_signed_scoped_and_preserves_reference_metadata`, `installation_rejection_distinguishes_revoked_from_forbidden_and_network_errors`, `installation_missing_registration_or_key_has_no_network_effect` |
| `verify` | `prepare_verification`, `finish_verification`, `verify` | `verification_refreshes_metadata_without_crossing_owner_or_installation_boundaries`, `verification_app_failures_and_mismatches_preserve_reference_status_and_diagnostics`, `verification_installation_failures_revoke_even_forbidden_and_network_errors`, `verification_sparse_app_success_matches_missing_null_and_empty_metadata`, `verification_uses_configured_enterprise_api_for_both_signed_requests` |
| `mintInstallationToken` | `prepare_installation_token`, `finish_call`, `installation_token` | `installation_token_cache_reuses_until_exact_skew_boundary_then_refreshes`, `installation_token_fallback_expiry_missing_installation_and_revoked_preconditions`, `installation_token_manual_save_preserves_cache_attach_disconnect_invalidate`, `installation_token_date_parse_forms_match_actual_reference`, `installation_token_legacy_local_and_invalid_expiry_reuses_until_exact_skew` |
| `testConnection` | `test`, `prepare_repositories` | `repository_test_and_execution_environment_share_agent_token_and_bot_identity`, `repository_failures_preserve_reference_status_and_cached_retry_behavior`, `payload_valid_optional_fields_match_actual_typescript_and_exact_omission`, `payload_malformed_repositories_reject_without_reusing_cached_credential` |
| `resolveAgentGithubEnv` | `resolve_env`, `execution_environment` | `repository_test_and_execution_environment_share_agent_token_and_bot_identity`, `execution_environment_missing_and_unusable_connections_have_no_network_effect` |
| `webhookSecret` | `webhook_secret` | `disconnect_removes_only_owner_agent_credentials_and_is_idempotent`, `manifest_exchange_success_encrypts_secrets_and_preserves_owner_isolation` |
| `installedAgentIds` | `installed_agent_ids` | `disconnect_removes_only_owner_agent_credentials_and_is_idempotent` |
| `disconnect` | `disconnect` | `disconnect_removes_only_owner_agent_credentials_and_is_idempotent`, `installation_token_manual_save_preserves_cache_attach_disconnect_invalidate` |
| `readState` | `read_state` | `state_authenticity_shape_and_forgiving_decode`, `native_and_reference_signed_states_cross_validate` |
| `buildAppJwt` | `build_app_jwt` | `rs256_jwt_matches_reference_claims_encoding_and_independent_signature_verification`, `jwt_signature_covers_claims_and_rejects_invalid_keys` |
| `getAgentGithubAppService` | `new` | `real_http_tool_and_environment_share_store_cache_and_host_authority` |

The accepted three-file expiry delta uses the existing shared JavaScript date
parser. It preserves fallback for absent/null/invalid expiry and the exact
one-minute refresh skew. 144 actual-reference expiry scenarios cover 27 forms
and nine refresh scenarios in UTC, New York, Berlin and Apia; child processes
isolate native timezone changes. This is tested input coverage, not proof of
arbitrary implementation-defined JavaScript Date.parse equivalence. The former
ISO-only parser compiles but fails the new UTC +0530 case in the isolated fault
control. Frozen/restored candidate runs each pass 142 focused checks and 352
library tests, strict native/focused Clippy, formatting and artifact checks.
The integrated live 142-check run also passes; combined full gate is pending.

Intentional compatibility decisions and client evidence:

- Reject malformed credential/repository success payloads and evict invalid minted credential. Review: `tests/contract/reviews/native-agent-github-payload.md`; client evidence: `tests/contract/tests/gateway_rust_github_store.rs`.
- Reject overload/same-owner races and fence stale network completion with shared bounded worker/owner leases. Review: `tests/contract/reviews/native-agent-github-port.md`; client evidence: `tests/contract/tests/gateway_rust_github_composition.rs`.
- Persist expiring one-use App-bound callback challenge, return only exact public replay, retain ambiguous effects until fresh issuance. Review: `tests/contract/reviews/native-agent-github-compound.md`; client evidence: `tests/contract/tests/gateway_rust_github_challenge_flow.rs`.
- Reject malformed/coalesced webhook headers and non-object payloads before authority lookup. Review: `tests/contract/reviews/native-agent-github-webhook-admission.md`; client evidence: `tests/contract/tests/gateway_rust_github_composition.rs`.
- Use full owner tuple cache keys, App/installation binding and count/payload-byte budgets; same-App manual-key updates retain existing installation token. Review: `.jait/artifacts/gateway-rust/parallel-github-service/service-credit-boundary-audit.md`; client evidence: `tests/contract/tests/gateway_rust_github_store.rs`.
- Preserve tested ISO, RFC2822, legacy/local Date.parse forms with shared existing helper; exact one-minute expiry skew remains. Review: `.jait/artifacts/gateway-rust/agent-github-expiry-parser/independent-review.md`; client evidence: `tests/contract/tests/gateway_rust_github_store.rs`.

Remaining limits are recorded separately from original service acceptance:

- optional webhook sink retries/idempotency/cancellation/ownership: Original service has no webhook sink method; optional route hook behavior has actual-client evidence, stronger external effect supervision is separate.
- direct database/secret ABA and distributed/cross-process cache or callback owner coherence: Reference uses in-memory Map/WeakMap and no direct-write generation fencing. Native detects current credential changes and fences its owned writes; out-of-band reversal remains explicit.
- real external GitHub browser/App/installation account test: Deterministic local contracts execute actual TypeScript service and native clients with fixture network replies. A live external credential/account is not required for source-component acceptance.
- production host transport/redirect/socket enforcement and lifecycle assembly, supported platforms, load/soak, recovery/rollback/activation: Native effect fields/deadlines/cancellation and one-owner construction are tested, but do not establish production platform acceptance.
- logical cache payload budget versus RSS and delayed insertion housekeeping: Count/byte admission is bounded under cache mutex; reads sample freshness under the lock, so expired entries cannot be returned. Delayed insertion may retain an unusable entry until another operation.
- full arbitrary JavaScript Date.parse equivalence: 144 service scenarios across four zones cover required ISO/legacy/local/invalid inputs; focused evidence does not prove every implementation-defined Date.parse string.

Evidence: `.jait/artifacts/gateway-rust/agent-github-expiry-parser/partial-result.json`,
`final-evidence-audit.json`, `service-acceptance-audit.json`, `integration-review.json`
and `integrated-focused.log` in that directory. Candidate manifest, source and
log hashes were rechecked before integration. Only the exact reviewed three-file
delta was applied; concurrent OpenCode Go, provider and deployment work is
preserved. The combined frozen-source gate passed for 235 existing components plus all
142 complete-service checks; all 3,739 source fingerprints matched live before
credit. Evidence: `.jait/artifacts/gateway-rust/agent-github-expiry-parser/combined-validation-result.json`.
The service now earns one original source-component credit. This review grants
no platform, replacement or activation acceptance.
Historical GitHub pending notes describe older snapshots; the method mapping and
explicit limits here supersede those service-gap lists without erasing evidence.
