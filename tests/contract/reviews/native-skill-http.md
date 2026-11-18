# Native skill HTTP routes

Reference: `packages/gateway/src/routes/skills.ts`.
Native: `packages/gateway-rust/src/routes/skills.rs`, explicitly mounted through
`Gateway::with_skills`. All registry/checker/installer ports must be supplied at mounting.
No file discovery, package-manager invocation or production activation is implicit.

Eight focused tests (four shared driver checks plus four HTTP matrices) compare real
Fastify gateway HTTP against real native HTTP. They retain authentication/cookie/origin
checks, deleted users, HEAD, list order/projection, duplicate replacement, mutable record
enablement, null/array/primitive bodies, strict Boolean toggles, missing records, optional
metadata truthiness, parser/media errors, installer option forwarding (including null and
zero), success projection and updated record rechecks, string/Error rejections, and
case-sensitive 400/500 install-error classification.

The reference uses its real registry, route and gateway/auth code. Tool checking and
installation are deterministic dependency ports in both sides: no npm process or actual
install is run. Native callbacks retain shared record identity across asynchronous work.
The `skills/index.ts` and `skills/install.ts` components receive no implementation credit.
Typed installation results are objects, matching the original service's declared result.

Four reversible mutations (inverted enablement, empty-metadata omission, install error
classification, stale installation projection) each failed its intended assertion;
restored sources passed. Logs: `.jait/artifacts/gateway-rust/skill-http-mutations/`.

Broader readiness work: connect the complete native discovery/installer services and
real executable checks, test OS/package manager integrations and supported platforms.
The adapter is opt-in and the production TypeScript gateway is unchanged.
