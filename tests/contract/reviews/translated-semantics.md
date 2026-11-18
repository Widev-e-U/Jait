# Translated assertion continuation review

This work repairs concrete audit counterexamples. It grants no blanket assertion
parity and does not authorize the R09 implementation port. The current baseline
still needs complete assertion/variant/source-branch review and required integration
and platform evidence.

- Object identity: generated observations use `ref` and `otherRef`; all 322 peers
  execute a wire-contract check. Reference-valued `toBe` and function equality fail
  closed on missing metadata. Same and distinct objects/functions are checked.
- Regex anchors: non-multiline `$` matches only at input end. Multiline start/end
  support CR, LF, U+2028 and U+2029, including separate positions within CRLF.
  Rust regression cases and JavaScript reference checks are saved in continuation
  artifacts. This does not certify all UTF-16, case folding or regex constructs.
- Collections: Set values and Map entries compare without insertion-order dependence,
  matching the installed Vitest iterable comparator; ordinary arrays remain ordered.
  Containment identity stays distinct from structural containment.
- Property paths: numeric bracket indices, escaped punctuation, array-form literal
  segments, and Vitest's exact-own-property precedence are exercised. This is not a
  complete recreation of prototype/inherited-property or every pathval edge case.
- Dates: the observation serializer retains Date metadata for ordinary nested data
  properties and array elements, including invalid Dates, so a Date cannot satisfy
  an equality assertion against its ISO string. It inspects property descriptors
  without rereading getters. Date-valued accessors/custom `toJSON`, nested class
  prototypes, symbol properties and cyclic structures still need a full type/wire
  review. These limitations preclude claiming general strict-equality equivalence.
- Original helper vectors now preserve category sum, thinking-token difference,
  and error-array membership relations. Formula-derived goldens were removed from
  those original mappings. Alternate valid outputs and malformed operands are tested.
- Platform-only `skipIf`/`runIf` comparisons become portable Rust `cfg_attr` gates.
  Nine Linux CLI cases previously ignored now execute and pass. Unknown/capability
  conditions remain visible unresolved ignores. No environment expression is evaluated
  as authoring-time code.
- CLI start/update fixtures retain the original Node `process.execPath` input,
  with all 11 registrations and 34 mandatory literal comparisons independently
  checked by `.jait/artifacts/rust-continuation/review-cli.mjs`.
- Mapping metadata separates original comparison rules from synthetic completion
  guards. Completion-only source bodies, optional callbacks and dynamic/hybrid
  expected operands still require individual review.
- The evidence parser accepts libtest's exact ` - should panic` result suffix only
  for a registered bare ID. Unknown, duplicate and incomplete result sets still fail.
- Isolated Unix fixture process groups now clean descendants on panic/exit/deadline.
  Bounded cleanup tests include inherited pipes, blocked input, unrelated groups and
  deliberately escaped children. Windows Job Object equivalence remains unresolved.
- Managed backend home/temp/config are disposable; Git prompts are disabled and
  discovery cannot escape `.jait/artifacts` into the enclosing Jait repository.
  A regression launches a real custom backend fixture and checks these boundaries
  and cleanup after auth-setup failure. Default managed acceptance passes 93/93.

Focused and fail-before/pass-after evidence lives in
`.jait/artifacts/rust-continuation/`. The independent `r00-r08-gaps.md` audit describes
the pre-fix snapshot; subsequent logs supersede its repaired-counterexample verdicts,
not its remaining coverage and platform gaps. Existing historical passing reports
must not substitute for fresh, source-bound reports.

Explicit `translated-report --profile docker` and `--profile chromium` runs require
all 9 and 33 selected integration cases respectively to pass without skips. Their
profiles remain separate from the full enabled suite; selecting either never
certifies excluded cases. Playwright binaries live under project artifacts, and
CI builds the current packaged helper before collecting source-bound evidence.
The database corpus and active-stream reviews describe additional passing
contracts and their remaining coverage limits.
