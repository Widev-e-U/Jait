# Consent event compatibility

The Node gateway broadcasts `consent.required` and `consent.resolved` to all
WebSocket clients (`packages/gateway/src/index.ts`). The web client's
`useUICommands` forwards these events without filtering by the active chat, and
`pending-approvals.ts` uses them to track background approvals by session.

The Rust gateway sends both events to authenticated clients currently authorized
for the request's session, regardless of the client's active subscription. This
preserves the background-approval use case and restricts cross-user disclosure.
The Node resolution envelope uses an empty `sessionId`; Rust labels it with the
owning session so authorization can be rechecked during delivery. The web client
uses the resolution's `requestId` rather than the envelope session ID. Other
clients and all reconnect/ordering cases still need differential acceptance tests.

The composed-application regression `consent_prompts_reach_session_owners_but_not_other_users`
checks prompt and resolution delivery to a bound and an unbound owner, and denial
to a different user. The bridge regression for failed or abandoned finalization
checks that current clients disconnect and snapshot recovery stays fail-closed.
These in-process application and bridge tests are not production-binary evidence.
