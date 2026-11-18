# Native installed skill discovery

Reference: `packages/gateway/src/tools/skill-discovery-tools.ts`.
Native: `tools/skill_discovery.rs`, `tools/skill-discovery-metadata.json`.
Target: `gateway_rust_skill_discovery`; driver: `nativeskilldiscovery.ts`.

Ten differential tests use the real search export, real SkillRegistry and the
real tool factory/execute methods, with no reference algorithm reconstruction or
mocked file reader. Pure search and complete tool results are compared as exact
serialized JSON, including field order and escaped lone UTF-16 surrogates.
Metadata is extracted from the actual tool factory and compared in full.

Coverage includes ID/name exact-match priority, enabled filtering, Unicode
letter/number tokenization, contextual lowercase, substring matches, repeated query
words, one leading slash, ECMAScript whitespace, empty input, result floor/clamp
and the zero/default quirk, NaN/infinities, stable locale ties and duplicate input
IDs. Descriptions are clipped at exactly 180 UTF-16 units, even inside a surrogate
pair. The tool case uses the real registry's duplicate-ID replacement behavior.

Read-tool cases operate on owned project-local files. They cover registered IDs,
disabled/missing/path-like IDs, directories, missing files, arbitrary UTF-8 replacement
and BOM/CRLF preservation. File content is returned as untrusted data. The supplied
ID is never interpreted as a path: only the enabled registry record owns the path.
Success/failure output and metadata match the original, including opaque read errors.
Repeated separators and parent components in trusted registry paths are preserved
in baseDirectory without filesystem canonicalization.

Six native tests independently pin exact priority, stable Unicode ties, repeated-word
scores, floor/clamp/default limits, 180-unit clipping and the escaped surrogate wire
value, exact dirname spelling, registry-only reads and opaque errors. Four restored
mutations (exact weight, preview length, disabled read acceptance, zero-limit default)
fail assertions in both suites. All restored checks and strict Clippy pass.

A draft-native reproduction caught Path::parent removing a repeated separator:
for `...//SKILL.md`, baseDirectory lacked the reference's trailing slash. The same
assertion passes with a lexical POSIX dirname. Evidence is
`.jait/artifacts/gateway-rust/skill-discovery-path-before.log` and
`skill-discovery-contract.log`. Mutation JSON and logs share that directory.

SkillLookup is an explicit adapter to the caller's existing registry, which retains
installation, discovery, enabling and filesystem ownership. This component does
not receive credit for porting the separate skills/index.ts registry/discovery module.
SystemSkillFileReader reads only the trusted registered path and uses replacement
UTF-8 decoding. Invoke blocking file operations on the runtime's blocking-work pool.
Production tool registration/consent wiring remains separate.

Inputs are typed skill strings/bools and numeric limits. JavaScript getters/prototypes
and mutating registry objects are outside native ownership semantics. Regex/case
Unicode tables and ICU collation are pinned by the Rust toolchain/lockfiles; the
current differential locale is en-US. search_with_collator supports a configured
host locale. Unicode-version changes, other host locales and actual Windows dirname/
filesystem behavior remain activation/compatibility checks, not claims of exhaustive
Unicode or Windows parity. The complete source-bound gate controls native credit.
