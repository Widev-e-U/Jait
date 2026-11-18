# Native session todos and internal links

References: tools/core/todo.ts and tools/link-tools.ts.
Target: gateway_rust_utility_tools. Nine tests compare real TypeScript tools
and shared link validators with native implementations and complete metadata.

Todo contracts exercise full-list replacement, removal of extra properties,
counts and multiple in-progress titles, session isolation (including empty
session IDs), getter mutation, retained result/getter arrays, clearing, and
detached missing-session arrays. Failed normalization does not replace prior
state. Runtime boundary cases cover missing/null/non-array lists, null elements
and scalar elements. Schema-valid titles/IDs/statuses preserve their values;
additional JSON boundary cases are compared. Caught TypeError text is tied to
the reference Bun runtime and transpiled source; engine-specific errors from
arbitrary prototype-shaped invalid inputs are outside the supported schema.

Link contracts cover safe/parsed/tool results for all page paths and aliases,
unknown/deeper/external/protocol-relative destinations, normalized dot paths,
backslashes, control characters, fragments, raw/encoded Unicode, empty labels
and UTF-16 label/URL ceilings. Search query tests preserve unrelated parameters,
replace duplicate q keys at the first position, use WHATWG form encoding,
handle empty searches and unsupported page searches, and reject expanded URLs.
The shared validators and page-search flags are embedded native dependencies
and are bound by the gate's shared-source fingerprints.

Four mutations (label ceiling, duplicate q replacement, todo normalization and
retained todo-result identity) fail assertions; restored sources pass. Strict
Clippy passes for the target. Evidence:
.jait/artifacts/gateway-rust/utility-tools-tests.log,
utility-tools-clippy.log, link-label/link-duplicate-search/todo-normalize/
todo-live-data-mutation.log.
