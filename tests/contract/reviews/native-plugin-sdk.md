# Native plugin SDK contract review

Scope: `plugins/contracts.ts`: descriptor and installed-state records, plugin
source metadata, tool definition wrapper, and setup/dispose construction.
The plugin manager, JS module loading, channel implementations, permissions
execution and dispatch remain host responsibilities. Context methods are typed
config/logger ports. Channel and execute values are generic typed handles.
Manifest validation stays in its independently verified component.

The driver imports actual helpers; Rust owns inputs and comparisons. Sixty-four
metadata cases cover all sixteen categories, three tiers, risk/consent values,
empty/scoped/Unicode identifiers, spoofed source metadata, retained unknown
properties including inert `__proto__`, execute identity, call arguments and
input immutability. Metadata key order is compared explicitly in addition to
values. Typed declarations seed their own-property order from the source record;
known fields replace matching keys without repositioning them.

Lifecycle comparisons verify construction is lazy, setup/dispose handles are
preserved, absent dispose is asynchronous and empty, repeated calls remain
repeated (no implicit one-shot wrapper), and setup/dispose rejections propagate.
Installed records and optional metadata roundtrip exact compiler-bound fixtures;
strict TypeScript positive/negative checks ensure statuses, required risk and
required module disposal match the declarations. Context config/log ports have
native signature and invocation checks. JavaScript getters, prototypes and
arbitrary callback receiver semantics are outside the typed host boundary.

Four focused checks plus four protocol guards pass. Four intentional mutations
(source name, display provenance, missing metadata, failing default disposal)
failed behavioral assertions, were restored byte-exactly, and the restored target
passed. Evidence: `.jait/artifacts/gateway-rust/plugin-sdk/`.
This is a candidate until the complete source-bound gate passes.

Reference SHA256: 260cc45bf388db15f82e495cc3a44dc3ab4fb00de41b6919529f9fd616ebc6a2
