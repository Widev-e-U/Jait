# Native persistent-agent tool adapter

Reviewed 2026-10-24. Reference: `packages/gateway/src/tools/persona-agent-tools.ts` with `packages/shared/src/persona-agent.ts`.

The native module implements the manage/inspect factory policy over a caller-supplied owner-scoped storage and provider-availability port. It does not spawn workers or schedule jobs. Storage still owns reporting-line integrity, authorization, deletion detachment and persistence. Tool registry consent remains required; this adds no ThreadService or production activation credit.

`gateway_rust_persona_tools` compares actual factory results, errors and ordered dependency arguments with TypeScript. Only UUID generation and service ports are fixtures. Checks cover complete metadata, authentication, inspection mutation refusal, UTF-16 id bounds, owner-scoped lookups/deletes, missing foreign records, generated create identity, defaults, shallow field preservation, unavailable providers and thrown values at every service boundary. Shared-schema comparisons cover required/optional/nullable fields, wrong types, discriminated schedules, arrays, nested stripping, top-level passthrough, UTF-16 length limits and the 30,000-unit serialized profile refinement. Native UUID generation is separately checked as v7. The extra prototype-key case exposed and fixed Rust preserving `__proto__` where Zod omits it.

Eight isolated mutations were caught by their intended comparisons: authentication bypass, inspection bypass, wrong delete owner, omitted existing fields, provider bypass, input-controlled identity, profile-size bypass and prototype-key retention. The restored 12-test target passes. Evidence: `.jait/artifacts/gateway-rust/chat-loops/persona-contracts.log`, `persona-prototype-before.log`, `persona-mutations.json` and `persona-mutations-restored.log`.

The adapter accepts JSON-compatible, schema-valid tool inputs. The wider native JSON parser's unsupported lone-surrogate transport cases remain outside this component's claim. Direct invalid non-object caller inputs are not a substitute for registry validation.
