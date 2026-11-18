# Native chat notification detail

Reference: `packages/gateway/src/services/chat-notification.ts`.
Native: `services/chat_notification.rs`. Target: `gateway_rust_chat_notification`.
Reference driver: `drivers/nativenotification.ts`.

Six differential tests call the actual source exports. Only the completion transport
and clock are injected. They compare returned UTF-16 code units, complete system/user
message contents, config propagation, token/temperature options, timer lifetime,
backend failure and deadline cancellation. A paused Tokio clock runs the native's
actual 12-second deadline; the reference fires its recorded abort callback. Both
cancel the pending completion and return null/None. Empty responses start neither
backend work nor a timer. No external model service or phone notification is used.

Normalization covers case-insensitive label prefixes, bullets, numbered list items,
quotes, first nonempty lines, ECMAScript whitespace, punctuation operation order,
word boundaries at the 40-unit threshold, and the 160-unit ceiling. Code-unit
comparison preserves lone surrogates produced by JavaScript slicing; it does not
replace them with U+FFFD or weaken string assertions. Native Utf16Text serializes
those units using the existing JSON encoder. Input strings are well-formed Unicode;
JavaScript-only malformed input objects are outside the typed boundary.

Generation compares trimming, the first 1,200 task units, the last 4,000 response
units, including splits within emoji pairs, and the exact data-only instruction.
It passes the opaque resolved provider config into the injected completion boundary.
Provider HTTP/runtime configuration resolution is separate migration work. The
completion future must cancel its transport on drop; native timeout drops it.

Four independent native regressions pass, including a pending transport drop probe.
The five original TypeScript tests pass. Four restored mutations are caught by both
native and differential tests: shortening the deadline, keeping the response prefix,
changing the word threshold, and removing whitespace/punctuation in the wrong order.
Original source restoration is byte-verified. Evidence in
`.jait/artifacts/gateway-rust/`: `chat-notification-native.log`,
`chat-notification-contract.log`, `chat-notification-ts.log`,
`chat-notification-clippy.log`, `chat-notification-mutations.json`, and per-mutation
failure logs. The Cargo manifests enable Tokio test-util only in dev-dependencies
for deterministic timer testing; production dependencies/configuration are unchanged.

This is one native source component. It prepares and normalizes notification text;
production chat wiring and external completion transport remain unactivated.
