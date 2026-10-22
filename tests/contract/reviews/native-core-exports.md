# Native core toolkit factories

Reference: `packages/gateway/src/tools/core/index.ts`. `tools/core.rs` exposes
all eight native factory functions plus session todo get/clear and typed todo /
Jait dependency inputs. Factories bind the reviewed read, edit, execute, search,
web, agent, todo and Jait adapters. A process-wide native todo store gives all
factory instances the reference module's shared per-session state. Get and clear
preserve retained result arrays when replacing/removing the map entry.

The actual TypeScript barrel is bundled with all original factory modules.
Only external filesystem/terminal/browser/agent/search engine ports are isolated;
none of the factories or barrel reexports are replaced. A runtime identity witness
checks all ten exports against the individual production modules. Behavioral
comparison suites for core_io, core_search, core_agent and core_jait now execute
the native factories and compare their definitions, results and port calls with
the individual real TypeScript implementations. This combination prevents an
unrelated export or a native factory bound to the wrong operation from passing.
The existing detailed wrapper corpora remain active, including context identity,
construction failures, raw results/errors, filesystem dispatch and search retry.

An additional differential lifecycle checks two todo factories, successful list
updates, state/identity after every operation, cross-session isolation, clear and
retained arrays. During mutation review, a misspelled fixture field initially
allowed error-only outcomes. The fixture now requires successful updates and
checks intermediate state; the original escaped evidence is retained in
core-tools-mutations-initial.json. Wrong native read dispatch, no-op exported
clear and a wrong TypeScript barrel alias are all caught and restored by the
strengthened contracts. See core-tools-mutations.json and restored logs.

Typed status spellings are round-tripped; the todo identifier preserves the
JSON number representation. Native dependency ports are explicit; this API does
not discover global services, bypass consent, instantiate terminal/browser
engines, or activate the general registry. No downstream engine receives new
credit from this barrel component. Full frozen validation controls credit.
