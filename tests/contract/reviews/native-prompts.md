# Native prompt family and registry migration

The native prompts module replaces all thirteen built-in resolver files, shared
sections, registry behavior and registration barrel. Immutable prose is embedded
in assets.json. The migration-time extractor expands shared prose constants into
base templates and captures the finite Claude/Gemini/GPT-mini text variants.
Selection predicates, registration priority, per-mode expansion, context assembly,
XML escaping, filesystem reads and truncation are Rust implementations. No JS
engine, child process, Node, Bun or TypeScript sidecar runs in the native path.
The extractor is development tooling, not a build/runtime prerequisite.

Reviewed resolver sources: default, Claude (Sonnet 4/4.5/4.6), Gemini (ordinary
and alternate), default OpenAI, GPT-5.1, GPT-5.2, GPT-5 Codex, GPT-5 (mini reminder
and ordinary), xAI, GLM, Ollama, Qwen/Ollama and DeepSeek. Built-in matchers,
prefix lists, internal-provider metadata, mode-expanded prose and reminders are
compared directly, including resolvers shadowed by the default registration
order. The registry preserves the source's broad GPT-5 precedence over GPT-5.1
and GPT-5.2, matcher-before-prefix selection and last-registered priority.
Custom typed resolvers can be registered natively. Default identity, safety,
reminder constants and nullish override behavior remain available.

Context assembly preserves local/internal/external provider branches, project
environment, skills with XML escaping, architecture, response styles, capability
and discovery deduplication, artifact instructions, global instructions, folder
instructions and System One ordering. Local contexts omit the source's excluded
blocks. All shared constants, mode instructions and response-style functions
are exposed natively. The registry barrel's source import order is retained.

Global instructions use an explicit path/home/state/cwd configuration rather than
implicit environment discovery. The Linux adapter implements SOUL/legacy/default
precedence, ECMAScript trim, tilde paths, lexical path resolution, UTF-8 recovery,
read errors and 12000-UTF-16-unit limits. Architecture is limited to 4000 units.
Native output retains raw UTF-16 units so a limit may split a surrogate exactly
as the reference does. No real global user file is read in tests. Windows path
semantics and full provider execution remain outside this Linux-focused gate.

gateway_rust_prompts compares the real source registry and filesystem loader
with the native implementations. SHA-256 hashes cover every UTF-16 little-endian
unit, paired with exact lengths; hashes keep the bounded subprocess output below
256 KiB without normalizing prompt content. Tests cover 100 direct resolver/mode
combinations, 78 registry endpoint/backend combinations, context/style/skill
matrices, custom resolvers, real project-local global files, invalid UTF-8 and
split-surrogate boundaries. Twelve tests pass, including four subprocess
transport tests. The focused target also passes strict Clippy.

Seven restored mutations alter registration order, Codex exclusion, GPT-5.2
matching, graph/global limits, local-context selection or embedded prose. Each
fails the same comparison assertion; restored sources pass. Evidence is in
.jait/artifacts/gateway-rust/prompts-mutations.json and prompts-mutant-*.log.
Source hashes bind all resolver files, shared dependencies, native code/assets
and extractor. Asset refreshes require source review and a passing gate; they
must never silently accept changed source. Sixteen component credits require the
full source-bound gate; no claim of production replacement readiness follows.


## Frozen verification provenance

Concurrent edits twice invalidated otherwise passing full gates: first a reviewed
usage-cache change and then a change to the unported provider route. The native
cache now follows the latest no-cooldown reference behavior. Verification copies
Git-visible source into a project-local frozen tree, records every copied hash,
routes workspace package aliases into that tree and pins resolved installed
external dependencies. Source cannot change mid-run from unrelated live edits.
The resulting report identifies source_root and separately lists live-source
drift; snapshot results must not be represented as verification of a different
live source tree. Native implementations remain in the main working checkout.
The standalone gateway and production processes are untouched.
