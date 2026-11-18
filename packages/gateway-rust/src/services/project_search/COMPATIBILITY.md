# Project search compatibility gaps

The HTTP route selects ripgrep only when it can spawn the configured `rg` on PATH. It sends only bytes read through the pinned root, and processes files sequentially under the filesystem lane and one deadline. Missing `rg` selects the TypeScript-style literal fallback; a present executable that fails does not. Regex searches require ripgrep. Output and resource caps can make results incomplete; `limited` indicates bounded traversal or output, while deadline and cancellation return errors.

This is not TypeScript parity. The Rust walker, ignore and glob implementations select candidates rather than `rg --files` or ripgrep's own traversal. Global Git excludes, include overrides, ordering, hidden files, and ignore semantics may differ. Candidate and byte budgets, maximum file size, per-file subprocesses, line truncation, regex errors, binary/encoding handling, and overload, timeout and cancellation responses can differ. Each file is a separate process, so large projects may time out sooner; the blocking lane bounds concurrent searches rather than granting a dedicated ripgrep pool. A disappearing or broken executable after the initial probe fails the search. Non-Unix descriptor-relative access remains unsupported. A file changed during scanning may be omitted. The current route error mapping for missing-ripgrep regex and failed processes needs differential client review. Differential tests with real ripgrep, scope races and clients, plus load/soak evidence, remain required before claiming migration parity or production readiness.

The pinned-root path validator rejects names containing backslashes or control characters, including literal Unix filenames. Such entries are skipped and mark coverage limited; TypeScript can enumerate some of them. This restriction requires a separate scope and path-safety review before changing.

During ripgrep stdout draining, cancellation and deadline checks also run between reads so a continuously readable pipe cannot indefinitely delay them. Focused `supervised_ripgrep_` tests on 2026-11-01 passed the complete-record case; the deadline/output case initially failed to start its generated executable with `ETXTBSY` and passed on a focused rerun. A focused `supervised_ripgrep_cancels_streaming_child` test passed after a child emitted output and signalled readiness; scheduling does not establish that stdout stayed continuously readable at cancellation. The compatibility and integration gaps above remain unresolved.

The stdout drain processes at most 16 reads before revisiting stdin and the operation deadline. After this change, the offline locked `supervised_ripgrep_` focused tests passed 3/3 on 2026-11-01. A focused duplex test passed on 2026-11-01, exchanging 512 KiB of input and output with a child that echoes each line while reading. This demonstrates progress with both pipes carrying more than a typical pipe buffer; it does not prove stdout remains continuously readable under all scheduling conditions. The loop now sleeps only on a pass with no pipe progress; the focused duplex test passed again after this change. Throughput under load has not been measured.

The subprocess guard kills and waits for the direct child on drop. It does not supervise or confirm termination of descendants; no descendant cleanup guarantee is claimed. The idle sleep and subprocess throughput have not been measured under load.

A process group could limit ordinary descendants while the child remains owned, but it is not a complete descendant fence: descendants can leave the group, and a group identifier must not be signalled after its ownership can no longer be established. The current loop calls `try_wait`, which can reap the child before stdout reaches EOF, so adding a group kill in the existing drop guard would require a deliberate lifecycle redesign. Process-exit cleanup and escaped descendants remain unverified.

On 2026-11-01 the pipe loop was changed to revisit cancellation and deadline checks after interrupted reads or writes rather than fail the search. The offline locked `supervised_ripgrep_` focused tests passed 4/4 after the change; they do not inject an interrupted system call. No component verification credit is claimed.

On 2026-11-01 directory enumeration was adjusted to capture the `fdopendir` error before closing the descriptor on failure, preserving the original error if cleanup changes errno. This failure branch was not fault-injected; no component verification credit is claimed.

On 2026-11-01 ignore-rule dot wildcards were adjusted to exclude JavaScript
line terminators, including U+2028 and U+2029 in valid filenames. The focused
`ignore_dot_wildcards_exclude_javascript_line_separators` Rust test passed, and
corresponding JavaScript expressions were checked with Node. This only covers
the tested fallback matcher cases; traversal and other compatibility gaps above
remain, and no component verification credit is claimed.

