# Native sandbox manager browser image prerequisite — 2026-10-26

Status: partial and uncredited. The canonical implementation remains
`packages/gateway-rust/src/security/sandbox_manager.rs`. Browser launch is still
pending; this review covers its admission/image prerequisite. Production remains
TypeScript. No engine build, activation, publication or agent was started.

## Implementation and authority review

`prepare_browser_image` composes the existing browser admission check before a
15,000 ms image inspection. Existing images skip building. Missing images require
an explicitly supplied `BrowserImageAuthority`; there is no fallback to `Host::run`,
ambient spawn, shell, working directory or environment. `BrowserImageBuild` has
private fields and fixes the selected engine, recovery-v3 tag, literal build argv,
600,000 ms deadline and stdin recipe. The source Dockerfile is stored beside the
canonical module and matches the evaluated TypeScript template byte for byte,
including x11vnc recovery behavior. It is an implementation asset, not a second
manager or separately credited component.

The build authority must be bound by bootstrap to existing consent, execution-node,
engine, authorized context, network and resource boundaries. The literal `.` in
the reference argv denotes that bound context; the manager does not resolve it
against ambient cwd. The authority must enforce bounded output and cancel/reap on
future drop, or retain admitted work under its bounded shutdown supervisor. No
concrete host build adapter is implemented by this slice. The trait expresses an
integration requirement, not proof that host authorization or cancellation works.
A successful prerequisite grants neither startup consent nor a capacity reservation.

## Compatibility review

Normal results preserve the reference's exit-code predicate, call ordering,
arguments, input and error text. The TypeScript image helpers ignore `timedOut`
when exitCode is zero. Synthetic zero-plus-timeout results are explicitly tested;
real host timeout adapters must report an absent/nonzero exit code when killing
work. This slice does not silently change that observable predicate.

An explicit host-authority error propagates as its existing HostError instead of
being wrapped as an ambient child-process build error. The actual TypeScript
comparison records this deliberate boundary difference in its build-denied case.
There are no native startup consumers yet; direct-caller evidence is still required
before replacement. Docker/Podman argv are independently asserted natively; the
TS import seam pins Docker detection, so only the binary is normalized there.

## Focused evidence and limits

Evidence directory: `.jait/artifacts/gateway-rust/sandbox-manager-20261026/`.
`browser-image-slice-review.json` binds source, recipe, comparison, mutation and
check hashes. Restored validation: 358 library tests; 13 comparisons against actual
TS admission, image ensure and input-build code; rerun 66 admission/config cases
plus 3 overflow checks and 24 command/session comparisons; formatting, strict
Clippy for the library and artifact paths. The TS harness changes import seams
and appends exports; it does not replace the methods being compared. All child
process effects are mocked, with exact stdin/argv/timeout assertions.

Four independent native mutations (ignore admission denial, rebuild existing
image, shorten build deadline, suppress build failure) fail their intended
assertions. A fifth control removes the recipe's -noxdamage flag; native vectors
still emit, and the actual-TS recipe comparison fails an assertion. Sources are
restored and passing vectors/comparisons regenerated afterward.

The native library's extra test contains the 13 scenario vectors; library-test
and comparison counts are different metrics. These focused tests do not establish
full frozen coverage, real build output bounds/cancellation, engine/platform
compatibility, browser launch ownership, port binding/readiness, conflict retry,
Linux/Windows lifecycle, storage/symlink containment, existing-container/background
routing, identity/worktree host integration or direct-caller replacement. All of
those gates remain open. SandboxManager remains absent from native coverage.
