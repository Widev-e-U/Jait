# Native model-facing command-output projections

The canonical implementation is `packages/gateway-rust/src/tools/command_output_filters.rs`.
It implements the production `command-output-filters.ts` component rather than
exercising the earlier reconstructed `tests/contract` filter model. It is a pure
API: callers retain the original terminal replay and use generic bounding when
it declines. Registering the module does not activate a production terminal host.

The review covers the environment toggle, ordered normalization of agent pager
preambles, PowerShell assignments, POSIX assignments, `cd`, grouping and `sudo`;
quote-aware first-pipeline selection and tokenization; git global-option skipping;
runner detection; and all seven dispatch branches (status/log/diff/git-grep/grep/
tests/path-list). Human/porcelain status keep section-dependent staging, deletion,
unmerged and untracked behavior. Log subject selection/caps, conservative hunk-only
diff cleanup, insertion-ordered grep grouping/caps, summary-before-failure priority,
eight subsequent failure-context lines, blank-line resets, minimum removal share,
and stable extension histogram ties preserve the actual implementation.

The differential driver invokes the unchanged actual TypeScript functions.
Strings are transported as UTF-16 units so a grep slice through a surrogate pair
is tested exactly using the existing native `Utf16Text` type. Existing ECMAScript
whitespace is reused. Regex conversion explicitly preserves ASCII digits and word
boundaries, non-Unicode JS case folding (long-s/Kelvin lookalikes), and JS dot/end
behavior. It does not add ANSI stripping. Real comparisons caught two incorrect
CRLF assumptions during implementation: CR-ended grep rows must decline, and a
CR-ended Author field does not match the TypeScript author regex. These behaviors
now have regressions rather than invented normalized parity.

Seven focused groups cover valid and malformed formats; thresholds and caps;
quoted/unknown/disabled commands; Unicode/BOM/NEL/LS, Windows paths and CRLF;
failure symbols/summary/context; long rows and stable histogram ties; and the
strict dispatch-level never-grow rule with independent native assertions.
Four shared driver self-checks are transport evidence and are counted separately
from the seven filter groups. Frozen and restored checks, compiler-fresh behavioral
controls, hashes and exact scenario counts are recorded under
`.jait/artifacts/gateway-rust/command-output-filters/`.

Limits: this is output projection, not a shell parser or command authorization
boundary. There are no process, network, credential, consent, or durable writes in
the API. Compression deliberately retains the reference's recognizers and caps;
it is not a general claim that arbitrary unrecognized output can be summarized.
Activation, the remaining terminal-tool host, whole-current-source native gates,
platform, load/soak, recovery/rollback and production replacement remain separate.