The fallback ignore `?` wildcard has a known supplementary-plane mismatch: JavaScript regular expressions without the Unicode flag consume UTF-16 code units, while the Rust regex consumes Unicode scalar values. A Node check on 2026-11-01 showed one `[^/]` does not match `😀` and two do; the Rust compiler currently emits one scalar-matching `[^/]` per wildcard. This can change ignore decisions for valid filenames containing supplementary characters. Correct handling needs to cover combinations of wildcards and character classes without weakening path confinement or the regex budgets; no parity credit is claimed.

On 2026-11-01 Linux directory enumeration was changed to retry interrupted `readdir` calls while revisiting cancellation and deadline checks; the interruption branch was subsequently fault-injected as described below. The project-search focused run passed 32 tests and failed two fixture assertions. After correcting those fixtures for the existing backslash path restriction and empty-query behavior, both failed tests passed individually. The full focused suite has not been rerun on those fixture changes, and this evidence does not establish component parity.

On 2026-11-01 directory enumeration was changed to inspect errno on Linux, Android, Apple, FreeBSD, DragonFly, NetBSD, and OpenBSD; unsupported targets fail closed. The accessor names were checked against locked libc 0.2.191, but only Linux was compiled and exercised: `non_utf8_names_consume_global_entry_budget` passed. On Linux, three focused injected `readdir` tests passed for interruption retry, I/O error after partial enumeration, and cancellation before retry. Non-Linux compilation and execution remain unverified. This evidence does not establish component parity.

A source audit on 2026-11-01 found that `ProjectSearchBridge` in
`services/primary_link.rs` had only the `ScriptedSearch` test implementation;
no production implementation or caller of `run_primary_project_search` was found
under `packages/gateway-rust/src`. The authenticated local HTTP route therefore
does not establish primary-link integration. Connecting the bridge requires an
authorized root and bounded execution/cancellation path, plus client contract
review; the seam alone earns no integration or verification credit.

On 2026-11-01 a pinned-root primary-link adapter was added. The focused
`primary_bridge_confines_root_and_preserves_results_and_cancellation` test passed
1/1, covering a content result, a different-root rejection and pre-cancellation.
The adapter is not wired to runtime dispatch: an authenticated caller must supply
the authorized root, shared filesystem lane and cancellation lifecycle. Error
message compatibility, in-flight cancellation and client contracts remain open.
No component verification credit is claimed.

The TypeScript primary-link runtime has two distinct entry points: its `fsOp`
`search-project` branch and the `search`/`file.search` tool aliases in
`toolOp`. Both depend on the surrounding primary-link connection and its
request lifecycle. The Rust authenticated `/api/project/search` route is a
separate client contract and does not invoke either branch. Wiring the adapter
there would not implement these callers. A native primary-link dispatcher must
first establish connection authority, bind the permitted project root, acquire
the shared bounded filesystem lane, and cancel work when its request ends; its
path and error behavior still require compatibility review.

An asynchronous primary-link search dispatch building block now accepts a
caller-supplied pinned root and blocking lane, retains the root identity, and
signals cancellation when the calling future is dropped. It has no production
connection caller: root authorization, lane sharing, disconnect supervision,
in-flight cancellation evidence and error/client compatibility remain open.
It must not be treated as an integrated or verified component.

The initial dispatch root/lane test passed on 2026-11-01. The dispatch now retains a pre-pinned root instead of reopening a path for each request; the focused `primary_search_dispatch_` run passed 2/2, including rejection after root replacement (execution `01a198bf-52de-7d9f-ade8-b8f39e442824`).

The expanded `primary_search_dispatch_uses_authorized_root_and_lane` focused test
passed on 2026-11-01 (execution `01a198c0-247e-731b-b20c-4650188ce1aa`),
covering the `fs` search-project result and rejection of a foreign root in
addition to the tool path and closed lane. The blocking lane retains its permit
until admitted work exits after a caller is dropped; dispatch signals cancellation
on drop, but this test does not demonstrate interruption of a running search or
connection-disconnect supervision. Runtime integration and parity remain unverified.

The focused `dropped_caller_signals_admitted_work_and_retains_lane` test passed
1/1 (execution `01a198c1-af06-7fbe-9617-ca9524181274`). It verifies that the
dispatch cancellation handoff signals an admitted test closure on caller drop,
and that the blocking lane stays occupied until that closure exits. It does not
exercise interruption inside a real search or connection disconnect handling.

