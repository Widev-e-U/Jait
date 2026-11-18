# Source-root isolation for frozen validation

Rust tests embed `CARGO_MANIFEST_DIR` when compiled. Sharing the same Cargo target
directory through a symlink allowed Cargo to reuse a test binary compiled in the
live checkout when the command was launched from a frozen source copy. The test
then read live inputs and wrote its report outside the frozen copy. A passing
exit status did not prove that the frozen inputs were exercised.

`tests/contract/run.mjs` now keys both contract and isolated source-review build
directories by the source root. The source-review CLI and its legacy alias share
a build within one root; different roots use distinct physical build directories
even when their parent caches are symlinked together. Ordinary contract builds
also receive separate root keys.

The native frozen preparer keeps its native target directory physical instead
of linking it to the live target. This preserves existing native binary paths
while preventing reuse of binaries embedding a different source root. The
root-keyed contract cache parent can still be shared.

The source-review build regression executes copied runners against a recording
Cargo fixture with two source roots and a shared cache. It failed against the
previous runner and passes after the change. The compatible CLI alias, locked
manifest and dependency-isolation checks remain covered. The native preparer
regression checks repeat preparation, distinct physical roots and preservation
of the live cache. All six native-preparer tests pass.

Fresh frozen translated evidence:
`.jait/artifacts/source-review-authoring/goal-reference-validation/frozen-source/.jait/artifacts/contracts/86f07faf-af54-410f-9b79-971ca37ebee4/report.json`.
It records 3,138 passing cases, zero failures and 50 retained skips. The report
was produced inside the frozen root and its fingerprints matched live inputs
before the changed declaration reviews were applied.

These checks protect evidence provenance. They do not resolve the recorded
integration skips, establish native component parity or authorize a production
cutover. Source evidence still requires exact current hashes, assertion-failing
mutations and restored passes.
