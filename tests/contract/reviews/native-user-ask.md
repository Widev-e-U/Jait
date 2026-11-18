# Native user.ask tool adapter

The native adapter calls the real UserQuestionService. It does not forward to
TypeScript or simulate a result. Its declarative metadata is embedded JSON
compared against createUserAskTool's actual constructor output, including the
parameter schema, descriptions, consent defaults, tier, risk, source and name.

Inputs follow the tool schema. Question id/header/text and option labels use
ECMAScript trim. Empty option labels are removed, empty descriptions are omitted,
recommended and multiSelect default false, and freeform input defaults true.
Empty question arrays, blank required fields and duplicate trimmed ids fail
before creating a pending request. Duplicate diagnostics preserve the order of
first duplicate occurrence rather than sorting.

The request takes session and owner identity solely from authenticated tool
context; extra input identity fields are ignored. requestedBy is user.ask. The
actual pending service supplies title defaults, nullable owners, event metadata
and a no-expiry request. Owner-authorized submission resumes execute with the
complete answers; cancellation returns the reference's unsuccessful result.
An unanswered request remains pending. Registry/consent dispatch and production
client transports remain separate migration work.

gateway_rust_user_ask compares the TypeScript constructor and real service with
the native adapter using isolated in-memory registries, fixed wall time and
validated normalized UUIDv7 request identities. Exact results, pending requests,
callback events and owner-filtered lists are compared. The vectors cover empty
and whitespace-only required fields, repeated ids, optional choices, removed
blank choices, Unicode trim, explicit defaults, cancellation, unanswered requests,
wrong-user submit, duplicate submit and input-supplied identity fields.

Two reversible mutations replace authenticated ownership or sort duplicate ids.
Each fails the same differential assertion; restored sources pass all eight
tests (including four subprocess transport tests) and strict contract Clippy.
Evidence is in .jait/artifacts/gateway-rust/user-ask-mutations.json and the
corresponding mutant/restored logs. The full source-bound gate is required before
crediting the component. This is focused schema-valid JSON compatibility, not
validation of arbitrary untyped JavaScript inputs or complete production dispatch.

---

## Resumable MCP wait refresh — 2026-10-20

The current source adds startResumable/waitForAnswer and a requestId branch in
user.ask. Native UserQuestionService now retains shared answers independently of
any one waiter. Exact request/session/owner lookup rejects mismatches without
consumption; the 60,000 ms deadline returns pending, while answer collection
removes the entry. Answers/cancellation arriving between calls remain collectable.
Already-started concurrent waiters share one settled result. Dropping a waiter
leaves the request intact. Plain non-MCP asks still wait indefinitely for answer
or cancellation and keep their pending entry when a receiver is dropped.

The tool accepts absent questions when resuming, rejects new questions with a
nonempty requestId, starts resumable requests only for mcp-client origin, and
returns the exact pending/answered/cancelled/missing envelopes. Context supplies
owner/session; input identity never does. Metadata was regenerated from the real
constructor and compared exactly, including the optional requestId schema.

Evidence under `.jait/artifacts/gateway-rust/parallel-20261020/user-ask-resume/`:

- `node tests/contract/run.mjs test --test gateway_rust_user_ask --test gateway_rust_user_ask_resume --test gateway_rust_input` passes. The refresh target has twelve component tests and four shared transport checks; old question/secret-input contracts remain green.
- `node packages/gateway-rust/run.mjs test --lib resume_tests` passes three native lifecycle tests, including a 59,999/60,000 ms boundary, answer-between-calls, null versus empty owner, cancelled/concurrent waiters, and one-time collection.
- The original user-questions and user-question-tools Vitest files pass eight tests.
- Three restored mutations (wait deadline, owner binding, retained collected entry) fail native and differential suites. Restored sources pass.

The TypeScript driver replaces timers with a caller-driven queue over the actual
service/tool exports; native tests advance a paused Tokio clock. No 60-second
real wait or question sent to the user is needed. UUID identities are validated
and normalized before comparing complete results and callback traces.

Typed/activation limits: shared state is in memory and restart drops requests,
matching this module's source responsibilities. Callback alias/reentrant native
panic behavior is not an arbitrary-JavaScript claim. Real MCP transport, user
surface delivery and durable request persistence are separate components. New
and resumed MCP calls are tested at the service/tool boundary; end-to-end client
transport activation remains open. The full source-bound gate controls credit.


### Delayed answer continuation — 2026-10-24

A per-call pending result must not strand the chat when the user answers later.
The TypeScript and native question services now expose an owner-scoped detached
resolution observer. Only a wait that yielded with no attached waiter emits a
wake. An attached waiter resumes itself; duplicate submissions cannot wake twice.
The answer stays available for collection through the original tool, which is
necessary for browser identity and control checks. Cancellation conveys no
browser control or other permission. Callbacks contain request metadata, never
answer values.

`gateway_rust_user_ask_resume` replays submit, cancel, foreign-owner rejection,
answer retention, one-time collection and attached-wait suppression against the
real TypeScript service and native implementation. Both `user.ask` and
`browser.handoff` request origins are exercised. Existing question HTTP contracts
remain required.

The production TypeScript MCP executor pauses other actions while a question is
pending. The chat runtime wakes an idle CLI or steers an active chat/thread after
a detached resolution, recovering via the original tool and retaining the
previous provider/runtime selection. `chat.external-providers.test.ts` exercises
submission through HTTP after the CLI turn has ended; `mcp-server.test.ts` verifies
that pending questions pause actions without affecting another chat. These are
new R14/R16/R24 acceptance requirements for native runtime wiring; service parity
alone does not certify that wiring or browser parity.

Browser clients must retain form state when collapsing prompts, show a single
line above the composer, and never submit on collapse. Browser tab selection must
follow the visible page and adopt new sign-in popups, so tools and live desktop
operate on the same page. `browser-handoff.spec.ts`, `composer-prompts.spec.ts`
and `browser-visible-tab.integration.test.ts` cover those client/runtime behaviors.