The existing `supervised_ripgrep_cancels_streaming_child` test exercises a
running child under a directly signalled cancellation token. The new dispatch
handoff test and that lower-level test do not together establish an end-to-end
caller-drop or disconnect test: the latter still needs to synchronize an actual
search with cancellation through the dispatch and verify cleanup.

On 2026-11-01 `dropped_caller_cancels_supervised_search` passed 1/1 (execution
`01a198c3-d948-738c-aed4-9a122bd99c07`). It passes the shared caller-drop
cancellation handoff into a supervised search using a controlled child, waits
for that child to start, and observes `Error::Cancelled` after aborting the
caller. This tests the helper and search together, not the complete dispatch or
production connection disconnect lifecycle. No component verification credit
is claimed; runtime integration and compatibility remain open.

A source review on 2026-11-01 found that `PrimaryLink` has no socket-close
handler: `handle_open` sets `connected`, but only `stop` clears it, and there
is no production `PrimaryLinkHost` implementation under the native runtime.
The TypeScript close callback schedules reconnect unless stopped. A native
connection owner must associate close and request tasks with the correct socket
generation, suppress reconnect after stop, and supervise and drain admitted search
work without allowing a stale close to affect a replacement connection. These
are integration requirements, not evidence that the current synchronous host
interface provides them. Disconnect cancellation changes observable behavior
and needs an explicit compatibility decision and client evidence.

On 2026-11-01 a primary-link identity review found that construction eagerly
persisted a newly generated node ID even when a nonempty ID had been read. The
current instance reused the old value, but the overwrite could change its identity
on a subsequent restart. Initialization now invokes persistence only when no
usable ID was read. The focused `persisted_node_id_does_not_run_persistence_callback`
test passed 1/1 (execution `01a19981-253c-72a2-8201-a67abccfe809`), covering
reuse, generation and fallback through the initialization helper. This is not a
production-host or full persistence integration test and adds no component
verification credit.

A subsequent identity review found that a read error was collapsed into a
missing ID, allowing an unreadable existing file to be overwritten. Initialization
now selects the hostname fallback on a read error without attempting persistence,
matching the TypeScript catch path. The focused helper test passed 1/1 including
this case (execution `01a19982-b1ed-7717-8502-20af084f95b9`). Host-level I/O and
production integration remain unverified; no component credit is claimed.

A further runtime integration review found no native call to `PrimaryLink::new`
and no implementation of `PrimaryLinkHost`. Its socket methods provide neither
connection identity nor timer cancellation, and `PrimarySearchDispatch` is not
called by the link. The native manifest has no WebSocket client dependency. A
production adapter therefore needs a transport choice, authenticated and scoped
root binding, connection-generation ownership, bounded task supervision, and
explicit timer lifecycle; adding a close callback to the current seam alone would
not provide those guarantees. TypeScript's close callback schedules a reconnect
and does not explicitly cancel in-flight `handleMessage` calls, so disconnect
cancellation requires the compatibility decision and client evidence noted above.
These are outstanding integration requirements, not component coverage.

The focused `to_ws_url_handles_unicode_at_scheme_boundaries` test passed 1/1
(execution `01a19984-0f5a-7353-85ec-593fc54649c6`) after scheme detection was
changed to avoid slicing through a UTF-8 character. This helper regression does
not establish socket integration or component verification.


A further source review of `packages/gateway/src/services/primary-link.ts`
found that its socket message callback starts `handleMessage` without awaiting
it. Socket close schedules reconnect without cancelling those handlers. Their
completion calls `send`, which checks `this.ws` at that later time: if a
replacement socket is open, an old request's response can be sent on that
replacement connection; if no socket is open, it is dropped. This applies to
both `fs.op-request` and `tool.op-request`. The draft
`packages/gateway-rust/src/services/project_search/connection_owner.rs` keeps
admitted leases across disconnect, but does not implement transport, response
routing or task supervision. Suppressing old-generation responses or cancelling
handlers on close would change the observed reference behavior. The runtime
response-routing and disconnect policy still require an explicit compatibility
decision and client evidence; no such decision or production integration is
claimed by this observation.
