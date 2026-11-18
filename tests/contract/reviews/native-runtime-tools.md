# Native runtime tools, canonical names and communication intents

References: tools/agent-communication.ts, agent-message-tool.ts, gateway-tools.ts,
project-editor-tools.ts, voice-tools.ts and tool-names.ts.
Target: gateway_rust_runtime_tools. Ten tests (six domain and four transport)
compare actual TypeScript functions and metadata against native adapters.

Intent tags cover all declared tags, case variants, JS whitespace, malformed
and repeated tags, render-segment whitespace retention, unknown values,
success classification and exact descriptions. Canonical names are an exhaustive
native enum with string/key mappings; every mapping, round-trip, uniqueness and
unknown-name rejection is checked against the TypeScript constants.

Swarm messages use the previously verified native mailbox and caller-supplied
swarm context. Empty results detach their empty data arrays; nonempty results
retain live arrays across later posts and round removal/replacement. The message
string is captured at execution time. Tests retain/observe old results to prove
this distinction, plus sender fallback, missing rounds, zero/one/multiple sibling
wording, Unicode/blank/invalid notes and controlled timestamps.
Mailbox and message locks are never nested in reverse order.

Editor opening validates session/project/UI availability in reference order,
trims JS whitespace and targets the correct session. UI sink failures propagate.
Speech validates input before the injected voice service, preserves session
context, propagates errors and reports MIME presence and UTF-16 audio length.
Gateway status compares optional service defaults, active-session selection,
enabled-job truthiness, duplicates/order in hook events, negative/fractional
uptime flooring, source call order and every service failure boundary.

UI, voice and status services are explicit injected native runtime boundaries;
their transports are not reimplemented by these adapters. No real messages,
audio, external device requests or UI commands are sent in these contracts.
Each tool's metadata is compared in full, including consent/risk declarations.
Six mutations (unsuccessful intent classification, default sender, session trim,
audio UTF-16 count, negative uptime floor and canonical name mapping) produce
assertion failures. Original sources are restored after every mutation.
Evidence: .jait/artifacts/gateway-rust/runtime-tools-tests.log and
intent/agent-sender/editor-session/voice-units/status-floor/tool-name-mutation.log.
